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
  // replaceChildren that skips null / false / undefined (the browser would print them as text)
  const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
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
  const clearData = () => { A.teams = []; A.members = []; A.profiles = []; A.state = undefined; A.evm = null; A.res = null; A.proj = null; A.ann = null; A.chat = null; A.judge = null; O.res = null; O.proj = null; A.today = null; O.evm = null; O.chat = null; O.tiles = null; L.chat = null; L.team = null; L.members = []; L.style = null; A.stats = null; };

  function mount(node, focus) {
    put(root, node);
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
        put(signDone, icon('check'), h('div', {}, h('b', { text: 'تم إنشاء حسابك' }),
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
      put(flash, banner('تم تغيير كلمة المرور.', 'ok'));
      say('تم تغيير كلمة المرور.');
    });
    const flash = h('div', { class: 'a-flash' });
    const pwBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', onclick: () => toggle(pwWrap.hidden) }, icon('lock'), h('span', { text: 'تغيير كلمة المرور' }));
    function toggle(open) {
      pwWrap.hidden = !open;
      pwBtn.setAttribute('aria-expanded', String(open));
      if (open) { p1.input.focus(); if (!pwBtn.offsetParent) pwWrap.scrollIntoView({ block: 'start' }); }
      else backTo(pwBtn);
    }
    // on a phone the header buttons live in «المزيد»: focus goes back there
    const backTo = b => { if (b.offsetParent || !dockRef) b.focus(); else dockRef.more.focus(); };
    let dockRef = null;
    const outBtn = btn(DEMO && DEMO.active ? 'خروج من التجربة' : 'خروج', 'x', 'btn-ghost', async () => {
      outBtn.disabled = true;
      if (DEMO && DEMO.active) { DEMO.exit(); return; }
      S.manualOut = true;
      await YB.signOut();
    });
    const body = h('div', { class: 'a-body' });
    const inbox = inboxBox();
    const roleName = ROLE[profile.role] || 'عضو';
    S.me = profile;
    const avatar = h('span', { class: 'a-avatar', 'aria-hidden': 'true', text: initial });
    const paintAvatar = () => {
      const p = S.prefs && S.prefs.avatar_path;
      if (!p) { put(avatar, initial); return; }
      photoUrls([p], AV_BUCKET).then(u => { if (u[p]) put(avatar, h('img', { src: u[p], alt: '' })); });
    };
    paintAvatar();
    const cust = settingsPanel(profile, paintAvatar);
    const custBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', 'data-fk': 'cust-open',
      onclick: () => { if (cust.hidden) { cust.open(); custBtn.setAttribute('aria-expanded', 'true'); } else cust.close(); } }, icon('sparkles'), h('span', { text: 'تخصيص' }));
    cust.onclose = () => { custBtn.setAttribute('aria-expanded', 'false'); backTo(custBtn); };
    const head = h('header', { class: 'a-head a-card' },
      avatar,
      h('div', { class: 'a-who' },
        h('h2', { text: profile.full_name || 'حسابي', tabindex: '-1', 'data-focus': '' }),
        h('div', { class: 'a-who-m' }, h('span', { class: 'a-badge r-' + profile.role, text: roleName }), h('small', { class: 'a-mail', dir: 'ltr', text: profile.email || '' }),
          h('small', { class: 'a-today', text: (() => { try { return new Date().toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return ''; } })() }))),
      h('div', { class: 'a-head-b' }, inbox.bell, custBtn, pwBtn, outBtn));
    const nav = h('nav', { class: 'a-side-nav', 'aria-label': 'أقسام حسابي' });
    const side = h('aside', { class: 'a-side' },
      h('a', { class: 'a-brand', href: 'index.html', 'aria-label': 'ينابيع: الموقع العام' }, h('b', { text: 'ينابيع' }), h('small', { text: 'لوحتي' })),
      nav,
      h('a', { class: 'a-side-out', href: 'index.html' }, icon('arrow-left'), h('span', { text: 'الموقع العام' })));
    const main = h('div', { class: 'a-main' }, head, inbox.panel, cust, pwWrap, flash, body);
    dockRef = phoneDock({
      nav, bell: inbox.bell, panel: inbox.panel,
      who: () => h('div', { class: 'a-more-who' }, avatar.cloneNode(true), h('div', {}, h('b', { text: profile.full_name || 'حسابي' }), h('span', { class: 'a-badge r-' + profile.role, text: roleName }))),
      cust: () => { if (cust.hidden) custBtn.click(); requestAnimationFrame(() => cust.scrollIntoView({ block: 'start' })); },
      pw: () => toggle(true),
      out: () => outBtn.click(), outLabel: DEMO && DEMO.active ? 'خروج من التجربة' : 'تسجيل الخروج'
    });
    const el = h('div', { class: 'a-app dash a-role-' + profile.role }, side, main, dockRef.el);
    inbox.start();
    if (S.flash) { flash.append(banner(S.flash, 'ok')); say(S.flash); S.flash = ''; }
    S.sh = { el, body, flash, nav };
    document.documentElement.classList.add('is-dash');
    return S.sh;
  }


  /* ------------------------------------------------------------------ phone: the bottom bar and «المزيد» (900px and less) */
  // On a phone the side menu and the header buttons leave. A bottom bar takes their place, like the apps people know:
  // three main sections, the notifications and «المزيد». «المزيد» is a sheet with every section (or every admin tab)
  // and the account actions (customize, password, install the app, the public site, sign out). The bar only mirrors
  // the side menu, so whatever the menu shows (a section hidden in «تخصيص», a new tab) the bar follows.
  const DOCK_PRI = ['home', 'teams', 'feed', 'stats', 'team', 'review', 'matches', 'link', 'judge', 'projects', 'results', 'dates', 'room'];
  const DOCK_SHORT = { home: 'الرئيسية', feed: 'الأخبار', team: 'الفريق', matches: 'المباريات', teams: 'الفرق', stats: 'الإحصاءات', review: 'الطلبات', link: 'ربط ابن',
    judge: 'التحكيم', projects: 'المشاريع', results: 'النتائج', dates: 'المواعيد', room: 'الغرفة', players: 'اللاعبون' };
  const smooth = () => (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  function phoneDock(o) {
    if (S.dockMo) { S.dockMo.forEach(m => m.disconnect()); S.dockMo = null; }
    const bar = h('nav', { class: 'a-dock', 'aria-label': 'التنقل السريع في لوحتي' });
    const badge = h('b', { class: 'a-dock-n', hidden: true });
    const bellB = h('button', { type: 'button', class: 'a-dock-b', 'data-dock': 'bell', 'aria-expanded': 'false', hidden: true, onclick: bellGo }, icon('bell'), h('span', { text: 'التنبيهات' }), badge);
    const moreB = h('button', { type: 'button', class: 'a-dock-b', 'data-dock': 'more', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: () => openMore() }, icon('grid'), h('span', { text: 'المزيد' }));
    let sig = '', btns = {}, sheet = null;
    function sources() {
      const links = Array.from(o.nav.querySelectorAll('[data-nav]')).filter(a => !a.closest('[hidden]'));
      if (links.length) return links.map(a => ({ key: a.dataset.nav, label: a.textContent.trim(), ic: a.querySelector('svg'), el: a, on: a.classList.contains('on'), tab: false }));
      return Array.from(o.nav.querySelectorAll('[role=tab]')).map(t => ({ key: t.id.replace(/^at-/, ''), label: t.textContent.trim(), ic: t.querySelector('svg'), el: t, on: t.getAttribute('aria-selected') === 'true', tab: true }));
    }
    const glyph = s => (s.ic ? s.ic.cloneNode(true) : icon('chart'));
    function go(key) {
      const s = sources().find(x => x.key === key);
      if (!s) return;
      s.el.click();
      if (s.tab) { window.scrollTo({ top: 0, behavior: smooth() }); const t = root.querySelector('#at-' + key); if (t) t.focus({ preventScroll: true }); }
    }
    function bellGo() {
      o.bell.click();
      const open = !o.panel.hidden;
      bellB.setAttribute('aria-expanded', String(open));
      if (open) requestAnimationFrame(() => o.panel.scrollIntoView({ block: 'start', behavior: smooth() }));
    }
    function render() {
      const srcs = sources();
      const main = DOCK_PRI.map(k => srcs.find(s => s.key === k)).filter(Boolean).slice(0, 3);
      const s2 = main.map(s => s.key).join();
      if (s2 !== sig) {
        sig = s2; btns = {};
        put(bar, ...main.map(s => (btns[s.key] = h('button', { type: 'button', class: 'a-dock-b', 'data-dock': s.key, onclick: () => go(s.key) }, glyph(s), h('span', { text: DOCK_SHORT[s.key] || s.label })))), bellB, moreB);
      }
      const cur = srcs.find(s => s.on);
      Object.keys(btns).forEach(k => {
        const on = !!cur && cur.key === k;
        btns[k].classList.toggle('on', on);
        if (on) btns[k].setAttribute('aria-current', 'page'); else btns[k].removeAttribute('aria-current');
      });
      moreB.classList.toggle('on', !!cur && !btns[cur.key]);
      bellB.hidden = o.bell.hidden;
      const n = o.bell.querySelector('.a-bell-n');
      badge.textContent = n ? n.textContent : '';
      badge.hidden = !n || n.hidden;
      bellB.setAttribute('aria-label', badge.hidden ? 'التنبيهات' : `التنبيهات: ${badge.textContent} غير مقروء`);
      bellB.setAttribute('aria-expanded', String(!o.panel.hidden));
    }
    let queued = false;
    const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); };
    if (window.MutationObserver) {
      const a = new MutationObserver(later), b = new MutationObserver(later), c = new MutationObserver(later);
      a.observe(o.nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'hidden'] });
      b.observe(o.bell, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
      c.observe(o.panel, { attributes: true, attributeFilter: ['hidden'] });
      S.dockMo = [a, b, c];
    }
    render();

    function closeMore(back) {
      if (!sheet) return;
      sheet.remove(); sheet = null;
      document.documentElement.classList.remove('a-lock');
      moreB.setAttribute('aria-expanded', 'false');
      if (back !== false) moreB.focus();
    }
    function openMore() {
      if (sheet) { closeMore(); return; }
      const srcs = sources();
      const act = (ic, label, fk, run) => h('button', { type: 'button', class: 'a-more-a', 'data-fk': fk, onclick: () => { closeMore(false); run(); } }, icon(ic), h('span', { text: label }));
      const pwa = window.YBPWA && ['prompt', 'ios'].includes(window.YBPWA.state());
      const close = h('button', { type: 'button', class: 'a-more-x', 'aria-label': 'إغلاق', onclick: () => closeMore() }, icon('x'));
      const panel = h('div', { class: 'a-more-p', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'a-more-h', tabindex: '-1', 'data-more': '' },
        h('div', { class: 'a-more-head' }, o.who(), close),
        h('h3', { class: 'a-more-t', id: 'a-more-h', text: 'أقسام لوحتي' }),
        h('div', { class: 'a-more-grid' }, srcs.map(s => h('button', { type: 'button', class: 'a-more-s' + (s.on ? ' on' : ''), 'data-fk': 'more-' + s.key, 'aria-current': s.on ? 'page' : null,
          onclick: () => { closeMore(false); go(s.key); } }, glyph(s), h('span', { text: s.label })))),
        h('h3', { class: 'a-more-t', text: 'حسابي' }),
        h('div', { class: 'a-more-list' },
          act('sparkles', 'تخصيص لوحتي', 'more-cust', o.cust),
          act('lock', 'تغيير كلمة المرور', 'more-pw', o.pw),
          pwa ? act('download', 'ثبّت ينابيع على هاتفك', 'more-install', () => window.YBPWA.install(moreB)) : null,
          h('a', { class: 'a-more-a', href: 'index.html' }, icon('home'), h('span', { text: 'الموقع العام' })),
          act('x', o.outLabel, 'more-out', o.out)));
      sheet = h('div', { class: 'a-more' }, h('div', { class: 'a-more-bg', onclick: () => closeMore() }), panel);
      sheet.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); closeMore(); return; }
        if (e.key !== 'Tab') return;
        const f = Array.from(panel.querySelectorAll('button,a[href]'));
        if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === panel)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      });
      document.body.append(sheet);
      document.documentElement.classList.add('a-lock');
      moreB.setAttribute('aria-expanded', 'true');
      panel.focus();
    }
    return { el: bar, more: moreB, close: closeMore };
  }

  /* ------------------------------------------------------------------ «خطوتك التالية»: one clear thing to do now */
  // At the top of «نظرة عامة»: where the person stands (a short progress line for a leader) and the single most useful
  // next action, with a button that takes them straight to the card where it is done. Built only from what the screen
  // already read (no extra request). spec: { steps?: [[label, done]], icon, title, text, note?, action?: [label, run] , done? }
  function nextCard(spec) {
    const box = h('section', { class: 'a-card a-next' + (spec.done ? ' is-done' : ''), 'aria-labelledby': 'a-next-h', 'data-next': '' });
    const steps = spec.steps || [];
    const doneN = steps.filter(s => s[1]).length;
    put(box,
      h('div', { class: 'a-next-top' }, h('h3', { id: 'a-next-h', text: spec.done ? 'كل شيء في مكانه' : 'خطوتك التالية' }),
        steps.length ? h('span', { class: 'a-next-n', text: `${doneN} من ${steps.length}` }) : null),
      steps.length ? h('ol', { class: 'a-next-steps', 'aria-label': 'مراحل التسجيل' }, steps.map((s, i) => {
        const now = !s[1] && steps.slice(0, i).every(x => x[1]);
        return h('li', { class: s[1] ? 'ok' : now ? 'now' : '', 'aria-current': now ? 'step' : null },
          h('span', { class: 'a-next-dot', 'aria-hidden': 'true' }, s[1] ? icon('check') : String(i + 1)), h('span', { text: s[0] }), h('span', { class: 'a-sr', text: s[1] ? ' (تمّ)' : now ? ' (الآن)' : '' }));
      })) : null,
      h('div', { class: 'a-next-do' },
        h('span', { class: 'a-next-ic', 'aria-hidden': 'true' }, icon(spec.icon || 'flag')),
        h('div', { class: 'a-next-t' }, h('b', { text: spec.title }), spec.text ? h('p', { text: spec.text }) : null,
          spec.note ? h('p', { class: 'a-note' }, h('b', { text: 'ملاحظة الإدارة: ' }), spec.note) : null),
        spec.action ? h('button', { type: 'button', class: 'btn btn-primary btn-sm a-next-go', 'data-fk': 'next-go', onclick: spec.action[1] }, h('span', { text: spec.action[0] }), icon('arrow-left')) : null,
        spec.link ? h('a', { class: 'btn btn-ghost btn-sm a-next-go', href: spec.link[1] }, h('span', { text: spec.link[0] }), icon('arrow-left')) : null));
    return box;
  }
  // scroll to a card and put the keyboard on it (its heading, or a given control)
  function goCard(node, focusSel) {
    if (!node) return;
    const sec = node.closest('.a-sec');
    if (sec && sec.hidden) return;
    node.scrollIntoView({ block: 'start', behavior: smooth() });
    const f = (focusSel && node.querySelector(focusSel)) || node.querySelector('h3,h2');
    if (f) { if (!f.matches('button,a,input,select,textarea')) f.tabIndex = -1; f.focus({ preventScroll: true }); }
  }
  const goSec = key => { const s = document.getElementById('sec-' + key); if (s) goCard(s, '.a-sec-h'); };
  function leaderNext() {
    const t = L.team, n = L.members.length;
    const minors = L.members.filter(m => isMinor(m.age)), got = minors.filter(m => m.consent_status === 'received').length;
    const okN = n >= MIN && n <= MAX, consents = !minors.length || got >= minors.length;
    const sent = t.status === 'submitted' || t.status === 'approved';
    const steps = [['الأعضاء', okN], ['الإرسال', sent], ['موافقات الأهل', consents], ['الاعتماد', t.status === 'approved']];
    const toRoster = ['افتح قائمة الفريق', () => goCard(L.boxes.roster)];
    const toSubmit = [t.status === 'returned' ? 'إلى زر إعادة الإرسال' : 'إلى زر الإرسال', () => goCard(L.boxes.top, '[data-fk=submit]')];
    if (t.status === 'rejected') return { steps, icon: 'alert', title: 'لم تعتمد الإدارة الفريق', text: 'تواصل مع الإدارة لمعرفة السبب وإعادة فتح الطلب.', note: t.admin_note || null };
    if ((t.status === 'draft' || t.status === 'returned') && n < MIN) return { steps, icon: 'users', title: `أضف ${MIN - n} ${MIN - n === 1 ? 'عضوًا' : 'أعضاء'} إلى فريقك`, text: `الفريق من ${MIN} إلى ${MAX} شاملًا القائد. لديك الآن ${n}.`, note: t.status === 'returned' ? t.admin_note : null, action: toRoster };
    if ((t.status === 'draft' || t.status === 'returned') && n > MAX) return { steps, icon: 'users', title: `احذف ${n - MAX} من القائمة`, text: `الحد الأقصى ${MAX} شاملًا القائد.`, action: toRoster };
    if (t.status === 'returned') return { steps, icon: 'repeat', title: 'عدّل ما طلبته الإدارة ثم أعد الإرسال', text: 'بعد التعديل اضغط «أعد إرسال الفريق للمراجعة».', note: t.admin_note || null, action: toSubmit };
    if (t.status === 'draft') return { steps, icon: 'send', title: 'أرسل الفريق للاعتماد', text: 'القائمة مكتملة. أرسلها لتراجعها الإدارة، ويمكنك سحب الإرسال للتعديل.', action: toSubmit };
    if (!consents) return { steps, icon: 'user-check', title: `اجمع موافقات الأهل: ${got} من ${minors.length}`, text: 'نموذج ورقي موقّع لكل عضو دون 18 سنة. سجّل استلام كل نموذج في قائمة الفريق.', action: toRoster, link: ['اطبع النموذج', 'register.html#c-consent'] };
    if (t.status === 'submitted') return { steps, icon: 'clock', title: 'طلبك قيد المراجعة', text: 'ستصلك رسالة هنا عند الاعتماد. تابع الرسوم والخطوات في «خطوات اعتماد فريقك».', action: ['عرض الخطوات', () => goCard(L.boxes.check.hidden ? L.boxes.top : L.boxes.check)] };
    return { steps, done: true, icon: 'trophy', title: 'فريقك معتمد ومكتمل', text: 'تابع المباريات والمواعيد، وأرسل مشاريع فريقك في «المشاريع والمبادرات».', action: ['المباريات والمواعيد', () => goSec('matches')] };
  }
  function paintNext() {
    if (!L.boxes.next || !L.team) return;
    const fresh = nextCard(leaderNext());
    L.boxes.next.replaceWith(fresh);
    L.boxes.next = fresh;
  }
  function memberNext(row, me) {
    const got = me && me.consent_status === 'received';
    if (me && !got) return { icon: 'user-check', title: 'موافقة ولي أمرك لم تصل بعد', text: 'اطلب من ولي أمرك توقيع نموذج الموافقة وتسليمه لقائد فريقك.', link: ['نموذج الموافقة', 'register.html#c-consent'] };
    if (row.status !== 'approved') return { icon: 'clock', title: 'فريقك ينتظر الاعتماد', text: 'يكمل قائد فريقك التسجيل، وتظهر هنا المباريات بعد الاعتماد والقرعة.' };
    return { done: true, icon: 'trophy', title: 'أنت جاهز للمسابقة', text: 'تابع مبارياتك ومواعيدك، وأخبار الفرق في «الأخبار».', action: ['المباريات والمواعيد', () => goSec('matches')] };
  }
  function parentNext(kids) {
    if (!kids.length) return { icon: 'user-check', title: 'اربط ابنك أو ابنتك', text: 'اطلب رمز الفريق من القائد، واكتب اسم الطفل كما في القائمة. بعدها تتابع فريقه ومبارياته هنا.', action: ['اربط الآن', () => goSec('link')] };
    const wait = kids.filter(k => k.consent_status !== 'received');
    if (wait.length) return { icon: 'user-check', title: `سلّم نموذج الموافقة لقائد الفريق (${wait.map(k => k.full_name.split(' ')[0]).join('، ')})`, text: 'نموذج ورقي موقّع. تتغيّر الحالة هنا بعد أن يسجّل القائد استلامه.', link: ['اطبع النموذج', 'register.html#c-consent'] };
    return { done: true, icon: 'trophy', title: 'الموافقات مكتملة', text: 'تابع مباريات الفريق ومواعيده ومشاريعه، وأخبار الفرق في «الأخبار».', action: ['المباريات والمشاريع', () => goSec('matches')] };
  }

  /* ------------------------------------------------------------------ players looking for a team (migration 0012, SPEC 4.12) */
  // A member opts in («أبحث عن فريق»); a minor shows a code that a parent enters to approve. Leaders whose team the admin
  // has seen get «لاعبون يبحثون عن فريق»: first name, age group, area, positions and achievements, with filters and a
  // «الأنسب» order that says why. An invite needs the player's yes (and the parent's for a minor) before joining.
  const AGE_G = { u10: 'أقل من 10 سنوات', u13: 'من 10 إلى 12', u16: 'من 13 إلى 15', u18: 'من 16 إلى 17', adult: '18 فأكثر' };
  const POS = { goal: 'حارس مرمى', defense: 'دفاع', midfield: 'وسط', attack: 'هجوم', chess: 'شطرنج', reciter: 'تسميع القرآن' };
  const INV_ST = { pending: 'بانتظار الرد', accepted: 'قُبلت', declined: 'اعتُذر عنها', cancelled: 'سُحبت' };
  const rpcFail = (r) => { const d = r && r.ok ? r.data : null; return !r || !r.ok ? r : d && d.ok === false ? { error: d.error } : null; };
  function inviteRow(i, who, fk, reload, show) {
    const mine = i.status === 'pending' && (who === 'player' ? !i.player_ok : !i.guardian_ok);
    const wait = i.status !== 'pending' ? '' : who === 'player' && i.player_ok ? 'وافقت، وتنتظر الدعوة موافقة ولي أمرك.' : who === 'guardian' && i.guardian_ok ? 'وافقت، وتنتظر الدعوة موافقة ابنك.' : '';
    const answer = async yes => {
      const r = await YB.rpc('yb_invite_answer', { id: i.id, accept: yes });
      const bad = rpcFail(r);
      if (bad) { if (sessionLost(bad)) return; return show(errMsg(bad)); }
      show('');
      await reload();
      say(!yes ? 'أُرسل اعتذارك.' : r.data.status === 'accepted' ? `تمّ الانضمام إلى ${r.data.team_name}.` : 'سُجّلت موافقتك.');
    };
    return h('li', { class: 'a-inv', 'data-invite': i.id },
      h('div', { class: 'a-team-top' }, h('div', {}, h('b', { text: i.team_name }), h('small', { class: 'a-hint', text: [i.team_area, i.leader ? 'القائد: ' + i.leader : ''].filter(Boolean).join(' · ') })),
        chip(INV_ST[i.status] || i.status, i.status === 'accepted' ? 'ok' : i.status === 'pending' ? 'brand' : 'muted')),
      wait ? h('p', { class: 'a-hint', text: wait }) : null,
      mine ? h('div', { class: 'a-actions' }, btn('أقبل', 'check', 'btn-primary', () => answer(true), { 'data-fk': `${fk}-yes-${i.id}` }),
        btn('أعتذر', 'x', 'btn-ghost', () => answer(false), { 'data-fk': `${fk}-no-${i.id}` })) : null);
  }
  // the member: opt in, the code for a parent, the invites
  function seekCard(fk) {
    const box = h('section', { class: 'a-card a-seek', hidden: true, 'aria-labelledby': fk + '-h', 'data-seek': '' });
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const show = t => { msg.textContent = t || ''; msg.hidden = !t; if (t) say(t); };
    let D = null, editing = false;
    async function load() {
      const r = await YB.rpc('yb_seek_me', {});
      if (!r.ok || !r.data || !r.data.can_seek) { box.hidden = true; return; }
      D = r.data; paint();
    }
    function form() {
      const s = D.seeker || {};
      const age = selectField('فئتك العمرية', 'age_group', Object.assign({ '': 'اختر فئتك' }, AGE_G), s.age_group || '');
      const area = field({ label: 'حيّك أو منطقتك (اختياري)', name: 'area', max: 60, value: s.area || '', hint: 'بلا أرقام هواتف ولا بريد.' });
      const pos = h('fieldset', { class: 'a-checks' }, h('legend', { class: 'a-l', text: 'ماذا تحب أن تلعب؟ (اختياري)' }),
        Object.keys(POS).map(k => { const id = uid('f'); return h('label', { class: 'a-check', for: id }, h('input', { type: 'checkbox', id, value: k, checked: (s.positions || []).includes(k) }), h('span', { text: POS[k] })); }));
      const f = h('form', { class: 'a-form', 'aria-label': 'أبحث عن فريق' }, age, area, pos,
        h('p', { class: 'a-privacy' }, icon('lock'), h('span', { text: 'يرى قادة الفرق التي راجعتها الإدارة اسمك الأول وفئتك وحيّك وإنجازاتك فقط، لا اسمك الكامل ولا بريدك ولا هاتفك. إن كان عمرك أقل من 18 فلا تظهر قبل موافقة ولي أمرك.' })),
        h('div', { class: 'a-actions' }, submitBtn(D.seeker ? 'احفظ' : 'أضفني إلى الباحثين عن فريق', 'check'),
          D.seeker ? h('button', { type: 'button', class: 'a-link', text: 'إلغاء', onclick: () => { editing = false; paint(); } }) : null));
      bind(f, async () => {
        if (!age.input.value) return showErr(f, 'اختر فئتك العمرية.', age.input);
        const r = await YB.rpc('yb_seek_save', { p: { age_group: age.input.value, area: area.input.value.trim(), positions: [...pos.querySelectorAll('input:checked')].map(x => x.value) } });
        const bad = rpcFail(r);
        if (bad) { if (sessionLost(bad)) return; return showErr(f, errMsg(bad), bad.error === 'contact_not_allowed' ? area.input : age.input); }
        D = r.data; editing = false; paint();
        say(D.seeker && D.seeker.listed ? 'أُضفت إلى قائمة الباحثين عن فريق.' : 'حُفظ طلبك. أعطِ الرمز لولي أمرك ليوافق.');
      });
      return f;
    }
    function paint() {
      const s = D.seeker;
      if (D.in_team && !s && !D.transfers_open) { box.hidden = true; return; }
      const nodes = [h('h3', { id: fk + '-h' }, icon('users'), h('span', { text: 'أبحث عن فريق' }))];
      if (!s || editing) {
        if (!s) nodes.push(h('p', { class: 'a-lead', text: D.in_team ? 'الانتقالات مفتوحة الآن: يمكنك أن تظهر لقادة الفرق الأخرى.' : 'لم تجد فريقًا بعد؟ سجّل نفسك ليجدك قادة الفرق ويدعوك.' }));
        nodes.push(form());
      } else {
        const st = !s.active ? chip('متوقف', 'muted') : s.listed ? chip('ظاهر لقادة الفرق', 'ok') : !s.guardian_ok ? chip('بانتظار موافقة ولي الأمر', 'sun') : chip('غير ظاهر الآن', 'muted');
        nodes.push(h('div', { class: 'a-team-top' }, h('div', {}, h('b', { text: AGE_G[s.age_group] || s.age_group }), s.area ? h('small', { class: 'a-hint', text: s.area }) : null), st));
        if ((s.positions || []).length) nodes.push(h('div', { class: 'a-chips' }, s.positions.map(k => chip(POS[k] || k, 'role'))));
        if (s.guardian_code) nodes.push(h('p', { class: 'a-lead', text: 'أعطِ هذا الرمز لولي أمرك، فيكتبه في حسابه في «موافقة على بحث ابنك عن فريق»:' }),
          h('p', { class: 'a-code', dir: 'ltr', 'data-seek-code': '', text: s.guardian_code }));
        if (D.in_team && !D.transfers_open) nodes.push(h('p', { class: 'a-hint', text: 'أنت في فريق الآن، فلا تظهر للفرق الأخرى إلا إذا فتحت الإدارة الانتقالات.' }));
        nodes.push(h('div', { class: 'a-actions' }, btn('عدّل', 'user', 'btn-ghost', () => { editing = true; paint(); }, { 'data-fk': fk + '-edit' }),
          armed(btn('أوقف البحث', 'x', 'btn-ghost', null, { 'data-fk': fk + '-stop' }), 'اضغط مرة أخرى لإيقاف البحث', async () => {
            const r = await YB.rpc('yb_seek_stop', {});
            if (!r.ok) { if (sessionLost(r)) return; return show(errMsg(r)); }
            await load(); say('أوقفت البحث، ولم تعد في القائمة.');
          })));
      }
      if ((D.invites || []).length) nodes.push(h('h4', { text: 'الدعوات' }), h('ul', { class: 'a-inv-l' }, D.invites.map(i => inviteRow(i, 'player', fk, load, show))));
      nodes.push(msg);
      put(box, ...nodes);
      box.hidden = false;
    }
    load();
    return box;
  }
  // the parent: approve with the child's code, answer invites, withdraw the approval
  function guardianSeekCard(fk) {
    const box = h('section', { class: 'a-card a-seek', 'aria-labelledby': fk + '-h', 'data-gseek': '' });
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const show = t => { msg.textContent = t || ''; msg.hidden = !t; if (t) say(t); };
    let kids = [];
    async function load() { const r = await YB.rpc('yb_guardian_seekers', {}); kids = r.ok && Array.isArray(r.data) ? r.data : []; paint(); }
    function paint() {
      const code = field({ label: 'الرمز الذي يظهر في حساب ابنك أو ابنتك', name: 'code', max: 12, dir: 'ltr', cap: 'characters', spell: false, required: true });
      const f = h('form', { class: 'a-form a-form-inline', 'aria-label': 'موافقة ولي الأمر على البحث عن فريق' }, code, h('div', { class: 'a-actions' }, submitBtn('أوافق', 'check')));
      bind(f, async () => {
        const r = await YB.rpc('yb_seek_guardian', { code: code.input.value });
        const bad = rpcFail(r);
        if (bad) { if (sessionLost(bad)) return; return showErr(f, errMsg(bad), code.input); }
        code.input.value = '';
        await load(); say(`وافقت؛ أصبح ${r.data.first_name || 'ابنك'} في قائمة الباحثين عن فريق.`);
      });
      put(box, h('h3', { id: fk + '-h' }, icon('user-check'), h('span', { text: 'موافقة على بحث ابنك عن فريق' })),
        h('p', { class: 'a-lead', text: 'إن سجّل ابنك أو ابنتك في «أبحث عن فريق» ظهر له رمز. اكتبه هنا لتوافق؛ عندها يرى قادة الفرق اسمه الأول وفئته وحيّه فقط، وكل دعوة تحتاج موافقتك أيضًا.' }),
        f, kids.length ? h('ul', { class: 'a-inv-l' }, kids.map(k => h('li', { class: 'a-gkid', 'data-gkid': k.seeker },
          h('div', { class: 'a-team-top' }, h('div', {}, h('b', { text: k.first_name || '—' }), h('small', { class: 'a-hint', text: AGE_G[k.age_group] || '' })),
            chip(k.active ? 'في قائمة الباحثين' : 'متوقف', k.active ? 'ok' : 'muted')),
          (k.invites || []).length ? h('ul', { class: 'a-inv-l' }, k.invites.map(i => inviteRow(i, 'guardian', fk, load, show))) : h('p', { class: 'a-hint', text: 'لا دعوات بعد.' }),
          k.active ? h('div', { class: 'a-actions' }, armed(btn('اسحب موافقتي', 'x', 'btn-ghost', null, { 'data-fk': `${fk}-rv-${k.seeker}` }), 'اضغط مرة أخرى لسحب الموافقة', async () => {
            const r = await YB.rpc('yb_seek_guardian_revoke', { seeker: k.seeker });
            if (!r.ok) { if (sessionLost(r)) return; return show(errMsg(r)); }
            await load(); say('سحبت موافقتك، ولم يعد ابنك في القائمة.');
          })) : null))) : null, msg);
    }
    load();
    return box;
  }
  // the leader: the recommended players
  function poolCard(fk) {
    const box = h('section', { class: 'a-card a-pool', hidden: true, 'aria-labelledby': fk + '-h', 'data-pool': '' });
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const show = t => { msg.textContent = t || ''; msg.hidden = !t; if (t) say(t); };
    const F = { age: '', pos: '', goals: 0, wins: 0, spirit: false, sort: 'best' };
    let D = null;
    const list = h('ul', { class: 'a-pool-l', 'aria-live': 'polite' });
    const countEl = h('p', { class: 'a-hint', role: 'status' });
    // «الأنسب»: a simple weighted score, always shown with its reasons
    function fit(p) {
      const why = []; let s = 0;
      if (p.goals) { s += p.goals * 2; why.push(`سجّل ${p.goals === 1 ? 'هدفًا' : p.goals === 2 ? 'هدفين' : p.goals + ' أهداف'}`); }
      if (p.wins) { s += p.wins * 3; why.push(`فاز مع فريقه ${p.wins === 1 ? 'مرة' : p.wins === 2 ? 'مرتين' : p.wins + ' مرات'}`); }
      if (p.spirit) { s += p.spirit * 4; why.push('نال «روح الفريق»' + (p.spirit > 1 ? ` ${p.spirit} مرات` : '')); }
      if (F.pos && (p.positions || []).includes(F.pos)) { s += 5; why.push('يلعب ' + POS[F.pos]); }
      if (!p.on_team) { s += 1; why.push('بلا فريق الآن'); }
      return { s, why };
    }
    async function load() {
      const r = await YB.rpc('yb_seek_pool', {});
      if (!r.ok || !r.data || r.data.ok === false) { box.hidden = true; return; }
      D = r.data; paint();
    }
    async function act(fn, args, done) {
      const r = await YB.rpc(fn, args);
      const bad = rpcFail(r);
      if (bad) { if (sessionLost(bad)) return; return show(errMsg(bad)); }
      show(''); await load(); say(done);
    }
    function paintList() {
      const rows = D.players.filter(p => (!F.age || p.age_group === F.age) && (!F.pos || (p.positions || []).includes(F.pos)) && p.goals >= F.goals && p.wins >= F.wins && (!F.spirit || p.spirit > 0))
        .map(p => Object.assign({ fit: fit(p) }, p));
      if (F.sort === 'best') rows.sort((a, b) => b.fit.s - a.fit.s);
      countEl.textContent = `${rows.length} من ${D.players.length} لاعبًا`;
      put(list, ...(rows.length ? rows.map(p => h('li', { class: 'a-pl', 'data-player': p.id },
        h('div', { class: 'a-team-top' }, h('div', {}, h('b', { text: p.first_name || '—' }), h('small', { class: 'a-hint', text: [AGE_G[p.age_group], p.area].filter(Boolean).join(' · ') })),
          p.on_team ? chip('في فريق (انتقالات)', 'sun') : null),
        (p.positions || []).length ? h('div', { class: 'a-chips' }, p.positions.map(k => chip(POS[k] || k, 'role'))) : null,
        h('p', { class: 'a-pl-ach' }, h('span', { text: `أهداف ${p.goals}` }), h('span', { text: `فوز ${p.wins}` }), h('span', { text: `روح الفريق ${p.spirit}` })),
        p.fit.why.length ? h('p', { class: 'a-hint', text: 'لماذا يناسبك: ' + p.fit.why.join('، ') + '.' }) : null,
        h('div', { class: 'a-actions' },
          p.invited ? [chip('دُعي، بانتظار الرد', 'brand'), armed(btn('اسحب الدعوة', 'x', 'btn-ghost', null, { 'data-fk': `${fk}-cx-${p.id}` }), 'اضغط مرة أخرى للسحب',
            () => act('yb_invite_cancel', { id: p.invite_id }, 'سُحبت الدعوة.'))]
            : D.can_invite ? btn('ادعُه إلى فريقك', 'send', 'btn-primary', () => act('yb_invite_send', { seeker: p.id }, `أُرسلت الدعوة إلى ${p.first_name}.`), { 'data-fk': `${fk}-inv-${p.id}` }) : null)))
        : [h('li', { class: 'a-empty', text: D.players.length ? 'لا لاعبين يطابقون هذه الاختيارات.' : 'لا يوجد لاعبون يبحثون عن فريق الآن.' })]));
    }
    function paint() {
      const sel = (label, key, opts) => { const w = selectField(label, fk + '-' + key, opts, F[key]); w.input.addEventListener('change', () => { F[key] = w.input.value; paintList(); }); return w; };
      const num = (label, key) => { const w = field({ label, name: fk + '-' + key, type: 'number', mode: 'numeric', value: String(F[key]) }); w.input.min = '0'; w.input.addEventListener('input', () => { F[key] = Math.max(0, +w.input.value || 0); paintList(); }); return w; };
      const sp = uid('f');
      const spirit = h('label', { class: 'a-check', for: sp }, h('input', { type: 'checkbox', id: sp, checked: F.spirit, onchange: e => { F.spirit = e.target.checked; paintList(); } }), h('span', { text: 'نال «روح الفريق»' }));
      const note = D.team_status === 'approved' ? 'اعتُمد فريقك، فقائمته مقفلة: يمكنك الاطلاع فقط.' : !D.can_invite ? 'فريقك مكتمل (7 بالقائد).' : `في فريقك ${D.room === 1 ? 'مكان واحد' : D.room === 2 ? 'مكانان' : D.room + ' أماكن'}.`;
      put(box, h('h3', { id: fk + '-h' }, icon('users'), h('span', { text: 'لاعبون يبحثون عن فريق' })),
        h('p', { class: 'a-lead', text: 'لاعبون سجّلوا أنهم يبحثون عن فريق (والقاصرون بموافقة أوليائهم). ترى الاسم الأول والفئة والحي والإنجازات فقط. ' + note }),
        h('div', { class: 'a-pool-f', role: 'group', 'aria-label': 'تصفية اللاعبين' },
          sel('الفئة العمرية', 'age', Object.assign({ '': 'كل الفئات' }, AGE_G)), sel('المركز', 'pos', Object.assign({ '': 'أي مركز' }, POS)),
          num('أهداف على الأقل', 'goals'), num('مرات فوز على الأقل', 'wins'), spirit, sel('الترتيب', 'sort', { best: 'الأنسب أولًا', new: 'الأحدث أولًا' })),
        countEl, list, msg);
      paintList();
      box.hidden = false;
    }
    load();
    return box;
  }
  // the admin: transfers and the counts
  function transfersCard() {
    const box = h('section', { class: 'a-card', 'data-transfers': '', hidden: true });
    async function load() {
      const r = await YB.rpc('yb_seek_stats', {});
      if (!r.ok || !r.data) { box.hidden = true; return; }
      const d = r.data, id = uid('f');
      const sw = h('input', { type: 'checkbox', id, role: 'switch', checked: !!d.transfers_open, 'data-fk': 'transfers',
        onchange: async e => {
          e.target.disabled = true;
          const w = await YB.rpc('yb_set_transfers', { allow: e.target.checked });
          if (!w.ok) { if (sessionLost(w)) return; e.target.checked = !e.target.checked; }
          await load(); say(e.target.checked ? 'فُتحت الانتقالات.' : 'أُغلقت الانتقالات.');
        } });
      put(box, h('h3', {}, icon('users'), h('span', { text: 'الباحثون عن فريق والانتقالات' })),
        h('p', { class: 'a-hint', text: `${d.listed} ظاهرون للقادة · ${d.waiting_guardian} بانتظار موافقة ولي الأمر · ${d.invites_open} دعوات مفتوحة · ${d.joined} انضموا عبر دعوة` }),
        h('label', { class: 'a-check', for: id }, sw, h('span', { text: 'فتح الانتقالات: يظهر لاعبو الفرق الأخرى الذين سجّلوا أنهم يبحثون عن فريق' })));
      box.hidden = false;
    }
    load();
    return box;
  }

  /* ------------------------------------------------------------------ match day: «يوم المباراة» and «مباريات اليوم» */
  // On a day the team plays (a board match dated today), the overview opens with the match: the opponent, the time and
  // the place, a countdown, then the live score with the minute (yb_match_live, read every 20 seconds while the tab is
  // open), then the result. Nothing new on the server: the published board, the dates and the live table already exist.
  const MDAY_MS = 20000;
  const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function untilText(date, time) {
    if (!time) return '';
    const t = new Date(`${date}T${time}:00`);
    if (isNaN(t)) return '';
    const mins = Math.round((t - Date.now()) / 60000);
    if (mins <= 0) return mins > -120 ? 'حان موعدها' : '';
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return 'تبدأ بعد ' + (hh ? `${hh} ${hh === 1 ? 'ساعة' : hh === 2 ? 'ساعتين' : 'ساعات'}` + (mm ? ` و${mm} دقيقة` : '') : `${mm} دقيقة`);
  }
  const liveMinute = x => (x && x.started_at ? Math.max(1, Math.floor((Date.now() - new Date(x.started_at).getTime()) / 60000) + 1) : null);
  // the match-day timers stop together when the screen changes
  // one set of timers per card (a screen drawn again replaces its own), all stopped when the screen changes
  function mdayStops(key, ...fns) {
    S.mdays = S.mdays || {};
    if (S.mdays[key]) S.mdays[key]();
    S.mdays[key] = () => fns.forEach(f => { try { f(); } catch (e) { /* already stopped */ } });
  }
  function matchDayCard(teamId, teamName, who) {
    const box = h('section', { class: 'a-card a-mday', hidden: true, 'aria-labelledby': 'a-mday-h', 'data-matchday': '' });
    const D = { m: null, opp: '', place: '', live: null, ours: null, day: localDay(new Date()) };
    async function load() {
      const r = await teamOnBoard(teamId, teamName);
      const m = r && r.v.matches.find(x => x.date === D.day);
      if (!m) { box.hidden = true; return; }
      D.m = m; D.ours = r.v.id; D.opp = nameOf(r.st, m.opponent);
      const [lv, ev] = await Promise.all([read('yb_match_live', { select: 'comp,match_key,a,b,sa,sb,status,started_at,updated_at,approved_at', filter: { match_key: 'eq.' + m.key } }),
        D.place ? Promise.resolve(null) : read('yb_events', { select: EV_SELECT, order: 'starts_at.asc' })]);
      D.live = lv && lv.ok && Array.isArray(lv.data) ? lv.data.find(x => x.comp === 'football') || null : D.live;
      if (ev && ev.ok && Array.isArray(ev.data)) {
        const e = ev.data.find(x => x.kind === 'match' && localDay(new Date(x.starts_at)) === D.day && ((x.team_ids || []).includes(teamId) || !(x.team_ids || []).length));
        if (e) { D.place = e.place || ''; if (!D.m.time) D.m.time = fmtHour(e.starts_at); }
      }
      paint();
    }
    function score() {
      const x = D.live;
      if (x && x.status !== 'approved') return x.a === D.ours ? [x.sa, x.sb] : [x.sb, x.sa];
      if (D.m.played && D.m.result) return [D.m.result.gf, D.m.result.ga];
      if (x) return x.a === D.ours ? [x.sa, x.sb] : [x.sb, x.sa];
      return null;
    }
    function paint() {
      if (!D.m) return;
      const x = D.live, sc = score();
      const phase = D.m.played || (x && x.status === 'approved') ? 'done' : x && x.status === 'live' ? 'live' : x && (x.status === 'final' || x.status === 'returned') ? 'wait' : 'before';
      const title = who === 'parent' ? 'اليوم مباراة فريق ابنك' : 'اليوم مباراتكم';
      const when = [D.m.time ? 'الساعة ' + D.m.time : '', D.place, `${STAGE[D.m.stage] || ''} · الجولة ${D.m.round}`].filter(Boolean).join(' · ');
      const nodes = [h('div', { class: 'a-mday-top' }, h('span', { class: 'a-mday-tag' }, icon('trophy'), h('span', { text: 'يوم المباراة' })),
        phase === 'live' ? h('span', { class: 'a-mday-live' }, h('i', { 'aria-hidden': 'true' }), h('span', { text: `جارية الآن · الدقيقة ${liveMinute(x) || 1}` })) : null),
        h('h3', { id: 'a-mday-h', text: phase === 'before' ? title : phase === 'done' ? 'انتهت مباراة اليوم' : 'مباراة اليوم' })];
      const teams = h('div', { class: 'a-mday-vs' }, h('b', { class: 'a-mday-t', text: teamName }),
        sc ? h('b', { class: 'a-mday-s', dir: 'ltr', 'aria-label': `النتيجة ${sc[0]} مقابل ${sc[1]}`, text: `${sc[1]} – ${sc[0]}` }) : h('span', { class: 'a-mday-x', text: 'ضد' }),
        h('b', { class: 'a-mday-t', text: D.opp }));
      nodes.push(teams, h('p', { class: 'a-hint a-mday-when', text: when }));
      if (phase === 'before') {
        const u = untilText(D.day, D.m.time);
        if (u) nodes.push(h('p', { class: 'a-mday-count', role: 'timer', 'aria-live': 'off', text: u }));
        if (who === 'leader') nodes.push(h('ul', { class: 'a-mday-tips' },
          h('li', { text: 'احضروا قبل الموعد بعشرين دقيقة على الأقل.' }),
          h('li', { text: 'تأكّد من حضور اللاعبين وسجّله في «المباريات والمواعيد».' }),
          h('li', { text: 'التأخر أو الغياب يُحسب وفق لائحة الدوري.' })));
      } else if (phase === 'wait') nodes.push(h('p', { class: 'a-lead', text: 'انتهت المباراة، والنتيجة بانتظار اعتماد الإدارة. لا تدخل الترتيب قبل اعتمادها.' }));
      else if (phase === 'done' && sc) {
        const o = sc[0] > sc[1] ? 'فوز، مبارك!' : sc[0] < sc[1] ? 'خسارة، والجولة القادمة فرصة جديدة.' : 'تعادل.';
        nodes.push(h('p', { class: 'a-lead', text: o }));
      }
      nodes.push(h('div', { class: 'a-actions' },
        who === 'leader' && phase === 'before' ? btn('الحضور والمواعيد', 'calendar', 'btn-primary', () => goSec('matches'), { 'data-fk': 'mday-go' }) : null,
        h('a', { class: 'btn btn-ghost btn-sm', href: 'tournament.html' }, icon('trophy'), h('span', { text: 'لوحة البطولة' })),
        h('a', { class: 'btn btn-ghost btn-sm', href: 'tournament.html?screen=1', target: '_blank', rel: 'noopener' }, icon('eye'), h('span', { text: 'شاشة العرض' }))));
      box.className = 'a-card a-mday is-' + phase;
      put(box, ...nodes);
      box.hidden = false;
    }
    box.start = () => {
      const stop = YB.poll ? YB.poll(load, MDAY_MS) : (load(), null);
      const tick = setInterval(() => { if (D.m && !box.hidden) paint(); }, 30000);
      mdayStops('team', () => stop && stop(), () => clearInterval(tick));
    };
    return box;
  }
  // «مباريات اليوم» for the officer and the admin: every board match dated today, with its live state
  function todayCard() {
    const box = h('section', { class: 'a-card a-today', hidden: true, 'aria-labelledby': 'a-today-h', 'data-today': '' });
    const day = localDay(new Date());
    async function load() {
      const g = await boardOnce();
      const st = g && g.state;
      let fb = null;
      try { fb = st && window.YTour ? window.YTour.football(st) : null; } catch (e) { fb = null; }
      const list = [];
      if (fb && fb.drawn) {
        const take = (stage, gname, rounds) => (rounds || []).forEach(r => r.matches.forEach(m => {
          const d = (m.res && m.res.date) || (m.sched && m.sched.date) || '';
          if (d === day) list.push({ key: m.key, a: m.a, b: m.b, time: (m.res && m.res.time) || (m.sched && m.sched.time) || '', label: `${STAGE[stage]}${gname ? ' · المجموعة ' + gname : ''} · الجولة ${r.round}`, res: m.res, sa: m.sa, sb: m.sb });
        }));
        fb.groups.forEach(x => take('group', x.name, x.rounds));
        if (fb.final) take('final', '', fb.final.rounds);
      }
      if (!list.length) { box.hidden = true; return; }
      const lv = await read('yb_match_live', { select: 'comp,match_key,a,b,sa,sb,status,started_at' });
      const rows = lv.ok && Array.isArray(lv.data) ? lv.data.filter(x => x.comp === 'football') : [];
      list.sort((p, q) => String(p.time).localeCompare(String(q.time)));
      put(box, h('div', { class: 'a-mday-top' }, h('h3', { id: 'a-today-h' }, icon('trophy'), h('span', { text: `مباريات اليوم (${list.length})` })),
        h('a', { class: 'btn btn-ghost btn-sm', href: 'tournament.html?screen=1', target: '_blank', rel: 'noopener' }, icon('eye'), h('span', { text: 'شاشة العرض' }))),
        h('ul', { class: 'a-today-l' }, list.map(m => {
          const x = rows.find(r => r.match_key === m.key);
          const s = m.res ? `${m.sa} – ${m.sb}` : x ? (x.a === m.a ? `${x.sa} – ${x.sb}` : `${x.sb} – ${x.sa}`) : '';
          const state = m.res ? chip('معتمدة', 'ok') : !x ? chip('لم تبدأ', 'muted') : chip(RES_W[x.status] + (x.status === 'live' ? ` · د ${liveMinute(x)}` : ''), x.status === 'live' ? 'brand' : x.status === 'returned' ? 'sun' : 'muted');
          return h('li', { class: 'a-today-i', 'data-today-key': m.key },
            h('span', { class: 'a-today-time', text: m.time || '—' }),
            h('span', { class: 'a-today-t' }, h('b', { text: `${nameOf(st, m.a)} ضد ${nameOf(st, m.b)}` }), h('small', { class: 'a-hint', text: m.label })),
            s ? h('b', { class: 'a-today-s', dir: 'ltr', text: s.split(' – ').reverse().join(' – ') }) : null, state);
        })));
      box.hidden = false;
    }
    box.start = () => { const stop = YB.poll ? YB.poll(load, MDAY_MS) : (load(), null); mdayStops('today', () => stop && stop()); };
    return box;
  }

  /* ------------------------------------------------------------------ the dashboard (signed in) */
  // Signed in, the page becomes an app: the site's banner goes, a side menu jumps between the role's sections and marks the
  // one in view, and «نظرة عامة» opens with summary tiles. Every section stays on the page (nothing is locked behind a
  // tab), so the screen also reads top to bottom on a phone, where the menu becomes a sliding bar.
  function dashLayout(groups) {
    const sh = S.sh;
    if (!sh) return;
    S.lastGroups = groups.filter(Boolean);
    const hidden = (S.prefs && S.prefs.hidden_sections) || [];
    const secs = groups.filter(g => g && g.nodes.some(Boolean) && (g.key === 'home' || !hidden.includes(g.key)));
    const nodes = secs.map(g => h('section', { class: 'a-sec', id: 'sec-' + g.key, 'aria-labelledby': 'sec-h-' + g.key, 'data-sec': g.key },
      h('h2', { class: 'a-sec-h', id: 'sec-h-' + g.key, tabIndex: -1 }, icon(g.icon), h('span', { text: g.label })),
      h('div', { class: 'a-grid' + (g.one ? ' one' : '') }, g.nodes.filter(Boolean))));
    const mark = k => sh.nav.querySelectorAll('[data-nav]').forEach(a => {
      const on = a.dataset.nav === k;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    const go = k => {
      const s = document.getElementById('sec-' + k);
      if (!s) return;
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      s.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      s.querySelector('.a-sec-h').focus({ preventScroll: true });
      mark(k);
    };
    put(sh.nav, h('ul', { class: 'a-nav' }, secs.map((g, i) => h('li', { 'data-nav-li': g.key },
      h('a', { href: '#sec-' + g.key, class: 'a-nav-l' + (i ? '' : ' on'), 'aria-current': i ? null : 'true', 'data-nav': g.key,
        onclick: e => { e.preventDefault(); go(g.key); } }, icon(g.icon), h('span', { text: g.label }))))));
    put(sh.body, ...nodes);
    if (S.dashObs) { S.dashObs.disconnect(); S.dashObs = null; }
    if (S.dashMo) { S.dashMo.disconnect(); S.dashMo = null; }
    // a section whose cards are all hidden (nothing to show yet) leaves the page and the menu until one appears
    const sync = () => nodes.forEach(s => {
      const empty = !Array.from(s.querySelector('.a-grid').children).some(c => !c.hidden);
      if (s.hidden !== empty) s.hidden = empty;
      const li = sh.nav.querySelector(`[data-nav-li="${s.dataset.sec}"]`);
      if (li && li.hidden !== empty) li.hidden = empty;
    });
    sync();
    if (window.MutationObserver) {
      S.dashMo = new MutationObserver(sync);
      nodes.forEach(s => S.dashMo.observe(s.querySelector('.a-grid'), { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true }));
    }
    if (window.IntersectionObserver) {
      S.dashObs = new IntersectionObserver(es => {
        const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (v) mark(v.target.dataset.sec);
      }, { rootMargin: '-96px 0px -55% 0px' });
      nodes.forEach(s => S.dashObs.observe(s));
    }
  }
  // a summary tile; value undefined = loading (filled later with .set)
  function tile(label, ic, value, sub, tone) {
    const v = h('b', { class: 'a-kpi-v', text: value === undefined ? '…' : value === null ? '—' : String(value) });
    const s = h('small', { class: 'a-kpi-s', text: sub || '' });
    const el = h('div', { class: 'a-kpi' + (tone ? ' t-' + tone : ''), role: 'group', 'aria-label': label, 'data-kpi': label },
      h('span', { class: 'a-kpi-i', 'aria-hidden': 'true' }, icon(ic)), h('span', { class: 'a-kpi-l', text: label }), v, s);
    el.set = (val, sb, tn) => {
      v.textContent = val === null || val === undefined ? '—' : String(val);
      s.textContent = sb || '';
      el.className = 'a-kpi' + (tn ? ' t-' + tn : '');
    };
    return el;
  }
  const kpis = (...t) => h('div', { class: 'a-kpis', 'data-kpis': '' }, t.filter(Boolean));
  // the published board, read once per screen
  function boardOnce() {
    if (!S.boardP) S.boardP = Promise.resolve().then(() => YB.getState()).catch(() => null);
    return S.boardP;
  }
  async function teamOnBoard(teamId, teamName) {
    const g = await boardOnce();
    const st = g && g.state;
    if (!st || !window.YTour) return null;
    const t = (st.teams || []).find(x => x.id === teamId) || (st.teams || []).find(x => x.name === teamName);
    if (!t) return null;
    try { return { st, v: window.YTour.teamView(st, t.id) }; } catch (e) { return null; }
  }
  function fillMatchTiles(tNext, tPos, teamId, teamName) {
    teamOnBoard(teamId, teamName).then(r => {
      if (!r || r.v.group === null) { tNext.set('—', 'تظهر بعد القرعة'); if (tPos) tPos.set('—', 'تظهر بعد القرعة'); return; }
      const n = r.v.next;
      tNext.set(n ? 'ضد ' + nameOf(r.st, n.opponent) : '—', n ? ([n.date, n.time].filter(Boolean).join(' · ') || `${STAGE[n.stage] || ''} · الجولة ${n.round}`) : 'لا مباريات متبقية', n ? 'brand' : '');
      if (tPos) {
        const size = ((r.st.groups || [])[r.v.group] || []).length || 4;
        tPos.set(r.v.position ? `${r.v.position} من ${size}` : '—', `المجموعة ${r.v.groupName || ''} · ${FOOT[r.v.status] || ''}`, r.v.position === 1 ? 'ok' : '');
      }
    });
  }
  function resultTile(t) {
    YB.rpc('yb_my_scores', {}).then(r => {
      const d = r.ok && r.data;
      const mine = d && d.published && Array.isArray(d.teams) ? d.teams[0] : null;
      if (mine) t.set(`${fmtPts(mine.total)} من 100`, `المركز ${mine.rank}`, 'ok'); else t.set('—', 'بعد إعلان النتائج');
    });
    return t;
  }
  function leaderTiles(t) {
    const ms = L.members, minors = ms.filter(m => isMinor(m.age)), got = minors.filter(m => m.consent_status === 'received').length;
    const tNext = tile('المباراة القادمة', 'calendar'), tPos = tile('ترتيب المجموعة', 'trophy');
    const tSubs = tile('المشاريع المقبولة', 'image'), tChat = tile('رسائل جديدة', 'bell');
    fillMatchTiles(tNext, tPos, t.team_id, t.team_name);
    // projects open after approval (as in the projects card): no read before that
    if (t.status !== 'approved') tSubs.set('—', 'بعد اعتماد الفريق');
    else read('yb_submissions', { select: 'id,status', filter: { team_id: 'eq.' + t.team_id } }).then(r => {
      const rows = r.ok && Array.isArray(r.data) ? r.data : null;
      tSubs.set(rows ? rows.filter(x => x.status === 'accepted').length : '—', rows ? `من ${rows.length} أُرسلت` : '');
    });
    YB.rpc('yb_chat_unread', {}).then(r => { const n = r.ok && typeof r.data === 'number' ? r.data : null; tChat.set(n, 'في غرفة القادة', n ? 'ok' : ''); });
    return kpis(
      tile('حالة الفريق', 'flag', STATUS[t.status] || t.status, t.status === 'approved' ? 'مشارك في المسابقة' : 'قبل الاعتماد', t.status === 'approved' ? 'ok' : t.status === 'returned' ? 'sun' : ''),
      tile('الأعضاء', 'users', `${ms.length} من ${MAX}`, ms.length < MIN ? `الحد الأدنى ${MIN}` : 'العدد مكتمل', ms.length < MIN ? 'sun' : ''),
      tile('موافقات الأهل', 'user-check', minors.length ? `${got} من ${minors.length}` : '—', minors.length && got < minors.length ? 'تنقص موافقات' : 'مكتملة', minors.length && got < minors.length ? 'sun' : 'ok'),
      tNext, tPos, tSubs, resultTile(tile('نتيجة الفريق', 'award')), tChat);
  }
  function memberTiles(row) {
    const tNext = tile('المباراة القادمة', 'calendar'), tPos = tile('ترتيب المجموعة', 'trophy');
    fillMatchTiles(tNext, tPos, row.team_id, row.team_name);
    return kpis(tile('الفريق', 'flag', STATUS[row.status] || row.status, row.team_name, row.status === 'approved' ? 'ok' : ''), tNext, tPos, resultTile(tile('نتيجة الفريق', 'award')));
  }
  function parentTiles(kids) {
    const got = kids.filter(k => k.consent_status === 'received').length;
    const first = kids[0];
    const tNext = tile('المباراة القادمة', 'calendar'), tPos = tile('ترتيب المجموعة', 'trophy');
    if (first) fillMatchTiles(tNext, tPos, first.team_id, first.team_name); else { tNext.set('—', 'اربط ابنك أولًا'); tPos.set('—', ''); }
    return kpis(tile('الأبناء المرتبطون', 'users', kids.length, kids.length ? kids.map(k => k.full_name.split(' ')[0]).join('، ') : 'لا أحد بعد'),
      tile('الموافقات', 'user-check', kids.length ? `${got} من ${kids.length}` : '—', kids.length && got < kids.length ? 'تنتظر موافقتك' : '', kids.length && got < kids.length ? 'sun' : 'ok'),
      tNext, tPos, resultTile(tile('نتيجة الفريق', 'award')));
  }
  function officerTiles() {
    const ts = [tile('مسابقاتك', 'flag', O.comps.length, O.comps.map(k => COMPS[k] || k).join('، ') || 'لم تُسند بعد')];
    if (O.comps.includes('registration')) { const w = O.teams.filter(t => t.status === 'submitted').length; ts.push(tile('طلبات بانتظارك', 'users', w, 'تسجيل الفرق', w ? 'sun' : 'ok')); }
    if (O.comps.some(k => k === 'football' || k === 'chess')) {
      const t = tile('نتائج للاعتماد', 'flag');
      YB.rpc('yb_results_queue', {}).then(r => { const rows = r.ok && Array.isArray(r.data) ? r.data : null; t.set(rows ? rows.filter(x => x.status === 'live').length : '—', 'مباريات جارية الآن'); });
      ts.push(t);
    }
    if (O.comps.includes('projects')) {
      const t = tile('مشاريع للمراجعة', 'image');
      YB.rpc('yb_submissions_queue', {}).then(r => { const rows = r.ok && Array.isArray(r.data) ? r.data : null; const n = rows ? rows.filter(x => x.status === 'submitted').length : null; t.set(n, 'بانتظار قرارك', n ? 'sun' : ''); });
      ts.push(t);
    }
    const tChat = tile('رسائل جديدة', 'bell');
    YB.rpc('yb_chat_unread', {}).then(r => { const n = r.ok && typeof r.data === 'number' ? r.data : null; tChat.set(n, 'في غرفة القادة', n ? 'ok' : ''); });
    ts.push(tChat);
    return kpis(...ts);
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
    if (n.kind === 'judge_assigned') return `اختارتك الإدارة حكمًا في: ${(Array.isArray(d.axes) ? d.axes : []).map(a => ({ hifz: 'الحفظ', fahm: 'الفهم', tatbiq: 'التطبيق' })[a] || a).join('، ')}. افتح «التحكيم» في حسابك.`;
    if (n.kind === 'results_published') return 'أُعلنت النتائج النهائية للمسابقة. افتح حسابك لترى نتيجة فريقك وأسباب الدرجات.';
    if (n.kind === 'announcement') return `إعلان جديد: ${d.title || ''}`;
    if (n.kind === 'chat_report') return 'بلاغ جديد عن رسالة في غرفة القادة. افتح «التواصل» للمراجعة.';
    if (n.kind === 'chat_muted') return `أوقفت الإدارة ${d.where === 'comments' ? 'تعليقاتك ومشاركتك في الغرفة' : 'مشاركتك في غرفة القادة'} ${d.hours ? (d.hours === 24 ? 'يومًا واحدًا' : d.hours === 168 ? 'أسبوعًا' : `${d.hours} ساعة`) : 'حتى إشعار آخر'}، ويمكنك القراءة.`;
    if (n.kind === 'post_pending') return `خبر جديد من ${d.team_name ? 'فريق «' + d.team_name + '»' : 'قائد فريق'} ينتظر موافقتك: «${d.snippet || ''}». افتح «الأخبار».`;
    if (n.kind === 'post_reviewed') return d.action === 'publish' ? `نُشر خبرك «${d.snippet || ''}» وصار يراه الجميع.`
      : d.action === 'reject' ? `أعاد المشرف خبرك «${d.snippet || ''}» للتعديل${d.note ? ': ' + d.note : '.'}` : `أخفى المشرف خبرك «${d.snippet || ''}».`;
    if (n.kind === 'comment_new') return `علّق ${d.by || 'أحدهم'} على خبرك «${d.snippet || ''}».`;
    if (n.kind === 'comment_report') return 'بلاغ جديد عن تعليق في الأخبار. افتح «الأخبار» ثم «بلاغات التعليقات».';
    if (n.kind === 'team_leader_new') return `صرت قائد ${/^فريق\s/.test(d.team_name || '') ? '' : 'فريق '}«${d.team_name || ''}». تجد الفريق كاملًا في حسابك.`;
    if (n.kind === 'team_leader_left') return `سلّمت الإدارة قيادة «${d.team_name || ''}» لشخص آخر${d.stays ? '، وبقيت عضوًا في الفريق' : ''}.`;
    if (n.kind === 'submission_new') return `أرسل ${team} عملًا للمراجعة: «${d.title || ''}».`;
    if (n.kind === 'submission_reviewed') return d.status === 'accepted' ? `قُبل عمل فريقك «${d.title || ''}» في المشاريع والمبادرات.`
      : d.status === 'returned' ? `أُعيد عمل «${d.title || ''}» للتعديل: ${d.note || ''}` : `لم يُقبل عمل «${d.title || ''}»${d.note ? ': ' + d.note : '.'}`;
    if (n.kind === 'submission_featured') return d.show ? `صار عمل فريقك «${d.title || ''}» معروضًا في الصفحة الرئيسية للموقع.` : `أُخفي عمل فريقك «${d.title || ''}» من الصفحة الرئيسية.`;
    if (n.kind === 'event_new') return `موعد جديد: ${d.title || ''} — ${fmtWhen(d.starts_at)}${d.place ? ' · ' + d.place : ''}`;
    if (n.kind === 'event_changed') return `تغيّر موعد: ${d.title || ''} — ${fmtWhen(d.starts_at)}${d.place ? ' · ' + d.place : ''}`;
    if (n.kind === 'event_cancelled') return `أُلغي موعد: ${d.title || ''}`;
    if (n.kind === 'invite_new') return `دعاك ${team} للانضمام إليه. افتح «أبحث عن فريق» لتقبل أو تعتذر.`;
    if (n.kind === 'invite_waiting') return `دعوة ${team} تنتظر ردّك لتكتمل.`;
    if (n.kind === 'invite_answer') return d.accepted ? `قبل ${d.first_name || 'لاعب'} دعوتك وانضم إلى ${team}.` : `اعتذر ${d.first_name || 'لاعب'} عن دعوة ${team}.`;
    if (n.kind === 'seek_approved') return 'وافق ولي أمرك، وأصبحت في قائمة الباحثين عن فريق.';
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
      put(list, ...(rows.length ? rows.map(n => h('li', { class: 'a-inbox-i' + (n.read_at ? '' : ' new') },
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
      if (!M.loaded) { put(el, head, skeleton()); return; }
      if (M.err) { put(el, head, errorBlock(M.err, () => refresh())); return; }
      const up = M.events.filter(e => !isPast(e)), past = M.events.filter(isPast);
      put(el, head,
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
      put(el, ...[h('h3', {}, icon('calendar'), h('span', { text: 'المواعيد القادمة' })),
        canRsvp && rows.length ? h('p', { class: 'a-lead', text: 'أكّد حضور فريقك قبل كل موعد. يصلك تنبيه هنا عند أي تغيير.' }) : null,
        rows.length ? h('ul', { class: 'a-evlist' }, rows) : h('p', { class: 'a-empty', text: 'لا توجد مواعيد قادمة لفريقك الآن.' }),
        h('p', { class: 'a-hint' }, h('a', { href: 'tournament.html#schedule', text: 'الجدول الكامل في لوحة البطولة' }))].filter(Boolean));
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
        put(body, drawSchedule(row, team));
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
      put(sh.body, errorBlock(YB.errorText(r.error), () => { put(sh.body, skeleton()); route(); }));
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
    const defs = [['teams', 'الفرق', 'users'], ['stats', 'الإحصاءات', 'chart'], ['feed', 'الأخبار', 'megaphone'], ['people', 'الأشخاص', 'user'], ['schedule', 'الجدول', 'calendar'], ['results', 'النتائج', 'flag'], ['projects', 'المشاريع', 'image'], ['comms', 'التواصل', 'bell'], ['judging', 'التحكيم', 'scale'], ['tour', 'لوحة البطولة', 'trophy'], ['export', 'تصدير', 'file-text']];
    const list = h('div', { role: 'tablist', 'aria-label': 'أقسام الإدارة', class: 'a-tabs a-tabs-4 a-tabs-5 a-tabs-6 a-tabs-7 a-tabs-8 a-tabs-9 a-tabs-11' });
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
    else if (A.tab === 'stats') drawAdminStats(panel);
    else if (A.tab === 'feed') { if (!S.feed) { S.feed = feedDesk('feed'); S.feed.start(); } panel.append(S.feed.el); }
    else if (A.tab === 'people') drawAdminPeople(panel);
    else if (A.tab === 'tour') drawAdminTour(panel);
    else if (A.tab === 'results') {
      if (!A.res) { A.res = resultsDesk(['football', 'chess'], true, 'ares'); A.res.start(); }
      if (!A.today) { A.today = todayCard(); A.today.start(); }
      panel.append(A.today, A.res.el);
    }
    else if (A.tab === 'judging') {
      if (!A.judge) { A.judge = judgingAdmin('ajdg'); A.judge.start(); }
      panel.append(A.judge.el);
    }
    else if (A.tab === 'comms') {
      if (!A.ann) { A.ann = announceDesk('aann'); A.ann.start(); }
      if (!A.chat) { A.chat = chatRoom(true, 'achat'); A.chat.start(); }
      panel.append(A.ann.el, A.chat.el);
    }
    else if (A.tab === 'projects') {
      if (!A.proj) { A.proj = projectsDesk(true, 'aprj'); A.proj.start(); }
      panel.append(A.proj.el);
    }
    else if (A.tab === 'schedule') {
      if (!A.evm) A.evm = eventManager(Object.keys(COMPS), () => A.teams.map(t => ({ id: t.id, name: t.name })), 'adm');
      panel.append(A.evm.el);
    }
    else drawAdminExport(panel);
    if (S.sh) put(S.sh.nav, adminTabs());
    put(A.body, counters(), ...(S.sh ? [] : [adminTabs()]), panel);
    if (keep) { const f = root.querySelector(`[data-fk="${CSS.escape(keep)}"]`); if (f) f.focus({ preventScroll: true }); }
  }

  /* --- teams */
  function drawAdminTeams(panel) {
    const list = h('div', { class: 'a-list', 'aria-live': 'polite' });
    const fill = () => {
      const q = lower(A.q.trim());
      const rows = A.teams.filter(t => (A.filter === 'all' || t.status === A.filter)
        && (!q || lower(t.name).includes(q) || lower(t.area).includes(q) || lower(leaderName(t)).includes(q)));
      put(list, ...(rows.length ? rows.map(adminTeamCard) : [h('p', { class: 'a-empty', text: A.teams.length ? 'لا توجد فرق تطابق البحث.' : 'لم يُسجَّل أي فريق بعد.' })]));
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
      put(out, h('dl', { class: 'a-dl' },
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
      put(list, ...(rows.length ? rows.map(personRow) : [h('p', { class: 'a-empty', text: 'لا توجد حسابات تطابق البحث.' })]));
    };
    const search = h('input', { type: 'search', class: 'a-search', placeholder: 'ابحث بالاسم أو البريد', 'aria-label': 'ابحث بالاسم أو البريد', value: A.pq, autocomplete: 'off', oninput: e => { A.pq = e.target.value; fill(); } });
    panel.append(transfersCard());
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
      const led = p.role === 'leader' ? A.teams.find(t => t.leader_id === p.id) : null;
      const tbox = led ? transferBox(p, led) : null;
      const rmsg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
      const save = btn('حفظ الدور', 'check', 'btn-ghost', async () => {
        if (save.dataset.busy) return;
        save.dataset.busy = '1';
        rmsg.hidden = true;
        const r = await YB.rpc('set_user_role', { target: p.id, new_role: sel.value });
        if (!r.ok) {
          delete save.dataset.busy;
          if (sessionLost(r)) return;
          rmsg.textContent = errMsg(r); rmsg.hidden = false; say(rmsg.textContent);
          if (r.error === 'leads_team' && tbox) { tbox.open(); if (trBtn) trBtn.setAttribute('aria-expanded', 'true'); }
          return;
        }
        await refreshAdmin('تم تغيير الدور.', 'rs-' + p.id);
      }, { disabled: true, 'data-fk': 'rs-' + p.id });
      sel.addEventListener('change', () => { save.disabled = sel.value === p.role; });
      const trBtn = tbox ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', 'data-fk': 'tr-open-' + p.id,
        onclick: e => { if (tbox.hidden) tbox.open(); else tbox.hidden = true; e.currentTarget.setAttribute('aria-expanded', String(!tbox.hidden)); } },
        icon('repeat'), h('span', { text: 'سلّم الفريق' })) : null;
      row.append(h('div', { class: 'a-person-a' }, sel, save, trBtn), rmsg);
      if (tbox) row.append(tbox);
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
  /* --- the Excel workbook (js/xlsx-lite.js, SPEC 4.10.8): built here, from what the admin can already read */
  const fmtDay = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmtHour = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const numOr = v => (v === null || v === undefined || v === '' || isNaN(+v) ? '' : +v);
  // the football sheets from the published board: every match (with its result) and every table
  function boardSheets(g) {
    const st = g && g.state;
    const out = { results: [['الدور', 'المجموعة', 'الجولة', 'الفريق الأول', 'أهداف الأول', 'أهداف الثاني', 'الفريق الثاني', 'التاريخ', 'الوقت', 'الحالة']],
      table: [['الدور', 'المجموعة', 'المركز', 'الفريق', 'لعب', 'فاز', 'تعادل', 'خسر', 'له', 'عليه', 'الفارق', 'النقاط']] };
    if (!st || !window.YTour) return out;
    let fb;
    try { fb = window.YTour.football(st); } catch (e) { return out; }
    const nm = id => nameOf(st, id);
    const put2 = (stage, gname, rounds, rows) => {
      (rounds || []).forEach(r => r.matches.forEach(m => out.results.push([stage, gname, r.round, nm(m.a), m.res ? numOr(m.sa) : '', m.res ? numOr(m.sb) : '', nm(m.b),
        (m.sched && m.sched.date) || (m.res && m.res.date) || '', (m.sched && m.sched.time) || (m.res && m.res.time) || '', m.res ? 'انتهت' : 'لم تُلعب'])));
      (rows || []).forEach(x => out.table.push([stage, gname, x.rank || '', nm(x.id), x.p, x.w, x.d, x.l, x.gf, x.ga, x.gd, x.pts]));
    };
    (fb.groups || []).forEach(g2 => put2(STAGE.group, g2.name, g2.rounds, g2.table));
    if (fb.final) put2(STAGE.final, '—', fb.final.rounds, fb.final.table);
    return out;
  }
  async function adminWorkbook(withPeople) {
    const [ev, sub, jb, g] = await Promise.all([
      read('yb_events', { select: EV_SELECT, order: 'starts_at.asc' }),
      YB.rpc('yb_submissions_queue', {}), YB.rpc('yb_results_board', {}), Promise.resolve().then(() => YB.getState()).catch(() => null)]);
    const teamName = id => (A.teams.find(t => t.id === id) || {}).name || '';
    const sheets = [];
    sheets.push({ name: 'الفرق', rows: [['اسم الفريق', 'الحي / المنطقة', 'الحالة', 'قائد الفريق', 'عدد الأعضاء', 'القاصرون', 'الموافقات المستلمة', 'الرسوم', 'رقم الطلب', 'قائمة الاحتياط', 'تاريخ التسجيل', 'ملاحظة المراجعة']]
      .concat(A.teams.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(t => {
        const ms = membersOf(t.id), minors = ms.filter(m => isMinor(m.age));
        return [t.name, t.area || '', STATUS[t.status] || t.status, leaderName(t), ms.length, minors.length, minors.filter(m => m.consent_status === 'received').length,
          FEE[t.fee_status] || '', t.ref_code || '', t.waitlist ? 'نعم' : '', fmtDay(t.created_at), t.admin_note || ''];
      })) });
    if (withPeople) sheets.push({ name: 'الأعضاء', rows: [EXPORT_HEAD()].concat(exportRows()) });
    const evs = ev.ok && Array.isArray(ev.data) ? ev.data : [];
    sheets.push({ name: 'الجدول', rows: [['التاريخ', 'الوقت', 'النوع', 'العنوان', 'المسابقة', 'المكان', 'الفرق', 'الحالة', 'ملاحظة']]
      .concat(evs.map(e => [fmtDay(e.starts_at), fmtHour(e.starts_at), KINDS[e.kind] || e.kind || '', e.title || '', COMPS[e.competition] || e.competition || '', e.place || '',
        (e.team_ids || []).map(teamName).filter(Boolean).join('، '), e.status === 'cancelled' ? 'أُلغي' : e.status === 'changed' ? 'تغيّر الموعد' : '', e.note || ''])) });
    const b = boardSheets(g);
    sheets.push({ name: 'النتائج', rows: b.results }, { name: 'الترتيب', rows: b.table });
    const board = jb.ok && jb.data && typeof jb.data === 'object' ? jb.data : null;
    sheets.push({ name: 'الدرجات', rows: [['المركز', 'الفريق', AXIS.hifz, AXIS.fahm, AXIS.tatbiq, AXIS.football, AXIS.chess, 'المجموع من 100']]
      .concat(((board && board.teams) || []).map(t => [t.rank || '', t.team_name, numOr(t.hifz), numOr(t.fahm), numOr(t.tatbiq), numOr(t.football), numOr(t.chess), numOr(t.total)])) });
    if (withPeople) sheets.push({ name: 'تفاصيل الدرجات', rows: [['الفريق', 'المعيار', 'الحكم', 'الدرجة', 'سبب الدرجة', 'آخر تعديل']]
      .concat(((board && board.scores) || []).map(s => [teamName(s.team_id), s.criterion || '', s.judge || '', numOr(s.points), s.reason || '', fmtDay(s.at)]))
      .concat(((board && board.admin) || []).map(s => [teamName(s.team_id), AXIS[s.axis] || s.axis, 'الإدارة', numOr(s.points), s.reason || '', ''])) });
    const subs = sub.ok && Array.isArray(sub.data) ? sub.data : [];
    sheets.push({ name: 'التسليمات', rows: [['الفريق', 'النوع', 'العنوان', 'المكان', 'تاريخ التنفيذ', 'الحالة', 'عدد المشاركين', 'المستفيدون', 'عدد الصور', 'في الصفحة الرئيسية', 'الملخص', 'النتائج', 'ملاحظة المراجعة']]
      .concat(subs.map(s => [s.team_name || '', SUB_KIND[s.kind] || s.kind || '', s.title || '', SUB_PLACE[s.place] || s.place || '', s.done_on || '', SUB_ST[s.status] || s.status || '',
        numOr(s.members_n), numOr(s.beneficiaries), (s.photos || []).length, s.featured ? 'نعم' : '', s.summary || '', s.results || '', s.review_note || ''])) });
    return sheets;
  }
  // a leader's own team: the team, its members (the leader already sees them), and its dates
  async function leaderWorkbook() {
    const t = L.team;
    const ev = await read('yb_events', { select: EV_SELECT, order: 'starts_at.asc' });
    // the team's own dates and those for every team (an empty list), as on «مواعيد فريقك»
    const evs = (ev.ok && Array.isArray(ev.data) ? ev.data : []).filter(e => (e.team_ids || []).indexOf(t.team_id) >= 0 || ((e.team_ids || []).length === 0 && t.status === 'approved'));
    return [
      { name: 'الفريق', rows: [['اسم الفريق', 'الحي / المنطقة', 'الحالة', 'عدد الأعضاء'], [t.team_name, t.area || '', STATUS[t.status] || t.status, L.members.length]] },
      { name: 'الأعضاء', rows: [['م', W.memberName || 'الاسم الثلاثي', W.age || 'العمر', W.guardianName || 'اسم ولي الأمر', W.guardianPhone || 'رقم الهاتف', 'قائد الفريق', 'موافقة ولي الأمر', 'الأدوار', 'حساب مرتبط']]
        .concat(L.members.map((m, i) => [i + 1, m.full_name, numOr(m.age), m.guardian_name || '', m.guardian_phone || '', m.is_leader ? 'نعم' : '', m.consent_status === 'received' ? 'استُلمت' : 'لم تُستلم',
          (m.roles || []).map(r => ROLE_W[r] || r).join('، '), m.user_id ? 'نعم' : ''])) },
      { name: 'المواعيد', rows: [['التاريخ', 'الوقت', 'النوع', 'العنوان', 'المكان', 'الحالة']]
        .concat(evs.map(e => [fmtDay(e.starts_at), fmtHour(e.starts_at), KINDS[e.kind] || e.kind || '', e.title || '', e.place || '', e.status === 'cancelled' ? 'أُلغي' : e.status === 'changed' ? 'تغيّر الموعد' : ''])) }];
  }
  async function saveWorkbook(button, make, file, status) {
    if (!window.YBXlsx) { status.textContent = 'تعذّر تجهيز ملف Excel في هذا المتصفح. استعمل ملف CSV.'; return; }
    button.disabled = true;
    status.textContent = 'يُجهَّز الملف…';
    try {
      const sheets = await make();
      YBXlsx.download(file, YBXlsx.workbook(sheets, { title: 'مشروع ينابيع' }));
      status.textContent = `بدأ تنزيل الملف (${sheets.length} أوراق: ${sheets.map(s => s.name).join('، ')}).`;
      say(status.textContent);
    } catch (e) {
      status.textContent = 'تعذّر تجهيز الملف الآن. حاول مرة أخرى.';
    } finally { button.disabled = false; }
  }
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
      put(printArea, h('h2', { text: 'مشروع ينابيع · كشف الفرق والأعضاء' }), h('p', { text: stamp() }),
        h('table', { class: 'a-ptable' }, h('thead', {}, h('tr', {}, EXPORT_HEAD().map(x => h('th', { scope: 'col', text: x })))),
          h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', { text: String(c) })))))));
    };
    const xStatus = h('p', { class: 'a-hint', role: 'status', 'aria-live': 'polite', 'data-xlsx-status': '' });
    const full = btn('نزّل ملف Excel الكامل', 'file-text', 'btn-primary', () => saveWorkbook(full, () => adminWorkbook(true), `yanabee-${stamp()}.xlsx`, xStatus), { 'data-fk': 'xlsx' });
    const share = btn('نسخة للمشاركة بلا بيانات الأعضاء', 'users', 'btn-ghost', () => saveWorkbook(share, () => adminWorkbook(false), `yanabee-share-${stamp()}.xlsx`, xStatus), { 'data-fk': 'xlsx-share' });
    panel.append(h('div', { class: 'a-card', 'data-xlsx': '' },
      h('h3', {}, icon('file-text'), h('span', { text: 'ملف Excel للموسم' })),
      h('p', { text: 'ملف واحد بأوراق منفصلة: الفرق، الأعضاء، الجدول، النتائج، الترتيب، الدرجات، تفاصيل الدرجات، التسليمات. يُجهَّز على جهازك ولا يُرسل إلى أي مكان.' }),
      h('p', { class: 'a-privacy' }, icon('lock'), h('span', { text: 'الملف الكامل فيه أسماء قاصرين وبيانات أولياء أمورهم وأسماء الحكّام. للمشاركة مع اللجنة استعمل النسخة التي بلا بيانات الأعضاء.' })),
      h('div', { class: 'a-actions' }, full, share), xStatus));
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
      put(sh.body, errorBlock(errMsg(r), () => { put(sh.body, skeleton()); route(); }));
      return;
    }
    O.body = sh.body;
    drawOfficer();
  }
  function drawOfficer(focusKey) {
    const comps = h('section', { class: 'a-card' }, h('h3', {}, icon('flag'), h('span', { text: 'مسابقاتك' })),
      O.comps.length ? h('ul', { class: 'a-chips' }, O.comps.map(k => h('li', {}, chip(COMPS[k] || k, 'brand'))))
        : h('p', { class: 'a-lead', text: 'لم تُسند إليك مسابقة بعد. يسندها المشرف العام من قسم «الأشخاص».' }));
    if (!O.chat) { O.chat = chatRoom(false, 'ochat'); O.chat.start(); }
    const games = O.comps.filter(k => k === 'football' || k === 'chess');
    if (games.length && !O.res) { O.res = resultsDesk(games, false, 'ores'); O.res.start(); }
    if (O.comps.includes('projects') && !O.proj) { O.proj = projectsDesk(false, 'oprj'); O.proj.start(); }
    const others = O.comps.filter(k => k !== 'registration');
    if (others.length && !O.evm) O.evm = eventManager(others, () => O.pub, 'off');
    if (!O.tiles) O.tiles = officerTiles();
    dashLayout([
      { key: 'home', label: 'نظرة عامة', icon: 'chart', nodes: [O.comps.includes('football') ? (O.today = todayCard()) : null, O.tiles, comps, announceFeed()] },
      feedGroup(),
      { key: 'review', label: 'طلبات التسجيل', icon: 'users', one: true, nodes: [O.comps.includes('registration') ? reviewQueue() : null, O.roles ? roleListCard() : null] },
      { key: 'results', label: 'النتائج', icon: 'flag', one: true, nodes: [games.length ? O.res.el : null] },
      { key: 'projects', label: 'المشاريع', icon: 'image', one: true, nodes: [O.proj ? O.proj.el : null] },
      { key: 'dates', label: 'المواعيد', icon: 'calendar', one: true, nodes: [O.evm ? O.evm.el : null] },
      { key: 'room', label: 'غرفة القادة', icon: 'bell', one: true, nodes: [O.chat.el] }]);
    if (O.today) O.today.start();
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
      put(el, ...kids);
    }
    return { el, start: async () => { put(el, skeleton()); await load(); paint(); } };
  }

  /* ------------------------------------------------------------------ ANNOUNCEMENTS AND THE LEADERS ROOM (migration 0009) */
  // Announcements: the admin writes; every signed-in role reads its own feed (RLS picks the rows); «all» ones are also public.
  // The leaders room: leaders, officers and the admin only; members and parents never see it (student chat stays off until
  // the owner decides). The server refuses phone numbers and e-mails, one message per 3 seconds; anyone reports; the admin
  // hides, mutes and purges. The room polls every 10 seconds only while it is open.
  const AUD = { all: 'الجميع', leaders: 'قادة الفرق', members: 'الأعضاء', parents: 'أولياء الأمور' };
  const CHAT_ROLE = { leader: 'قائد', officer: 'مسؤول', admin: 'الإدارة' };
  const CHAT_MS = 10000;
  const ANN_COLS = 'id,title,body,audience,published,created_at,updated_at,published_at';
  const hm = iso => { try { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  const muteText = hrs => (hrs === null || hrs === undefined ? 'حتى إشعار آخر' : hrs === 24 ? 'يومًا واحدًا' : hrs === 168 ? 'أسبوعًا' : `${hrs} ساعة`);

  // every role: the announcements meant for it (hidden when there are none)
  function announceFeed() {
    const el = h('section', { class: 'a-card a-ann', hidden: true, 'data-ann-feed': '', 'aria-labelledby': 'ann-feed-h' });
    (async () => {
      const r = await read('yb_announcements', { select: ANN_COLS, filter: { published: 'eq.true' }, order: 'created_at.desc', limit: 10 });
      const rows = r.ok && Array.isArray(r.data) ? r.data : [];
      if (!rows.length) return;
      put(el, h('h3', { id: 'ann-feed-h' }, icon('bell'), h('span', { text: 'الإعلانات' })),
        h('ul', { class: 'a-ann-l' }, rows.map(a => h('li', { class: 'a-ann-i' },
          h('div', { class: 'a-ann-top' }, h('b', { text: a.title }), a.audience !== 'all' ? chip(`إلى ${AUD[a.audience] || a.audience}`, 'brand') : null),
          h('p', { class: 'a-pj-txt', text: a.body }),
          h('small', { class: 'a-hint', text: fmtDate(a.published_at || a.created_at) })))));
      el.hidden = false;
    })();
    return el;
  }

  // the admin: write, publish, unpublish, delete
  function announceDesk(fk) {
    const D = { rows: [], editing: null, err: '' };
    const el = h('section', { class: 'a-card a-ann', 'data-ann-desk': '', 'aria-labelledby': fk + '-h' });
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    async function load() {
      const r = await read('yb_announcements', { select: ANN_COLS, order: 'created_at.desc', limit: 50 });
      D.rows = r.ok && Array.isArray(r.data) ? r.data : [];
      D.err = r.ok ? '' : YB.errorText(r.error);
    }
    async function refresh(msg, focus) { await load(); paint(); if (msg) say(msg); if (focus) focusFk(focus); }
    // resolves true, or an error sentence
    async function save(a, published) {
      const r = await YB.rpc('yb_announce_save', { id: a.id || null, title: a.title, body: a.body, audience: a.audience, published });
      if (!r.ok) { if (sessionLost(r)) return ''; return errMsg(r); }
      return true;
    }
    function form(a) {
      const title = field({ label: 'عنوان الإعلان', name: 'atitle', required: true, max: 80, value: a.title || '' });
      title.input.dataset.fk = 'atitle';
      const body = areaField('نص الإعلان', 'abody', a.body, 600, true, 'حتى 600 حرف. يصل إلى صندوق إشعارات الفئة المختارة عند نشره أول مرة.');
      const aud = selectField('إلى من؟', 'aud', AUD, a.audience || 'all');
      const pub = h('button', { type: 'submit', class: 'btn btn-primary', 'data-fk': 'apub' }, icon('send'), h('span', { text: a.published ? 'احفظ التعديل' : 'انشر الآن' }));
      const f = h('form', { class: 'a-form', 'aria-label': a.id ? 'تعديل الإعلان' : 'إعلان جديد' }, title, body, aud,
        h('p', { class: 'a-note', text: 'لا تذكر أسماء الأطفال أو أرقام الهواتف في الإعلانات. إعلانات «الجميع» تظهر لكل زوار الموقع.' }),
        h('div', { class: 'a-actions' }, pub,
          a.published ? null : btn('احفظ مسودة', 'file-text', 'btn-ghost', () => go(false), { 'data-fk': 'adraft' }),
          btn('إلغاء', 'x', 'btn-ghost', () => { D.editing = null; paint(); focusFk(fk + '-new'); }, { 'data-fk': 'acancel' })));
      async function go(published) {
        const tv = nameKey(title.input.value), bv = String(body.input.value || '').trim();
        if (tv.length < 2) return showErr(f, 'اكتب عنوانًا للإعلان.', title.input);
        if (bv.length < 2) return showErr(f, 'اكتب نص الإعلان.', body.input);
        showErr(f, '');
        const out = await save({ id: a.id, title: tv, body: bv, audience: aud.input.value }, published);
        if (out !== true) { if (out) showErr(f, out, title.input); return; }
        D.editing = null;
        await refresh(published ? 'نُشر الإعلان.' : 'حُفظت المسودة.', fk + '-new');
      }
      bind(f, () => go(true));
      return f;
    }
    function item(a) {
      const del = armed(btn('احذفه', 'trash', 'btn-ghost', null, { 'data-fk': 'adel-' + a.id }), 'اضغط مرة أخرى للحذف', async () => {
        const r = await YB.rpc('yb_announce_delete', { id: a.id });
        if (!r.ok) { if (sessionLost(r)) return; say(errMsg(r)); return; }
        await refresh('حُذف الإعلان.', fk + '-new');
      });
      return h('li', { class: 'a-ann-i', 'data-ann': a.id },
        h('div', { class: 'a-ann-top' }, h('b', { text: a.title }), a.published ? chip('منشور', 'ok') : chip('مسودة', 'muted'), chip(`إلى ${AUD[a.audience] || a.audience}`, 'brand')),
        h('p', { class: 'a-pj-txt', text: a.body }),
        h('small', { class: 'a-hint', text: fmtDate(a.published_at || a.created_at) }),
        h('div', { class: 'a-actions' },
          btn('عدّله', 'file-text', 'btn-ghost', () => { D.editing = Object.assign({}, a); paint(); focusFk('atitle'); }, { 'data-fk': 'aed-' + a.id }),
          btn(a.published ? 'أوقف نشره' : 'انشره', a.published ? 'eye' : 'send', 'btn-ghost', async () => {
            const out = await save(a, !a.published);
            if (out !== true) { if (out) say(out); return; }
            await refresh(a.published ? 'أُوقف نشر الإعلان.' : 'نُشر الإعلان.', 'atog-' + a.id);
          }, { 'data-fk': 'atog-' + a.id }), del));
    }
    function paint() {
      put(el, h('h3', { id: fk + '-h' }, icon('bell'), h('span', { text: 'الإعلانات' })),
        h('p', { class: 'a-lead', text: 'إعلان «الجميع» يظهر في الصفحة الرئيسية ولوحة البطولة، وإعلان القادة أو الأعضاء أو الأهل يظهر في حساباتهم فقط.' }),
        D.err ? h('p', { class: 'a-live-msg', role: 'alert', text: D.err }) : null,
        D.editing ? form(D.editing) : h('div', { class: 'a-actions' }, btn('إعلان جديد', 'send', 'btn-primary', () => { D.editing = { audience: 'all' }; paint(); focusFk('atitle'); }, { 'data-fk': fk + '-new' })),
        D.rows.length ? h('ul', { class: 'a-ann-l' }, D.rows.map(item)) : h('p', { class: 'a-empty', text: 'لا إعلانات بعد.' }));
    }
    return { el, start: async () => { put(el, skeleton()); await load(); paint(); } };
  }

  // the leaders room: leaders, officers and the admin (admin = moderation tools)
  function chatRoom(admin, fk) {
    const C = { rows: [], open: false, unread: 0, err: '', stop: null, mutes: [] };
    const el = h('section', { class: 'a-card a-chat', 'data-chat': '', 'aria-labelledby': fk + '-h' });
    const listEl = h('ol', { class: 'a-chat-l', 'aria-live': 'polite', 'aria-label': 'رسائل غرفة القادة', tabIndex: 0 });
    const msgEl = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const taId = uid('f');
    const ta = h('textarea', { id: taId, class: 'a-note-in', rows: 2, maxlength: 500, 'data-fk': fk + '-ta', placeholder: 'اكتب رسالتك للقادة…' });
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    const showMsg = t => { msgEl.textContent = t || ''; msgEl.hidden = !t; if (t) say(t); };
    async function loadUnread() {
      const r = await YB.rpc('yb_chat_unread', {});
      C.unread = r.ok && typeof r.data === 'number' ? r.data : 0;
    }
    async function loadList() {
      const r = await YB.rpc('yb_chat_list', {});
      if (!r.ok) { if (sessionLost(r)) return; showMsg(errMsg(r)); return; }
      const atEnd = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 40;
      C.rows = Array.isArray(r.data) ? r.data : [];
      paintList();
      if (atEnd || !listEl.dataset.ready) listEl.scrollTop = listEl.scrollHeight;
      listEl.dataset.ready = '1';
      const last = C.rows.length ? C.rows[C.rows.length - 1].id : 0;
      if (C.unread) { C.unread = 0; paintHead(); }
      if (last && last !== C.seen) { C.seen = last; YB.rpc('yb_chat_seen', { last_id: last }); }
    }
    async function loadMutes() {
      if (!admin) return;
      const r = await YB.rpc('yb_chat_mutes_list', {});
      C.mutes = r.ok && Array.isArray(r.data) ? r.data : [];
    }
    function stopPolling() { if (C.stop) { C.stop(); C.stop = null; } if (S.stopChat === stopPolling) S.stopChat = null; }
    function openRoom(on) {
      C.open = on;
      stopPolling();
      paint();
      if (on) {
        if (S.stopChat) S.stopChat();
        C.stop = YB.poll ? YB.poll(async () => { await loadList(); if (admin) { await loadMutes(); paintMutes(); } }, CHAT_MS) : null;
        if (!C.stop) loadList();
        S.stopChat = stopPolling;
        focusFk(fk + '-ta');
      } else focusFk(fk + '-open');
    }
    async function act(rpcName, args, done) {
      const r = await YB.rpc(rpcName, args);
      if (!r.ok) { if (sessionLost(r)) return false; showMsg(errMsg(r)); return false; }
      showMsg('');
      if (done) say(done);
      await loadList();
      return true;
    }
    function msgItem(m) {
      const acts = [];
      if (!m.mine && !m.hidden) {
        if (m.reported) acts.push(chip('بلّغتَ عنها', 'muted'));
        else acts.push(armed(btn('بلّغ', 'flag', 'btn-ghost', null, { 'data-fk': 'crep-' + m.id }), 'اضغط مرة أخرى للتبليغ',
          () => act('yb_chat_report', { message_id: m.id, reason: null }, 'وصل البلاغ إلى الإدارة.')));
      }
      if (admin) {
        if (m.reports) acts.push(chip(`${m.reports} بلاغ`, 'bad'));
        acts.push(btn(m.hidden ? 'أظهرها' : 'أخفها', m.hidden ? 'eye' : 'x', 'btn-ghost',
          () => act('yb_chat_hide', { message_id: m.id, hide: !m.hidden }, m.hidden ? 'أُظهرت الرسالة.' : 'أُخفيت الرسالة.'), { 'data-fk': 'chide-' + m.id }));
        if (m.reports && !m.hidden) acts.push(btn('أغلق البلاغ', 'check', 'btn-ghost',
          () => act('yb_chat_resolve', { message_id: m.id }, 'أُغلق البلاغ.'), { 'data-fk': 'cres-' + m.id }));
        if (!m.mine && m.author_role !== 'admin') {
          if (m.author_muted) acts.push(chip('موقوف', 'sun'));
          else {
            const sel = h('select', { class: 'a-select a-chat-mute', 'aria-label': `مدة إيقاف ${m.author_name}`, 'data-fk': 'cmsel-' + m.id },
              [['24', 'يومًا'], ['168', 'أسبوعًا'], ['', 'حتى إشعار آخر']].map(([v, t]) => h('option', { value: v, text: t })));
            acts.push(sel, btn('أوقف مشاركته', 'lock', 'btn-ghost', async () => {
              const hrs = sel.value === '' ? null : Number(sel.value);
              if (await act('yb_chat_mute', { message_id: m.id, hours: hrs, reason: null }, `أُوقفت مشاركة ${m.author_name} ${muteText(hrs)}.`)) { await loadMutes(); paintMutes(); }
            }, { 'data-fk': 'cmute-' + m.id }));
          }
        }
      }
      return h('li', { class: 'a-chat-i' + (m.mine ? ' mine' : '') + (m.hidden ? ' hid' : ''), 'data-msg': m.id },
        h('div', { class: 'a-chat-top' }, h('b', { text: m.mine ? 'أنت' : m.author_name }), chip(CHAT_ROLE[m.author_role] || '', m.author_role === 'admin' ? 'ok' : 'brand'),
          h('small', { class: 'a-hint', text: hm(m.created_at) })),
        m.hidden && !admin ? h('p', { class: 'a-hint', text: 'أخفت الإدارة هذه الرسالة.' })
          : h('p', { class: 'a-chat-b', text: m.body || '' }),
        m.hidden && admin ? h('small', { class: 'a-hint', text: 'مخفية عن الغرفة' }) : null,
        acts.length ? h('div', { class: 'a-chat-acts' }, acts) : null);
    }
    function paintList() {
      put(listEl, ...(C.rows.length ? C.rows.map(msgItem) : [h('li', { class: 'a-empty', text: 'لا رسائل بعد. ابدأ بالسلام.' })]));
    }
    const mutesBox = h('div', { class: 'a-chat-mutes', hidden: true });
    function paintMutes() {
      if (!admin) return;
      put(mutesBox, h('h4', { class: 'a-sub', text: 'الموقوفون عن المشاركة' }),
        C.mutes.length ? h('ul', { class: 'a-roles' }, C.mutes.map(x => h('li', {}, h('b', { text: x.full_name || '—' }),
          chip(x.until ? `حتى ${hm(x.until)}` : 'حتى إشعار آخر', 'sun'),
          btn('أعد مشاركته', 'repeat', 'btn-ghost', async () => {
            if (await act('yb_chat_unmute', { target: x.user_id }, `أُعيدت مشاركة ${x.full_name}.`)) { await loadMutes(); paintMutes(); }
          }, { 'data-fk': 'cun-' + x.user_id })))) : h('p', { class: 'a-hint', text: 'لا أحد موقوف الآن.' }),
        h('div', { class: 'a-actions' }, armed(btn('احذف الرسائل الأقدم من 180 يومًا', 'trash', 'btn-ghost', null, { 'data-fk': fk + '-purge' }), 'اضغط مرة أخرى للحذف', async () => {
          const r = await YB.rpc('yb_chat_purge', {});
          if (!r.ok) { if (sessionLost(r)) return; showMsg(errMsg(r)); return; }
          say(`حُذفت ${Number(r.data) || 0} من الرسائل القديمة.`);
          await loadList();
        })));
      mutesBox.hidden = false;
    }
    const head = h('div', { class: 'a-chat-h' });
    function paintHead() {
      put(head, h('h3', { id: fk + '-h' }, icon('users'), h('span', { text: 'غرفة القادة' })),
        C.unread && !C.open ? chip(`${C.unread} ${C.unread === 1 ? 'رسالة جديدة' : 'رسائل جديدة'}`, 'ok') : null,
        btn(C.open ? 'أغلق الغرفة' : 'افتح الغرفة', C.open ? 'x' : 'arrow-left', C.open ? 'btn-ghost' : 'btn-primary', () => openRoom(!C.open),
          { 'data-fk': fk + '-open', 'aria-expanded': String(C.open) }));
    }
    const sendForm = h('form', { class: 'a-form a-chat-f', 'aria-label': 'رسالة جديدة' },
      h('label', { for: taId, class: 'a-l', text: 'رسالتك' }), ta,
      h('small', { class: 'a-hint', text: 'لا تكتب أرقام هواتف أو بريدًا إلكترونيًا أو أسماء أطفال. الغرفة تحت إشراف الإدارة، ولكل من فيها أن يبلّغ عن أي رسالة.' }),
      h('div', { class: 'a-actions' }, submitBtn('أرسل', 'send')));
    bind(sendForm, async () => {
      const b = String(ta.value || '').trim();
      if (!b) return showErr(sendForm, 'اكتب رسالة أولًا.', ta);
      showErr(sendForm, '');
      const r = await YB.rpc('yb_chat_post', { body: b });
      if (!r.ok) { if (sessionLost(r)) return; return showErr(sendForm, errMsg(r), ta); }
      ta.value = '';
      await loadList();
      listEl.scrollTop = listEl.scrollHeight;
      ta.focus();
    });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendForm.requestSubmit(); } });
    function paint() {
      paintHead();
      const kids = [head, h('p', { class: 'a-lead', text: 'للقادة ومسؤولي المسابقات والإدارة فقط؛ لا يراها الأعضاء ولا أولياء الأمور.' })];
      if (C.open) kids.push(listEl, msgEl, sendForm, admin ? mutesBox : null);
      put(el, ...kids.filter(Boolean));
    }
    return { el, start: async () => { paint(); await loadUnread(); paintHead(); if (admin) { await loadMutes(); paintMutes(); } } };
  }

  /* ------------------------------------------------------------------ PROJECTS AND INITIATIVES (migration 0008) */
  // f-apply: each team applies the values of the surah in the family, the neighbourhood or the school, and documents it.
  // The leader sends a short card (c-card cd1 / cd5) with up to 6 photos; the projects officer accepts it, returns it with a note,
  // or does not accept it. Photos sit in a PRIVATE bucket and are shown through short signed links to the team and the
  // projects staff only. Every photo is drawn again on a canvas before upload: smaller, JPEG, without its EXIF block
  // (no camera location, no device name).
  const SUB_BUCKET = 'yanabee-submissions', SUB_MAX = 12, PHOTO_MAX = 6, PHOTO_EDGE = 1600;
  const SUB_ST = { submitted: 'بانتظار المراجعة', returned: 'مطلوب تعديل', accepted: 'مقبول', rejected: 'غير مقبول' };
  const SUB_TONE = { submitted: 'brand', returned: 'sun', accepted: 'ok', rejected: 'bad' };
  const SUB_KIND = { project: 'مشروع', activity: 'مبادرة أو نشاط' };
  const SUB_PLACE = { family: 'الأسرة', neighborhood: 'السكن والحي', school: 'المدرسة أو الجامعة' };
  const SUB_COLS = 'id,team_id,kind,title,value_text,place,done_on,summary,results,members_n,beneficiaries,photos,status,review_note,created_at,updated_at,featured';
  function newId() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* not a secure page: build one below */ }
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const x = Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }
  const isoDay = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const dayText = s => (s ? fmtDate(String(s).slice(0, 10) + 'T12:00:00') : '');

  async function shrinkPhoto(file, edge) {
    if (!file || !/^image\//.test(file.type || '')) throw { error: 'bad_file_type' };
    let src = null, w = 0, ht = 0, url = '';
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; ht = src.height; } catch (e) {
      url = URL.createObjectURL(file);
      src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }).catch(() => null);
      if (src) { w = src.naturalWidth; ht = src.naturalHeight; }
    }
    if (!src || !w || !ht) { if (url) URL.revokeObjectURL(url); throw { error: 'bad_file_type' }; }
    const k = Math.min(1, (edge || PHOTO_EDGE) / Math.max(w, ht));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(ht * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    if (url) URL.revokeObjectURL(url);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw { error: 'bad_file_type' };
    if (blob.size > 5 * 1024 * 1024) throw { error: 'file_too_large' };
    return blob;
  }

  // signed links live 15 minutes; they are asked again a little before that
  const PHOTO_URL = new Map();
  async function photoUrls(paths, bucket) {
    const b = bucket || SUB_BUCKET, now = Date.now(), out = {}, miss = [];
    paths.forEach(p => { const c = PHOTO_URL.get(b + ':' + p); if (c && c.until > now) out[p] = c.url; else miss.push(p); });
    if (miss.length && YB.signedUrls) {
      const r = await YB.signedUrls(b, miss, 900);
      if (r.ok && r.data) Object.keys(r.data).forEach(p => { PHOTO_URL.set(b + ':' + p, { url: r.data[p], until: now + 780000 }); out[p] = r.data[p]; });
    }
    return out;
  }
  // items: [{ path } | { url }]; onRemove(i) draws a remove button on each
  function photoStrip(items, onRemove, title, bucket) {
    const ul = h('ul', { class: 'a-photos', 'aria-label': title ? `صور «${title}»` : 'صور التوثيق' });
    items.forEach((it, i) => {
      const li = h('li', { class: 'a-photo' });
      if (it.url) li.append(h('img', { src: it.url, alt: `صورة ${i + 1} (لم تُرفع بعد)` }));
      else { li.dataset.path = it.path; li.append(h('span', { class: 'a-photo-ph', 'aria-hidden': 'true' }, icon('image'))); }
      if (onRemove) li.append(h('button', { type: 'button', class: 'a-photo-x', 'aria-label': `احذف الصورة ${i + 1}`, 'data-fk': 'sphx-' + i, onclick: () => onRemove(i) }, icon('x')));
      ul.append(li);
    });
    fillPhotos(ul, title, bucket);
    return ul;
  }
  async function fillPhotos(ul, title, bucket) {
    const lis = Array.from(ul.querySelectorAll('li[data-path]'));
    if (!lis.length) return;
    const urls = await photoUrls(lis.map(li => li.dataset.path), bucket);
    lis.forEach((li, i) => {
      const u = urls[li.dataset.path];
      const ph = li.querySelector('.a-photo-ph');
      if (!u || !ph) return;
      ph.replaceWith(h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `افتح الصورة ${i + 1}${title ? ` من «${title}»` : ''} بحجمها الكامل` },
        h('img', { src: u, alt: '', loading: 'lazy', decoding: 'async' })));
    });
  }
  function subItem(x, o) {
    o = o || {};
    const meta = [SUB_PLACE[x.place] || '', dayText(x.done_on), x.members_n !== null && x.members_n !== undefined ? `شارك ${x.members_n} من الأعضاء` : '',
      x.beneficiaries !== null && x.beneficiaries !== undefined ? `المستفيدون: ${x.beneficiaries}` : ''].filter(Boolean).join(' · ');
    return h('article', { class: 'a-pj', 'data-sub': x.id },
      h('div', { class: 'a-pj-top' }, h('div', {}, h('h4', { text: x.title }), h('small', { class: 'a-hint', text: [o.teamName, SUB_KIND[x.kind] || x.kind].filter(Boolean).join(' · ') })),
        h('div', { class: 'a-pj-chips' }, chip(SUB_ST[x.status] || x.status, SUB_TONE[x.status]),
          x.featured && x.status === 'accepted' ? h('span', { 'data-featured': '' }, chip('معروض في الصفحة الرئيسية', 'ok')) : null)),
      x.value_text ? h('p', { class: 'a-pj-txt' }, h('b', { text: 'القيمة المستهدفة: ' }), x.value_text) : null,
      meta ? h('p', { class: 'a-hint', text: meta }) : null,
      h('p', { class: 'a-pj-txt', text: x.summary }),
      x.results ? h('p', { class: 'a-pj-txt' }, h('b', { text: 'النتائج والدروس: ' }), x.results) : null,
      (x.photos || []).length ? photoStrip(x.photos.map(path => ({ path })), null, x.title) : null,
      x.review_note && x.status !== 'submitted' ? h('p', { class: 'a-pj-note', role: 'note' }, icon('alert'), h('span', { text: `ملاحظة المراجعة: ${x.review_note}` })) : null,
      o.actions && o.actions.length ? h('div', { class: 'a-actions' }, o.actions) : null,
      o.after || null);
  }
  function selectField(label, name, opts, value) {
    const id = uid('f');
    const s = h('select', { id, name, class: 'a-select' }, Object.keys(opts).map(k => h('option', { value: k, selected: k === value, text: opts[k] })));
    const wrap = h('div', { class: 'a-f' }, h('label', { for: id, class: 'a-l', text: label }), s);
    wrap.input = s;
    return wrap;
  }
  function areaField(label, name, value, max, required, hint) {
    const id = uid('f'), hid = hint ? uid('h') : '';
    const ta = h('textarea', { id, name, class: 'a-note-in', rows: 4, maxlength: max, required: !!required, 'aria-describedby': hid || null });
    ta.value = value || '';
    const wrap = h('div', { class: 'a-f' }, h('label', { for: id, class: 'a-l' }, label, required ? h('i', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null),
      ta, hint ? h('small', { id: hid, class: 'a-hint', text: hint }) : null);
    wrap.input = ta;
    return wrap;
  }

  // the team leader: send, fix and withdraw; team = { id, name, status }
  function leaderSubs(team, fk) {
    const T = { rows: [], editing: null, err: '' };
    const el = h('section', { class: 'a-card a-pjs', 'aria-labelledby': fk + '-h', 'data-subs': '' });
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    const head = () => [h('h3', { id: fk + '-h' }, icon('image'), h('span', { text: 'المشاريع والمبادرات' })), W.applyLine ? h('p', { class: 'a-lead', text: W.applyLine }) : null];
    async function load() {
      const r = await read('yb_submissions', { select: SUB_COLS, filter: { team_id: 'eq.' + team.id }, order: 'created_at.desc' });
      T.rows = r.ok && Array.isArray(r.data) ? r.data : [];
      T.err = r.ok ? '' : YB.errorText(r.error);
      if (!r.ok) sessionLost(r.error);
    }
    async function refresh(msg, focus) { await load(); paint(); if (msg) say(msg); if (focus) focusFk(focus); }
    function paint() {
      if (team.status !== 'approved') {
        put(el, ...head(), h('p', { class: 'a-empty', text: 'يُفتح توثيق المشاريع والمبادرات بعد اعتماد الفريق.' }));
        return;
      }
      const kids = head();
      if (T.err) kids.push(h('p', { class: 'a-live-msg', role: 'alert', text: T.err }));
      if (T.editing) kids.push(subForm(T.editing));
      else if (T.rows.length < SUB_MAX) kids.push(h('div', { class: 'a-actions' }, btn('أضف مشروعًا أو مبادرة', 'image', 'btn-primary', () => {
        T.editing = { id: newId(), isNew: true, photos: [], adds: [] }; paint(); focusFk('stitle');
      }, { 'data-fk': fk + '-add' })));
      else kids.push(h('p', { class: 'a-hint', text: 'بلغ الفريق الحد الأقصى: 12 مشروعًا ومبادرة.' }));
      kids.push(T.rows.length ? h('div', { class: 'a-list' }, T.rows.map(x => subItem(x, { actions: T.editing ? [] : actions(x) })))
        : h('p', { class: 'a-empty', text: 'لم يرسل الفريق مشروعًا أو مبادرة بعد. وثّقوا كل عمل بعد تنفيذه: ماذا فعلتم، وأين، ومن استفاد، وما الذي تعلّمتموه.' }));
      put(el, ...kids);
    }
    function actions(x) {
      if (x.status !== 'submitted' && x.status !== 'returned') return [];
      const del = armed(btn('اسحبه', 'trash', 'btn-ghost', null, { 'data-fk': 'sdel-' + x.id }), 'اضغط مرة أخرى للسحب', async () => {
        const r = await YB.rpc('yb_delete_submission', { id: x.id });
        if (!r.ok) { if (sessionLost(r)) return; say(errMsg(r)); return; }
        if ((x.photos || []).length) await YB.removeFiles(SUB_BUCKET, x.photos);
        await refresh('سُحب العمل وحُذفت صوره.', fk + '-add');
      });
      return [btn(x.status === 'returned' ? 'عدّله وأرسله من جديد' : 'عدّله', 'file-text', 'btn-ghost', () => {
        T.editing = Object.assign({}, x, { photos: (x.photos || []).slice(), adds: [] }); paint(); focusFk('stitle');
      }, { 'data-fk': 'sed-' + x.id }), del];
    }
    function subForm(ed) {
      const orig = ((T.rows.find(x => x.id === ed.id) || {}).photos || []).slice();
      const kind = selectField('نوع العمل', 'kind', SUB_KIND, ed.kind || 'project');
      const title = field({ label: 'عنوان العمل', name: 'stitle', required: true, max: 120, value: ed.title || '', hint: 'مثل: سقيا عمّال الحي، أو درس أسبوعي في المسجد.' });
      title.input.dataset.fk = 'stitle';
      const value = field({ label: 'القيمة المستهدفة من سورة الصف', name: 'svalue', max: 120, value: ed.value_text || '', hint: 'مثل: الصدق، التعاون، الوفاء بالعهد.' });
      const place = selectField('مكان التطبيق', 'place', SUB_PLACE, ed.place || 'neighborhood');
      const date = field({ label: 'تاريخ التنفيذ', name: 'sdate', type: 'date', value: ed.done_on ? String(ed.done_on).slice(0, 10) : '' });
      date.input.min = '2026-11-01'; date.input.max = isoDay(new Date());
      const summary = areaField('ماذا فعلتم؟', 'ssum', ed.summary, 2000, true, 'الفكرة والخطوات ومن شارك. لا تكتبوا أسماء الأطفال.');
      const results = areaField(W.lessons || 'النتائج والدروس المستفادة', 'sres', ed.results, 2000, false);
      const mem = field({ label: 'عدد أعضاء الفريق المشاركين', name: 'smem', type: 'number', nmin: 0, nmax: 7, mode: 'numeric', value: ed.members_n ?? '' });
      const ben = field({ label: 'عدد المستفيدين (تقريبًا)', name: 'sben', type: 'number', nmin: 0, nmax: 100000, mode: 'numeric', value: ed.beneficiaries ?? '' });
      const pickId = uid('f');
      const pick = h('input', { type: 'file', id: pickId, accept: 'image/jpeg,image/png,image/webp,image/*', multiple: true, class: 'a-file', 'data-fk': 'sfile' });
      const strip = h('div', { class: 'a-photos-w' });
      const count = h('small', { class: 'a-hint', 'aria-live': 'polite' });
      const ok = h('input', { type: 'checkbox', id: uid('f'), name: 'sok' });
      const okRow = h('label', { class: 'a-check', for: ok.id }, ok, h('span', { text: 'أؤكد أن الصور لا تُظهر وجوه الأطفال، أو أن ظهورهم فيها بموافقة أولياء أمورهم.' }));
      const progress = h('p', { class: 'a-hint', 'aria-live': 'polite' });
      const n = () => ed.photos.length + ed.adds.length;
      function paintStrip() {
        const items = ed.photos.map(path => ({ path })).concat(ed.adds.map(a => ({ url: a.url })));
        put(strip, items.length ? photoStrip(items, i => {
          if (i < ed.photos.length) ed.photos.splice(i, 1);
          else { const a = ed.adds.splice(i - ed.photos.length, 1)[0]; if (a && a.url) URL.revokeObjectURL(a.url); }
          paintStrip(); say('حُذفت الصورة من القائمة.'); pick.focus();
        }) : h('p', { class: 'a-hint', text: 'لم تُضف صور بعد.' }));
        count.textContent = `${n()} من ${PHOTO_MAX} صور`;
        pick.disabled = n() >= PHOTO_MAX;
        okRow.hidden = !n();
      }
      pick.addEventListener('change', () => {
        const files = Array.from(pick.files || []);
        const room = PHOTO_MAX - n();
        files.slice(0, room).forEach(f => ed.adds.push({ file: f, url: URL.createObjectURL(f) }));
        if (files.length > room) say(`أُضيفت ${room} فقط؛ ست صور على الأكثر.`);
        pick.value = '';
        paintStrip();
      });
      const cancel = btn('إلغاء', 'x', 'btn-ghost', async () => {
        const orphan = ed.adds.filter(a => a.path).map(a => a.path);
        ed.adds.forEach(a => { if (a.url) URL.revokeObjectURL(a.url); });
        if (orphan.length) await YB.removeFiles(SUB_BUCKET, orphan);
        T.editing = null; paint(); focusFk(fk + '-add');
      }, { 'data-fk': 'scancel' });
      const form = h('form', { class: 'a-form a-pj-form', 'aria-label': ed.isNew ? 'مشروع أو مبادرة جديدة' : 'تعديل المشروع أو المبادرة' },
        h('div', { class: 'a-grid2' }, kind, place), title, value, h('div', { class: 'a-grid2' }, date, mem), ben, summary, results,
        h('div', { class: 'a-f' }, h('label', { for: pickId, class: 'a-l', text: 'صور التوثيق (حتى 6 صور)' }), pick, count,
          h('small', { class: 'a-hint', text: 'تُصغَّر كل صورة على جهازك قبل رفعها، ويُحذف منها موقع التصوير. لا يراها إلا فريقكم ومسؤول المشاريع.' })),
        strip, W.photoWarn ? h('p', { class: 'a-pj-note', role: 'note' }, icon('shield'), h('span', { text: W.photoWarn })) : null, okRow, progress,
        h('div', { class: 'a-actions' }, submitBtn(ed.status === 'returned' ? 'أرسله من جديد' : 'أرسل للمراجعة', 'send'), cancel));
      paintStrip();
      bind(form, async () => {
        const tv = nameKey(title.input.value), sv = String(summary.input.value || '').trim();
        if (tv.length < 3) return showErr(form, 'اكتب عنوانًا للعمل (3 أحرف على الأقل).', title.input);
        if (sv.length < 10) return showErr(form, 'صف ما فعلتم في سطر أو سطرين على الأقل.', summary.input);
        const mv = mem.input.value === '' ? null : num(mem.input.value), bv = ben.input.value === '' ? null : num(ben.input.value);
        if (mv !== null && (mv < 0 || mv > 7)) return showErr(form, 'عدد الأعضاء المشاركين من 0 إلى 7.', mem.input);
        if (bv !== null && (bv < 0 || bv > 100000)) return showErr(form, 'عدد المستفيدين غير صالح.', ben.input);
        const dv = date.input.value;
        if (dv && (dv < '2026-11-01' || dv > isoDay(new Date()))) return showErr(form, YB.errorText('bad_date'), date.input);
        if (n() && !ok.checked) return showErr(form, 'أكّد شرط الصور قبل الإرسال، أو احذف الصور.', ok);
        showErr(form, '');
        const todo = ed.adds.filter(a => !a.path);
        for (let i = 0; i < todo.length; i++) {
          progress.textContent = `جارٍ رفع الصورة ${i + 1} من ${todo.length}…`;
          let blob;
          try { blob = await shrinkPhoto(todo[i].file); } catch (e) { progress.textContent = ''; return showErr(form, YB.errorText(e), pick); }
          const path = `${team.id}/${ed.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
          const u = await YB.upload(SUB_BUCKET, path, blob, 'image/jpeg');
          if (!u.ok) { progress.textContent = ''; if (sessionLost(u)) return; return showErr(form, errMsg(u), pick); }
          todo[i].path = path;
        }
        progress.textContent = '';
        const photos = ed.photos.concat(ed.adds.map(a => a.path));
        const r = await YB.rpc('yb_save_submission', { id: ed.id, team_id: team.id, p: {
          kind: kind.input.value, title: tv, value_text: nameKey(value.input.value), place: place.input.value, done_on: dv || null,
          summary: sv, results: String(results.input.value || '').trim(), members_n: mv, beneficiaries: bv, photos } });
        if (!r.ok) { if (sessionLost(r)) return; return showErr(form, errMsg(r), title.input); }
        const dropped = orig.filter(p => !photos.includes(p));
        if (dropped.length) await YB.removeFiles(SUB_BUCKET, dropped);
        ed.adds.forEach(a => { if (a.url) URL.revokeObjectURL(a.url); });
        T.editing = null;
        await refresh('أُرسل العمل إلى مسؤول المشاريع للمراجعة.', fk + '-add');
      });
      return form;
    }
    return { el, start: async () => { put(el, ...head(), skeleton()); if (team.status === 'approved') await load(); paint(); } };
  }

  // a member or a parent: the team's work, read only (only the team's own people can read it)
  function teamSubsView(teamId, teamName) {
    const el = h('section', { class: 'a-card a-pjs', hidden: true, 'data-subs-view': '' });
    (async () => {
      const r = await read('yb_submissions', { select: SUB_COLS, filter: { team_id: 'eq.' + teamId }, order: 'created_at.desc' });
      const rows = r.ok && Array.isArray(r.data) ? r.data : [];
      if (!rows.length) return;
      const acc = rows.filter(x => x.status === 'accepted').length;
      const tn = /^فريق\s/.test(teamName || '') ? teamName : 'فريق ' + (teamName || '');
      put(el, h('h3', {}, icon('image'), h('span', { text: `مشاريع ${tn} ومبادراته` })),
        h('p', { class: 'a-lead', text: `${rows.length} من الأعمال الموثقة${acc ? `، قُبل منها ${acc}` : ''}. يرسلها قائد الفريق، ولا يراها إلا الفريق ومسؤول المشاريع.` }),
        h('div', { class: 'a-list' }, rows.map(x => subItem(x))));
      el.hidden = false;
    })();
    return el;
  }

  // the projects officer and the admin: the review desk
  function projectsDesk(admin, fk) {
    const R = { rows: [], err: '', filter: 'submitted' };
    const el = h('section', { class: 'a-card a-pjs', 'data-projects': '', 'aria-labelledby': fk + '-h' });
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    async function load() {
      const r = await YB.rpc('yb_submissions_queue', {});
      R.rows = r.ok && Array.isArray(r.data) ? r.data : [];
      R.err = r.ok ? '' : errMsg(r);
      if (!r.ok) sessionLost(r);
    }
    async function refresh(msg, focus) { await load(); paint(); if (msg) say(msg); if (focus) focusFk(focus); }
    function review(x) {
      if (x.status !== 'submitted' && !admin) return null;
      const id = uid('f');
      const note = h('textarea', { id, class: 'a-note-in', rows: 2, maxlength: 500, 'data-fk': 'snote-' + x.id, placeholder: 'مثل: أضيفوا صورة للعمل نفسه، أو وضّحوا عدد المستفيدين.' });
      const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
      const go = async (decision, done) => {
        const nv = String(note.value || '').trim();
        if (decision === 'return' && !nv) { msg.textContent = 'اكتب ملاحظة توضّح للفريق المطلوب تعديله.'; msg.hidden = false; note.focus(); return; }
        const r = await YB.rpc('yb_review_submission', nv ? { id: x.id, decision, note: nv } : { id: x.id, decision });
        if (!r.ok) { if (sessionLost(r)) return; msg.textContent = errMsg(r); msg.hidden = false; return; }
        await refresh(done, fk + '-refresh');
      };
      const rej = armed(btn('لا يُقبل', 'x', 'btn-ghost', null, { 'data-fk': 'srej-' + x.id }), 'اضغط مرة أخرى للتأكيد', () => go('reject', `لم يُقبل عمل ${x.team_name}، وأُبلغ الفريق.`));
      return h('div', { class: 'a-pj-review' }, h('label', { for: id, class: 'a-l', text: 'ملاحظة للفريق (مطلوبة عند الإعادة)' }), note, msg,
        h('div', { class: 'a-actions' },
          btn('اقبله', 'check', 'btn-primary', () => go('accept', `قُبل عمل ${x.team_name}، وأُبلغ الفريق.`), { 'data-fk': 'sacc-' + x.id }),
          btn('أعده للتعديل', 'repeat', 'btn-ghost', () => go('return', `أُعيد عمل ${x.team_name} للتعديل مع ملاحظتك.`), { 'data-fk': 'sret-' + x.id }), rej));
    }
    // the admin picks accepted work for the home page (after checking the parents' consent for its photos)
    function feature(x) {
      if (!admin || x.status !== 'accepted') return null;
      const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
      const go = async show => {
        const r = await YB.rpc('yb_feature_submission', { id: x.id, show });
        if (!r.ok) { if (sessionLost(r)) return; msg.textContent = errMsg(r); msg.hidden = false; return; }
        await refresh(show ? `صار عمل ${x.team_name} معروضًا في الصفحة الرئيسية، وأُبلغ الفريق.` : `أُخفي عمل ${x.team_name} من الصفحة الرئيسية.`, 'sfeat-' + x.id);
      };
      const b = x.featured
        ? btn('أخفِه من الصفحة الرئيسية', 'eye', 'btn-ghost', () => go(false), { 'data-fk': 'sfeat-' + x.id })
        : armed(btn('اعرضه في الصفحة الرئيسية', 'eye', 'btn-ghost', null, { 'data-fk': 'sfeat-' + x.id }),
          'تأكدت من موافقة الأهل على الصور؟ اضغط للعرض', () => go(true));
      return h('div', { class: 'a-pj-feature' },
        h('p', { class: 'a-hint', text: x.featured ? 'يراه زوار الموقع الآن مع صوره (اسم الفريق والعمل فقط، بلا أسماء الأعضاء).'
          : 'يبقى خاصًا حتى تختار عرضه. قبل العرض تأكد أن أولياء أمور من يظهر في الصور موافقون.' }), msg, b);
    }
    function paint() {
      const waiting = R.rows.filter(x => x.status === 'submitted').length;
      const accepted = R.rows.filter(x => x.status === 'accepted');
      const shown = R.filter === 'all' ? R.rows : R.rows.filter(x => x.status === 'submitted');
      const tab = (k, label) => h('button', { type: 'button', class: 'btn btn-sm ' + (R.filter === k ? 'btn-primary' : 'btn-ghost'), 'aria-pressed': String(R.filter === k), 'data-fk': fk + '-f-' + k,
        onclick: () => { R.filter = k; paint(); focusFk(fk + '-f-' + k); } }, h('span', { text: label }));
      const teams = new Set(accepted.map(x => x.team_id)).size;
      put(el, h('h3', { id: fk + '-h' }, icon('image'), h('span', { text: 'مراجعة المشاريع والمبادرات' })),
        h('p', { class: 'a-lead', text: waiting ? `${waiting} من الأعمال بانتظار مراجعتك.` : 'لا أعمال بانتظار المراجعة الآن.' }),
        R.rows.length ? h('p', { class: 'a-hint', text: `كل الأعمال: ${R.rows.length} · المقبولة: ${accepted.length}${teams ? ` من ${teams} ${teams === 1 ? 'فريق' : 'فرق'}` : ''}` }) : null,
        R.err ? h('p', { class: 'a-live-msg', role: 'alert', text: R.err }) : null,
        h('div', { class: 'a-actions', role: 'group', 'aria-label': 'عرض' }, tab('submitted', `بانتظار المراجعة (${waiting})`), tab('all', 'كل الأعمال'),
          btn('تحديث', 'repeat', 'btn-ghost', () => refresh('تم التحديث.', fk + '-refresh'), { 'data-fk': fk + '-refresh' })),
        shown.length ? h('div', { class: 'a-list' }, shown.map(x => subItem(x, { teamName: x.team_name, after: [review(x), feature(x)].filter(Boolean) })))
          : h('p', { class: 'a-empty', text: R.rows.length ? 'لا شيء هنا. اختر «كل الأعمال» لرؤية ما رُوجع.' : 'لم ترسل الفرق مشاريع أو مبادرات بعد.' }),
        h('p', { class: 'a-hint', text: admin ? 'الصور خاصة: تُفتح بروابط مؤقتة للفريق صاحب العمل ولمسؤولي المشاريع فقط، إلا ما تختار عرضه في الصفحة الرئيسية. لا تعرض صورة فيها قاصر قبل التأكد من موافقة وليّ أمره.'
          : 'الصور خاصة: تُفتح بروابط مؤقتة لك وللفريق صاحب العمل فقط. لا تُنشر صورة فيها قاصر قبل التأكد من موافقة وليّ أمره. العرض في الصفحة الرئيسية يقرره المشرف العام.' }));
    }
    return { el, start: async () => { put(el, skeleton()); await load(); paint(); } };
  }

  /* ------------------------------------------------------------------ JUDGING AND FINAL RESULTS (migration 0010) */
  // c-score: hifz, fahm, tatbiq (c-rubric: roles, execution, documentation), football, chess = 100. Judges are parents or
  // the admin, chosen by the admin; they give points and write WHY for every score. Nothing is public until the admin
  // publishes; then the team's people read their breakdown with the reasons (never the judges' names). The server holds
  // every cap and rule; the numbers here only label the inputs.
  const RUB = Array.isArray(W.rubric) ? W.rubric : [];
  const capIn = (word, dflt) => { const m = String(W.scoreLine || '').match(new RegExp(word + '\\s+(\\d+)')); return m ? Number(m[1]) : dflt; };
  const AXIS = { hifz: 'الحفظ', fahm: 'الفهم', tatbiq: 'التطبيق', football: 'كرة القدم', chess: 'الشطرنج' };
  const AXIS_CAP = { hifz: capIn('الحفظ', 10), fahm: capIn('الفهم', 15), tatbiq: capIn('التطبيق', 45), football: capIn('كرة القدم', 20), chess: capIn('الشطرنج', 10) };
  const rubAt = (i, label, cap) => ({ label: (RUB[i] && RUB[i][0]) || label, cap: (RUB[i] && Number(RUB[i][1])) || cap });
  const CRIT = [
    { k: 'hifz', axis: 'hifz', label: 'الحفظ والتسميع', cap: AXIS_CAP.hifz },
    { k: 'fahm', axis: 'fahm', label: 'الفهم والتفسير', cap: AXIS_CAP.fahm },
    Object.assign({ k: 'roles', axis: 'tatbiq' }, rubAt(0, 'مشاركة أعضاء الفريق وتوزيع الأدوار', 10)),
    Object.assign({ k: 'execution', axis: 'tatbiq' }, rubAt(1, 'التنفيذ الفعلي للمشروع', 30)),
    Object.assign({ k: 'documentation', axis: 'tatbiq' }, rubAt(2, 'توثيق النتائج والأثر', 5))];
  const critOf = k => CRIT.find(c => c.k === k) || { k, label: AXIS[k] || k, cap: AXIS_CAP[k] };
  const fmtPts = v => (v === null || v === undefined || v === '' ? '—' : String(Math.round(Number(v) * 100) / 100));
  const teamWord = n => (/^فريق\s/.test(String(n || '')) ? String(n) : `فريق ${n || ''}`);
  const AXIS_ORDER = ['hifz', 'fahm', 'tatbiq', 'football', 'chess'];

  // a judge (a parent or the admin): every approved team, the criteria of their axes, points + the reason
  function judgeDesk(fk) {
    const J = { data: null, open: {} };
    const el = h('section', { class: 'a-card a-judge', hidden: true, 'data-judge': '', 'aria-labelledby': fk + '-h' });
    async function load() {
      const r = await YB.rpc('yb_my_judging', {});
      J.data = r.ok && r.data && typeof r.data === 'object' ? r.data : null;
      if (!r.ok) sessionLost(r);
    }
    function critRow(t, c) {
      const s = (t.scores || {})[c.k] || null;
      const lock = !!J.data.published;
      const pid = uid('f'), rid = uid('f');
      const pts = h('input', { id: pid, type: 'number', min: 0, max: c.cap, step: 0.5, inputmode: 'decimal', class: 'a-judge-pts', disabled: lock,
        value: s ? Number(s.points) : '', 'data-fk': `jp-${t.team_id}-${c.k}` });
      const why = h('textarea', { id: rid, class: 'a-note-in', rows: 2, maxlength: 500, disabled: lock, 'data-fk': `jr-${t.team_id}-${c.k}`,
        placeholder: 'لماذا هذه الدرجة؟ مثل: تلاوة صحيحة مع تردد في الآية الرابعة.' });
      why.value = s ? s.reason : '';
      const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
      const bad = (txt, f) => { msg.textContent = txt; msg.hidden = false; say(txt); if (f) f.focus(); };
      const save = btn(s ? 'احفظ التعديل' : 'احفظ الدرجة', 'check', 'btn-primary', async () => {
        const v = pts.value === '' ? null : Number(pts.value);
        const rs = String(why.value || '').trim();
        if (v === null || !Number.isFinite(v)) return bad('اكتب الدرجة أولًا.', pts);
        if (v < 0 || v > c.cap) return bad(`الدرجة من 0 إلى ${c.cap}.`, pts);
        if (rs.length < 3) return bad('اكتب سبب الدرجة: يقرؤه الفريق بعد إعلان النتائج.', why);
        const r = await YB.rpc('yb_judge_score', { team_id: t.team_id, criterion: c.k, points: v, reason: rs });
        if (!r.ok) { if (sessionLost(r)) return; return bad(errMsg(r)); }
        say(`حُفظت درجة «${c.label}» ل${teamWord(t.name)}.`);
        await load();
        paint(`jp-${t.team_id}-${c.k}`);
      }, { 'data-fk': `js-${t.team_id}-${c.k}` });
      return h('div', { class: 'a-judge-c' + (s ? ' done' : ''), 'data-crit': c.k },
        h('div', { class: 'a-judge-top' }, h('label', { for: pid, class: 'a-l', text: c.label }), chip(`من ${c.cap}`, 'muted'), s ? chip('مُقيَّم', 'ok') : null),
        h('div', { class: 'a-judge-in' }, pts, h('div', { class: 'a-f' }, h('label', { for: rid, class: 'a-hint', text: 'سبب الدرجة' }), why)),
        msg, lock ? null : h('div', { class: 'a-actions' }, save));
    }
    async function loadSubs(t, box) {
      if (!box || box.dataset.ready) return;
      box.dataset.ready = '1';
      const r = await read('yb_submissions', { select: SUB_COLS, filter: { team_id: 'eq.' + t.team_id, status: 'eq.accepted' }, order: 'created_at.desc' });
      const rows = r.ok && Array.isArray(r.data) ? r.data : [];
      put(box, h('h4', { class: 'a-sub', text: 'مشاريع الفريق ومبادراته المقبولة' }),
        rows.length ? h('div', { class: 'a-list' }, rows.map(x => subItem(x))) : h('p', { class: 'a-hint', text: 'لا مشاريع مقبولة لهذا الفريق بعد.' }));
    }
    function teamBox(t) {
      const mine = J.data.axes || [];
      const crits = CRIT.filter(c => mine.includes(c.axis));
      const done = crits.filter(c => (t.scores || {})[c.k]).length;
      const subsBox = mine.includes('tatbiq') && !t.conflict ? h('div', { class: 'a-judge-subs', 'data-jsubs': t.team_id }) : null;
      const d = h('details', { class: 'a-judge-t', open: !!J.open[t.team_id], 'data-jteam': t.team_id });
      d.addEventListener('toggle', () => { J.open[t.team_id] = d.open; if (d.open && subsBox) loadSubs(t, subsBox); });
      d.append(h('summary', { 'data-fk': 'jt-' + t.team_id }, h('b', { text: t.name }),
        t.conflict ? chip('لا تحكّمه', 'sun') : chip(`${done} من ${crits.length}`, done === crits.length ? 'ok' : 'brand')));
      if (t.conflict) d.append(h('p', { class: 'a-note', text: 'لديك ابن أو ابنة في هذا الفريق، أو أنت من أعضائه، فلا تحكّمه. يحكّمه حكم آخر.' }));
      else { crits.forEach(c => d.append(critRow(t, c))); if (subsBox) d.append(subsBox); }
      if (d.open && subsBox) loadSubs(t, subsBox);
      return d;
    }
    function paint(focus) {
      if (!J.data || !Array.isArray(J.data.axes) || !J.data.axes.length) { el.hidden = true; return; }
      put(el, h('h3', { id: fk + '-h' }, icon('scale'), h('span', { text: 'التحكيم' })),
        h('p', { class: 'a-lead', text: `اختارتك الإدارة حكمًا في: ${J.data.axes.map(a => AXIS[a]).join('، ')}. اكتب سبب كل درجة؛ يقرؤه الفريق بعد إعلان النتائج دون اسمك.` }),
        J.data.published ? h('p', { class: 'a-note', text: 'أُعلنت النتائج، فالدرجات مقفلة الآن.' }) : null,
        (J.data.teams || []).length ? h('div', { class: 'a-list' }, J.data.teams.map(teamBox)) : h('p', { class: 'a-empty', text: 'لا فرق معتمدة للتحكيم بعد.' }));
      el.hidden = false;
      if (focus) { const f = el.querySelector(`[data-fk="${CSS.escape(focus)}"]`); if (f) f.focus({ preventScroll: true }); }
    }
    return { el, start: async () => { await load(); paint(); } };
  }

  // the admin: choose the judges, read every score with its judge and reason, football and chess points, publish
  function judgingAdmin(fk) {
    const G = { judges: [], board: null, err: '' };
    const el = h('div', { class: 'a-judging', 'data-judging-admin': '' });
    const msgEl = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const showMsg = t => { msgEl.textContent = t || ''; msgEl.hidden = !t; if (t) say(t); };
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    async function load() {
      const [a, b] = await Promise.all([YB.rpc('yb_judges_list', {}), YB.rpc('yb_results_board', {})]);
      G.judges = a.ok && Array.isArray(a.data) ? a.data : [];
      G.board = b.ok && b.data && typeof b.data === 'object' ? b.data : null;
      G.err = !a.ok ? errMsg(a) : !b.ok ? errMsg(b) : '';
      if (!a.ok) sessionLost(a);
    }
    async function refresh(msg, focus) { await load(); paint(); if (msg) say(msg); if (focus) focusFk(focus); }
    const roleWord = r => (r === 'admin' ? 'الإدارة' : 'ولي أمر');
    function axisBoxes(sel, who) {
      return h('div', { class: 'a-axes', role: 'group', 'aria-label': `محاور ${who}` }, ['hifz', 'fahm', 'tatbiq'].map(a => {
        const id = uid('f');
        return h('label', { class: 'a-check', for: id }, h('input', { type: 'checkbox', id, value: a, checked: sel.includes(a) }), h('span', { text: AXIS[a] }));
      }));
    }
    const picked = box => Array.from(box.querySelectorAll('input:checked')).map(i => i.value);
    async function setAxes(id, axes, done, focus) {
      const r = await YB.rpc('yb_set_judge', { target: id, axes });
      if (!r.ok) { if (sessionLost(r)) return; return showMsg(errMsg(r)); }
      showMsg('');
      await refresh(done, focus);
    }
    function judgesCard() {
      const eligible = (A.profiles || []).filter(p => (p.role === 'parent' || p.role === 'admin') && !G.judges.some(j => j.user_id === p.id));
      const rows = G.judges.map(j => {
        const ax = axisBoxes(j.axes || [], j.full_name || '');
        return h('li', { class: 'a-judge-row', 'data-judge-row': j.user_id },
          h('div', { class: 'a-judge-top' }, h('b', { text: j.full_name || '—' }), chip(roleWord(j.role), 'muted'), chip(`${j.scored} درجة`, 'brand')),
          ax, h('div', { class: 'a-actions' },
            btn('احفظ المحاور', 'check', 'btn-ghost', () => {
              const a = picked(ax);
              if (!a.length) return showMsg('اختر محورًا واحدًا على الأقل، أو أزله من الحكّام.');
              setAxes(j.user_id, a, `حُفظت محاور ${j.full_name}.`, 'jax-' + j.user_id);
            }, { 'data-fk': 'jax-' + j.user_id }),
            armed(btn('أزله من الحكّام', 'x', 'btn-ghost', null, { 'data-fk': 'jrm-' + j.user_id }), 'اضغط مرة أخرى للإزالة',
              () => setAxes(j.user_id, [], `أُزيل ${j.full_name} من الحكّام. تبقى درجاته السابقة في السجل.`, fk + '-pick'))));
      });
      const sel = h('select', { class: 'a-select', 'aria-label': 'اختر الحساب', 'data-fk': fk + '-pick' },
        [h('option', { value: '', text: 'اختر ولي أمر أو مشرفًا…' }), ...eligible.map(p => h('option', { value: p.id, text: `${p.full_name || p.email || '—'} (${roleWord(p.role)})` }))]);
      const ax = axisBoxes(['hifz'], 'الحكم الجديد');
      const add = btn('اجعله حكمًا', 'scale', 'btn-primary', () => {
        if (!sel.value) return showMsg('اختر الحساب أولًا.');
        const a = picked(ax);
        if (!a.length) return showMsg('اختر محورًا واحدًا على الأقل.');
        setAxes(sel.value, a, `أصبح ${sel.selectedOptions[0].textContent} حكمًا، ووصله إشعار.`, fk + '-pick');
      }, { 'data-fk': fk + '-add' });
      return h('section', { class: 'a-card', 'aria-labelledby': fk + '-jh', 'data-judges': '' }, h('h3', { id: fk + '-jh' }, icon('users'), h('span', { text: 'الحكّام' })),
        h('p', { class: 'a-lead', text: 'تختار الإدارة الحكّام من أولياء الأمور أو المشرفين. ينشئ الحكم حسابًا بنوع «ولي أمر» أولًا، ثم تختاره هنا وتحدد محاوره. لا يحكّم أحد فريقًا فيه ابنه.' }),
        rows.length ? h('ul', { class: 'a-judge-l' }, rows) : h('p', { class: 'a-empty', text: 'لم تختر أي حكم بعد.' }),
        h('div', { class: 'a-judge-add' }, h('h4', { class: 'a-sub', text: 'أضف حكمًا' }),
          eligible.length ? [sel, ax, h('div', { class: 'a-actions' }, add)] : h('p', { class: 'a-hint', text: 'لا حسابات أولياء أمور متاحة. اطلب من الحكم أن ينشئ حسابًا بنوع «ولي أمر» أولًا.' })));
    }
    function axisForm(t, ax, pubd) {
      const cur = ((G.board && G.board.admin) || []).find(s => s.team_id === t.team_id && s.axis === ax);
      const pid = uid('f'), rid = uid('f');
      const pts = h('input', { id: pid, type: 'number', min: 0, max: AXIS_CAP[ax], step: 0.5, inputmode: 'decimal', class: 'a-judge-pts', disabled: pubd,
        value: cur ? Number(cur.points) : '', 'data-fk': `ap-${t.team_id}-${ax}` });
      const why = h('textarea', { id: rid, class: 'a-note-in', rows: 2, maxlength: 500, disabled: pubd, 'data-fk': `ar-${t.team_id}-${ax}`,
        placeholder: ax === 'football' ? 'مثل: المركز الأول في المجموعة ثم الثاني في الدور النهائي.' : 'مثل: وصل لاعب الفريق إلى المباراة النهائية.' });
      why.value = cur ? cur.reason : '';
      const save = btn('احفظ', 'check', 'btn-ghost', async () => {
        const v = pts.value === '' ? null : Number(pts.value), rs = String(why.value || '').trim();
        if (v === null || !Number.isFinite(v) || v < 0 || v > AXIS_CAP[ax]) { pts.focus(); return showMsg(`درجة ${AXIS[ax]} من 0 إلى ${AXIS_CAP[ax]}.`); }
        if (rs.length < 3) { why.focus(); return showMsg(`اكتب سبب درجة ${AXIS[ax]}.`); }
        const r = await YB.rpc('yb_admin_score', { team_id: t.team_id, axis: ax, points: v, reason: rs });
        if (!r.ok) { if (sessionLost(r)) return; return showMsg(errMsg(r)); }
        showMsg('');
        await refresh(`حُفظت درجة ${AXIS[ax]} ل${teamWord(t.team_name)}.`, `ap-${t.team_id}-${ax}`);
      }, { 'data-fk': `as-${t.team_id}-${ax}`, disabled: pubd });
      return h('div', { class: 'a-judge-c' + (cur ? ' done' : '') },
        h('div', { class: 'a-judge-top' }, h('label', { for: pid, class: 'a-l', text: AXIS[ax] }), chip(`من ${AXIS_CAP[ax]}`, 'muted')),
        h('div', { class: 'a-judge-in' }, pts, h('div', { class: 'a-f' }, h('label', { for: rid, class: 'a-hint', text: 'السبب' }), why)),
        pubd ? null : h('div', { class: 'a-actions' }, save));
    }
    function boardCard() {
      const B = G.board;
      if (!B) return null;
      const teams = B.teams || [], pubd = !!B.published;
      const missing = teams.filter(t => AXIS_ORDER.some(a => t[a] === null || t[a] === undefined)).length;
      const table = h('div', { class: 'a-tablewrap' }, h('table', { class: 'a-ptable a-results' },
        h('thead', {}, h('tr', {}, ['المركز', 'الفريق', ...AXIS_ORDER.map(a => `${AXIS[a]} (${AXIS_CAP[a]})`), 'المجموع'].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, teams.map(t => h('tr', {}, h('td', { text: String(t.rank) }), h('th', { scope: 'row', text: t.team_name }),
          AXIS_ORDER.map(a => h('td', { text: fmtPts(t[a]) })), h('td', {}, h('b', { text: fmtPts(t.total) })))))));
      const details = teams.map(t => {
        const sc = (B.scores || []).filter(s => s.team_id === t.team_id);
        return h('details', { class: 'a-judge-t', 'data-board-team': t.team_id }, h('summary', { 'data-fk': 'bt-' + t.team_id }, h('b', { text: t.team_name }), chip(`${fmtPts(t.total)} من 100`, 'brand')),
          sc.length ? h('ul', { class: 'a-reasons' }, sc.map(s => h('li', {},
            h('div', { class: 'a-judge-top' }, h('b', { text: critOf(s.criterion).label }), chip(`${fmtPts(s.points)} من ${critOf(s.criterion).cap}`, 'ok'), h('small', { class: 'a-hint', text: s.judge || '' })),
            h('p', { class: 'a-pj-txt', text: s.reason })))) : h('p', { class: 'a-hint', text: 'لم يقيّم أي حكم هذا الفريق بعد.' }),
          axisForm(t, 'football', pubd), axisForm(t, 'chess', pubd));
      });
      const pub = armed(btn(pubd ? 'أوقف إعلان النتائج' : 'أعلن النتائج للجميع', pubd ? 'eye' : 'send', pubd ? 'btn-ghost' : 'btn-primary', null, { 'data-fk': fk + '-pub' }),
        pubd ? 'اضغط مرة أخرى لإيقاف الإعلان' : 'اضغط مرة أخرى للإعلان', async () => {
          const r = await YB.rpc('yb_publish_results', { publish: !pubd });
          if (!r.ok) { if (sessionLost(r)) return; return showMsg(errMsg(r)); }
          await refresh(pubd ? 'أُوقف إعلان النتائج، وفُتح التعديل من جديد.' : 'أُعلنت النتائج للجميع ووصل إشعار لكل الحسابات.', fk + '-pub');
        });
      return h('section', { class: 'a-card', 'aria-labelledby': fk + '-bh', 'data-board': '' }, h('h3', { id: fk + '-bh' }, icon('trophy'), h('span', { text: 'الدرجات والنتائج' })),
        W.scoreLine ? h('p', { class: 'a-lead', text: W.scoreLine }) : null,
        h('p', { class: 'a-hint', text: 'درجة كل معيار هي متوسط درجات الحكّام فيه، والتطبيق مجموع معاييره الثلاثة. التساوي يظهر تساويًا كما هو.' }),
        teams.length ? table : h('p', { class: 'a-empty', text: 'لا فرق معتمدة بعد.' }),
        details.length ? h('div', { class: 'a-list' }, details) : null,
        h('div', { class: 'a-pub' }, pubd ? chip('النتائج معلنة الآن', 'ok') : chip('النتائج غير معلنة', 'muted'),
          !pubd && missing ? h('p', { class: 'a-note', text: `${missing} من الفرق تنقصها درجة محور واحد على الأقل. يمكنك الإعلان، لكن الناقص يُحسب صفرًا.` }) : null,
          h('div', { class: 'a-actions' }, pub)));
    }
    let desk = null;
    function paint() {
      if (!desk) { desk = judgeDesk(fk + '-me'); desk.start(); }
      put(el, ...[G.err ? h('p', { class: 'a-live-msg', role: 'alert', text: G.err }) : null, msgEl, desk.el, judgesCard(), boardCard()].filter(Boolean));
    }
    return { el, start: async () => { put(el, skeleton()); await load(); paint(); } };
  }

  // the team's people, after publication: the result and the reasons (no judges' names)
  function scoresCard() {
    const el = h('section', { class: 'a-card a-scores', hidden: true, 'data-scores': '' });
    (async () => {
      const r = await YB.rpc('yb_my_scores', {});
      const d = r.ok && r.data;
      if (!d || !d.published || !Array.isArray(d.teams) || !d.teams.length) return;
      const kids = [];
      d.teams.forEach((t, i) => {
        const why = c => (t.reasons || []).filter(x => x.criterion === c.k);
        const adm = ax => (t.admin || []).find(x => x.axis === ax);
        const rows = [...CRIT.map(c => ({ label: c.label, pts: t[c.k], cap: c.cap, reasons: why(c).map(x => x.reason) })),
          ...['football', 'chess'].map(ax => ({ label: AXIS[ax], pts: t[ax], cap: AXIS_CAP[ax], reasons: adm(ax) ? [adm(ax).reason] : [] }))];
        kids.push(h('h3', { id: 'sc-h-' + i }, icon('trophy'), h('span', { text: `نتيجة ${teamWord(t.team_name)}: ${fmtPts(t.total)} من 100 · المركز ${t.rank}` })),
          h('ul', { class: 'a-reasons' }, rows.map(x => h('li', {},
            h('div', { class: 'a-judge-top' }, h('b', { text: x.label }), chip(`${fmtPts(x.pts)} من ${x.cap}`, x.pts === null || x.pts === undefined ? 'muted' : 'ok')),
            x.reasons.length ? h('ul', { class: 'a-why' }, x.reasons.map(rs => h('li', { text: rs }))) : null))),
          h('p', { class: 'a-hint', text: 'الأسباب كما كتبها الحكّام، دون أسمائهم. للتظلم راجع إدارة المسابقة خلال المدة المعلنة.' }));
      });
      put(el, ...kids);
      el.hidden = false;
    })();
    return el;
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
      put(sh.body, errorBlock(YB.errorText(r.error), () => { put(sh.body, skeleton()); route(); }));
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
    put(body, ...(qref ? [claimCard, createCard] : [createCard, claimCard]));
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
    L.subs = leaderSubs({ id: t.team_id, name: t.team_name, status: t.status }, 'lsub');
    if (!L.chat) { L.chat = chatRoom(false, 'lchat'); L.chat.start(); }
    dashLayout([
      { key: 'home', label: 'نظرة عامة', icon: 'chart', nodes: [(L.boxes.mday = matchDayCard(t.team_id, t.team_name, 'leader')), (L.boxes.next = nextCard(leaderNext())), leaderTiles(t), L.boxes.top, L.boxes.check, scoresCard(), announceFeed()] },
      feedGroup(),
      { key: 'matches', label: 'المباريات والمواعيد', icon: 'trophy', one: true, nodes: [L.dates, L.sched.node, L.boxes.marks] },
      { key: 'team', label: 'الفريق', icon: 'users', nodes: [L.boxes.roster, L.boxes.roles, L.boxes.code, (L.style || (L.style = teamStyleCard(t), L.style.start(), L.style)).el, L.printBox] },
      { key: 'projects', label: 'المشاريع والمبادرات', icon: 'image', one: true, nodes: [L.subs.el] },
      { key: 'players', label: 'لاعبون يبحثون عن فريق', icon: 'users', one: true, nodes: [poolCard('pool')] },
      { key: 'room', label: 'غرفة القادة', icon: 'bell', one: true, nodes: [L.chat.el] }]);
    L.subs.start();
    L.boxes.mday.start();
    paintLeader();
    startSchedule([L.sched]);
    if (focus) { const f = L.boxes.top.querySelector('[data-focus]'); if (f) f.focus({ preventScroll: true }); }
  }
  function paintLeader() { paintNext(); paintTop(); paintCheck(); paintMarks(); paintRoster(); paintRoles(); paintCode(); paintPrint(); }
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
    put(box, h('h3', { id: 'l-marks-h' }, icon('trophy'), h('span', { text: 'هدّافو فريقنا و«روح الفريق»' })),
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
      put(box, head, h('ul', { class: 'a-roles' }, ROLE_ORDER.map(k => { const m = holder(k); return h('li', {}, h('b', { text: ROLE_W[k] + ': ' }), m ? m.full_name : '—'); })),
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
    put(box, head,
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
    put(box, h('h3', { id: 'l-check-h' }, icon('check'), h('span', { text: 'خطوات اعتماد فريقك' })), YBChecklist.render(r.data));
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
    put(box, ...nodes);
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
    put(box, 
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
    put(L.boxes.code, 
      h('h3', { id: 'l-code-h' }, icon('lock'), h('span', { text: 'رمز الانضمام' })),
      h('p', { class: 'a-code', dir: 'ltr', 'aria-label': 'رمز الفريق: ' + code.split('').join(' '), 'data-code': '', text: code }),
      h('p', { class: 'a-lead', text: 'أعطِ هذا الرمز لأعضاء فريقك ولأولياء أمورهم. يدخله العضو مع اسمه كما كتبته في القائمة ليربط حسابه بالفريق، ويدخله ولي الأمر مع اسم ابنه ليتابعه. لا تنشره علنًا.' }),
      h('div', { class: 'a-actions' }, copy, regen));
  }

  /* --- print the registration form pre-filled */
  function paintPrint() {
    const msg = h('p', { class: 'a-err', role: 'alert', hidden: true });
    const xStatus = h('p', { class: 'a-hint', role: 'status', 'aria-live': 'polite', 'data-xlsx-status': '' });
    const xbtn = btn('نزّل ملف Excel لفريقك', 'file-text', 'btn-ghost', () => saveWorkbook(xbtn, leaderWorkbook, `yanabee-team-${stamp()}.xlsx`, xStatus), { 'data-fk': 'xlsx-team' });
    put(L.printBox, 
      h('h3', {}, icon('printer'), h('span', { text: 'استمارة التسجيل جاهزة' })),
      h('p', { class: 'a-lead', text: 'نملأ لك استمارة التسجيل بما أدخلته هنا، فتراجعها وتطبعها مع موافقات أولياء الأمور. تُحفظ المسودة على هذا الجهاز فقط.' }),
      h('div', { class: 'a-actions' }, btn('اطبع الاستمارة جاهزة', 'printer', 'btn-primary', () => {
        if (!writeDraft()) { msg.textContent = 'تعذّر حفظ المسودة في هذا المتصفح، فلا يمكن تعبئة الاستمارة تلقائيًا.'; msg.hidden = false; say(msg.textContent); return; }
        location.href = 'register.html';
      }, { 'data-fk': 'print-form' }), xbtn), msg, xStatus);
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
    if (!r.ok) { if (sessionLost(r)) return; put(sh.body, errorBlock(YB.errorText(r), () => { put(sh.body, skeleton()); route(); })); return; }
    const row = (Array.isArray(r.data) ? r.data : []).find(x => x.my_role === 'member');
    if (!row) {
      put(sh.body, h('section', { class: 'a-card' }, h('h3', {}, icon('users'), h('span', { text: 'انضم إلى فريقك' })),
        h('p', { class: 'a-lead', text: 'اطلب من قائد فريقك رمز الفريق، ثم اكتبه هنا مع اسمك كما كتبه في قائمة الفريق.' }), joinForm('member')), seekCard('seek'));
      return;
    }
    const ro = await read('my_roster', { select: 'member_id,team_id,full_name,is_leader,joined,is_me,consent_status', filter: { team_id: 'eq.' + row.team_id }, order: 'full_name.asc' });
    if (seq !== S.seq) return;
    const roster = ro.ok ? (ro.data || []) : [];
    const me = roster.find(x => x.is_me);
    const box = scheduleBox({ id: row.team_id, name: row.team_name });
    const mday = matchDayCard(row.team_id, row.team_name, 'member');
    const mv = [
      announceFeed(),
      scoresCard(),
      h('section', { class: 'a-card a-teamcard' }, h('div', { class: 'a-team-top' }, h('div', {}, h('h3', { text: row.team_name }), row.area ? h('small', { class: 'a-hint', text: row.area }) : null), statusChip(row.status)),
        h('p', { class: 'a-lead', text: 'أنت عضو في هذا الفريق.' })),
      h('section', { class: 'a-card' }, h('h3', {}, icon('users'), h('span', { text: 'أعضاء الفريق' })),
        ro.ok ? h('ul', { class: 'a-names a-names-roster' }, roster.map(x => h('li', {}, h('span', { text: x.full_name }), x.is_leader ? chip('قائد', 'brand') : null, x.is_me ? chip('أنا', 'ok') : null)))
          : h('p', { class: 'a-empty', text: 'تعذّر تحميل أسماء الفريق الآن.' })),
      h('section', { class: 'a-card' }, h('h3', {}, icon('user-check'), h('span', { text: 'موافقة ولي الأمر' })),
        me ? consentBlock(me.consent_status) : h('p', { class: 'a-empty', text: 'لا تتوفر حالة الموافقة الآن.' })),
      teamDates(row.team_id, row.status, false),
      row.status === 'approved' ? teamSubsView(row.team_id, row.team_name) : null,
      box.node];
    dashLayout([
      { key: 'home', label: 'نظرة عامة', icon: 'chart', nodes: [mday, nextCard(memberNext(row, ro.ok ? me : null)), memberTiles(row), mv[2], mv[0], mv[1], mv[4]] },
      feedGroup(),
      { key: 'matches', label: 'المباريات والمواعيد', icon: 'trophy', one: true, nodes: [mv[5], mv[7]] },
      { key: 'team', label: 'الفريق', icon: 'users', nodes: [mv[3], seekCard('seek')] },
      { key: 'projects', label: 'المشاريع والمبادرات', icon: 'image', one: true, nodes: [mv[6]] }]);
    startSchedule([box]);
    mday.start();
  }

  /* ------------------------------------------------------------------ PARENT */
  async function viewParent(profile, seq) {
    const sh = shell(profile);
    sh.body.append(skeleton());
    mount(sh.el, S.focusNext);
    const r = await read('my_children', { select: 'member_id,full_name,consent_status,team_id,team_name,team_area,team_status', order: 'full_name.asc' });
    if (seq !== S.seq) return;
    if (!r.ok) { if (sessionLost(r.error)) return; put(sh.body, errorBlock(YB.errorText(r.error), () => { put(sh.body, skeleton()); route(); })); return; }
    const kids = r.data || [];
    const jd = judgeDesk('pjdg');
    jd.start();
    const mday = kids.length ? matchDayCard(kids[0].team_id, kids[0].team_name, 'parent') : null;
    const home = [mday, nextCard(parentNext(kids)), parentTiles(kids), announceFeed(), scoresCard()];
    const nodes = home, games = [];
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
      games.push(teamDates(k.team_id, k.team_status, false), k.team_status === 'approved' ? teamSubsView(k.team_id, k.team_name) : null, b.node);
    });
    const link = h('section', { class: 'a-card' }, h('h3', {}, icon('user-check'), h('span', { text: kids.length ? 'اربط ابنًا أو ابنة آخر' : 'اربط ابنك أو ابنتك' })),
      h('p', { class: 'a-lead', text: 'اطلب من قائد الفريق رمز الفريق، واكتب اسم الطفل كما كتبه في القائمة.' }), joinForm('parent'));
    dashLayout([
      { key: 'home', label: 'نظرة عامة', icon: 'chart', nodes: home },
      feedGroup(),
      { key: 'judge', label: 'التحكيم', icon: 'scale', one: true, nodes: [jd.el] },
      { key: 'matches', label: 'المباريات والمشاريع', icon: 'trophy', one: true, nodes: games },
      { key: 'link', label: 'ربط ابن أو ابنة', icon: 'user-check', nodes: [link, guardianSeekCard('gseek')] }]);
    startSchedule(boxes);
    if (mday) mday.start();
  }

  /* ------------------------------------------------------------------ SOCIAL (migration 0011): the news feed, customization,
     the leader handover and the admin's statistics. The admin publishes at once; a team leader's post waits for the admin
     (who also checks the parents' consent for any photo). Everyone signed in reacts; comments are for grown-ups unless the
     admin lets members comment. A child never shows a photo of themselves: initials in the team's color. */
  const FEED_BUCKET = 'yanabee-feed', AV_BUCKET = 'yanabee-avatars', FEED_PHOTOS = 4, FEED_MAX = 1500;
  const REACT = [['clap', '👏', 'تصفيق'], ['heart', '❤️', 'أحببته'], ['dua', '🤲', 'دعاء'], ['strong', '💪', 'قوة']];
  const PALETTE = { teal: ['فيروزي', '#0a7680'], blue: ['أزرق', '#1f63b8'], green: ['أخضر', '#1d7a37'], amber: ['عنبري', '#8a5a00'],
    orange: ['برتقالي', '#b3461a'], red: ['أحمر', '#b3302f'], purple: ['بنفسجي', '#5b3fb5'], pink: ['وردي', '#a8326a'] };
  const BADGES = { star: ['نجمة', '⭐'], moon: ['هلال', '🌙'], sun: ['شمس', '☀️'], leaf: ['ورقة', '🌿'], book: ['كتاب', '📖'],
    ball: ['كرة', '⚽'], chess: ['شطرنج', '♟️'], bolt: ['برق', '⚡'], heart: ['قلب', '💚'], shield: ['درع', '🛡️'] };
  const NOTE_GROUPS = [['matches', 'المباريات والنتائج والمواعيد'], ['projects', 'المشاريع والمبادرات'], ['announcements', 'الإعلانات'], ['feed', 'الأخبار والتعليقات على منشوراتي']];
  const SIZES = { m: 'عادي', l: 'كبير', xl: 'أكبر' };
  const THEMES = { auto: 'مثل جهازي', light: 'فاتح', dark: 'داكن' };
  const POST_ERR = { too_fast: 'نشرت قبل لحظات. انتظر قليلًا ثم انشر.', too_many: 'لديك خمسة أخبار تنتظر موافقة المشرف. انتظر حتى يراجعها.',
    no_team: 'تحتاج فريقًا لتنشر أخباره.', too_many_photos: 'أربع صور على الأكثر في الخبر.', bad_photo: 'تعذّر ربط إحدى الصور. احذفها وأعد اختيارها.' };
  const CMT_ERR = { too_fast: 'علّقت قبل لحظات. انتظر ثواني قليلة.', chat_muted: 'أوقفت الإدارة تعليقاتك مؤقتًا؛ يمكنك القراءة فقط.',
    contact_not_allowed: 'لا تُكتب أرقام الهواتف ولا البريد في التعليقات، حفاظًا على الجميع.', not_found: 'هذا الخبر لم يعد متاحًا.' };

  function timeAgo(iso) {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'الآن';
    if (s < 3600) { const m = Math.round(s / 60); return m === 1 ? 'قبل دقيقة' : m === 2 ? 'قبل دقيقتين' : m <= 10 ? `قبل ${m} دقائق` : `قبل ${m} دقيقة`; }
    if (s < 86400) { const hh = Math.round(s / 3600); return hh === 1 ? 'قبل ساعة' : hh === 2 ? 'قبل ساعتين' : hh <= 10 ? `قبل ${hh} ساعات` : `قبل ${hh} ساعة`; }
    if (s < 172800) return 'أمس';
    try { return new Date(t).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
  }
  // a round picture, or the first letter on the team's color (always for a child)
  function avatarEl(name, path, color, cls) {
    const c = (PALETTE[color] || PALETTE.teal)[1];
    const el = h('span', { class: 'a-av' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true', style: `--av:${c}`, text: (String(name || '?').trim().charAt(0) || '?') });
    if (path) photoUrls([path], AV_BUCKET).then(u => { if (u[path]) put(el, h('img', { src: u[path], alt: '', loading: 'lazy', decoding: 'async' })); });
    return el;
  }

  /* --- personal settings (yb_my_prefs / yb_save_prefs): theme, accent, text size, hidden sections, notifications, picture */
  async function loadPrefs() {
    let r;
    try { r = await YB.rpc('yb_my_prefs', {}); } catch (e) { r = null; }
    applyPrefs(r && r.ok && r.data && typeof r.data === 'object' ? r.data : null);
  }
  function applyPrefs(p) {
    S.prefs = p || { theme: 'auto', accent: 'teal', text_size: 'm', hidden_sections: [], notify_off: [], avatar_path: null, can_avatar: false };
    const de = document.documentElement;
    Object.keys(PALETTE).forEach(k => de.classList.toggle('acc-' + k, k === S.prefs.accent && k !== 'teal'));
    ['l', 'xl'].forEach(k => de.classList.toggle('ts-' + k, S.prefs.text_size === k));
    if (p && S.prefs.theme && S.prefs.theme !== 'auto') {
      de.dataset.theme = S.prefs.theme;
      try { localStorage.setItem('yanabee-theme', S.prefs.theme); } catch (e) { /* storage blocked */ }
    } else if (p) {
      try { localStorage.removeItem('yanabee-theme'); } catch (e) { /* storage blocked */ }
      de.dataset.theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  }
  async function savePref(patch, done) {
    const r = await YB.rpc('yb_save_prefs', { p: patch });
    if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return false; say(errMsg(r.ok ? { error: r.data && r.data.error } : r)); return false; }
    applyPrefs(r.data.prefs);
    if (done) say(done);
    return true;
  }
  function settingsPanel(profile, onAvatar) {
    const P = () => S.prefs || {};
    const el = h('section', { class: 'a-card a-cust', hidden: true, 'aria-labelledby': 'cust-h', 'data-settings': '' });
    const status = h('p', { class: 'a-hint', role: 'status', 'data-cust-status': '' });
    const saved = msg => { status.textContent = msg || 'حُفظ.'; };
    const radios = (name, legend, opts, current, onPick, cls) => h('fieldset', { class: 'a-cust-set ' + (cls || '') }, h('legend', { text: legend }),
      h('div', { class: 'a-cust-opts' }, Object.keys(opts).map(k => {
        const o = opts[k];
        const inp = h('input', { type: 'radio', name, value: k, checked: k === current, 'data-fk': name + '-' + k });
        inp.addEventListener('change', () => { if (inp.checked) onPick(k); });
        return h('label', { class: 'a-cust-opt' + (o.sw ? ' sw' : ''), style: o.sw ? `--sw:${o.sw}` : null }, inp,
          o.sw ? h('span', { class: 'a-swd', 'aria-hidden': 'true' }) : null, h('span', { class: o.sw ? 'a-sr' : '', text: o.label }));
      })));
    function paint() {
      const p = P();
      const theme = radios('cth', 'المظهر', Object.fromEntries(Object.keys(THEMES).map(k => [k, { label: THEMES[k] }])), p.theme || 'auto',
        async k => { if (await savePref({ theme: k })) saved('حُفظ المظهر.'); });
      const accent = radios('cac', 'لون لوحتي', Object.fromEntries(Object.keys(PALETTE).map(k => [k, { label: PALETTE[k][0], sw: PALETTE[k][1] }])), p.accent || 'teal',
        async k => { if (await savePref({ accent: k })) saved('حُفظ اللون.'); }, 'swatches');
      const size = radios('csz', 'حجم الخط', Object.fromEntries(Object.keys(SIZES).map(k => [k, { label: SIZES[k] }])), p.text_size || 'm',
        async k => { if (await savePref({ text_size: k })) saved('حُفظ حجم الخط.'); });
      // the sections of this screen (the overview always stays)
      const secs = (S.lastGroups || []).filter(g => g && g.key !== 'home');
      const hidden = p.hidden_sections || [];
      const secBox = secs.length ? h('fieldset', { class: 'a-cust-set' }, h('legend', { text: 'أقسام لوحتي' }),
        h('p', { class: 'a-hint', text: 'أخفِ ما لا تحتاجه. تبقى «نظرة عامة» دائمًا.' }),
        h('div', { class: 'a-cust-checks' }, secs.map(g => {
          const cb = h('input', { type: 'checkbox', checked: !hidden.includes(g.key), 'data-fk': 'csec-' + g.key });
          cb.addEventListener('change', async () => {
            const now = new Set(P().hidden_sections || []);
            if (cb.checked) now.delete(g.key); else now.add(g.key);
            if (await savePref({ hidden_sections: Array.from(now) })) { saved(cb.checked ? `أُظهر «${g.label}».` : `أُخفي «${g.label}».`); if (S.lastGroups) dashLayout(S.lastGroups); }
            else cb.checked = !cb.checked;
          });
          return h('label', { class: 'a-check' }, cb, h('span', { text: g.label }));
        }))) : null;
      const off = p.notify_off || [];
      const notes = h('fieldset', { class: 'a-cust-set' }, h('legend', { text: 'التنبيهات' }),
        h('div', { class: 'a-cust-checks' }, NOTE_GROUPS.map(([k, label]) => {
          const cb = h('input', { type: 'checkbox', checked: !off.includes(k), 'data-fk': 'cnote-' + k });
          cb.addEventListener('change', async () => {
            const now = new Set(P().notify_off || []);
            if (cb.checked) now.delete(k); else now.add(k);
            if (await savePref({ notify_off: Array.from(now) })) saved(cb.checked ? `ستصلك تنبيهات «${label}».` : `لن تصلك تنبيهات «${label}».`);
            else cb.checked = !cb.checked;
          });
          return h('label', { class: 'a-check' }, cb, h('span', { text: label }));
        })),
        h('p', { class: 'a-hint', text: 'تصلك دائمًا التنبيهات المهمة: حالة الفريق، وموافقات الأهل، والتحكيم والنتائج، وقرارات الإدارة.' }));
      put(el, h('div', { class: 'a-cust-h' }, h('h3', { id: 'cust-h' }, icon('sparkles'), h('span', { text: 'تخصيص حسابي' })),
          h('button', { type: 'button', class: 'a-link', text: 'إغلاق', onclick: () => el.close() })),
        h('div', { class: 'a-cust-grid' }, h('div', {}, theme, accent, size), h('div', {}, pictureBox(), secBox, notes)), status);
    }
    function pictureBox() {
      const p = P();
      if (!p.can_avatar) return h('div', { class: 'a-cust-set' }, h('b', { class: 'a-l', text: 'صورتك' }),
        h('div', { class: 'a-cust-pic' }, avatarEl(profile.full_name, null, 'teal', 'lg'),
          h('p', { class: 'a-hint', text: 'يظهر الحرف الأول من اسمك بلون فريقك. لا تُرفع صور الأعضاء، حفاظًا عليهم.' })));
      const pickId = uid('f');
      const pick = h('input', { id: pickId, type: 'file', accept: 'image/*', class: 'a-file-h', 'data-fk': 'cpic' });
      const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
      pick.addEventListener('change', async () => {
        const f = pick.files && pick.files[0];
        pick.value = '';
        if (!f) return;
        msg.hidden = true;
        status.textContent = 'جارٍ رفع الصورة…';
        let blob;
        try { blob = await shrinkPhoto(f, 480); } catch (e) { status.textContent = ''; msg.textContent = YB.errorText(e); msg.hidden = false; return; }
        const path = `${S.uid}/${Date.now().toString(36)}.jpg`;
        const old = P().avatar_path;
        const u = await YB.upload(AV_BUCKET, path, blob, 'image/jpeg');
        if (!u.ok) { status.textContent = ''; if (sessionLost(u)) return; msg.textContent = errMsg(u); msg.hidden = false; return; }
        if (await savePref({ avatar: path })) {
          if (old && old !== path) YB.removeFiles(AV_BUCKET, [old]);
          saved('حُفظت صورتك.'); paint(); if (onAvatar) onAvatar();
        } else status.textContent = '';
      });
      const remove = p.avatar_path ? btn('أزل الصورة', 'trash', 'btn-ghost', async () => {
        const old = P().avatar_path;
        if (await savePref({ avatar: null })) { if (old) YB.removeFiles(AV_BUCKET, [old]); saved('أُزيلت صورتك.'); paint(); if (onAvatar) onAvatar(); }
      }, { 'data-fk': 'cpic-x' }) : null;
      return h('div', { class: 'a-cust-set' }, h('b', { class: 'a-l', text: 'صورتك' }),
        h('div', { class: 'a-cust-pic' }, avatarEl(profile.full_name, p.avatar_path, 'teal', 'lg'),
          h('div', {}, h('label', { for: pickId, class: 'btn btn-ghost btn-sm' }, icon('image'), h('span', { text: p.avatar_path ? 'غيّر الصورة' : 'اختر صورة' })), pick, remove,
            h('small', { class: 'a-hint', text: 'تُصغَّر على جهازك قبل الرفع. يراها من سجّل الدخول فقط.' }))), msg);
    }
    el.open = () => { paint(); el.hidden = false; const f = el.querySelector('input'); if (f) f.focus(); };
    el.close = () => { el.hidden = true; if (el.onclose) el.onclose(); };
    return el;
  }

  /* --- team identity (yb_team_style): the leader picks a color and a badge */
  function teamStyleCard(team) {
    const el = h('section', { class: 'a-card a-tstyle', 'aria-labelledby': 'tst-h', 'data-team-style': '' });
    const cur = { color: 'teal', badge: 'star' };
    const preview = h('div', { class: 'a-tstyle-p', 'aria-live': 'polite' });
    const paintPreview = () => put(preview, h('span', { class: 'a-tbadge', style: `--tc:${PALETTE[cur.color][1]}` }, h('span', { 'aria-hidden': 'true', text: BADGES[cur.badge][1] }),
      h('b', { text: team.team_name || team.name || '' })), h('small', { class: 'a-hint', text: `${PALETTE[cur.color][0]} · ${BADGES[cur.badge][0]}` }));
    const group = (name, legend, opts, key) => h('fieldset', { class: 'a-cust-set' }, h('legend', { text: legend }), h('div', { class: 'a-cust-opts' + (key === 'color' ? ' swatches' : ' badges') },
      Object.keys(opts).map(k => {
        const inp = h('input', { type: 'radio', name, value: k, checked: cur[key] === k, 'data-fk': name + '-' + k });
        inp.addEventListener('change', () => { if (inp.checked) { cur[key] = k; paintPreview(); } });
        return h('label', { class: 'a-cust-opt' + (key === 'color' ? ' sw' : ' bd'), style: key === 'color' ? `--sw:${opts[k][1]}` : null }, inp,
          key === 'color' ? h('span', { class: 'a-swd', 'aria-hidden': 'true' }) : h('span', { class: 'a-bd', 'aria-hidden': 'true', text: opts[k][1] }), h('span', { class: 'a-sr', text: opts[k][0] }));
      })));
    const msg = h('p', { class: 'a-hint', role: 'status' });
    async function start() {
      const r = await read('yb_team_style', { select: 'color,badge', filter: { team_id: 'eq.' + (team.team_id || team.id) } });
      const row = r.ok && Array.isArray(r.data) && r.data[0];
      if (row && PALETTE[row.color]) cur.color = row.color;
      if (row && BADGES[row.badge]) cur.badge = row.badge;
      S.myColor = cur.color;
      paint();
    }
    function paint() {
      const name = 'ts';
      put(el, h('h3', { id: 'tst-h' }, icon('flag'), h('span', { text: 'هوية الفريق' })),
        h('p', { class: 'a-lead', text: 'اختر لون فريقك وشارته. تظهران على أخبار الفريق وفي بطاقته.' }), preview,
        group(name + 'c', 'اللون', PALETTE, 'color'), group(name + 'b', 'الشارة', BADGES, 'badge'), msg,
        h('div', { class: 'a-actions' }, btn('احفظ هوية الفريق', 'check', 'btn-primary', async () => {
          const r = await YB.rpc('yb_set_team_style', { team_id: team.team_id || team.id, color: cur.color, badge: cur.badge });
          if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; msg.textContent = errMsg(r.ok ? { error: r.data && r.data.error } : r); return; }
          S.myColor = cur.color;
          msg.textContent = 'حُفظت هوية الفريق.'; say(msg.textContent);
        }, { 'data-fk': 'tst-save' })));
      paintPreview();
    }
    return { el, start };
  }

  /* --- the news feed */
  function feedDesk(fk) {
    const F = { posts: [], meta: null, more: false, err: '', open: new Set(), edit: null, reports: null, showReports: false };
    const el = h('section', { class: 'a-card a-feed', 'aria-labelledby': fk + '-h', 'data-feed': '' });
    const list = h('div', { class: 'a-feed-l', 'aria-live': 'polite' });
    const focusFk = k => { const f = el.querySelector(`[data-fk="${CSS.escape(k)}"]`); if (f) f.focus({ preventScroll: true }); };
    async function load(before) {
      const r = await YB.rpc('yb_feed', before ? { before, lim: 15 } : { lim: 15 });
      if (!r.ok || !r.data || typeof r.data !== 'object') { F.err = errMsg(r); if (r) sessionLost(r); return false; }
      F.err = '';
      const posts = Array.isArray(r.data.posts) ? r.data.posts : [];
      if (before) F.posts = F.posts.concat(posts.filter(x => !F.posts.some(y => y.id === x.id)));
      else { F.posts = posts; F.meta = r.data; }
      F.more = posts.length >= 15;
      return true;
    }
    async function refresh(msg, focus) { await load(); if (F.showReports) await loadReports(); paint(); if (msg) say(msg); if (focus) focusFk(focus); }
    async function loadReports() {
      const r = await YB.rpc('yb_feed_reports', {});
      F.reports = r.ok && Array.isArray(r.data) ? r.data : [];
    }
    const M = () => F.meta || {};
    function paint() {
      const m = M();
      const head = h('div', { class: 'a-feed-h' }, h('h3', { id: fk + '-h' }, icon('megaphone'), h('span', { text: 'الأخبار' })),
        btn('تحديث', 'repeat', 'btn-ghost', () => refresh('تم التحديث.', fk + '-refresh'), { 'data-fk': fk + '-refresh' }));
      const adminBar = m.admin ? adminTools() : null;
      const queue = m.admin && Array.isArray(m.queue) && m.queue.length ? h('div', { class: 'a-feed-q', 'data-feed-queue': '' },
        h('h4', {}, icon('clock'), h('span', { text: `بانتظار موافقتك (${m.queue.length})` })),
        h('p', { class: 'a-hint', text: 'أخبار القادة لا تظهر لأحد قبل أن تنشرها. تأكد أن أولياء أمور من يظهر في الصور موافقون.' }),
        m.queue.map(x => postCard(x, true))) : null;
      put(list, ...(F.posts.length ? F.posts.map(x => postCard(x, false)) : [h('p', { class: 'a-empty', text: m.can_post ? 'لا أخبار بعد. اكتب أول خبر!' : 'لا أخبار بعد. ستظهر هنا أخبار الإدارة والفرق.' })]));
      put(el, head, F.err ? h('p', { class: 'a-live-msg', role: 'alert', text: F.err }) : null, adminBar, queue,
        m.can_post ? composer() : null, list,
        F.more ? h('div', { class: 'a-actions center' }, btn('أخبار أقدم', 'chevron-down', 'btn-ghost', async () => {
          const last = F.posts.filter(x => !x.pinned).slice(-1)[0];
          if (!last) return;
          await load(last.at); paint(); focusFk(fk + '-more');
        }, { 'data-fk': fk + '-more' })) : null);
    }
    function adminTools() {
      const m = M();
      const cb = h('input', { type: 'checkbox', checked: !!m.members_comment, 'data-fk': fk + '-mc' });
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        const r = await YB.rpc('yb_set_members_comment', { allow: cb.checked });
        cb.disabled = false;
        if (!r.ok) { cb.checked = !cb.checked; if (!sessionLost(r)) say(errMsg(r)); return; }
        await refresh(cb.checked ? 'صار بإمكان الأعضاء التعليق.' : 'أُوقفت تعليقات الأعضاء.', fk + '-mc');
      });
      const n = m.reports || 0;
      const repBtn = btn(n ? `بلاغات التعليقات (${n})` : 'بلاغات التعليقات', 'alert', n ? 'btn-primary' : 'btn-ghost', async () => {
        F.showReports = !F.showReports;
        if (F.showReports) await loadReports();
        paint(); focusFk(fk + '-reps');
      }, { 'data-fk': fk + '-reps', 'aria-expanded': String(F.showReports) });
      return h('div', { class: 'a-feed-admin' }, h('div', { class: 'a-feed-tools' },
        h('label', { class: 'a-check' }, cb, h('span', { text: 'السماح للأعضاء (الأطفال) بالتعليق' })), repBtn),
        F.showReports ? reportsList() : null);
    }
    function reportsList() {
      const rows = F.reports || [];
      if (!rows.length) return h('p', { class: 'a-empty', text: 'لا بلاغات مفتوحة.' });
      return h('ul', { class: 'a-feed-reps', 'data-feed-reports': '' }, rows.map(x => {
        const act = (action, done) => async () => {
          const r = await YB.rpc('yb_comment_moderate', { id: x.comment_id, action });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await refresh(done, fk + '-reps');
        };
        return h('li', { class: 'a-feed-rep' },
          h('p', {}, h('b', { text: x.author_name + ': ' }), h('span', { text: x.body })),
          h('small', { class: 'a-hint', text: `على خبر: «${x.post_snippet}» · بلاغات: ${x.reports}${(x.reasons || []).length ? ' · السبب: ' + x.reasons.join('، ') : ''}` }),
          h('div', { class: 'a-actions' },
            btn('أخفِ التعليق', 'eye', 'btn-primary', act('hide', 'أُخفي التعليق.'), { 'data-fk': 'crh-' + x.comment_id }),
            btn('أبقِه وأغلق البلاغ', 'check', 'btn-ghost', act('keep', 'أُغلق البلاغ.'), { 'data-fk': 'crk-' + x.comment_id }),
            armed(btn('أوقف كاتبه يومًا', 'lock', 'btn-ghost', null, { 'data-fk': 'crm-' + x.comment_id }), 'اضغط مرة أخرى للتأكيد', async () => {
              const r = await YB.rpc('yb_comment_mute', { id: x.comment_id, hours: 24, reason: 'بلاغ على تعليق' });
              if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
              await refresh('أُوقف الكاتب عن التعليق يومًا واحدًا.', fk + '-reps');
            })));
      }));
    }
    function composer() {
      const ed = F.edit || { id: null, body: '', photos: [], adds: [], mine: true };
      const isLeader = S.role === 'leader';
      const taId = uid('f'), pickId = uid('f');
      const ta = h('textarea', { id: taId, class: 'a-note-in a-feed-ta', rows: 3, maxlength: FEED_MAX, 'data-fk': fk + '-ta',
        placeholder: isLeader ? 'شارك خبرًا عن فريقك: تدريب، مبادرة، لحظة جميلة…' : 'اكتب خبرًا لكل المشاركين…' });
      ta.value = ed.body || '';
      const counter = h('small', { class: 'a-hint', 'aria-live': 'polite' });
      const count = () => { counter.textContent = `${String(ta.value).length} / ${FEED_MAX}`; };
      ta.addEventListener('input', count);
      const canPhoto = ed.mine !== false && !(DEMO && DEMO.active);   // the demo has no photo storage
      const pick = h('input', { id: pickId, type: 'file', accept: 'image/*', multiple: true, class: 'a-file-h', 'data-fk': fk + '-pick' });
      const strip = h('div', { class: 'a-feed-pre' });
      const ok = h('input', { type: 'checkbox', name: 'fok', 'data-fk': fk + '-ok' });
      const okRow = h('label', { class: 'a-check', hidden: true }, ok, h('span', { text: 'تأكدت أن أولياء أمور من يظهر في الصور موافقون على نشرها.' }));
      const total = () => ed.photos.length + ed.adds.length;
      function paintStrip() {
        put(strip, total() ? photoStrip(ed.photos.map(path => ({ path })).concat(ed.adds.map(a => ({ url: a.url }))), i => {
          if (i < ed.photos.length) ed.photos.splice(i, 1); else { const a = ed.adds.splice(i - ed.photos.length, 1)[0]; if (a && a.url) URL.revokeObjectURL(a.url); }
          paintStrip();
        }, 'الخبر', FEED_BUCKET) : null);
        okRow.hidden = !(isLeader && total());
        pick.disabled = total() >= FEED_PHOTOS;
      }
      pick.addEventListener('change', () => {
        Array.from(pick.files || []).forEach(f => { if (total() < FEED_PHOTOS && /^image\//.test(f.type || '')) ed.adds.push({ file: f, url: URL.createObjectURL(f) }); });
        pick.value = '';
        paintStrip();
      });
      const progress = h('p', { class: 'a-hint', role: 'status' });
      const form = h('form', { class: 'a-form a-feed-c', 'aria-label': ed.id ? 'تعديل الخبر' : 'خبر جديد', 'data-feed-form': '' },
        h('div', { class: 'a-feed-c-top' }, avatarEl(S.me && S.me.full_name, S.prefs && S.prefs.avatar_path, S.myColor),
          h('div', { class: 'a-f' }, h('label', { for: taId, class: 'a-l', text: ed.id ? 'عدّل الخبر' : (isLeader ? 'خبر من فريقك' : 'خبر جديد') }), ta, counter)),
        strip, okRow,
        isLeader ? h('p', { class: 'a-hint' }, icon('shield'), h('span', { text: ' يراجع المشرف خبرك قبل أن يراه الجميع.' })) : null,
        progress,
        h('div', { class: 'a-actions' },
          canPhoto ? h('label', { for: pickId, class: 'btn btn-ghost btn-sm' }, icon('image'), h('span', { text: 'صور (حتى 4)' })) : null, canPhoto ? pick : null,
          submitBtn(ed.id ? 'احفظ التعديل' : (isLeader ? 'أرسل للمراجعة' : 'انشر'), 'send'),
          ed.id ? h('button', { type: 'button', class: 'a-link', text: 'إلغاء', onclick: () => { F.edit = null; paint(); focusFk(fk + '-ta'); } }) : null));
      count(); paintStrip();
      bind(form, async () => {
        const body = String(ta.value || '').trim();
        if (!body) return showErr(form, 'اكتب نص الخبر.', ta);
        if (isLeader && total() && !ok.checked) return showErr(form, 'أكّد موافقة الأهل على الصور، أو احذف الصور.', ok);
        showErr(form, '');
        const id = ed.id || newId();
        const added = [];
        for (let i = 0; i < ed.adds.length; i++) {
          progress.textContent = `جارٍ رفع الصورة ${i + 1} من ${ed.adds.length}…`;
          let blob;
          try { blob = await shrinkPhoto(ed.adds[i].file); } catch (e) { progress.textContent = ''; return showErr(form, YB.errorText(e), pick); }
          const path = `${S.uid}/${id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
          const u = await YB.upload(FEED_BUCKET, path, blob, 'image/jpeg');
          if (!u.ok) { progress.textContent = ''; if (sessionLost(u)) return; return showErr(form, errMsg(u), pick); }
          added.push(path);
        }
        progress.textContent = '';
        const photos = ed.photos.concat(added);
        const r = await YB.rpc('yb_post_save', { id, body, photos });
        if (!r.ok || !r.data || !r.data.ok) {
          if (r && sessionLost(r)) return;
          if (added.length) YB.removeFiles(FEED_BUCKET, added);
          return showErr(form, errMsg(r.ok ? { error: r.data && r.data.error } : r, POST_ERR), ta);
        }
        const dropped = (ed.orig || []).filter(p => !photos.includes(p));
        if (dropped.length) YB.removeFiles(FEED_BUCKET, dropped);
        ed.adds.forEach(a => { if (a.url) URL.revokeObjectURL(a.url); });
        F.edit = null;
        await refresh(r.data.status === 'pending' ? 'أُرسل الخبر إلى المشرف. سيظهر للجميع بعد موافقته.' : (ed.id ? 'حُفظ التعديل.' : 'نُشر الخبر.'), fk + '-ta');
      });
      return form;
    }
    function postCard(x, inQueue) {
      const m = M();
      const isOpen = F.open.has(x.id);
      const roleTxt = x.author_role === 'admin' ? 'الإدارة' : (ROLE[x.author_role] || '');
      const team = x.team_name ? h('span', { class: 'a-tbadge sm', style: `--tc:${(PALETTE[x.team_color] || PALETTE.teal)[1]}` },
        x.team_badge && BADGES[x.team_badge] ? h('span', { 'aria-hidden': 'true', text: BADGES[x.team_badge][1] }) : null, h('span', { text: x.team_name })) : null;
      const chips = [x.pinned ? chip('مثبّت', 'brand') : null,
        x.status === 'pending' ? chip('بانتظار موافقة المشرف', 'sun') : null,
        x.status === 'rejected' ? chip('أُعيد للتعديل', 'bad') : null,
        x.status === 'hidden' ? chip('مخفي عن الجميع', 'muted') : null].filter(Boolean);
      const long = String(x.body || '').length > 320;
      const body = h('p', { class: 'a-post-b' + (long ? ' clamp' : ''), text: x.body });
      const more = long ? h('button', { type: 'button', class: 'a-link', 'aria-expanded': 'false', text: 'اقرأ المزيد', onclick: e => {
        const open = body.classList.toggle('clamp') === false;
        e.currentTarget.textContent = open ? 'أقل' : 'اقرأ المزيد';
        e.currentTarget.setAttribute('aria-expanded', String(open));
      } }) : null;
      const photos = (x.photos || []).length ? postPhotos(x) : null;
      const note = x.review_note && (x.status === 'rejected' || x.mine || m.admin) ? h('p', { class: 'a-pj-note', role: 'note' }, icon('alert'), h('span', { text: `ملاحظة المشرف: ${x.review_note}` })) : null;
      const published = x.status === 'published';
      const reacts = published ? h('div', { class: 'a-post-r', role: 'group', 'aria-label': 'تفاعل' }, REACT.map(([k, emo, label]) => {
        const n = (x.reactions && x.reactions[k]) || 0, on = x.my_reaction === k;
        return h('button', { type: 'button', class: 'a-react' + (on ? ' on' : ''), 'aria-pressed': String(on), 'aria-label': `${label} (${n})`, 'data-fk': `rx-${k}-${x.id}`,
          onclick: async () => {
            const r = await YB.rpc('yb_react', { post_id: x.id, kind: on ? null : k });
            if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; say(errMsg(r.ok ? { error: r.data && r.data.error } : r)); return; }
            x.reactions = r.data.reactions || {}; x.my_reaction = r.data.mine || null;
            paint(); focusFk(`rx-${k}-${x.id}`); say(on ? 'أُزيل تفاعلك.' : `تفاعلت: ${label}.`);
          } }, h('span', { 'aria-hidden': 'true', text: emo }), h('b', { text: n ? String(n) : '' }));
      })) : null;
      const acts = [];
      if (published) acts.push(h('button', { type: 'button', class: 'a-post-cbtn', 'aria-expanded': String(isOpen), 'data-fk': 'cm-' + x.id,
        onclick: () => { if (isOpen) F.open.delete(x.id); else F.open.add(x.id); paint(); focusFk('cm-' + x.id); } },
        icon('message'), h('span', { text: `التعليقات (${x.comments || 0})` })));
      if (inQueue) {
        const nid = uid('f');
        const nt = h('input', { id: nid, class: 'a-in', maxlength: 300, placeholder: 'مثل: احذفوا الصورة الثانية', 'data-fk': 'pqn-' + x.id });
        acts.push(btn('انشره', 'check', 'btn-primary', () => moderate(x, 'publish', null, 'نُشر الخبر، وأُبلغ القائد.'), { 'data-fk': 'pqp-' + x.id }),
          h('span', { class: 'a-feed-ret' }, h('label', { for: nid, class: 'a-sr', text: 'ملاحظة للقائد' }), nt,
            btn('أعده بملاحظة', 'repeat', 'btn-ghost', () => moderate(x, 'reject', nt.value, 'أُعيد الخبر للقائد مع ملاحظتك.'), { 'data-fk': 'pqr-' + x.id })));
      } else {
        if (x.mine && x.status !== 'hidden') acts.push(btn('عدّل', 'file-text', 'btn-ghost', () => {
          F.edit = { id: x.id, body: x.body, photos: [...(x.photos || [])], orig: [...(x.photos || [])], adds: [], mine: true };
          paint(); focusFk(fk + '-ta');
        }, { 'data-fk': 'pe-' + x.id }));
        else if (m.admin && x.status === 'published') acts.push(btn('عدّل', 'file-text', 'btn-ghost', () => {
          F.edit = { id: x.id, body: x.body, photos: [...(x.photos || [])], orig: [], adds: [], mine: false };
          paint(); focusFk(fk + '-ta');
        }, { 'data-fk': 'pe-' + x.id }));
        if (m.admin && x.status === 'published') acts.push(btn(x.pinned ? 'ألغِ التثبيت' : 'ثبّت في الأعلى', 'pin', 'btn-ghost', () => moderate(x, x.pinned ? 'unpin' : 'pin', null, x.pinned ? 'أُلغي التثبيت.' : 'ثُبّت الخبر في الأعلى.'), { 'data-fk': 'pp-' + x.id }),
          btn('أخفِه', 'eye', 'btn-ghost', () => moderate(x, 'hide', null, 'أُخفي الخبر عن الجميع.'), { 'data-fk': 'ph-' + x.id }));
        if (m.admin && x.status === 'hidden') acts.push(btn('أظهره', 'eye', 'btn-ghost', () => moderate(x, 'show', null, 'عاد الخبر إلى الصفحة.'), { 'data-fk': 'ph-' + x.id }));
        if (x.mine || m.admin) acts.push(armed(btn('احذف', 'trash', 'btn-ghost', null, { 'data-fk': 'pd-' + x.id }), 'اضغط مرة أخرى للحذف', async () => {
          if ((x.photos || []).length) await YB.removeFiles(FEED_BUCKET, x.photos);
          const r = await YB.rpc('yb_post_delete', { id: x.id });
          if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
          await refresh('حُذف الخبر.', fk + '-refresh');
        }));
      }
      return h('article', { class: 'a-post' + (x.pinned ? ' pinned' : '') + (x.status !== 'published' ? ' st-' + x.status : ''), 'data-post': x.id, 'aria-label': `خبر من ${x.author_name}` },
        h('header', { class: 'a-post-h' }, avatarEl(x.author_name, x.author_avatar, x.team_color),
          h('div', { class: 'a-post-who' }, h('b', { text: x.author_name || '—' }),
            h('small', {}, roleTxt ? h('span', { text: roleTxt }) : null, team, h('time', { datetime: x.at || x.published_at || x.created_at, text: timeAgo(x.at || x.published_at || x.created_at) }))),
          chips.length ? h('div', { class: 'a-post-chips' }, chips) : null),
        body, more, photos, note, reacts,
        acts.length ? h('div', { class: 'a-post-a' }, acts) : null,
        isOpen && published ? commentsBox(x) : null);
    }
    function postPhotos(x) {
      const ps = x.photos.slice(0, FEED_PHOTOS);
      const grid = h('div', { class: 'a-post-ph n' + ps.length });
      ps.forEach(p => grid.append(h('span', { class: 'a-post-pi', 'data-path': p }, h('span', { class: 'a-photo-ph', 'aria-hidden': 'true' }, icon('image')))));
      photoUrls(ps, FEED_BUCKET).then(u => grid.querySelectorAll('[data-path]').forEach((s, i) => {
        const url = u[s.dataset.path];
        if (url) put(s, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `افتح الصورة ${i + 1} بحجمها الكامل` }, h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' })));
      }));
      return grid;
    }
    async function moderate(x, action, note, done) {
      const r = await YB.rpc('yb_post_moderate', note && String(note).trim() ? { id: x.id, action, note: String(note).trim() } : { id: x.id, action });
      if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; say(errMsg(r.ok ? { error: r.data && r.data.error } : r)); return; }
      await refresh(done, fk + '-refresh');
    }
    function commentsBox(x) {
      const m = M();
      const box = h('div', { class: 'a-cmts', 'data-comments': x.id }, h('p', { class: 'a-hint', text: 'جارٍ التحميل…' }));
      const paintC = rows => {
        const ul = h('ul', { class: 'a-cmt-l' }, rows.map(c => {
          const acts = [];
          if (c.mine) acts.push(armed(btn('احذف', 'trash', 'btn-ghost', null, { 'data-fk': 'cd-' + c.id }), 'اضغط للتأكيد', async () => {
            const r = await YB.rpc('yb_comment_delete', { id: c.id });
            if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
            x.comments = Math.max(0, (x.comments || 1) - 1); await reload('حُذف تعليقك.');
          }));
          else if (!m.admin && !c.hidden) acts.push(c.reported ? h('small', { class: 'a-hint', text: 'أبلغت عنه' }) :
            armed(btn('أبلغ', 'flag', 'btn-ghost', null, { 'data-fk': 'cr-' + c.id }), 'اضغط للتأكيد', async () => {
              const r = await YB.rpc('yb_comment_report', { id: c.id });
              if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; say(errMsg(r.ok ? { error: r.data && r.data.error } : r)); return; }
              await reload('وصل بلاغك إلى المشرف. شكرًا لك.');
            }));
          if (m.admin && !c.mine) acts.push(btn(c.hidden ? 'أظهره' : 'أخفِه', 'eye', 'btn-ghost', async () => {
            const r = await YB.rpc('yb_comment_moderate', { id: c.id, action: c.hidden ? 'show' : 'hide' });
            if (!r.ok) { if (!sessionLost(r)) say(errMsg(r)); return; }
            await reload(c.hidden ? 'أُظهر التعليق.' : 'أُخفي التعليق.', 'ch-' + c.id);
          }, { 'data-fk': 'ch-' + c.id }), c.author_muted ? h('small', { class: 'a-hint', text: 'كاتبه موقوف' }) :
            armed(btn('أوقفه يومًا', 'lock', 'btn-ghost', null, { 'data-fk': 'cmu-' + c.id }), 'اضغط للتأكيد', async () => {
              const r = await YB.rpc('yb_comment_mute', { id: c.id, hours: 24 });
              if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; say(errMsg(r.ok ? { error: r.data && r.data.error } : r)); return; }
              await reload('أُوقف الكاتب عن التعليق يومًا واحدًا.');
            }));
          return h('li', { class: 'a-cmt' + (c.hidden ? ' hid' : '') }, avatarEl(c.author_name, c.author_avatar, null, 'sm'),
            h('div', { class: 'a-cmt-b' }, h('p', {}, h('b', { text: c.author_name || '—' }), ' ',
              h('span', { text: c.hidden && !m.admin ? 'أخفى المشرف هذا التعليق.' : c.body }), c.hidden && m.admin ? chip('مخفي', 'muted') : null),
              h('small', { class: 'a-hint' }, h('time', { datetime: c.created_at, text: timeAgo(c.created_at) }), c.reports ? ` · بلاغات: ${c.reports}` : ''),
              acts.length ? h('div', { class: 'a-cmt-a' }, acts) : null));
        }));
        const form = m.can_comment ? commentForm() : (S.role === 'member' ? h('p', { class: 'a-hint', text: 'التعليق متاح للأعضاء حين تسمح به الإدارة. يمكنك التفاعل بالرموز.' }) : null);
        put(box, rows.length ? ul : h('p', { class: 'a-empty', text: 'لا تعليقات بعد.' }), form);
      };
      function commentForm() {
        const id = uid('f');
        const ta = h('textarea', { id, class: 'a-note-in', rows: 2, maxlength: 500, placeholder: 'اكتب تعليقًا لطيفًا…', 'data-fk': 'ct-' + x.id });
        const f = h('form', { class: 'a-form a-cmt-f', 'aria-label': 'تعليق جديد' }, h('label', { for: id, class: 'a-sr', text: 'تعليقك' }), ta,
          h('div', { class: 'a-actions' }, submitBtn('علّق', 'send')));
        bind(f, async () => {
          const b = String(ta.value || '').trim();
          if (!b) return showErr(f, 'اكتب تعليقك أولًا.', ta);
          const r = await YB.rpc('yb_comment_post', { post_id: x.id, body: b });
          if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; return showErr(f, errMsg(r.ok ? { error: r.data && r.data.error } : r, CMT_ERR), ta); }
          x.comments = (x.comments || 0) + 1;
          await reload('أُضيف تعليقك.', 'ct-' + x.id);
        });
        return f;
      }
      async function reload(msg, focus) {
        const r = await YB.rpc('yb_comments', { post_id: x.id });
        if (!r.ok) { put(box, h('p', { class: 'a-live-msg', role: 'alert', text: errMsg(r) })); return; }
        paintC(Array.isArray(r.data) ? r.data : []);
        const cbtn = el.querySelector(`[data-fk="cm-${CSS.escape(x.id)}"] span`);
        if (cbtn) cbtn.textContent = `التعليقات (${x.comments || 0})`;
        if (msg) say(msg);
        if (focus) focusFk(focus);
      }
      reload();
      return box;
    }
    return { el, start: async () => { put(el, skeleton()); await load(); paint(); } };
  }
  // the feed section of a dashboard (one feed per screen, kept across repaints)
  function feedGroup() {
    if (!S.feed) { S.feed = feedDesk('feed'); S.feed.start(); }
    return { key: 'feed', label: 'الأخبار', icon: 'megaphone', one: true, nodes: [S.feed.el] };
  }

  /* --- the leader handover (yb_transfer_team), from «الأشخاص» */
  // the box stays empty until it is opened (the candidate list names other people)
  function transferBox(p, team) {
    const box = h('div', { class: 'a-transfer', hidden: true, 'data-transfer': p.id });
    box.open = () => { if (!box.firstChild) fillTransfer(box, p, team); box.hidden = false; const f = box.querySelector('select'); if (f) f.focus(); };
    return box;
  }
  function fillTransfer(box, p, team) {
    const leads = new Set(A.teams.map(t => t.leader_id));
    const inTeam = new Map(A.members.filter(m => m.user_id).map(m => [m.user_id, m.team_id]));
    const cands = A.profiles.filter(x => x.id !== p.id && (x.role === 'member' || x.role === 'parent' || (x.role === 'leader' && !leads.has(x.id)))
      && (!inTeam.has(x.id) || inTeam.get(x.id) === team.id));
    const sid = uid('f');
    const sel = h('select', { id: sid, class: 'a-select', 'data-fk': 'tr-to-' + p.id },
      h('option', { value: '', text: cands.length ? 'اختر القائد الجديد' : 'لا يوجد حساب مناسب بعد' }),
      cands.map(x => h('option', { value: x.id, text: `${x.full_name || x.email} · ${ROLE[x.role] || x.role}${inTeam.get(x.id) === team.id ? ' · في الفريق' : ''}` })));
    const fate = uid('fate');
    const opt = (v, label, on) => h('label', { class: 'a-check' }, h('input', { type: 'radio', name: fate, value: v, checked: !!on, 'data-fk': `tr-${v}-${p.id}` }), h('span', { text: label }));
    const msg = h('p', { class: 'a-live-msg', role: 'alert', hidden: true });
    const go = armed(btn('سلّم الفريق', 'repeat', 'btn-primary', null, { 'data-fk': 'tr-go-' + p.id }), 'اضغط مرة أخرى للتأكيد', async () => {
      msg.hidden = true;
      if (!sel.value) { msg.textContent = 'اختر من سيقود الفريق.'; msg.hidden = false; sel.focus(); return; }
      const f = box.querySelector(`input[name="${fate}"]:checked`).value;
      const r = await YB.rpc('yb_transfer_team', { team_id: team.id, new_leader: sel.value, old_stays: f === 'stay', old_role: f === 'stay' ? 'member' : f });
      if (!r.ok || !r.data || !r.data.ok) { if (r && sessionLost(r)) return; msg.textContent = errMsg(r.ok ? { error: r.data && r.data.error } : r); msg.hidden = false; return; }
      await refreshAdmin(`سُلّم «${team.name}» إلى قائده الجديد، وأُبلغ الطرفان.`, 'rs-' + p.id);
    });
    put(box, h('p', { class: 'a-hint', text: `يقود «${team.name}». ليصبح دوره غير «قائد فريق»، اختر من يتولى الفريق: ولي أمر، أو عضو في الفريق، أو قائد بلا فريق.` }),
      h('div', { class: 'a-f' }, h('label', { for: sid, class: 'a-l', text: 'القائد الجديد' }), sel),
      h('fieldset', { class: 'a-comps' }, h('legend', { text: 'وماذا عن القائد الحالي؟' }),
        opt('stay', 'يبقى في الفريق عضوًا', true), opt('parent', 'يغادر الفريق ويصبح ولي أمر'), opt('member', 'يغادر الفريق ويبقى حسابًا بلا فريق')),
      msg, h('div', { class: 'a-actions' }, go));
  }

  /* --- the admin's statistics (yb_analytics): charts with a table behind each one */
  function vizTip(host) {
    const tip = h('div', { class: 'a-viz-tip', role: 'tooltip', hidden: true });
    host.append(tip);
    const show = (t, x, y) => {
      tip.textContent = t; tip.hidden = false;
      const hb = host.getBoundingClientRect(), w = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(hb.width - w - 4, x - hb.left - w / 2)) + 'px';
      tip.style.top = Math.max(4, y - hb.top - tip.offsetHeight - 12) + 'px';
    };
    host.addEventListener('pointerover', e => { const m = e.target.closest('[data-tip]'); if (m && host.contains(m)) { const b = m.getBoundingClientRect(); show(m.dataset.tip, b.left + b.width / 2, b.top); } });
    host.addEventListener('pointerout', e => { if (!e.relatedTarget || !host.contains(e.relatedTarget) || !e.relatedTarget.closest('[data-tip]')) tip.hidden = true; });
    host.addEventListener('focusin', e => { const m = e.target.closest('[data-tip]'); if (m) { const b = m.getBoundingClientRect(); show(m.dataset.tip, b.left + b.width / 2, b.top); } });
    host.addEventListener('focusout', () => { tip.hidden = true; });
    return { show, hide: () => { tip.hidden = true; } };
  }
  const sv = (tag, a) => { const e = document.createElementNS(SVGNS, tag); Object.keys(a || {}).forEach(k => e.setAttribute(k, String(a[k]))); return e; };
  const fmtN = n => (Number(n) || 0).toLocaleString('ar-u-nu-latn');
  const dayLabel = d => { try { return new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'short' }); } catch (e) { return d; } };
  function vizCard(title, sub, chart, table, cls) {
    const id = uid('viz');
    return h('figure', { class: 'a-card a-viz' + (cls ? ' ' + cls : ''), 'aria-labelledby': id },
      h('figcaption', {}, h('h4', { id, text: title }), sub ? h('p', { class: 'a-hint', text: sub }) : null), chart,
      table ? h('details', { class: 'a-viz-t' }, h('summary', { text: 'اعرض الأرقام جدولًا' }), table) : null);
  }
  function vizTable(cols, rows) {
    return h('div', { class: 'a-tablewrap' }, h('table', { class: 'a-tbl' }, h('thead', {}, h('tr', {}, cols.map(c => h('th', { scope: 'col', text: c })))),
      h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => i === 0 ? h('th', { scope: 'row', text: String(c) }) : h('td', { text: String(c) })))))));
  }
  // horizontal bars, one hue; the value is written beside each bar
  function barList(items, opts) {
    opts = opts || {};
    const max = Math.max(1, ...items.map(i => i.max || i.value || 0));
    return h('ul', { class: 'a-hbars' + (opts.cls ? ' ' + opts.cls : '') }, items.map(i => {
      const w = Math.round(100 * (i.value || 0) / (i.max || max));
      return h('li', { class: 'a-hb' }, h('span', { class: 'a-hb-l', text: i.label }),
        h('span', { class: 'a-hb-t', tabindex: '0', 'data-tip': i.tip || `${i.label}: ${fmtN(i.value)}` }, h('span', { class: 'a-hb-f', style: `width:${w}%` })),
        h('b', { class: 'a-hb-v', text: i.text || fmtN(i.value) }));
    }));
  }
  // lines over days (the oldest day on the right, as Arabic reads), with a crosshair and a tooltip
  function lineChart(days, series, opts) {
    opts = opts || {};
    const W = 640, H = 200, pl = 10, pr = 34, pt = 14, pb = 26;
    const n = days.length;
    const max = Math.max(1, ...series.flatMap(s => s.values));
    const x = i => pl + (n <= 1 ? 0 : (W - pl - pr) * (1 - i / (n - 1)));
    const y = v => pt + (H - pt - pb) * (1 - v / max);
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'a-line', role: 'img', 'aria-label': opts.label || '' });
    [0, 0.5, 1].forEach(f => {
      const v = Math.round(max * f);
      svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), class: 'g' }));
      const t = sv('text', { x: W - pr + 6, y: y(v) + 4, class: 'ax' }); t.textContent = fmtN(v); svg.append(t);
    });
    [0, n - 1].forEach(i => { if (i < 0) return; const t = sv('text', { x: x(i), y: H - 6, class: 'ax', 'text-anchor': i === 0 ? 'end' : 'start' }); t.textContent = dayLabel(days[i]); svg.append(t); });
    series.forEach((s, k) => {
      const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      svg.append(sv('polyline', { points: pts, class: 'ln s' + (k + 1) }));
    });
    const cross = sv('line', { y1: pt, y2: H - pb, class: 'cx', visibility: 'hidden' });
    const dots = series.map((s, k) => sv('circle', { r: 4.5, class: 'dt s' + (k + 1), visibility: 'hidden' }));
    svg.append(cross, ...dots);
    const wrap = h('div', { class: 'a-line-w', tabindex: '0', 'aria-label': (opts.label || '') + '. استخدم الأسهم للتنقل بين الأيام.' }, svg);
    const tip = vizTip(wrap);
    let at = -1;
    const mark = i => {
      at = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', x(at)); cross.setAttribute('x2', x(at)); cross.setAttribute('visibility', 'visible');
      dots.forEach((d, k) => { d.setAttribute('cx', x(at)); d.setAttribute('cy', y(series[k].values[at])); d.setAttribute('visibility', 'visible'); });
      const r = svg.getBoundingClientRect();
      tip.show(`${dayLabel(days[at])} · ` + series.map(s => `${s.name}: ${fmtN(s.values[at])}`).join(' · '), r.left + r.width * x(at) / W, r.top + r.height * Math.min(...series.map(s => y(s.values[at]))) / H);
    };
    const off = () => { cross.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.hide(); };
    wrap.addEventListener('pointermove', e => { const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * W / r.width; mark(Math.round((1 - (px - pl) / (W - pl - pr)) * (n - 1))); });
    wrap.addEventListener('pointerleave', off);
    wrap.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { e.preventDefault(); mark(at < 0 ? 0 : at + 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); mark(at < 0 ? n - 1 : at - 1); } else if (e.key === 'Escape') off(); });
    wrap.addEventListener('blur', off);
    const legend = series.length > 1 ? h('ul', { class: 'a-legend' }, series.map((s, k) => h('li', {}, h('i', { class: 's' + (k + 1), 'aria-hidden': 'true' }), h('span', { text: `${s.name} (${fmtN(opts.total ? s.values.reduce((a, b) => a + b, 0) : (s.values[s.values.length - 1] || 0))})` })))) : null;
    return h('div', {}, legend, wrap);
  }
  // fill the gaps of a [{d, n}] list over the last `span` days (oldest first)
  function daySeries(rows, span, key) {
    const m = new Map((rows || []).map(r => [String(r.d).slice(0, 10), Number(r[key || 'n']) || 0]));
    const out = [];
    for (let i = span - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = isoDay(d); out.push([k, m.get(k) || 0]); }
    return out;
  }
  function drawAdminStats(panel) {
    const box = h('div', { class: 'a-an', 'data-stats': '' });
    panel.append(box);
    const paint = () => {
      const st = A.stats;
      if (!st) { put(box, skeleton()); return; }
      if (st.error) { put(box, errorBlock(st.error, async () => { A.stats = null; paint(); await loadStats(); paint(); })); return; }
      const t = st.teams || {}, m = st.members || {}, fd = st.feed || {}, pj = st.projects || {}, g = st.goals || {}, ms = st.matches || {}, nt = st.notes || {}, jd = st.judging || {};
      const bs = t.by_status || {}, fee = t.fee || {};
      const approved = bs.approved || 0, inComp = (t.list || []).length;
      const played = Object.values(ms).reduce((a, c) => a + (c.approved || 0), 0);
      const consentPct = m.minors ? Math.round(100 * (m.consents || 0) / m.minors) : null;
      const readPct = nt.total ? Math.round(100 * (nt.read || 0) / nt.total) : null;
      const reactions = Object.values(fd.reactions || {}).reduce((a, b) => a + b, 0);
      const kp = kpis(
        tile('الفرق المعتمدة', 'users', `${approved} من 12`, (bs.submitted ? `${bs.submitted} قيد المراجعة` : 'لا طلبات تنتظر') + (t.waitlist ? ` · ${t.waitlist} في الانتظار` : ''), approved >= 12 ? 'ok' : ''),
        tile('المشاركون', 'user', m.total || 0, `${m.joined || 0} لهم حسابات`),
        tile('موافقات الأهل', 'user-check', consentPct === null ? '—' : consentPct + '%', m.minors ? `${m.consents || 0} من ${m.minors}` : 'لا أطفال بعد', consentPct !== null && consentPct < 100 ? 'sun' : 'ok'),
        tile('الرسوم المدفوعة', 'landmark', `${(fee.paid || 0) + (fee.waived || 0)} من ${inComp}`, fee.unpaid ? `${fee.unpaid} لم تدفع` : 'مكتملة', fee.unpaid ? 'sun' : 'ok'),
        tile('مباريات معتمدة', 'trophy', played, `${g.total || 0} هدفًا · ${g.spirit || 0} روح فريق`),
        tile('مشاريع مقبولة', 'image', (pj.by_status || {}).accepted || 0, `${fmtN(pj.beneficiaries || 0)} مستفيدًا · ${pj.featured || 0} في الصفحة الرئيسية`),
        tile('الأخبار', 'megaphone', (fd.by_status || {}).published || 0, `${reactions} تفاعلًا · ${fd.comments || 0} تعليقًا${fd.reports_open ? ` · ${fd.reports_open} بلاغ` : ''}`, fd.reports_open ? 'sun' : ''),
        tile('قراءة التنبيهات', 'bell', readPct === null ? '—' : readPct + '%', `${fmtN(nt.read || 0)} من ${fmtN(nt.total || 0)}`));
      const acc = daySeries((st.accounts || {}).per_day, 60), tms = daySeries(t.per_day, 60);
      let cum = 0; const accCum = acc.map(r => (cum += r[1]));
      cum = 0; const tmCum = tms.map(r => (cum += r[1]));
      // newest first in the chart's arrays (index 0 = today, drawn at the left)
      const growth = vizCard('التسجيل خلال 60 يومًا', 'المجموع التراكمي للحسابات والفرق الجديدة في هذه الفترة.',
        lineChart(acc.map(r => r[0]), [{ name: 'الحسابات', values: accCum }, { name: 'الفرق', values: tmCum }], { label: 'التسجيل خلال 60 يومًا' }),
        vizTable(['اليوم', 'حسابات جديدة', 'فرق جديدة'], acc.map((r, i) => [r[0], r[1], tms[i][1]]).filter(r => r[1] || r[2]).map(r => [dayLabel(r[0]), r[1], r[2]])), 'wide');
      const stRows = Object.keys(STATUS).map(k => ({ label: STATUS[k], value: bs[k] || 0 }));
      const status = vizCard('الفرق حسب الحالة', null, barList(stRows), vizTable(['الحالة', 'عدد الفرق'], stRows.map(r => [r.label, r.value])));
      const tl = t.list || [];
      const consents = vizCard('موافقات الأهل لكل فريق', 'كم من الأطفال في الفريق وصلت موافقة وليّ أمره.',
        tl.length ? barList(tl.map(r => ({ label: r.name, value: r.consents, max: Math.max(1, r.minors), text: r.minors ? `${r.consents} من ${r.minors}` : '—', tip: `${r.name}: ${r.consents} من ${r.minors}` })), { cls: 'pct' }) : h('p', { class: 'a-empty', text: 'لا فرق في المسابقة بعد.' }),
        tl.length ? vizTable(['الفريق', 'الأعضاء', 'الأطفال', 'الموافقات', 'لهم حسابات', 'الرسوم'], tl.map(r => [r.name, r.members, r.minors, r.consents, r.joined, { paid: 'مدفوعة', waived: 'معفاة', unpaid: 'لم تُدفع' }[r.fee] || r.fee])) : null);
      const ag = m.ages || {};
      const ageRows = [['أقل من 10', ag.u10], ['10 إلى 12', ag.a10], ['13 إلى 15', ag.a13], ['16 و17', ag.a16], ['18 فأكثر', ag.adult], ['غير مذكور', ag.unknown]].map(([l, v]) => ({ label: l, value: v || 0 }));
      const ages = vizCard('أعمار المشاركين', null, barList(ageRows), vizTable(['العمر', 'العدد'], ageRows.map(r => [r.label, r.value])));
      const gl = (g.by_team || []).map(r => ({ label: r.name, value: r.n }));
      const goals = vizCard('الأهداف حسب الفريق', 'من المباريات المسجّلة.', gl.length ? barList(gl) : h('p', { class: 'a-empty', text: 'لم تُسجّل أهداف بعد.' }), gl.length ? vizTable(['الفريق', 'الأهداف'], gl.map(r => [r.label, r.value])) : null);
      const pl = Object.keys(SUB_PLACE).map(k => ({ label: SUB_PLACE[k], value: (pj.by_place || {})[k] || 0 }));
      const places = vizCard('المشاريع المقبولة حسب المكان', null, barList(pl), vizTable(['المكان', 'العدد'], pl.map(r => [r.label, r.value])));
      const pd = fd.per_day || [];
      const activity = vizCard('نشاط الأخبار خلال 30 يومًا', 'المنشورات والتعليقات والتفاعلات كل يوم.',
        pd.length ? lineChart(pd.map(r => r.d), [{ name: 'تفاعلات', values: pd.map(r => r.reactions) }, { name: 'تعليقات', values: pd.map(r => r.comments) }, { name: 'منشورات', values: pd.map(r => r.posts) }], { label: 'نشاط الأخبار خلال 30 يومًا', total: true }) : h('p', { class: 'a-empty', text: 'لا نشاط بعد.' }),
        pd.length ? vizTable(['اليوم', 'منشورات', 'تعليقات', 'تفاعلات'], (fd.per_day || []).filter(r => r.posts || r.comments || r.reactions).map(r => [dayLabel(r.d), r.posts, r.comments, r.reactions])) : null, 'wide');
      const rx = REACT.map(([k, emo, label]) => ({ label: `${emo} ${label}`, value: (fd.reactions || {})[k] || 0 }));
      const react = vizCard('التفاعلات حسب النوع', null, barList(rx), vizTable(['التفاعل', 'العدد'], rx.map(r => [r.label, r.value])));
      const roles = Object.keys(ROLE).map(k => ({ label: ROLE[k], value: ((st.accounts || {}).by_role || {})[k] || 0 }));
      const people = vizCard('الحسابات حسب الدور', null, barList(roles), vizTable(['الدور', 'العدد'], roles.map(r => [r.label, r.value])));
      const judge = vizCard('التحكيم', jd.published ? 'النتائج منشورة.' : 'النتائج لم تُنشر بعد.', barList([
        { label: 'الحكّام', value: jd.judges || 0 }, { label: 'الفرق التي قُيّمت', value: jd.teams_scored || 0, max: Math.max(1, approved), text: `${jd.teams_scored || 0} من ${approved}` },
        { label: 'الدرجات المسجّلة', value: jd.scores || 0 }]), null);
      let when = '';
      try { when = new Date(st.generated_at).toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' }); } catch (e) { when = ''; }
      put(box, h('div', { class: 'a-an-h' }, h('h3', {}, icon('chart'), h('span', { text: 'الإحصاءات' })),
          h('small', { class: 'a-hint', text: when ? `آخر تحديث ${when}` : '' }),
          btn('تحديث', 'repeat', 'btn-ghost', async () => { await loadStats(); paint(); say('حُدّثت الإحصاءات.'); const f = box.querySelector('[data-fk="st-refresh"]'); if (f) f.focus(); }, { 'data-fk': 'st-refresh' })),
        kp, h('div', { class: 'a-viz-g' }, growth, status, consents, ages, goals, places, activity, react, people, judge));
      box.querySelectorAll('.a-hbars').forEach(b => vizTip(b.parentElement));
    };
    async function loadStats() {
      const r = await YB.rpc('yb_analytics', {});
      if (!r.ok || !r.data || typeof r.data !== 'object') { if (r && sessionLost(r)) return; A.stats = { error: errMsg(r) }; return; }
      A.stats = r.data;
    }
    paint();
    if (!A.stats || A.stats.error) loadStats().then(() => { if (box.isConnected) paint(); });
  }

  /* ------------------------------------------------------------------ router */
  async function route(opts) {
    opts = opts || {};
    const seq = ++S.seq;
    stopPoll();
    if (S.stopInbox) { S.stopInbox(); S.stopInbox = null; }
    if (S.stopChat) S.stopChat();
    if (S.dashObs) { S.dashObs.disconnect(); S.dashObs = null; }
    if (S.dashMo) { S.dashMo.disconnect(); S.dashMo = null; }
    if (S.mdays) { Object.values(S.mdays).forEach(f => f()); S.mdays = null; }
    S.boardP = null; S.sh = null; S.feed = null; S.lastGroups = null; S.myColor = null;
    document.documentElement.classList.remove('is-dash');
    S.modeSet = null;
    S.focusNext = !!opts.focus;
    if (!YB || !YB.configured) { S.rendered = 'unconfigured'; viewUnconfigured(); return; }
    root.setAttribute('aria-busy', 'true');
    if (S.rendered !== 'signedout' || opts.focus) put(root, skeleton());
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
      put(root, skeleton());
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
    await loadPrefs();
    if (seq !== S.seq) return;
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
