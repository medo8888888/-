// tournament.js — لوحة البطولة (tournament.html): the interactive competition screen of «مشروع ينابيع».
// Classic script (IIFE, no libraries). Works from file://.
//
// Engine: js/tournament-engine.js (window.YTour, pure). Backend: js/yb-api.js (window.YB, optional). Contract: docs/YANABEE_APP.md.
// Four modes, decided automatically:
//   public  – anyone: the published state from YB.getState(), polled every 15 s while the tab is visible, read-only
//   manager – a signed-in admin: every control, a local draft, explicit «نشر للجميع» with an optimistic-concurrency check
//   local   – the backend is not configured (or a share snapshot was opened as a local copy): full manager, this browser only
//   share   – tournament.html#v=<YTour.encode(state,{public:true})>: a read-only snapshot, never touches the local state
// Privacy: team names only. Chess player labels are never rendered, shared or published. Rules and facts come from the
// document words embedded by the page (#tn-words, taken verbatim from content/yanabee/competition.txt); the rest is UI chrome.
(function () {
  'use strict';

  const YT = window.YTour;
  const YB = window.YB || { configured: false };
  const root = document.getElementById('tn-app');
  if (!root) return;
  if (!YT) { root.textContent = 'تعذّر تحميل محرّك البطولة. أعد تحميل الصفحة.'; return; }

  let W = {};
  try { W = JSON.parse(document.getElementById('tn-words').textContent) || {}; } catch (e) { W = {}; }
  const WF = W.forfeit || {};

  /* ------------------------------------------------------------------ constants */
  const LS_LOCAL = 'yanabee-tournament-v1';
  const LS_DRAFT = 'yanabee-tournament-draft-v1';
  const LS_TEAM = 'yanabee-tournament-myteam-v1';
  const POLL_MS = 15000;
  const HIST_MAX = 20;
  const GN = YT.GROUP_NAMES;
  const TABS = [['overview', 'نظرة عامة'], ['football', 'كرة القدم'], ['chess', 'الشطرنج'], ['myteam', 'فريقي'], ['schedule', 'الجدول'], ['setup', 'الإعداد']];
  // unified schedule (yb_events, SPEC 4.10.3): chrome words only; the dates and titles come from the database
  const COMPS = { football: 'دوري كرة القدم', chess: 'بطولة الشطرنج', projects: 'المشاريع والمبادرات', hifz: 'الحفظ', fahm: 'الفهم', workshops: 'الورش', registration: 'التسجيل' };
  const KINDS = { match: 'مباراة', round: 'جولة', workshop: 'ورشة', recitation: 'موعد تسميع', other: 'موعد' };

  const ERR = {
    bad_state: 'بيانات البطولة غير صالحة.',
    bad_team: 'بيانات الفريق غير صالحة. اكتب اسمًا للفريق.',
    duplicate_team: 'هذا الفريق مضاف من قبل.',
    duplicate_name: 'اسم الفريق مكرّر. اختر اسمًا آخر.',
    too_many_teams: 'الحد الأقصى 12 فريقًا.',
    need_12_teams: 'تلزم 12 فرقة لهذه الخطوة.',
    no_groups: 'لم تُجرَ قرعة المجموعات بعد.',
    bad_groups: 'توزيع المجموعات غير صالح: يلزم 4 فرق في كل مجموعة.',
    unknown_team: 'هذا الفريق غير موجود في البطولة.',
    same_team: 'لا يمكن أن يلعب الفريق ضد نفسه.',
    bad_group: 'المجموعة غير صالحة.',
    bad_score: 'اكتب نتيجة صحيحة: عددان صحيحان من 0 إلى 999.',
    bad_cards: 'عدد البطاقات غير صالح. البطاقات الحمراء لا تزيد عن مجموع البطاقات.',
    bad_text: 'النص طويل أو غير صالح.',
    bad_result: 'النتيجة غير صالحة.',
    final_not_ready: 'التصفيات لم تبدأ بعد: يلزم أولًا حسم الأول في كل مجموعة.',
    not_in_final: 'هذا الفريق ليس من فرق التصفيات.',
    bad_kind: 'نوع القرار الإداري غير صالح.',
    bad_side: 'اختر الفريق المقصّر.',
    bad_scope: 'النطاق غير صالح.',
    not_tied: 'لا يوجد تعادل بهذه الفرق الآن.',
    bad_order: 'الترتيب غير صالح: اختر كل فريق مرة واحدة.',
    no_draw_needed: 'لا يوجد تعادل يُحسم بالقرعة الآن.',
    bad_rng: 'تعذّرت القرعة. أعد المحاولة.',
    bad_ids: 'قائمة الفرق غير صالحة.',
    bad_pairs: 'الأزواج غير صالحة: يظهر كل فريق مرة واحدة فقط.',
    bad_stage: 'الجولة غير صالحة.',
    bad_index: 'المباراة غير موجودة.',
    bad_winner: 'الفائز يجب أن يكون أحد طرفي المباراة.',
    r1_incomplete: 'أنهِ الجولة 1 أولًا.',
    rr_unavailable: 'دوري الثلاثة لم يبدأ بعد.',
    rr_incomplete: 'أنهِ مباريات دوري الثلاثة أولًا.',
    rr_unresolved: 'لا يُلعب النهائي قبل حسم المركزين الأولين.',
    bad_share: 'رابط المشاركة غير صالح أو تالف.'
  };
  const KIND = { absent: 'لم يحضر', late: 'تأخر', withdraw: 'انسحب قبل المباراة', withdraw_during: 'انسحب أثناء المباراة', unregistered: 'لاعب غير مسجل' };
  const STEP_TXT = {
    gd: 'بفارق الأهداف', gf: 'بالأهداف المسجلة', h2h: 'بالمواجهات المباشرة',
    cards: 'بعدد البطاقات (الأقل بطاقات حمراء فصفراء)'
  };
  const FB_STATUS = {
    not_drawn: 'لم تُجرَ قرعة المجموعات بعد.',
    group: 'في دور المجموعات.',
    tie: 'انتهت المجموعة وتعادلت المراكز الأولى؛ ينتظر الحسم.',
    qualified: 'متأهل إلى التصفيات.',
    final: 'في التصفيات.',
    first: 'المركز الأول في كرة القدم.',
    second: 'المركز الثاني في كرة القدم.',
    third: 'المركز الثالث في كرة القدم.',
    out: 'لم يتأهل إلى التصفيات.'
  };
  const CH_STATUS = {
    none: 'لم تُسحب أزواج الشطرنج بعد.',
    r1: 'يلعب في الجولة 1.',
    r2: 'تأهل إلى الجولة 2.',
    rr: 'تأهل إلى دوري الثلاثة.',
    final: 'تأهل إلى المباراة النهائية.',
    first: 'المركز الأول في الشطرنج.',
    second: 'المركز الثاني في الشطرنج.',
    third: 'المركز الثالث في الشطرنج.',
    out: 'خرج من البطولة.'
  };
  const ROUND_TXT = { r1: 'الجولة 1', r2: 'الجولة 2', rr: 'دوري الثلاثة', final: 'النهائي' };
  const ORD = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];
  const OUT = { W: 'فوز', D: 'تعادل', L: 'خسارة' };

  const ICON = {
    calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    cloud: '<path d="M12 13v8"/><path d="m8 17 4-4 4 4"/><path d="M20 17.5a4.5 4.5 0 0 0-1.5-8.74A6 6 0 1 0 5.6 16"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'
  };

  /* ------------------------------------------------------------------ small helpers */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) put(el, arguments[i]);
    return el;
  }
  function put(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(k => put(el, k)); return; }
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function svg(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'i');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICON[name] || '';
    return s;
  }
  function btn(label, o) {
    o = o || {};
    return h('button', {
      type: 'button', class: 'tn-btn' + (o.cls ? ' ' + o.cls : ''), onclick: o.on, disabled: o.disabled,
      'data-act': o.act, 'data-fk': o.fk, 'aria-label': o.aria, title: o.title, hidden: o.hidden
    }, o.icon ? svg(o.icon) : null, h('span', null, label));
  }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } };
  const clone = x => JSON.parse(JSON.stringify(x));
  function canon(x) {
    if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  }
  const sig = s => canon(Object.assign({}, YT.normalize(s), { updated: '' }));
  function fmtDT(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return String(iso); }
  }
  function fmtDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '';
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long' }); } catch (e) { return s; }
  }
  const errMsg = e => (e && e.code && ERR[e.code]) || (e && e.message && ERR[e.message]) || 'تعذّر تنفيذ الإجراء. راجع البيانات وأعد المحاولة.';
  const fxWhen = r => [r && r.date ? fmtDay(r.date) : '', r && r.time ? r.time : ''].filter(Boolean).join(' · ');
  const plural = (n, one, two, many) => (n === 1 ? one : n === 2 ? two : many);

  /* ------------------------------------------------------------------ state */
  const A = {
    gen: 0, mode: 'boot', S: YT.emptyState(), pub: null, base: null, remoteAt: '', unpublished: false,
    loading: true, error: '', pollErr: '', dirty: false, busy: false, conflict: null, remoteNewer: null, staleDraft: null,
    hist: [], tab: 'overview', openKeys: new Set(), shareV: '', shareErr: false, forcedLocal: false, storageOk: true,
    session: null, isAdmin: false, myIds: [], myTeam: '', approved: null, checked: new Set(), shareBox: false, stop: null,
    events: [], evLoaded: false, evErr: '', pubNames: {}, sf: { team: '', comp: '', cat: '', mine: false },
    live: [], liveSig: '', screen: /(^|[?&])screen=1(&|$)/.test(location.search), screenIdx: 0, screenTimer: null
  };
  const canEdit = () => A.mode === 'manager' || A.mode === 'local';
  let memo = { s: null, v: null };
  function view() {
    if (memo.s !== A.S) memo = { s: A.S, v: { fb: YT.football(A.S), ch: YT.chess(A.S), ov: YT.overview(A.S) } };
    return memo.v;
  }
  const nm = id => { const t = A.S.teams.find(x => x.id === id); return t ? t.name : '؟'; };
  const teamsList = () => A.S.teams.map(t => ({ id: t.id, name: t.name }));
  function uid() {
    const used = new Set(A.S.teams.map(t => t.id));
    for (let n = 1; n < 1000; n++) if (!used.has('t' + n)) return 't' + n;
    return 't' + Date.now();
  }

  /* ------------------------------------------------------------------ messages (aria-live) */
  const els = {};
  let toastT = 0, flip = false;
  function say(msg, isErr) {
    flip = !flip;
    const el = isErr ? els.err : els.ok;
    const other = isErr ? els.ok : els.err;
    other.classList.remove('show');
    el.textContent = msg + (flip ? '\u200b' : '');
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), isErr ? 9000 : 5000);
  }

  /* ------------------------------------------------------------------ dialog */
  function ask(text, okLabel, danger) {
    return new Promise(resolve => {
      if (typeof HTMLDialogElement === 'undefined' || !document.createElement('dialog').showModal) { resolve(window.confirm(text)); return; }
      const dlg = h('dialog', { class: 'tn-dlg', 'aria-label': 'تأكيد' });
      const done = v => { try { dlg.close(); } catch (e) { /* closed */ } dlg.remove(); resolve(v); };
      const cancel = btn('إلغاء', { cls: 'ghost', on: () => done(false) });
      cancel.setAttribute('data-cancel', '');
      const ok = btn(okLabel || 'متابعة', { cls: danger ? 'danger' : 'primary', on: () => done(true) });
      ok.setAttribute('data-ok', '');
      dlg.append(h('p', null, text), h('div', { class: 'tn-dlg-act' }, ok, cancel));
      dlg.addEventListener('cancel', ev => { ev.preventDefault(); done(false); });
      document.body.append(dlg);
      dlg.showModal();
      cancel.focus();
    });
  }

  /* ------------------------------------------------------------------ mutations: act / undo / persist */
  function resKeys(s) {
    const out = new Set();
    Object.keys(s.fb.res).forEach(k => out.add('fb:' + k));
    s.chess.r1.forEach((p, i) => { if (p.w) out.add('c1:' + i); });
    s.chess.r2.forEach((p, i) => { if (p.w) out.add('c2:' + i); });
    Object.keys(s.chess.rr.res).forEach(k => out.add('rr:' + k));
    if (s.chess.final.w) out.add('cf');
    return out;
  }
  function lostCount(before, after, keep) {
    const b = resKeys(before), a = resKeys(after);
    let n = 0;
    b.forEach(k => { if (!a.has(k) && k !== keep) n++; });
    return n;
  }
  function act(fn, ok, opt) {
    opt = opt || {};
    let next;
    try { next = fn(A.S); } catch (e) { say(errMsg(e), true); return false; }
    const before = A.S;
    A.hist.push(before);
    if (A.hist.length > HIST_MAX) A.hist.shift();
    A.S = next;
    const lost = opt.lost === false ? 0 : lostCount(before, next, opt.keep);
    changed();
    say((ok || 'تم الحفظ.') + (lost ? ` أُلغيت ${lost} ${plural(lost, 'نتيجة', 'نتيجتان', 'نتائج')} كانت تعتمد على التغيير.` : ''));
    return true;
  }
  function undo() {
    if (!A.hist.length || !canEdit()) return;
    A.S = A.hist.pop();
    changed();
    say('تراجعت عن آخر تغيير.');
  }
  function computeDirty() {
    A.dirty = A.mode === 'manager' && sig(A.S) !== sig(A.pub || YT.emptyState());
  }
  function persist() {
    if (A.mode === 'local') {
      A.storageOk = lsSet(LS_LOCAL, JSON.stringify({ v: 1, state: A.S }));
    } else if (A.mode === 'manager') {
      if (A.dirty) A.storageOk = lsSet(LS_DRAFT, JSON.stringify({ v: 1, state: A.S, base: A.base, at: Date.now() }));
      else lsDel(LS_DRAFT);
    }
  }
  function changed() {
    computeDirty();
    persist();
    render(true);
  }

  /* ------------------------------------------------------------------ hash (tabs + share link) */
  function parseHash() {
    const out = { tab: '', v: '' };
    const raw = (location.hash || '').replace(/^#/, '');
    raw.split('&').forEach(tok => {
      if (!tok) return;
      const i = tok.indexOf('=');
      if (i < 0) { if (TABS.some(t => t[0] === tok)) out.tab = tok; return; }
      const k = tok.slice(0, i), v = tok.slice(i + 1);
      if (k === 'v') out.v = v;
      else if (k === 'tab' && TABS.some(t => t[0] === v)) out.tab = v;
    });
    return out;
  }
  function writeHash() {
    const hs = A.mode === 'share' ? '#v=' + A.shareV + '&tab=' + A.tab : '#' + A.tab;
    try { history.replaceState(null, '', location.pathname + location.search + hs); } catch (e) { /* file:// quirks */ }
  }
  const allowedTabs = () => TABS.map(t => t[0]).filter(id => id !== 'setup' || canEdit());
  function setTab(id, o) {
    o = o || {};
    if (allowedTabs().indexOf(id) < 0) id = 'overview';
    A.tab = id;
    if (!o.noWrite) writeHash();
    render();
    if (o.focus) { const b = els.tabs.querySelector('#tn-t-' + id); if (b) b.focus(); }
  }

  /* ------------------------------------------------------------------ boot: decide the mode, load the data */
  function stopPoll() { if (A.stop) { try { A.stop(); } catch (e) { /* ignore */ } A.stop = null; } }

  function localLoad() {
    A.mode = 'local';
    let st = YT.emptyState();
    const raw = lsGet(LS_LOCAL);
    if (raw) { try { const o = JSON.parse(raw); st = YT.normalize(o && o.state ? o.state : o); } catch (e) { st = YT.emptyState(); } }
    A.S = st; A.pub = null; A.loading = false; A.error = '';
    computeDirty();
  }

  async function resolveRole() {
    let s = null;
    try { s = YB.session ? YB.session() : null; } catch (e) { s = null; }
    if (s && !s.profile && YB.loadProfile) {
      try { await YB.loadProfile(); } catch (e) { /* stays a public view */ }
      try { s = YB.session(); } catch (e) { s = null; }
    }
    A.session = s;
    A.isAdmin = !!(s && s.profile && s.profile.role === 'admin');
  }

  function readDraft() {
    const raw = lsGet(LS_DRAFT);
    if (!raw) return null;
    try { const o = JSON.parse(raw); return o && o.state ? { state: YT.normalize(o.state), base: o.base === undefined ? null : o.base } : null; } catch (e) { return null; }
  }

  function applyInitial(r) {
    A.error = '';
    A.pollErr = '';
    const remoteState = r && r.state ? YT.normalize(r.state) : null;
    A.remoteAt = r && r.updated_at ? r.updated_at : '';
    A.unpublished = !r;
    if (!A.isAdmin) {
      A.mode = 'public';
      A.S = remoteState || YT.emptyState();
      A.pub = null; A.base = null;
      return;
    }
    A.mode = 'manager';
    A.base = r ? r.updated_at : null;
    A.pub = remoteState;
    A.S = remoteState || YT.emptyState();
    const d = readDraft();
    if (d && sig(d.state) !== sig(A.S)) {
      if (d.base === A.base) A.S = d.state;
      else A.staleDraft = d;
    } else if (d) lsDel(LS_DRAFT);
    computeDirty();
  }

  async function loadRemote() {
    A.loading = true; A.error = '';
    render();
    let r;
    try { r = await YB.getState(); } catch (e) {
      A.loading = false; A.error = YB.errorText(e); render(); return false;
    }
    A.loading = false;
    applyInitial(r);
    return true;
  }

  function startPoll() {
    stopPoll();
    if (!YB.configured || !YB.poll) return;
    A.stop = YB.poll(pollTick, POLL_MS, { immediate: false });
  }
  async function pollTick() {
    let r;
    try { r = await YB.getState(); } catch (e) { A.pollErr = YB.errorText(e); updateTop(); renderNotices(); return; }
    A.pollErr = '';
    if (A.mode === 'public') {
      const at = r && r.updated_at ? r.updated_at : '';
      if (at !== A.remoteAt || A.unpublished !== !r) {
        A.remoteAt = at; A.unpublished = !r;
        A.S = r && r.state ? YT.normalize(r.state) : YT.emptyState();
        render(true);
        return;
      }
    } else if (A.mode === 'manager') {
      if (r && r.updated_at && r.updated_at !== A.base) A.remoteNewer = r; else A.remoteNewer = null;
    }
    if (await loadLive()) { if (A.tab === 'schedule') await loadEvents(); render(true); return; }
    if (A.tab === 'schedule') { await loadEvents(); render(true); return; }
    updateTop(); renderNotices();
  }

  // the unified schedule: every date the database lets this visitor read (anon: dates between approved teams)
  async function loadEvents() {
    if (!YB.configured || !YB.q || A.mode === 'share' || A.mode === 'local') return;
    try {
      const rows = await YB.q('yb_events', { select: 'id,competition,kind,title,starts_at,place,team_ids,category,status,note', order: 'starts_at.asc' });
      A.events = Array.isArray(rows) ? rows : [];
      A.evErr = '';
    } catch (e) { A.events = []; A.evErr = e && e.error === 'not_found' ? '' : YB.errorText(e); }
    try { const t = await YB.q('public_teams', { select: 'id,name' }); (Array.isArray(t) ? t : []).forEach(x => { A.pubNames[x.id] = x.name; }); } catch (e) { /* names fall back to the board */ }
    A.evLoaded = true;
  }

  async function loadMine() {
    A.myIds = [];
    if (!YB.configured || !A.session || A.isAdmin) return;
    try {
      const r = await YB.rpc('my_team', {});
      let ids = r && r.ok && Array.isArray(r.data) ? r.data.map(x => x.team_id).filter(Boolean) : [];
      if (!ids.length && YB.q) {
        const rows = await YB.q('my_children', { select: 'team_id,team_name' });   // team only: never the child's name
        ids = Array.isArray(rows) ? rows.map(x => x.team_id).filter(Boolean) : [];
      }
      A.myIds = ids;
    } catch (e) { A.myIds = []; }
  }

  async function boot() {
    const gen = ++A.gen;
    stopPoll();
    A.hist = []; A.conflict = null; A.remoteNewer = null; A.staleDraft = null; A.shareErr = false; A.shareBox = false; A.approved = null;
    const hs = parseHash();
    if (hs.tab) A.tab = hs.tab;
    if (hs.v) {
      try {
        A.S = YT.decode(hs.v); A.mode = 'share'; A.shareV = hs.v; A.loading = false; A.error = '';
        finishBoot();
        return;
      } catch (e) { A.shareErr = true; }
    }
    A.shareV = '';
    if (!YB.configured || A.forcedLocal) { localLoad(); finishBoot(); return; }
    A.mode = 'public'; A.loading = true;
    render();
    try { if (YB.ready) await YB.ready; } catch (e) { /* e-mail link problems are shown on the account page */ }
    await resolveRole();
    if (gen !== A.gen) return;
    const ok = await loadRemote();
    if (gen !== A.gen) return;
    if (!ok) { A.mode = A.isAdmin ? 'manager' : 'public'; render(); return; }
    await loadMine();
    if (gen !== A.gen) return;
    finishBoot();
    startPoll();
    loadEvents().then(() => { if (gen === A.gen && A.tab === 'schedule') render(true); });   // in the background: the board never waits for the dates
    loadLive().then(ch => { if (gen === A.gen && ch) render(true); });   // live results on top of the board (migration 0007)
    if (A.screen && !A.screenTimer) {
      A.screenTimer = setInterval(() => { A.screenIdx++; render(); }, 12000);   // the big screen turns the group tables and the clock
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* no wake lock */ }
    }
  }
  function finishBoot() {
    pickMyTeam();
    if (allowedTabs().indexOf(A.tab) < 0) A.tab = 'overview';
    root.setAttribute('aria-busy', 'false');
    render();
  }
  function pickMyTeam() {
    const ids = A.S.teams.map(t => t.id);
    const mine = A.myIds.filter(id => ids.indexOf(id) >= 0)[0];
    if (mine) { A.myTeam = mine; return; }
    const saved = lsGet(LS_TEAM);
    if (saved && ids.indexOf(saved) >= 0 && ids.indexOf(A.myTeam) < 0) A.myTeam = saved;
    if (ids.indexOf(A.myTeam) < 0) A.myTeam = '';
  }

  /* ------------------------------------------------------------------ publish (manager) */
  function forPublish() {
    const st = YT.stamp(A.S, new Date().toISOString());
    st.teams.forEach(t => { delete t.chess; });   // player labels are never published
    return st;
  }
  async function publish(base) {
    if (A.busy || A.mode !== 'manager') return;
    A.busy = true; updateTop();
    const st = forPublish();
    let r;
    try { r = await YB.publishState(st, base === undefined ? A.base : base); } catch (e) { r = { ok: false, error: 'network' }; }
    A.busy = false;
    if (r && r.ok) {
      A.base = r.updated_at; A.remoteAt = r.updated_at || ''; A.pub = st; A.S = st; A.conflict = null; A.remoteNewer = null; A.unpublished = false;
      computeDirty(); persist(); render(true);
      say('نُشرت البطولة للجميع.');
      return;
    }
    if (r && r.conflict) {
      A.conflict = { at: r.updated_at || null };
      render(true);
      say('تغيّرت البطولة المنشورة من جهة أخرى. اختر ما تريده من الخيارات في أعلى الصفحة.', true);
      return;
    }
    updateTop();
    say(YB.errorText(r || { error: 'unknown' }), true);
  }
  async function loadNewest() {
    let r;
    try { r = await YB.getState(); } catch (e) { say(YB.errorText(e), true); return; }
    A.hist.push(A.S);
    if (A.hist.length > HIST_MAX) A.hist.shift();
    A.S = r && r.state ? YT.normalize(r.state) : YT.emptyState();
    A.base = r ? r.updated_at : null; A.remoteAt = r ? r.updated_at : ''; A.pub = r ? A.S : null;
    A.conflict = null; A.remoteNewer = null; A.staleDraft = null;
    computeDirty(); persist(); render(true);
    say('حُمّلت أحدث نسخة منشورة. يمكنك «تراجع» لاستعادة تغييراتك.');
  }
  async function overwrite() {
    let r;
    try { r = await YB.getState(); } catch (e) { say(YB.errorText(e), true); return; }
    A.conflict = null;
    await publish(r ? r.updated_at : null);
  }

  /* ------------------------------------------------------------------ shell */
  function buildShell() {
    root.textContent = '';
    els.badge = h('span', { class: 'tn-badge' });
    els.stamp = h('span', { class: 'tn-stamp' });
    els.state = h('div', { class: 'tn-state' }, els.badge, els.stamp);
    els.bUndo = btn('تراجع', { icon: 'undo', act: 'undo', on: undo });
    els.bPublish = btn('نشر للجميع', { icon: 'cloud', cls: 'primary', act: 'publish', on: () => publish() });
    els.bRefresh = btn('حدّث الآن', { icon: 'refresh', act: 'refresh', on: manualRefresh });
    els.bShare = btn('رابط المشاركة', { icon: 'link', act: 'share', on: toggleShare });
    els.bPrint = btn('اطبع', { icon: 'printer', act: 'print', on: doPrint });
    els.bScreen = h('a', { class: 'tn-btn', href: '?screen=1', target: '_blank', rel: 'noopener', 'data-act': 'screen' }, svg('screen'), h('span', null, 'شاشة العرض'));
    els.actions = h('div', { class: 'tn-actions', role: 'toolbar', 'aria-label': 'إجراءات اللوحة' }, els.bUndo, els.bPublish, els.bRefresh, els.bShare, els.bPrint, els.bScreen);
    els.top = h('div', { class: 'tn-top' }, els.state, els.actions);
    els.notices = h('div', { class: 'tn-notices' });
    els.tabs = h('div', { class: 'tn-tabs', role: 'tablist', 'aria-label': 'أقسام لوحة البطولة', 'data-seg': 'own' });
    els.panels = h('div', { class: 'tn-panels' });
    TABS.forEach(t => {
      els.tabs.append(h('button', {
        type: 'button', role: 'tab', id: 'tn-t-' + t[0], 'aria-controls': 'tn-p-' + t[0], class: 'tn-tab',
        onclick: () => setTab(t[0]), onkeydown: tabKey
      }, t[1]));
      els.panels.append(h('div', { role: 'tabpanel', id: 'tn-p-' + t[0], 'aria-labelledby': 'tn-t-' + t[0], class: 'tn-panel', tabindex: '-1', hidden: true }));
    });
    els.ok = h('div', { class: 'tn-toast', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    els.err = h('div', { class: 'tn-toast err', role: 'alert', 'aria-atomic': 'true' });
    root.append(els.top, els.notices, els.tabs, els.panels, els.ok, els.err);
  }
  function tabKey(e) {
    const ids = allowedTabs();
    let i = ids.indexOf(A.tab);
    const rtl = getComputedStyle(root).direction === 'rtl';
    if (e.key === 'ArrowLeft') i += rtl ? 1 : -1;
    else if (e.key === 'ArrowRight') i += rtl ? -1 : 1;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ids.length - 1;
    else return;
    e.preventDefault();
    setTab(ids[(i + ids.length) % ids.length], { focus: true });
  }
  async function manualRefresh() {
    if (A.mode !== 'public') return;
    try { await pollTick(); say(A.pollErr ? A.pollErr : 'تم التحديث.', !!A.pollErr); } catch (e) { say(YB.errorText(e), true); }
  }

  function updateTop() {
    const m = A.mode;
    els.badge.textContent = m === 'public' ? 'عرض عام' : m === 'manager' ? 'وضع الإدارة' : m === 'local' ? 'وضع محلي' : m === 'share' ? 'نسخة مشاركة' : '…';
    els.badge.dataset.mode = m;
    els.top.dataset.mode = m;
    let stamp = '';
    if (m === 'public') stamp = A.unpublished ? 'لم تُنشر البطولة بعد' : (A.remoteAt ? 'آخر تحديث: ' + fmtDT(A.remoteAt) : '');
    else if (m === 'manager') stamp = A.dirty ? 'تغييرات غير منشورة' : (A.base ? 'منشور · آخر تحديث: ' + fmtDT(A.base) : 'لم يُنشر شيء بعد');
    else if (m === 'local') stamp = 'وضع محلي: يُحفظ على هذا الجهاز فقط';
    else if (m === 'share') stamp = A.S.updated ? 'لقطة بتاريخ ' + fmtDT(A.S.updated) : 'لقطة للعرض فقط';
    els.stamp.textContent = stamp;
    els.stamp.classList.toggle('is-dirty', m === 'manager' && A.dirty);
    els.stamp.setAttribute('data-dirty', m === 'manager' && A.dirty ? '1' : '0');
    els.bUndo.hidden = !canEdit();
    els.bUndo.disabled = !A.hist.length;
    els.bPublish.hidden = m !== 'manager';
    els.bPublish.disabled = A.busy || !A.dirty;
    els.bPublish.querySelector('span').textContent = A.busy ? 'جارٍ النشر…' : 'نشر للجميع';
    els.bRefresh.hidden = m !== 'public';
    els.bShare.hidden = m !== 'local';
    els.bPrint.hidden = A.loading || !A.S.teams.length;
  }

  /* ------------------------------------------------------------------ notices */
  function notice(cls, role, kids) {
    return h('div', { class: 'tn-note ' + cls, role: role || null }, kids);
  }
  function renderNotices() {
    const box = els.notices;
    const kids = [];
    if (A.shareErr) kids.push(notice('warn', 'alert', [svg('alert'), h('p', null, ERR.bad_share + ' عُرضت اللوحة الأصلية بدلًا منها.')]));
    if (A.mode === 'share') {
      kids.push(notice('info', null, [h('p', null, h('b', null, 'نسخة مشاركة للعرض فقط'), ' · هذه لقطة من البطولة وقت إنشاء الرابط، ولا تغيّر بيانات أحد.'),
        btn('افتح كنسخة محلية', { cls: 'primary', act: 'open-local', on: openAsLocal })]));
    }
    if (A.mode === 'local' && A.forcedLocal && YB.configured) {
      kids.push(notice('info', null, [h('p', null, 'تعمل الآن على نسخة محلية على هذا الجهاز، وليست البطولة المنشورة.'),
        btn('العودة إلى البطولة المنشورة', { act: 'back-published', on: () => { A.forcedLocal = false; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } boot(); } })]));
    }
    if (A.mode === 'local' && !A.storageOk) {
      kids.push(notice('warn', 'alert', [svg('alert'), h('p', null, 'تعذّر الحفظ في هذا المتصفح، فستبقى البيانات حتى إغلاق الصفحة فقط. صدّر ملف JSON من «الإعداد» لحفظها.')]));
    }
    if (A.mode === 'public' && A.pollErr && !A.loading && !A.error) {
      kids.push(notice('warn', null, [svg('alert'), h('p', null, 'تعذّر تحديث البيانات الآن، وتُعرض آخر نسخة وصلتنا. ' + A.pollErr), btn('أعد المحاولة', { act: 'retry', on: manualRefresh })]));
    }
    if (A.mode === 'manager') {
      if (A.staleDraft) {
        kids.push(notice('info', null, [h('p', null, 'وُجدت مسودة محفوظة على هذا الجهاز مبنية على نسخة أقدم من المنشور. نشرها سيحل محل ما نُشر لاحقًا.'),
          btn('استعد المسودة', { act: 'restore-draft', on: restoreDraft }), btn('تجاهل المسودة', { act: 'drop-draft', on: () => { lsDel(LS_DRAFT); A.staleDraft = null; renderNotices(); say('حُذفت المسودة.'); } })]));
      }
      if (A.remoteNewer && !A.conflict) {
        kids.push(notice('info', null, [h('p', null, 'نُشرت نسخة أحدث من البطولة من جهة أخرى.'),
          btn('حمّل النسخة الأحدث', { act: 'load-newer', on: loadNewest })]));
      }
      if (A.conflict) {
        kids.push(notice('warn', 'alert', [svg('alert'),
          h('p', null, h('b', null, 'تغيّرت البطولة المنشورة من جهة أخرى'), ' بعد أن بدأت التعديل. اختر: تحميل النسخة الأحدث (وتبقى تغييراتك قابلة للاستعادة بزر «تراجع»)، أو النشر فوقها.'),
          h('div', { class: 'tn-note-act' },
            btn('حمّل النسخة الأحدث', { cls: 'primary', act: 'conflict-load', on: loadNewest }),
            btn('اكتب فوقها', { cls: 'danger', act: 'conflict-overwrite', on: async () => { if (await ask('سيحل ما لديك محل النسخة المنشورة الأحدث. هل تتابع؟', 'اكتب فوقها', true)) overwrite(); } }),
            btn('ابقَ على مسودتي', { act: 'conflict-keep', on: () => { A.conflict = null; renderNotices(); } }))]));
      }
    }
    if (A.shareBox && A.mode === 'local') kids.push(shareBox());
    box.replaceChildren(...kids);
  }
  function restoreDraft() {
    const d = A.staleDraft;
    if (!d) return;
    A.hist.push(A.S);
    A.S = d.state; A.staleDraft = null;
    changed();
    say('استُعيدت المسودة.');
  }

  /* ------------------------------------------------------------------ share link */
  function shareUrl() {
    return location.href.split('#')[0] + '#v=' + YT.encode(A.S, { public: true });
  }
  function toggleShare() {
    A.shareBox = !A.shareBox;
    renderNotices();
    if (A.shareBox) { const i = els.notices.querySelector('.tn-sharebox input'); if (i) i.select(); }
  }
  function shareBox() {
    const url = shareUrl();
    const input = h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'رابط المشاركة', class: 'tn-link', dir: 'ltr' });
    return h('div', { class: 'tn-note info tn-sharebox' },
      h('p', null, 'رابط يفتح لقطة للعرض فقط من البطولة كما هي الآن. لا يتغيّر عند تعديلك لاحقًا، ولا يمرّ بأي خادم.'),
      h('div', { class: 'tn-copy' }, input, btn('انسخ الرابط', { cls: 'primary', act: 'copy-share', on: () => copyText(url, input) })),
      h('p', { class: 'tn-fine' }, 'لا يحتوي الرابط على أي بيانات غير أسماء الفرق والنتائج.'));
  }
  async function copyText(text, input) {
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { ok = false; }
    if (!ok && input) { try { input.focus(); input.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; } }
    say(ok ? 'نُسخ الرابط.' : 'تعذّر النسخ تلقائيًا. حدّد الرابط وانسخه يدويًا.', !ok);
  }
  async function openAsLocal() {
    const cur = lsGet(LS_LOCAL);
    let has = false;
    if (cur) { try { const o = JSON.parse(cur); has = !!(o && o.state && YT.normalize(o.state).teams.length); } catch (e) { has = false; } }
    if (has && !(await ask('لديك بطولة محلية محفوظة على هذا الجهاز، وسيحل هذا الرابط محلها. هل تتابع؟', 'استبدل نسختي المحلية', true))) return;
    const snap = A.S;
    A.forcedLocal = true;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + A.tab); } catch (e) { /* ignore */ }
    A.mode = 'local'; A.shareV = ''; A.S = snap; A.hist = [];
    changed();
    say('فُتحت اللقطة كنسخة محلية على هذا الجهاز.');
    boot2Local();
  }
  function boot2Local() { stopPoll(); finishBoot(); }

  /* ------------------------------------------------------------------ print */
  function doPrint() {
    buildPrint();
    const only = window.__yanabeePrintOnly;
    if (typeof only === 'function') { only('print-tournament'); return; }
    document.body.classList.add('print-tournament');
    const off = () => { document.body.classList.remove('print-tournament'); window.removeEventListener('afterprint', off); };
    window.addEventListener('afterprint', off);
    window.print();
  }
  function buildPrint() {
    const host = document.getElementById('tn-print');
    if (!host) return;
    const { fb, ch } = view();
    const T = (cap, head, rows) => h('table', { class: 'tn-ptbl' }, h('caption', null, cap),
      h('thead', null, h('tr', null, head.map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map(r => h('tr', null, r.map(c => h('td', null, String(c)))))));
    const stand = (cap, table) => T(cap, ['#', 'الفريق', 'لعب', 'فاز', 'تعادل', 'خسر', 'له', 'عليه', 'فارق', 'نقاط'],
      table.map(r => [r.rank, nm(r.id), r.p, r.w, r.d, r.l, r.gf, r.ga, r.gd, r.pts]));
    const fixtures = rounds => h('ul', { class: 'tn-pfx' }, rounds.map(rd => rd.matches.map(m =>
      h('li', null, `الجولة ${rd.round}: ${nm(m.a)} ${m.res ? m.sa + ' – ' + m.sb : 'ضد'} ${nm(m.b)}`))));
    const kids = [h('h2', null, 'لوحة البطولة · مشروع ينابيع'), h('p', { class: 'tn-fine' }, 'طُبعت في ' + fmtDT(new Date().toISOString()))];
    if (fb.drawn) {
      kids.push(h('h3', null, W.fbTitle || 'دوري كرة القدم'));
      fb.groups.forEach(g => kids.push(h('section', null, stand('المجموعة ' + g.name, g.table), fixtures(g.rounds))));
      if (fb.final) kids.push(h('section', null, stand('التصفيات', fb.final.table), fixtures(fb.final.rounds)));
      if (fb.podium) kids.push(h('section', null, h('h4', null, 'مراكز كرة القدم'), h('ol', null, fb.podium.map((id, i) => h('li', null, ORD[i] + ': ' + nm(id))))));
    }
    if (ch.r1.matches.length) {
      kids.push(h('h3', null, W.chTitle || 'بطولة الشطرنج'));
      const list = (title, ms) => h('section', null, h('h4', null, title), h('ul', { class: 'tn-pfx' }, ms.map(m =>
        h('li', null, `${nm(m.a)} ضد ${nm(m.b)}${m.w ? ' · الفائز: ' + nm(m.w) : ''}`))));
      kids.push(list('الجولة 1', ch.r1.matches));
      if (ch.r2.matches.length) kids.push(list('الجولة 2', ch.r2.matches));
      if (ch.rr.matches.length) {
        kids.push(list('الجولة 3: دوري الثلاثة', ch.rr.matches));
        kids.push(T('ترتيب دوري الثلاثة', ['#', 'الفريق', 'لعب', 'فوز', 'خسارة'], ch.rr.table.map(r => [r.rank, nm(r.id), r.p, r.w, r.l])));
      }
      if (ch.final) kids.push(list('النهائي', [ch.final]));
      if (ch.podium) kids.push(h('section', null, h('h4', null, 'مراكز الشطرنج'), h('ol', null, ch.podium.map((id, i) => h('li', null, ORD[i] + ': ' + nm(id))))));
    }
    host.replaceChildren(...kids);
  }

  /* ------------------------------------------------------------------ render */
  function render(keepFocus) {
    if (!els.tabs) return;
    if (A.screen && !A.loading && !A.error && (A.mode === 'public' || A.mode === 'manager')) { renderScreen(); return; }
    updateTop();
    renderNotices();
    const ids = allowedTabs();
    TABS.forEach(t => {
      const b = els.tabs.querySelector('#tn-t-' + t[0]);
      const on = ids.indexOf(t[0]) >= 0;
      b.hidden = !on;
      b.setAttribute('aria-selected', t[0] === A.tab ? 'true' : 'false');
      b.tabIndex = t[0] === A.tab ? 0 : -1;
    });
    if (ids.indexOf(A.tab) < 0) A.tab = 'overview';
    const ae = document.activeElement;
    let fk = null;
    if (keepFocus && ae && ae.dataset && ae.dataset.fk && els.panels.contains(ae)) fk = ae.dataset.fk;
    TABS.forEach(t => {
      const p = els.panels.querySelector('#tn-p-' + t[0]);
      const on = t[0] === A.tab;
      p.hidden = !on;
      if (on) fillPanel(p, t[0]);
    });
    if (fk) {
      const next = els.panels.querySelector('[data-fk="' + fk.replace(/(["\\])/g, '\\$1') + '"]');
      if (next) next.focus({ preventScroll: true });
    }
    root.setAttribute('aria-busy', A.loading ? 'true' : 'false');
  }

  function skeleton() { return h('div', { class: 'tn-skel', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')); }
  function fillPanel(p, tab) {
    const box = [];
    if (tab === 'schedule' && !A.loading) {
      const box1 = h('div', { class: 'tn-in' });
      renderSchedule(box1);
      p.replaceChildren(box1);
      return;
    }
    if (A.loading) {
      box.push(h('p', { class: 'tn-fine', role: 'status' }, 'جارٍ تحميل البطولة…'), skeleton());
    } else if (A.error) {
      box.push(h('div', { class: 'tn-card tn-errbox', role: 'alert' },
        h('h3', null, 'تعذّر تحميل البطولة'), h('p', null, A.error),
        btn('أعد المحاولة', { cls: 'primary', icon: 'refresh', act: 'retry-load', on: () => { loadRemote().then(ok => { if (ok) { finishBoot(); startPoll(); } else render(); }); } })));
    } else if (A.mode === 'public' && A.unpublished) {
      box.push(h('div', { class: 'tn-card tn-empty' }, h('h3', null, 'لم تُنشر نتائج البطولة بعد'),
        h('p', null, 'ستظهر هنا المجموعات والنتائج والترتيب فور أن تنشرها الإدارة. تتحدث الصفحة تلقائيًا، ويمكنك الاطلاع على نظام البطولة في الأسفل.'),
        h('a', { class: 'tn-btn', href: '#c-format' }, h('span', null, 'نظام البطولة'))));
    } else {
      const box0 = h('div', { class: 'tn-in' });
      ({ overview: renderOverview, football: renderFootball, chess: renderChess, myteam: renderMyTeam, schedule: renderSchedule, setup: renderSetup })[tab](box0);
      box.push(box0);
    }
    p.replaceChildren(...box);
  }

  /* ------------------------------------------------------------------ shared pieces */
  function prog(played, total, label) {
    const pct = total ? Math.round(played / total * 100) : 0;
    return h('div', { class: 'tn-prog' },
      h('div', { class: 'tn-barx', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(played), 'aria-label': label }, h('i', { style: 'width:' + pct + '%' })),
      h('span', { class: 'tn-prog-n' }, `${played} من ${total}`));
  }
  function card(title, kids, cls, id) {
    return h('section', { class: 'tn-card' + (cls ? ' ' + cls : ''), 'aria-labelledby': id || null },
      title ? h('h3', { id: id || null }, title) : null, kids);
  }
  function podium(ids, label) {
    return h('ol', { class: 'tn-pod', 'aria-label': label }, ids.map((id, i) =>
      h('li', { class: 'p' + (i + 1) }, h('span', { class: 'tn-medal', 'aria-hidden': 'true' }, String(i + 1)), h('small', null, ORD[i]), h('b', null, nm(id)))));
  }
  function how(kind) {
    const lines = kind === 'football' ? W.fbLines : W.chLines;
    const kids = [h('ul', { class: 'tn-lines' }, (lines || []).map(l => h('li', null, l)))];
    if (kind === 'football') {
      if (W.points) kids.push(h('p', { class: 'tn-rule' }, h('b', null, (W.lg6Title || 'احتساب النقاط والترتيب') + ': '), W.points.map(r => r[0] + ' ' + r[1]).join(' · ')));
      if (W.tiebreak) kids.push(h('p', { class: 'tn-rule' }, W.tiebreak));
      kids.push(h('p', { class: 'tn-fine' }, h('a', { href: 'competition.html#c-league' }, 'اللائحة التنظيمية كاملة')));
    }
    const d = h('details', { class: 'tn-how' }, h('summary', null, 'نظام ' + (kind === 'football' ? (W.fbTitle || 'دوري كرة القدم') : (W.chTitle || 'بطولة الشطرنج'))), kids);
    return d;
  }
  function notFor12(more) {
    const n = A.S.teams.length;
    return h('div', { class: 'tn-card tn-empty' }, h('h3', null, n ? 'عدد الفرق ' + n + ' من 12' : 'لا توجد فرق بعد'),
      h('p', null, 'يلزم 12 فريقًا لتبدأ البطولة.' + (canEdit() ? '' : ' ستظهر الفرق هنا بعد أن تضيفها الإدارة.')),
      canEdit() ? btn('اذهب إلى الإعداد', { cls: 'primary', act: 'go-setup', on: () => setTab('setup', { focus: false }) }) : null, more);
  }


  /* ------------------------------------------------------------------ unified schedule (الجدول) */
  const teamName = id => { const t = A.S.teams.find(x => x.id === id); return t ? t.name : (A.pubNames[id] || 'فريق'); };
  // football fixtures that have a planned date on the board (fb.sched) join the list as matches
  function planItems() {
    const out = [];
    let fb;
    try { fb = view().fb; } catch (e) { return out; }
    const add = (m, label) => {
      if (!m.sched || !m.sched.date || m.res) return;
      const at = m.sched.date + 'T' + (m.sched.time || '00:00');
      out.push({ id: 'fx:' + m.key, competition: 'football', kind: 'match', title: `${label}: ${nm(m.a)} ضد ${nm(m.b)}`, starts_at: at, local: true, noTime: !m.sched.time,
        place: null, team_ids: [m.a, m.b], category: label.split(' · ')[0], status: 'scheduled', note: null, board: true });
    };
    (fb.groups || []).forEach(g => g.rounds.forEach(rd => rd.matches.forEach(m => add(m, `المجموعة ${g.name} · الجولة ${rd.round}`))));
    if (fb.final) fb.final.rounds.forEach(rd => rd.matches.forEach(m => add(m, `التصفيات · الجولة ${rd.round}`)));
    return out;
  }
  const evDate = e => (e.local ? new Date(e.starts_at) : new Date(e.starts_at));
  const dayKey = e => { const d = evDate(e); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function allItems() {
    const db = A.events.slice();
    const have = new Set(db.filter(e => e.competition === 'football' && e.kind === 'match').map(e => (e.team_ids || []).slice().sort().join('|') + '@' + dayKey(e)));
    const plans = planItems().filter(p => !have.has(p.team_ids.slice().sort().join('|') + '@' + dayKey(p)));
    return db.concat(plans).sort((a, b) => evDate(a) - evDate(b));
  }
  function renderSchedule(box) {
    const items = allItems();
    const now = Date.now();
    const f = A.sf;
    const myIds = (A.myIds || []).concat(A.myTeam ? [A.myTeam] : []);
    const teamIds = new Set();
    items.forEach(e => (e.team_ids || []).forEach(id => teamIds.add(id)));
    const cats = [...new Set(items.map(e => e.category).filter(Boolean))].sort();
    const comps = [...new Set(items.map(e => e.competition))];
    const fit = e => (!f.team || (e.team_ids || []).length === 0 || e.team_ids.indexOf(f.team) >= 0)
      && (!f.comp || e.competition === f.comp) && (!f.cat || e.category === f.cat)
      && (!f.mine || !myIds.length || (e.team_ids || []).length === 0 || e.team_ids.some(id => myIds.indexOf(id) >= 0));
    const shown = items.filter(fit);
    const upcoming = shown.filter(e => evDate(e).getTime() >= now - 3 * 36e5);
    const past = shown.filter(e => evDate(e).getTime() < now - 3 * 36e5);
    const sel = (id, label, val, opts, key) => h('label', { class: 'tn-lab', for: id }, h('span', null, label),
      h('select', { id, 'data-fk': 'sf-' + key, onchange: ev => { A.sf[key] = ev.target.value; render(true); } },
        h('option', { value: '' }, 'الكل'), opts.map(o => h('option', { value: o[0], selected: o[0] === val }, o[1]))));
    box.append(h('div', { class: 'tn-head' }, h('h2', null, 'الجدول الموحّد'),
      h('p', { class: 'tn-fine' }, 'كل المباريات والجولات والورش ومواعيد التسميع في مكان واحد. يصل تنبيه للفرق المعنية عند إضافة موعد أو تغييره أو إلغائه.')));
    const filters = h('div', { class: 'tn-card tn-sfilters', role: 'group', 'aria-label': 'تصفية الجدول' },
      sel('tn-sf-team', 'الفريق', f.team, [...teamIds].map(id => [id, teamName(id)]).sort((a, b) => a[1].localeCompare(b[1], 'ar')), 'team'),
      sel('tn-sf-comp', 'المسابقة', f.comp, comps.map(c => [c, COMPS[c] || c]), 'comp'),
      cats.length ? sel('tn-sf-cat', 'الفئة', f.cat, cats.map(c => [c, c]), 'cat') : null,
      myIds.length ? h('label', { class: 'tn-check' }, h('input', { type: 'checkbox', checked: f.mine, 'data-fk': 'sf-mine', onchange: ev => { A.sf.mine = ev.target.checked; render(true); } }), h('span', null, 'مواعيد فريقي فقط')) : null,
      shown.length ? btn('أضف إلى التقويم (ics)', { icon: 'calendar', act: 'ics', on: () => downloadIcs(upcoming.length ? upcoming : shown) }) : null);
    box.append(filters);
    if (A.evErr) box.append(h('p', { class: 'tn-fine', role: 'alert' }, 'تعذّر تحميل المواعيد: ' + A.evErr));
    if (!items.length && YB.configured && !A.evLoaded && (A.mode === 'public' || A.mode === 'manager')) { box.append(h('p', { class: 'tn-fine', role: 'status' }, 'جارٍ تحميل المواعيد…'), skeleton()); return; }
    if (!items.length) {
      box.append(h('div', { class: 'tn-card tn-empty' }, h('h3', null, 'لا توجد مواعيد منشورة بعد'),
        h('p', null, YB.configured ? 'ستظهر هنا المواعيد فور أن تضيفها الإدارة أو مسؤولو المسابقات.' : 'تُضاف المواعيد من حساب الإدارة بعد ربط الموقع بقاعدة البيانات. مواعيد مباريات الكرة المخطّطة في اللوحة تظهر هنا أيضًا.')));
      return;
    }
    if (!shown.length) { box.append(h('p', { class: 'tn-fine', role: 'status' }, 'لا توجد مواعيد تطابق التصفية.')); return; }
    const group = list => {
      const days = [];
      list.forEach(e => { const k = dayKey(e); let d = days.find(x => x.k === k); if (!d) { d = { k, items: [] }; days.push(d); } d.items.push(e); });
      return days.map(d => h('section', { class: 'tn-day', 'aria-label': fmtDay(d.k) }, h('h3', { class: 'tn-day-h' }, svg('calendar'), fmtDayLong(d.k)),
        h('ul', { class: 'tn-evs' }, d.items.map(evRow))));
    };
    box.append(h('p', { class: 'tn-fine', role: 'status' }, `${upcoming.length} من المواعيد القادمة`), ...group(upcoming));
    if (past.length) box.append(h('details', { class: 'tn-past' }, h('summary', null, `مواعيد مضت (${past.length})`), ...group(past.slice().reverse())));
  }
  function fmtDayLong(k) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || '');
    if (!m) return k || '';
    try { return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return k; }
  }
  function evRow(e) {
    const d = evDate(e);
    const time = e.noTime ? '' : (isNaN(d) ? '' : d.toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' }));
    const teams = (e.team_ids || []).length ? e.team_ids.map(teamName).join(' · ') : 'كل الفرق';
    const st = e.status === 'cancelled' ? h('em', { class: 'tn-chip bad' }, 'أُلغي') : e.status === 'changed' ? h('em', { class: 'tn-chip warn' }, 'تغيّر الموعد') : null;
    return h('li', { class: 'tn-ev k-' + e.kind + (e.status === 'cancelled' ? ' is-cancelled' : '') },
      h('span', { class: 'tn-ev-t' }, time || '—'),
      h('div', { class: 'tn-ev-b' },
        h('b', null, e.title), st,
        h('span', { class: 'tn-ev-m' }, [KINDS[e.kind] || '', COMPS[e.competition] || '', e.category || ''].filter(Boolean).join(' · ')),
        h('span', { class: 'tn-ev-m' }, teams + (e.place ? ' · ' + e.place : '')),
        e.note ? h('span', { class: 'tn-ev-n' }, e.note) : null,
        e.board ? h('span', { class: 'tn-ev-n' }, 'من خطة لوحة البطولة') : null));
  }
  // a small .ics file (RFC 5545) with the shown dates: works offline, nothing is sent anywhere
  function downloadIcs(list) {
    const pad = n => String(n).padStart(2, '0');
    const utc = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    const esc = t => String(t || '').replace(/[\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yanabee//Schedule//AR', 'CALSCALE:GREGORIAN'];
    const stamp = utc(new Date());
    list.filter(e => e.status !== 'cancelled').forEach(e => {
      const d = evDate(e);
      if (isNaN(d)) return;
      const end = new Date(d.getTime() + 90 * 60000);
      lines.push('BEGIN:VEVENT', 'UID:' + String(e.id).replace(/[^\w:-]/g, '') + '@yanabee', 'DTSTAMP:' + stamp, 'DTSTART:' + utc(d), 'DTEND:' + utc(end),
        'SUMMARY:' + esc(e.title), 'DESCRIPTION:' + esc([COMPS[e.competition], e.category, e.note].filter(Boolean).join(' - ')));
      if (e.place) lines.push('LOCATION:' + esc(e.place));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }));
      a.download = 'yanabee-schedule.ics';
      document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      say('نُزّل ملف التقويم.');
    } catch (e) { say('تعذّر تنزيل ملف التقويم.', true); }
  }

  /* ------------------------------------------------------------------ overview */
  function steps(names, current, extra) {
    return h('ol', { class: 'tn-steps' }, names.map((n, i) => {
      const st = i < current ? 'done' : i === current ? 'now' : 'todo';
      return h('li', { class: 'is-' + st, 'aria-current': st === 'now' ? 'step' : null },
        h('span', { class: 'tn-sn', 'aria-hidden': 'true' }, st === 'done' ? svg('check') : String(i + 1)),
        h('span', { class: 'tn-st' }, n, extra && extra[i] ? h('small', null, extra[i]) : null));
    }));
  }
  function decisions() {
    const { fb, ch } = view();
    const out = [];
    fb.pending.forEach(p => {
      if (p.reason !== 'tie') return;
      out.push({ tab: 'football', text: p.scope === 'final' ? 'تعادل في ترتيب التصفيات يحتاج حسمًا.' : `تعادل على المركز الأول في المجموعة ${GN[+p.scope.slice(1)]} يحتاج حسمًا.` });
    });
    if (ch.rr.tied) out.push({ tab: 'chess', text: 'تعادل 1–1–1 في دوري الثلاثة (الجولة 3) يحتاج ترتيب اللجنة.' });
    return out;
  }
  function nextMatches() {
    const { fb, ch } = view();
    const out = [];
    fb.groups.forEach(g => {
      for (const rd of g.rounds) { const m = rd.matches.find(x => !x.res); if (m) { out.push({ tab: 'football', text: `المجموعة ${g.name} · الجولة ${rd.round}: ${nm(m.a)} ضد ${nm(m.b)}` + (fxWhen(m.sched) ? ' · ' + fxWhen(m.sched) : '') }); break; } }
    });
    if (fb.final) {
      for (const rd of fb.final.rounds) { const m = rd.matches.find(x => !x.res); if (m) { out.push({ tab: 'football', text: `التصفيات · الجولة ${rd.round}: ${nm(m.a)} ضد ${nm(m.b)}` + (fxWhen(m.sched) ? ' · ' + fxWhen(m.sched) : '') }); break; } }
    }
    const pushCh = (label, ms) => ms.filter(m => !m.w).slice(0, 2).forEach(m => out.push({ tab: 'chess', text: `الشطرنج · ${label}: ${nm(m.a)} ضد ${nm(m.b)}` }));
    if (ch.r1.matches.length && !ch.r1.complete) pushCh('الجولة 1', ch.r1.matches);
    else if (ch.r2.matches.length && !ch.r2.complete) pushCh('الجولة 2', ch.r2.matches);
    else if (ch.rr.matches.length && !ch.rr.top2) pushCh('دوري الثلاثة', ch.rr.matches);
    else if (ch.final && !ch.final.w) pushCh('النهائي', [ch.final]);
    return out;
  }

  function renderOverview(box) {
    const { ov, ch } = view();
    const n = A.S.teams.length;
    if (n < 12) box.append(notFor12());
    const dec = decisions();
    if (dec.length) {
      box.append(h('section', { class: 'tn-card tn-decide', 'aria-labelledby': 'tn-dec-h' }, h('h3', { id: 'tn-dec-h' }, svg('alert'), 'حالات تحتاج قرارًا'),
        h('ul', null, dec.map(d => h('li', null, h('span', null, d.text), h('button', { type: 'button', class: 'tn-link-btn', onclick: () => setTab(d.tab, { focus: false }) }, 'افتح')))),
        W.committee ? h('p', { class: 'tn-rule' }, W.committee) : null));
    }
    const fbIdx = { draw: 0, groups: 1, final: 2, done: 4 }[ov.football.phase];
    const fbExtra = [ov.drawn ? 'تمت القرعة' : null, `${ov.football.groups.played} من ${ov.football.groups.total}`, ov.drawn ? `${ov.football.final.played} من ${ov.football.final.total}` : null, null];
    const fbCard = h('section', { class: 'tn-card tn-sport', 'aria-labelledby': 'tn-ov-fb' },
      h('div', { class: 'tn-chead' }, h('h3', { id: 'tn-ov-fb' }, 'كرة القدم'),
        h('button', { type: 'button', class: 'tn-link-btn', onclick: () => setTab('football') }, 'افتح التفاصيل')),
      prog(ov.football.played, ov.football.total, 'تقدّم مباريات كرة القدم'),
      steps(['القرعة والمجموعات', 'مباريات المجموعات', 'التصفيات', 'المراكز'], fbIdx, fbExtra),
      ov.football.podium ? [h('h4', { class: 'tn-sub' }, svg('trophy'), 'مراكز كرة القدم'), podium(ov.football.podium, 'مراكز كرة القدم')] : null);
    const chIdx = { setup: 0, r1: 1, r2: 2, rr: 3, final: 4, done: 6 }[ov.chess.phase];
    const chExtra = [ch.r1.matches.length ? 'تمت القرعة' : null, `${ov.chess.r1.played} من ${ov.chess.r1.total}`, `${ov.chess.r2.played} من ${ov.chess.r2.total}`,
      `${ov.chess.rr.played} من ${ov.chess.rr.total}`, `${ov.chess.final.played} من ${ov.chess.final.total}`, null];
    const chCard = h('section', { class: 'tn-card tn-sport', 'aria-labelledby': 'tn-ov-ch' },
      h('div', { class: 'tn-chead' }, h('h3', { id: 'tn-ov-ch' }, 'الشطرنج'),
        h('button', { type: 'button', class: 'tn-link-btn', onclick: () => setTab('chess') }, 'افتح التفاصيل')),
      prog(ov.chess.played, ov.chess.total, 'تقدّم مباريات الشطرنج'),
      steps(['القرعة', 'الجولة 1', 'الجولة 2', 'الجولة 3: دوري الثلاثة', 'النهائي', 'المراكز'], chIdx, chExtra),
      ov.chess.podium ? [h('h4', { class: 'tn-sub' }, svg('trophy'), 'مراكز الشطرنج'), podium(ov.chess.podium, 'مراكز الشطرنج')] : null);
    box.append(h('div', { class: 'tn-sports' }, fbCard, chCard));
    const now = nowCard();
    if (now) box.prepend(now);
    const td = todayCard();
    if (td) box.prepend(td);
    const nx = nextMatches();
    box.append(h('section', { class: 'tn-card', 'aria-labelledby': 'tn-next-h' }, h('h3', { id: 'tn-next-h' }, 'المباريات القادمة'),
      nx.length ? h('ul', { class: 'tn-next' }, nx.map(x => h('li', null, h('span', null, x.text), h('button', { type: 'button', class: 'tn-link-btn', onclick: () => setTab(x.tab) }, 'افتح'))))
        : h('p', { class: 'tn-fine' }, n < 12 ? 'تظهر المباريات بعد اكتمال الفرق والقرعة.' : 'لا توجد مباريات قادمة الآن.')));
  }

  /* ------------------------------------------------------------------ live results (migration 0007) */
  // yb_match_live: anyone may read it (no notes, no user ids). The board itself holds APPROVED results only; live and
  // pending rows are drawn on top with their own chips and never change the standings.
  async function loadLive() {
    if (!YB.configured || !YB.q || A.mode === 'share' || A.mode === 'local') return false;
    let rows;
    try { rows = await YB.q('yb_match_live', { select: 'comp,match_key,a,b,sa,sb,ca,cb,ra,rb,status,started_at,updated_at,approved_at' }); } catch (e) { return false; }
    if (!Array.isArray(rows)) return false;   // not available yet: keep the board as it is
    const sig = JSON.stringify(rows);
    if (sig === A.liveSig) return false;
    A.liveSig = sig; A.live = rows;
    return true;
  }
  const liveRow = (comp, a, b) => A.live.find(x => x.comp === comp && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  const liveMin = r => { const t = Date.parse(r.started_at || ''); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 60000)); };
  const LIVE_W = { live: 'جارية الآن', final: 'انتهت · بانتظار الاعتماد', returned: 'قيد المراجعة', approved: 'نتيجة معتمدة' };
  const liveScore = (r, a) => (r.a === a ? [r.sa, r.sb] : [r.sb, r.sa]);   // as seen from side a of the board match
  function liveChip(r) {
    const m = r.status === 'live' ? liveMin(r) : null;
    return h('em', { class: 'tn-chip live-' + r.status }, r.status === 'live' ? h('i', { class: 'tn-dot', 'aria-hidden': 'true' }) : null,
      LIVE_W[r.status] + (m !== null ? ` · الدقيقة ${m}` : ''));
  }
  function liveText(x) {
    if (x.comp === 'chess') return x.sa === x.sb ? '—' : 'الفائز: ' + nm(x.sa > x.sb ? x.a : x.b);
    return `${x.sa} – ${x.sb}`;
  }
  // «الآن في الملعب»: live and waiting results, then the last approved ones
  function nowCard() {
    const on = A.live.filter(x => x.status === 'live' || x.status === 'final' || x.status === 'returned');
    const done = A.live.filter(x => x.status === 'approved' && x.approved_at)
      .sort((x, y) => String(y.approved_at).localeCompare(String(x.approved_at))).slice(0, 3);
    if (!on.length && !done.length) return null;
    const line = x => h('li', { class: 'tn-now-i', 'data-live': x.status },
      h('span', { class: 'tn-now-c' }, x.comp === 'chess' ? 'الشطرنج' : 'كرة القدم'),
      h('span', { class: 'tn-now-t' }, `${nm(x.a)} ضد ${nm(x.b)}`),
      h('b', { class: 'tn-now-s', dir: 'rtl' }, liveText(x)), liveChip(x));
    return h('section', { class: 'tn-card tn-now', 'aria-labelledby': 'tn-now-h' },
      h('div', { class: 'tn-chead' }, h('h3', { id: 'tn-now-h' }, 'الآن في الملعب'),
        h('a', { class: 'tn-link-btn', href: '?screen=1', target: '_blank', rel: 'noopener' }, 'شاشة العرض')),
      on.length ? h('ul', { class: 'tn-now-l' }, on.map(line)) : null,
      done.length ? [h('h4', { class: 'tn-sub' }, 'آخر النتائج المعتمدة'), h('ul', { class: 'tn-now-l' }, done.map(line))] : null,
      h('p', { class: 'tn-fine' }, 'النتيجة الجارية أو المنتظرة لا تدخل الترتيب حتى تعتمدها الإدارة.'));
  }
  // match day: every football match dated today on the board (its schedule or its result), earliest first
  function localDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function todayMatches() {
    const { fb } = view();
    if (!fb || !fb.drawn) return [];
    const day = localDay(new Date()), out = [];
    const take = (label, rounds) => (rounds || []).forEach(r => r.matches.forEach(m => {
      const d = (m.res && m.res.date) || (m.sched && m.sched.date) || '';
      if (d === day) out.push({ m, label: `${label} · الجولة ${r.round}`, time: (m.res && m.res.time) || (m.sched && m.sched.time) || '' });
    }));
    fb.groups.forEach(g => take('المجموعة ' + g.name, g.rounds));
    if (fb.final) take('التصفيات', fb.final.rounds);
    return out.sort((x, y) => String(x.time).localeCompare(String(y.time)));
  }
  function todayScore(t) {
    if (t.m.res) return `${t.m.sa} – ${t.m.sb}`;
    const x = liveRow('football', t.m.a, t.m.b);
    return x ? (x.a === t.m.a ? `${x.sa} – ${x.sb}` : `${x.sb} – ${x.sa}`) : '';
  }
  // «مباريات اليوم» on the board: shown only on a day with matches
  function todayCard() {
    const list = todayMatches();
    if (!list.length) return null;
    return h('section', { class: 'tn-card tn-today', 'aria-labelledby': 'tn-today-h', 'data-today': '' },
      h('div', { class: 'tn-chead' }, h('h3', { id: 'tn-today-h' }, `اليوم يوم مباريات (${list.length})`),
        h('a', { class: 'tn-link-btn', href: '?screen=1', target: '_blank', rel: 'noopener' }, 'شاشة العرض')),
      h('ul', { class: 'tn-today-l' }, list.map(t => {
        const x = t.m.res ? null : liveRow('football', t.m.a, t.m.b), s = todayScore(t);
        return h('li', { class: 'tn-today-i' + (x && x.status === 'live' ? ' is-live' : '') },
          h('span', { class: 'tn-today-time' }, t.time || '—'),
          h('span', { class: 'tn-today-t' }, h('b', null, `${nm(t.m.a)} ضد ${nm(t.m.b)}`), h('small', null, t.label)),
          s ? h('b', { class: 'tn-now-s', dir: 'rtl' }, s) : null,
          t.m.res ? h('em', { class: 'tn-chip live-approved' }, 'انتهت') : x ? liveChip(x) : h('em', { class: 'tn-chip' }, 'لم تبدأ'));
      })),
      h('p', { class: 'tn-fine' }, 'تتحدّث هذه القائمة وحدها كل بضع ثوانٍ أثناء المباريات.'));
  }
  // the big screen (?screen=1): live matches large, one group table at a time, the next matches, a clock
  function renderScreen() {
    const { fb } = view();
    document.documentElement.classList.add('tn-screen-on');
    const live = A.live.filter(x => x.comp === 'football' && (x.status === 'live' || x.status === 'final'));
    const big = x => h('article', { class: 'tns-m is-' + x.status },
      h('div', { class: 'tns-row' }, h('span', { class: 'tns-t' }, nm(x.a)), h('b', { class: 'tns-s', dir: 'rtl' }, `${x.sa} – ${x.sb}`), h('span', { class: 'tns-t' }, nm(x.b))),
      liveChip(x));
    const groups = fb.drawn ? fb.groups : [];
    const g = groups.length ? groups[A.screenIdx % groups.length] : null;
    const nx = nextMatches().slice(0, 4);
    const today = todayMatches();
    const clock = new Date().toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
    root.replaceChildren(h('div', { class: 'tns', 'data-screen': '' },
      h('header', { class: 'tns-h' }, h('b', null, 'مشروع ينابيع · البطولة الآن'), h('span', { class: 'tns-clock' }, clock),
        h('a', { class: 'tns-x', href: location.pathname }, 'خروج من شاشة العرض')),
      h('section', { class: 'tns-live', 'aria-label': 'المباريات الآن' }, live.length ? live.map(big) : h('p', { class: 'tns-empty' }, 'لا مباريات جارية الآن.')),
      h('div', { class: 'tns-grid' },
        g ? h('section', { class: 'tns-table', 'aria-label': 'ترتيب المجموعة ' + g.name }, h('h3', null, 'المجموعة ' + g.name), standings(g.table, 'ترتيب المجموعة ' + g.name, { qualified: g.first }))
          : h('section', { class: 'tns-table' }, h('p', { class: 'tns-empty' }, 'تظهر الجداول بعد القرعة.')),
        today.length
          ? h('section', { class: 'tns-next', 'data-screen-today': '' }, h('h3', null, 'مباريات اليوم'),
            h('ul', null, today.map(t => h('li', null, `${t.time || '—'} · ${nm(t.m.a)} ضد ${nm(t.m.b)}` + (todayScore(t) ? ' · ' + todayScore(t) : '')))))
          : h('section', { class: 'tns-next' }, h('h3', null, 'المباريات القادمة'),
            nx.length ? h('ul', null, nx.map(x => h('li', null, x.text))) : h('p', { class: 'tns-empty' }, 'لا مباريات قادمة.')))));
    root.setAttribute('aria-busy', 'false');
  }

  /* ------------------------------------------------------------------ football */
  function noteSentences(table) {
    const out = [], seen = new Set();
    table.forEach((r, i) => {
      const below = table[i + 1];
      r.notes.forEach(n => {
        if (n.step === 'tie' || n.step === 'decision') {
          const key = n.step + '|' + (n.with || []).join(',');
          if (seen.has(key)) return;
          seen.add(key);
          const names = (n.with || []).map(nm).map(x => '«' + x + '»').join(' و');
          if (n.step === 'tie') out.push({ k: 'tie', t: n.flag === 'committee'
            ? `${names}: المواجهات المباشرة بينها لا تحسم الترتيب، فيُحسم بقرار اللجنة.`
            : `${names}: تساوت في كل المعايير، فيُحسم الترتيب بقرعة علنية.` });
          else out.push({ k: 'decision', t: `${names}: حُسم ترتيبها بقرار مسجّل.` });
        } else if (STEP_TXT[n.step] && below && n.vs && n.vs[0] === below.id) {
          out.push({ k: n.step, t: `«${nm(r.id)}» قبل «${nm(below.id)}» ${STEP_TXT[n.step]}.` });
        }
      });
    });
    return out;
  }
  function standings(table, caption, opt) {
    opt = opt || {};
    const th = (t, tip) => h('th', { scope: 'col', title: tip || null }, t);
    const rows = table.map(r => {
      const q = opt.qualified === r.id;
      return h('tr', { class: (q ? 'is-q ' : '') + (r.flag ? 'is-tie' : ''), 'data-team': r.id },
        h('td', { class: 'tn-rk' }, String(r.rank)),
        h('th', { scope: 'row', class: 'tn-tn' }, h('span', null, nm(r.id)),
          q ? h('em', { class: 'tn-chip ok' }, 'متأهل') : null,
          opt.podium && r.rank <= 3 ? h('em', { class: 'tn-chip ok' }, ORD[r.rank - 1]) : null,
          r.flag ? h('em', { class: 'tn-chip warn' }, 'تعادل يحتاج حسمًا') : null),
        h('td', null, String(r.p)), h('td', null, String(r.w)), h('td', null, String(r.d)), h('td', null, String(r.l)),
        h('td', null, String(r.gf)), h('td', null, String(r.ga)),
        h('td', { class: 'tn-gd' }, h('bdi', { dir: 'ltr' }, (r.gd > 0 ? '+' : '') + r.gd)),
        h('td', { class: 'tn-pts' }, String(r.pts)));
    });
    return h('div', { class: 'tn-scroll', tabindex: '0', role: 'region', 'aria-label': caption },
      h('table', { class: 'tn-tbl' }, h('caption', { class: 'sr-only' }, caption),
        h('thead', null, h('tr', null, th('#', 'الترتيب'), th('الفريق'), th('لعب', 'عدد المباريات'), th('فاز'), th('تعادل'), th('خسر'), th('له', 'الأهداف المسجلة'), th('عليه', 'الأهداف المستقبلة'), th('فارق', 'فارق الأهداف'), th('نقاط'))),
        h('tbody', null, rows)));
  }
  function notesList(table) {
    const s = noteSentences(table);
    if (!s.length) return null;
    return h('ul', { class: 'tn-notes', 'aria-label': 'كيف رُتّبت الفرق' }, s.map(x => h('li', { 'data-k': x.k }, x.t)));
  }
  function tiePanels(ties, scope, table, isGroup) {
    if (!ties || !ties.length) return null;
    return ties.map(c => {
      const names = c.ids.map(nm).join('، ');
      const rank = Math.min.apply(null, c.ids.map(id => table.find(r => r.id === id).rank));
      const kids = [h('h4', null, c.decided ? 'ترتيب معتمد: ' + c.ids.map(nm).join(' ثم ') : 'تعادل يحتاج حسمًا: ' + names)];
      if (!c.decided) kids.push(h('p', null, c.flag === 'draw'
        ? 'تساوت هذه الفرق في كل المعايير، فتُحسم بقرعة علنية. ' + (W.tiebreak || '')
        : 'المواجهات المباشرة بينها لا تحسم الترتيب. ' + (W.committee || '')));
      if (isGroup && rank > 1) kids.push(h('p', { class: 'tn-fine' }, 'لا يؤثر هذا التعادل على التأهل. ' + ((W.fbLines && W.fbLines[2]) || '')));
      if (canEdit()) {
        const sels = c.ids.map((id, i) => {
          const s = h('select', { 'aria-label': 'من يأخذ المركز ' + (i + 1) + ' في ' + names, 'data-fk': 'ord:' + scope + ':' + c.ids.join(',') + ':' + i },
            c.ids.map(x => h('option', { value: x, selected: x === id }, nm(x))));
          return h('label', { class: 'tn-ordsel' }, h('span', null, 'المركز ' + (i + 1)), s);
        });
        const save = btn('احفظ الترتيب', { cls: 'primary', act: 'save-order', on: () => {
          const ids = sels.map(l => l.querySelector('select').value);
          act(S => YT.setOrder(S, scope, ids), 'حُفظ ترتيب الفرق المتعادلة.');
        } });
        kids.push(h('div', { class: 'tn-tiectl' },
          c.flag === 'draw' && !c.decided ? btn('قرعة علنية', { icon: 'shuffle', act: 'draw', on: () => act(S => YT.draw(S, scope), 'أُجريت القرعة العلنية وحُفظ الترتيب.') }) : null,
          h('div', { class: 'tn-ordrow' }, sels, save)));
      }
      return h('div', { class: 'tn-tie' + (c.decided ? ' is-done' : ''), 'data-scope': scope }, kids);
    });
  }

  function fxItem(m, scope) {
    return canEdit() ? fxEdit(m, scope) : fxRead(m);
  }
  function admBadge(res) {
    if (!res || !res.adm) return null;
    return h('em', { class: 'tn-chip warn' }, `قرار إداري · ${KIND[res.adm] || res.adm} · ${nm(res.fault)}`);
  }
  function fxRead(m) {
    const r = m.res;
    const lv = liveRow('football', m.a, m.b);
    if (!r && lv && lv.status !== 'approved') {   // a live or pending result: drawn on top, not in the standings
      const s = liveScore(lv, m.a);
      return h('li', { class: 'tn-fx ro is-live', 'data-key': m.key, 'data-live': lv.status },
        h('div', { class: 'tn-fxrow' }, h('span', { class: 'tn-fxt' }, nm(m.a)), h('b', { class: 'tn-fxs live', dir: 'rtl' }, `${s[0]} – ${s[1]}`), h('span', { class: 'tn-fxt' }, nm(m.b))),
        h('div', { class: 'tn-fxmeta' }, liveChip(lv)));
    }
    return h('li', { class: 'tn-fx ro' + (r ? ' is-played' : ''), 'data-key': m.key },
      h('div', { class: 'tn-fxrow' },
        h('span', { class: 'tn-fxt' }, nm(m.a)),
        r ? h('b', { class: 'tn-fxs', dir: 'rtl' }, `${m.sa} – ${m.sb}`) : h('span', { class: 'tn-fxs idle' }, 'ضد'),
        h('span', { class: 'tn-fxt' }, nm(m.b))),
      r ? h('div', { class: 'tn-fxmeta' }, admBadge(r), (fxWhen(r) || fxWhen(m.sched)) ? h('span', null, fxWhen(r) || fxWhen(m.sched)) : null,
        r.ca || r.cb ? h('span', null, `بطاقات: ${r.ca} / ${r.cb}`) : null)
        : (fxWhen(m.sched) ? h('div', { class: 'tn-fxmeta tn-when' }, svg('calendar'), h('span', null, 'الموعد: ' + fxWhen(m.sched))) : null));
  }
  function numInput(name, label, value, o) {
    return h('input', Object.assign({
      type: 'number', name, min: '0', max: '999', step: '1', inputmode: 'numeric', 'aria-label': label, value: value === undefined || value === null ? '' : String(value), autocomplete: 'off'
    }, o || {}));
  }
  function readFx(form, m) {
    const g = n => form.elements[n].value.trim();
    const num = n => (g(n) === '' ? null : Number(g(n)));
    return { a: m.a, b: m.b, sa: num('sa'), sb: num('sb'), ca: num('ca') === null ? 0 : num('ca'), cb: num('cb') === null ? 0 : num('cb'),
      ra: num('ra') === null ? 0 : num('ra'), rb: num('rb') === null ? 0 : num('rb'),
      date: g('date') || (form.elements.pdate ? g('pdate') : ''), time: g('time') || (form.elements.ptime ? g('ptime') : '') };
  }
  function nextEmptyAfter(key) {
    const panel = els.panels.querySelector('.tn-panel:not([hidden])');
    if (!panel) return;
    const forms = Array.from(panel.querySelectorAll('form.tn-fx'));
    const i = forms.findIndex(f => f.dataset.key === key);
    const order = forms.slice(i + 1).concat(forms.slice(0, i + 1));
    const t = order.find(f => !f.classList.contains('is-played'));
    const target = t || forms[i];
    if (target) { const inp = target.elements.sa; if (inp) inp.focus(); }
  }
  function saveFx(form, m, moveOn) {
    const r = readFx(form, m);
    if (r.sa === null || r.sb === null) {
      say('اكتب نتيجة الفريقين.', true);
      (r.sa === null ? form.elements.sa : form.elements.sb).focus();
      return;
    }
    const ok = act(S => YT.setResult(S, r), `حُفظت النتيجة: ${nm(m.a)} ${r.sa} – ${r.sb} ${nm(m.b)}.`, { keep: 'fb:' + m.key });
    if (ok && moveOn) nextEmptyAfter(m.key);
  }
  function fxEdit(m, scope) {
    const r = m.res, key = m.key, A_ = nm(m.a), B_ = nm(m.b);
    const sa = numInput('sa', `أهداف ${A_} ضد ${B_}`, r && r.sa, { class: 'tn-sc', enterkeyhint: 'next', 'data-fk': 'sa:' + key });
    const sb = numInput('sb', `أهداف ${B_} ضد ${A_}`, r && r.sb, { class: 'tn-sc', enterkeyhint: 'done', 'data-fk': 'sb:' + key });
    const form = h('form', { class: 'tn-fx' + (r ? ' is-played' : ''), 'data-key': key, novalidate: true });
    const open = A.openKeys.has('fx:' + key);
    const moreBtn = h('button', { type: 'button', class: 'tn-btn ghost sm', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'tn-more-' + key.replace(/\W/g, '_'), 'data-fk': 'more:' + key,
      onclick: () => {
        const on = !A.openKeys.has('fx:' + key);
        if (on) A.openKeys.add('fx:' + key); else A.openKeys.delete('fx:' + key);
        moreBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
        panel.hidden = !on;
      } }, h('span', null, 'تفاصيل وقرار إداري'));
    const panel = h('div', { class: 'tn-more', id: 'tn-more-' + key.replace(/\W/g, '_'), hidden: !open });
    // date / time / cards
    panel.append(h('div', { class: 'tn-grid2' },
      h('label', { class: 'tn-lab' }, h('span', null, 'التاريخ (اختياري)'), h('input', { type: 'date', name: 'date', value: r ? r.date : '', 'data-fk': 'date:' + key })),
      h('label', { class: 'tn-lab' }, h('span', null, 'الوقت (اختياري)'), h('input', { type: 'time', name: 'time', value: r ? r.time : '', 'data-fk': 'time:' + key }))));
    panel.append(h('div', { class: 'tn-cards4' },
      h('span', { class: 'tn-lab-h' }, 'بطاقات'),
      h('label', { class: 'tn-lab' }, h('span', null, `بطاقات ${A_}`), numInput('ca', `بطاقات ${A_}`, r && r.ca ? r.ca : '', { 'data-fk': 'ca:' + key })),
      h('label', { class: 'tn-lab' }, h('span', null, `بطاقات ${B_}`), numInput('cb', `بطاقات ${B_}`, r && r.cb ? r.cb : '', { 'data-fk': 'cb:' + key })),
      h('label', { class: 'tn-lab' }, h('span', null, `حمراء ${A_}`), numInput('ra', `البطاقات الحمراء لـ ${A_}`, r && r.ra ? r.ra : '', { 'data-fk': 'ra:' + key })),
      h('label', { class: 'tn-lab' }, h('span', null, `حمراء ${B_}`), numInput('rb', `البطاقات الحمراء لـ ${B_}`, r && r.rb ? r.rb : '', { 'data-fk': 'rb:' + key }))));
    // forfeit
    const kindSel = h('select', { name: 'kind', 'aria-label': 'قرار إداري', 'data-fk': 'kind:' + key },
      h('option', { value: '' }, 'اختر القرار…'), Object.keys(KIND).map(k => h('option', { value: k }, KIND[k])));
    const sideSel = h('select', { name: 'fault', 'aria-label': 'الفريق المقصّر', 'data-fk': 'fault:' + key },
      h('option', { value: m.a }, 'المقصّر: ' + A_), h('option', { value: m.b }, 'المقصّر: ' + B_));
    const ruleP = h('p', { class: 'tn-rule', hidden: true });
    kindSel.addEventListener('change', () => {
      const rows = WF[kindSel.value];
      ruleP.hidden = !rows;
      ruleP.replaceChildren(...(rows ? rows.map(x => h('span', { class: 'tn-ruleln' }, h('b', null, x[0] + ': '), x[1])) : []));
    });
    panel.append(h('div', { class: 'tn-forfeit' }, h('span', { class: 'tn-lab-h' }, 'قرار إداري'), kindSel, sideSel,
      btn('طبّق القرار', { act: 'forfeit', on: () => {
        if (!kindSel.value) { say('اختر القرار الإداري أولًا.', true); kindSel.focus(); return; }
        const g = readFx(form, m);
        act(S => YT.adminResult(S, m.a, m.b, kindSel.value, sideSel.value, { date: g.date, time: g.time }),
          `طُبّق قرار إداري (${KIND[kindSel.value]}) على «${nm(sideSel.value)}».`, { keep: 'fb:' + key });
      } }), ruleP));
    if (r) panel.append(h('div', { class: 'tn-clear' }, btn('مسح النتيجة', { cls: 'danger sm', icon: 'trash', act: 'clear', on: () => act(S => YT.clearResult(S, m.a, m.b), 'مُسحت النتيجة.', { keep: 'fb:' + key }) })));
    // the fixture's planned date/time (before it is played): fb.sched via YT.setSchedule
    let plan = null;
    if (!r) {
      const pd = h('input', { type: 'date', name: 'pdate', value: m.sched ? m.sched.date : '', 'data-fk': 'pdate:' + key });
      const pt = h('input', { type: 'time', name: 'ptime', value: m.sched ? m.sched.time : '', 'data-fk': 'ptime:' + key });
      plan = h('div', { class: 'tn-plan' },
        h('label', { class: 'tn-lab' }, h('span', null, 'موعد المباراة'), pd),
        h('label', { class: 'tn-lab' }, h('span', null, 'الوقت'), pt),
        btn('حفظ الموعد', { cls: 'ghost sm', icon: 'calendar', act: 'save-when', on: () => act(S => YT.setSchedule(S, m.a, m.b, { date: pd.value.trim(), time: pt.value.trim() }),
          pd.value || pt.value ? `حُفظ موعد المباراة: ${nm(m.a)} ضد ${nm(m.b)}.` : 'أُزيل موعد المباراة.', { keep: 'fb:' + key }) }));
    }
    form.append(
      h('div', { class: 'tn-fxrow' }, h('span', { class: 'tn-fxt' }, A_), sa, h('span', { class: 'tn-x', 'aria-hidden': 'true' }, '–'), sb, h('span', { class: 'tn-fxt' }, B_)),
      plan,
      h('div', { class: 'tn-fxact' }, btn('حفظ', { cls: 'primary sm', act: 'save-fx', on: () => saveFx(form, m, false) }), moreBtn,
        r ? h('em', { class: 'tn-chip ok' }, svg('check'), 'محفوظة') : null, admBadge(r)),
      panel);
    form.addEventListener('submit', e => { e.preventDefault(); saveFx(form, m, true); });
    form.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const t = e.target;
      if (t === sa && sb.value === '' ) { sb.focus(); return; }
      if (t === sb && sa.value === '') { sa.focus(); return; }
      saveFx(form, m, true);
    });
    return h('li', { class: 'tn-fxli' }, form);
  }
  function roundsView(rounds, scope) {
    return rounds.map(rd => h('div', { class: 'tn-round' }, h('h5', null, 'الجولة ' + rd.round),
      h('ul', { class: 'tn-fxs-list' }, rd.matches.map(m => fxItem(m, scope)))));
  }

  function groupCard(g) {
    const sc = 'g' + g.index;
    const head = h('div', { class: 'tn-chead' }, h('h3', { id: 'tn-gh-' + g.index }, 'المجموعة ' + g.name), prog(g.played, g.total, 'مباريات المجموعة ' + g.name));
    return h('section', { class: 'tn-card tn-group', 'aria-labelledby': 'tn-gh-' + g.index, 'data-group': g.name },
      head,
      g.first ? h('p', { class: 'tn-q' }, svg('check'), 'المتأهل إلى التصفيات: ', h('b', null, nm(g.first))) : null,
      standings(g.table, 'ترتيب المجموعة ' + g.name, { qualified: g.first }),
      notesList(g.table),
      tiePanels(g.ties, sc, g.table, true),
      h('h4', { class: 'tn-sub' }, 'المباريات'),
      roundsView(g.rounds, sc));
  }
  function finalCard(fb) {
    if (!fb.final) {
      const why = fb.pending.map(p => {
        const g = fb.groups[+p.scope.slice(1)];
        return p.reason === 'tie' ? `المجموعة ${g.name}: تعادل على المركز الأول، يلزم حسمه.` : `المجموعة ${g.name}: بقي ${g.total - g.played} من ${g.total} مباريات.`;
      });
      return h('section', { class: 'tn-card tn-final is-wait', 'aria-labelledby': 'tn-final-h' }, h('h3', { id: 'tn-final-h' }, 'التصفيات'),
        h('p', null, 'لم تتحدد فرق التصفيات بعد. ' + ((W.fbLines && W.fbLines[2]) || '')),
        why.length ? h('ul', { class: 'tn-why' }, why.map(x => h('li', null, x))) : null);
    }
    const f = fb.final;
    const qOf = id => fb.groups.find(g => g.teams.indexOf(id) >= 0).name;
    return h('section', { class: 'tn-card tn-final', 'aria-labelledby': 'tn-final-h' },
      h('div', { class: 'tn-chead' }, h('h3', { id: 'tn-final-h' }, 'التصفيات'), prog(f.played, f.total, 'مباريات التصفيات')),
      h('p', { class: 'tn-fine' }, 'الفرق المتأهلة: ' + f.teams.map(id => `${nm(id)} (المجموعة ${qOf(id)})`).join('، ') + '.'),
      standings(f.table, 'ترتيب التصفيات', { podium: !!fb.podium }),
      notesList(f.table),
      tiePanels(f.ties, 'final', f.table, false),
      h('h4', { class: 'tn-sub' }, 'المباريات'),
      roundsView(f.rounds, 'final'),
      fb.podium ? [h('h4', { class: 'tn-sub' }, svg('trophy'), 'مراكز كرة القدم'), podium(fb.podium, 'مراكز كرة القدم')] : null);
  }
  function renderFootball(box) {
    const { fb } = view();
    box.append(h('div', { class: 'tn-head' }, h('h2', null, W.fbTitle || 'دوري كرة القدم'), prog(fb.played, fb.total, 'تقدّم مباريات كرة القدم')), how('football'));
    if (!fb.drawn) {
      box.append(h('div', { class: 'tn-card tn-empty' }, h('h3', null, 'لم تُجرَ قرعة المجموعات بعد'),
        h('p', null, A.S.teams.length === 12 ? 'تظهر المجموعات والمباريات بعد القرعة.' : `عدد الفرق ${A.S.teams.length} من 12؛ يلزم 12 فرقة لتقسيمها إلى 3 مجموعات.`),
        canEdit() ? btn('اذهب إلى الإعداد', { cls: 'primary', act: 'go-setup', on: () => setTab('setup') }) : null));
      return;
    }
    box.append(h('div', { class: 'tn-groups' }, fb.groups.map(groupCard)), finalCard(fb));
  }

  /* ------------------------------------------------------------------ chess */
  function chessMatch(m, stage, idx, onPick) {
    const editable = canEdit() && onPick;
    const side = id => {
      const win = m.w === id, lose = m.w && m.w !== id;
      const cls = 'tn-side' + (win ? ' is-win' : '') + (lose ? ' is-lose' : '');
      if (!editable) return h('span', { class: cls }, win ? svg('check') : null, nm(id));
      return h('button', { type: 'button', class: cls, 'aria-pressed': win ? 'true' : 'false', 'data-fk': `w:${stage}:${idx}:${id}`,
        onclick: () => onPick(win ? null : id) }, win ? svg('check') : null, h('span', null, nm(id)));
    };
    return h('li', { class: 'tn-cm' + (m.w ? ' is-done' : ''), role: 'group', 'aria-label': `مباراة ${nm(m.a)} ضد ${nm(m.b)}${m.w ? '، الفائز ' + nm(m.w) : ''}` },
      side(m.a), h('span', { class: 'tn-vs', 'aria-hidden': 'true' }, 'ضد'), side(m.b));
  }
  function pairsEditor(stage, pool, current) {
    const n = stage === 'r1' ? 6 : 3;
    const key = 'pairs:' + stage;
    const sels = [];
    const opts = id => h('option', { value: id }, nm(id));
    const rows = [];
    for (let i = 0; i < n; i++) {
      const mk = side => h('select', { 'aria-label': `المباراة ${i + 1}: الفريق ${side + 1}`, 'data-fk': `pair:${stage}:${i}:${side}` },
        h('option', { value: '' }, 'اختر فريقًا'), pool.map(opts));
      const a = mk(0), b = mk(1);
      if (current[i]) { a.value = current[i].a; b.value = current[i].b; }
      sels.push([a, b]);
      rows.push(h('div', { class: 'tn-pair' }, h('span', { class: 'tn-pn' }, String(i + 1)), a, h('span', { 'aria-hidden': 'true' }, 'ضد'), b));
    }
    const save = btn('احفظ الأزواج', { cls: 'primary', act: 'save-pairs-' + stage, on: () => {
      const pairs = sels.map(([a, b]) => ({ a: a.value, b: b.value }));
      if (pairs.some(p => !p.a || !p.b)) { say('اختر فريقين لكل مباراة.', true); return; }
      act(S => YT.setChessPairs(S, stage, pairs), 'حُفظت الأزواج.', { lost: stage === 'r1' ? false : undefined });
    } });
    const d = h('details', { class: 'tn-manual', open: A.openKeys.has(key) }, h('summary', null, 'ضبط الأزواج يدويًا'), rows, save);
    d.addEventListener('toggle', () => { if (d.open) A.openKeys.add(key); else A.openKeys.delete(key); });
    return d;
  }
  function drawBtn(stage, ids, hasWinners) {
    return btn(stage === 'r1' ? 'قرعة الأزواج' : 'قرعة أزواج الجولة 2', { icon: 'shuffle', cls: 'primary', act: 'draw-' + stage, on: async () => {
      if (hasWinners && !(await ask('سحب جديد يلغي النتائج المرتبطة بالأزواج الحالية. هل تتابع؟', 'اسحب من جديد', true))) return;
      let pairs;
      try { pairs = YT.drawPairs(ids); } catch (e) { say(errMsg(e), true); return; }
      act(S => YT.setChessPairs(S, stage, pairs), stage === 'r1' ? 'أُجريت قرعة الجولة 1.' : 'أُجريت قرعة الجولة 2.', { lost: false });
    } });
  }
  function colHead(title, p, t, id) { return h('div', { class: 'tn-chead' }, h('h3', { id }, title), t ? prog(p, t, 'تقدّم ' + title) : null); }

  function renderChess(box) {
    const { ch } = view();
    box.append(h('div', { class: 'tn-head' }, h('h2', null, W.chTitle || 'بطولة الشطرنج'), prog(ch.played, ch.total, 'تقدّم مباريات الشطرنج')), how('chess'));
    if (A.S.teams.length !== 12) { box.append(notFor12()); return; }
    const ids = A.S.teams.map(t => t.id);
    const cols = [];
    // round 1
    const c1 = [colHead('الجولة 1', ch.r1.played, 6, 'tn-c1')];
    if (!ch.r1.matches.length) {
      c1.push(h('p', { class: 'tn-fine' }, 'لم تُسحب الأزواج بعد. تُسحب 6 مباريات بين الفرق الاثنتي عشرة.'));
      if (canEdit()) c1.push(h('div', { class: 'tn-tiectl' }, drawBtn('r1', ids, false)), pairsEditor('r1', ids, []));
    } else {
      c1.push(h('ul', { class: 'tn-cms' }, ch.r1.matches.map(m => chessMatch(m, 'r1', m.index, id => act(S => YT.setChessWinner(S, 'r1', m.index, id), id ? `فاز «${nm(id)}» في الجولة 1.` : 'أُلغيت نتيجة المباراة.', { keep: 'c1:' + m.index })))));
      if (canEdit()) c1.push(h('p', { class: 'tn-fine' }, 'اضغط اسم الفائز. اضغطه مرة أخرى لإلغاء النتيجة.'),
        h('div', { class: 'tn-tiectl' }, drawBtn('r1', ids, ch.r1.winners.length > 0)), pairsEditor('r1', ids, ch.r1.matches));
    }
    cols.push(h('section', { class: 'tn-card tn-col', 'aria-labelledby': 'tn-c1', 'data-round': 'r1' }, c1));
    // round 2
    const c2 = [colHead('الجولة 2', ch.r2.played, 3, 'tn-c2')];
    if (!ch.r1.complete) c2.push(h('p', { class: 'tn-fine' }, `تُحدَّد أزواجها بعد انتهاء الجولة 1 (${ch.r1.played} من 6).`));
    else if (!ch.r2.matches.length) {
      c2.push(h('p', null, 'الفائزون الستة: ' + ch.r2.pool.map(nm).join('، ') + '.'));
      if (canEdit()) c2.push(h('div', { class: 'tn-tiectl' }, drawBtn('r2', ch.r2.pool, false)), pairsEditor('r2', ch.r2.pool, []));
      else c2.push(h('p', { class: 'tn-fine' }, 'لم تُسحب أزواج الجولة 2 بعد.'));
    } else {
      c2.push(h('ul', { class: 'tn-cms' }, ch.r2.matches.map(m => chessMatch(m, 'r2', m.index, id => act(S => YT.setChessWinner(S, 'r2', m.index, id), id ? `فاز «${nm(id)}» في الجولة 2.` : 'أُلغيت نتيجة المباراة.', { keep: 'c2:' + m.index })))));
      if (canEdit()) c2.push(h('div', { class: 'tn-tiectl' }, drawBtn('r2', ch.r2.pool, ch.r2.winners.length > 0)), pairsEditor('r2', ch.r2.pool, ch.r2.matches));
    }
    cols.push(h('section', { class: 'tn-card tn-col', 'aria-labelledby': 'tn-c2', 'data-round': 'r2' }, c2));
    // round 3: round robin of the three
    const c3 = [colHead('الجولة 3: دوري الثلاثة', ch.rr.played, 3, 'tn-c3')];
    if (!ch.r2.complete) c3.push(h('p', { class: 'tn-fine' }, `تبدأ بعد انتهاء الجولة 2 (${ch.r2.played} من 3).`));
    else {
      c3.push(h('div', { class: 'tn-scroll', tabindex: '0', role: 'region', 'aria-label': 'ترتيب دوري الثلاثة' },
        h('table', { class: 'tn-tbl' }, h('caption', { class: 'sr-only' }, 'ترتيب دوري الثلاثة'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'الفريق'), h('th', { scope: 'col' }, 'لعب'), h('th', { scope: 'col' }, 'فوز'), h('th', { scope: 'col' }, 'خسارة'))),
          h('tbody', null, ch.rr.table.map(r => h('tr', { class: r.flag ? 'is-tie' : '' }, h('td', { class: 'tn-rk' }, String(r.rank)),
            h('th', { scope: 'row', class: 'tn-tn' }, h('span', null, nm(r.id)), r.flag ? h('em', { class: 'tn-chip warn' }, 'تعادل') : null),
            h('td', null, String(r.p)), h('td', null, String(r.w)), h('td', null, String(r.l))))))));
      c3.push(h('ul', { class: 'tn-cms' }, ch.rr.matches.map(m => chessMatch({ a: m.a, b: m.b, w: m.w }, 'rr', m.key, id => act(S => YT.setChessRR(S, m.a, m.b, id), id ? `فاز «${nm(id)}» في دوري الثلاثة.` : 'أُلغيت نتيجة المباراة.', { keep: 'rr:' + m.key })))));
      if (canEdit()) c3.push(h('p', { class: 'tn-fine' }, 'اضغط اسم الفائز. اضغطه مرة أخرى لإلغاء النتيجة.'));
      const tie = ch.rr.ties[0];
      if (tie) {
        const names = tie.ids.map(nm).join('، ');
        const kids = [h('h4', null, tie.decided ? 'ترتيب اللجنة: ' + tie.ids.map(nm).join(' ثم ') : 'تعادل 1–1–1 يحتاج ترتيب اللجنة'),
          tie.decided ? null : h('p', null, `لكل من ${names} فوز واحد وخسارة واحدة. ` + (W.committee || ''))];
        if (canEdit()) {
          const sels = tie.ids.map((id, i) => h('label', { class: 'tn-ordsel' }, h('span', null, 'المركز ' + (i + 1)),
            h('select', { 'aria-label': 'من يأخذ المركز ' + (i + 1) + ' في دوري الثلاثة', 'data-fk': 'rrord:' + i }, tie.ids.map(x => h('option', { value: x, selected: x === id }, nm(x))))));
          kids.push(h('div', { class: 'tn-ordrow' }, sels, btn('احفظ الترتيب', { cls: 'primary', act: 'save-rr-order', on: () => {
            const order = sels.map(l => l.querySelector('select').value);
            act(S => YT.setChessOrder(S, order), 'حُفظ ترتيب اللجنة لدوري الثلاثة.', { lost: false });
          } })));
        }
        c3.push(h('div', { class: 'tn-tie' + (tie.decided ? ' is-done' : ''), 'data-scope': 'rr' }, kids));
      }
    }
    cols.push(h('section', { class: 'tn-card tn-col', 'aria-labelledby': 'tn-c3', 'data-round': 'rr' }, c3));
    // final
    const c4 = [colHead('النهائي', ch.final && ch.final.w ? 1 : 0, 1, 'tn-c4')];
    if (!ch.final) c4.push(h('p', { class: 'tn-fine' }, 'يلعبه الأول والثاني من دوري الثلاثة، بعد حسم ترتيبهما.'));
    else {
      c4.push(h('ul', { class: 'tn-cms' }, chessMatch(ch.final, 'final', 0, id => act(S => YT.setChessFinal(S, id), id ? `فاز «${nm(id)}» في النهائي.` : 'أُلغيت نتيجة النهائي.', { keep: 'cf' }))));
      if (canEdit()) c4.push(h('p', { class: 'tn-fine' }, 'اضغط اسم الفائز. اضغطه مرة أخرى لإلغاء النتيجة.'));
    }
    cols.push(h('section', { class: 'tn-card tn-col', 'aria-labelledby': 'tn-c4', 'data-round': 'final' }, c4));
    box.append(h('div', { class: 'tn-bracket' }, cols));
    if (ch.podium) box.append(h('section', { class: 'tn-card tn-podcard', 'aria-labelledby': 'tn-chpod' }, h('h3', { id: 'tn-chpod' }, svg('trophy'), 'مراكز الشطرنج'), podium(ch.podium, 'مراكز الشطرنج')));
  }

  /* ------------------------------------------------------------------ my team */
  function renderMyTeam(box) {
    const teams = A.S.teams;
    box.append(h('div', { class: 'tn-head' }, h('h2', null, 'فريقي')));
    if (!teams.length) { box.append(notFor12()); return; }
    if (!A.myTeam || !teams.some(t => t.id === A.myTeam)) A.myTeam = teams.some(t => t.id === A.myIds[0]) ? A.myIds[0] : '';
    const sel = h('select', { id: 'tn-team-sel', 'data-fk': 'team-sel', onchange: e => { A.myTeam = e.target.value; lsSet(LS_TEAM, A.myTeam); render(true); } },
      h('option', { value: '' }, 'اختر فريقك…'), teams.map(t => h('option', { value: t.id, selected: t.id === A.myTeam }, t.name)));
    const mineElsewhere = A.session && !A.isAdmin && A.myIds.length && !A.myIds.some(id => teams.some(t => t.id === id));
    box.append(h('div', { class: 'tn-card' }, h('label', { class: 'tn-lab', for: 'tn-team-sel' }, h('span', null, 'الفريق')), sel,
      mineElsewhere ? h('p', { class: 'tn-fine' }, 'فريقك لم يُضَف إلى البطولة بعد.') : null));
    if (!A.myTeam) { box.append(h('p', { class: 'tn-fine' }, 'اختر فريقًا لترى مجموعته ومبارياته ونتائجه.')); return; }
    let tv;
    try { tv = YT.teamView(A.S, A.myTeam); } catch (e) { box.append(h('p', { class: 'tn-fine', role: 'alert' }, errMsg(e))); return; }
    const status = [];
    status.push(h('li', null, h('b', null, 'كرة القدم: '), FB_STATUS[tv.status] || ''));
    const warn = YT.warnings ? YT.warnings(A.S, A.myTeam) : 0;   // lg2: «إنذار أول بالخروج من المسابقة»
    if (warn) status.push(h('li', { class: 'tn-warnline' }, h('em', { class: 'tn-chip ' + (warn > 1 ? 'bad' : 'warn') }, warn > 1 ? `${warn} قرارات غياب/انسحاب` : 'إنذار أول'),
      ' ', warn > 1 && WF.repeat ? `${WF.repeat[0][0]}: ${WF.repeat[0][1]}` : 'إنذار أول بالخروج من المسابقة (اللائحة: ثانيًا).'));
    if (tv.groupName) status.push(h('li', null, `المجموعة ${tv.groupName}` + (tv.position ? ` · المركز ${tv.position} من 4` : '')));
    const cs = tv.chess;
    status.push(h('li', null, h('b', null, 'الشطرنج: '), (CH_STATUS[cs.stage] || '') + (cs.stage === 'out' && cs.outAt ? ' (في ' + ROUND_TXT[cs.outAt] + ')' : '')));
    box.append(h('section', { class: 'tn-card tn-mine', 'aria-labelledby': 'tn-mine-h' }, h('h3', { id: 'tn-mine-h' }, tv.name),
      h('ul', { class: 'tn-status' }, status),
      tv.podium ? podium([tv.id], 'مركز الفريق') : null,
      tv.row ? h('ul', { class: 'tn-stats', 'aria-label': 'إحصاءات الفريق في المجموعة' }, [['لعب', tv.row.p], ['فاز', tv.row.w], ['تعادل', tv.row.d], ['خسر', tv.row.l], ['له', tv.row.gf], ['عليه', tv.row.ga], ['نقاط', tv.row.pts]].map(x => h('li', null, h('b', null, String(x[1])), h('span', null, x[0])))) : null));
    if (tv.matches.length) {
      box.append(h('section', { class: 'tn-card', 'aria-labelledby': 'tn-mm-h' }, h('h3', { id: 'tn-mm-h' }, 'مباريات كرة القدم'),
        tv.next ? h('p', { class: 'tn-q' }, svg('check'), 'المباراة التالية: ', h('b', null, `${tv.next.stage === 'final' ? 'التصفيات' : 'المجموعات'} · الجولة ${tv.next.round} ضد ${nm(tv.next.opponent)}`)) : null,
        h('ul', { class: 'tn-mm' }, tv.matches.map(m => h('li', { class: m.played ? 'o-' + m.result.outcome : '' },
          h('span', { class: 'tn-mt' }, `${m.stage === 'final' ? 'التصفيات' : 'المجموعات'} · الجولة ${m.round}`),
          h('b', null, 'ضد ' + nm(m.opponent)),
          m.played ? h('span', { class: 'tn-res' }, h('em', { class: 'tn-chip ' + (m.result.outcome === 'W' ? 'ok' : m.result.outcome === 'L' ? 'bad' : '') }, OUT[m.result.outcome]),
            h('bdi', { dir: 'rtl' }, `${m.result.gf} – ${m.result.ga}`), m.result.adm ? h('em', { class: 'tn-chip warn' }, 'قرار إداري') : null)
            : h('span', { class: 'tn-res idle' }, 'لم تُلعب بعد'),
          fxWhen(m) ? h('span', { class: 'tn-mwhen' }, fxWhen(m)) : null,
          fxWhen(m) ? h('span', { class: 'tn-fine' }, fxWhen(m)) : null)))));
    }
    if (cs.matches.length) {
      box.append(h('section', { class: 'tn-card', 'aria-labelledby': 'tn-cm-h' }, h('h3', { id: 'tn-cm-h' }, 'مباريات الشطرنج'),
        h('ul', { class: 'tn-mm' }, cs.matches.map(m => h('li', null, h('span', { class: 'tn-mt' }, ROUND_TXT[m.round]), h('b', null, 'ضد ' + nm(m.opponent)),
          m.won === null ? h('span', { class: 'tn-res idle' }, 'لم تُلعب بعد') : h('em', { class: 'tn-chip ' + (m.won ? 'ok' : 'bad') }, m.won ? 'فوز' : 'خسارة'))))));
    }
  }

  /* ------------------------------------------------------------------ setup (manager / local) */
  function hasProgress() {
    return !!(A.S.groups || Object.keys(A.S.fb.res).length || A.S.chess.r1.length);
  }
  async function guard(text, ok) {
    if (!hasProgress()) return true;
    return ask(text, ok || 'متابعة', true);
  }
  function teamsCard() {
    const n = A.S.teams.length;
    const list = h('ul', { class: 'tn-tlist' }, A.S.teams.map((t, i) => {
      const inp = h('input', { type: 'text', value: t.name, maxlength: '60', 'aria-label': 'اسم الفريق ' + (i + 1), 'data-fk': 'tname:' + t.id, autocomplete: 'off' });
      const commit = refocus => {
        const v = inp.value.trim();
        if (v === t.name) return;
        act(S => YT.setTeams(S, teamsList().map(x => (x.id === t.id ? { id: x.id, name: v } : x))), 'غُيّر اسم الفريق.', { lost: false });
        if (refocus) { const again = els.panels.querySelector('[data-fk="tname:' + t.id + '"]'); if (again) again.focus(); }
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(true); } });
      inp.addEventListener('change', () => commit(false));
      return h('li', null, h('span', { class: 'tn-pn' }, String(i + 1)), inp,
        btn('', { cls: 'icon danger', icon: 'trash', aria: 'احذف الفريق ' + t.name, act: 'remove-team', on: async () => {
          if (!(await guard('حذف فريق يلغي القرعة والنتائج الحالية. هل تتابع؟', 'احذف الفريق'))) return;
          act(S => YT.setTeams(S, teamsList().filter(x => x.id !== t.id)), 'حُذف الفريق.', { lost: false });
        } }));
    }));
    const addInp = h('input', { type: 'text', maxlength: '60', 'aria-label': 'اسم فريق جديد', placeholder: 'اسم فريق جديد', 'data-fk': 'add-team', autocomplete: 'off', disabled: n >= 12 });
    const addForm = h('form', { class: 'tn-add', onsubmit: async e => {
      e.preventDefault();
      const v = addInp.value.trim();
      if (!v) { say(ERR.bad_team, true); addInp.focus(); return; }
      if (hasProgress() && !(await guard('إضافة فريق جديدة تلغي القرعة والنتائج الحالية. هل تتابع؟', 'أضف الفريق'))) return;
      if (act(S => YT.setTeams(S, teamsList().concat([{ id: uid(), name: v }])), 'أُضيف الفريق.', { lost: false })) {
        const again = els.panels.querySelector('[data-fk="add-team"]'); if (again) again.focus();
      }
    } }, addInp, btn('أضف', { cls: 'primary', icon: 'plus', act: 'add-team', disabled: n >= 12, on: () => addForm.requestSubmit() }));
    const kids = [h('p', { class: 'tn-fine' }, `عدد الفرق: ${n} من 12.`), n ? list : h('p', { class: 'tn-fine' }, 'لا توجد فرق بعد.'), addForm];
    const tools = [];
    if (A.mode === 'local') {
      tools.push(btn('تعبئة فرق تجريبية', { icon: 'users', act: 'demo', on: async () => {
        if (A.S.teams.length && !(await ask('ستحل الفرق التجريبية محل الفرق والنتائج الحالية على هذا الجهاز. هل تتابع؟', 'استبدل', true))) return;
        act(() => YT.setTeams(YT.emptyState(), Array.from({ length: 12 }, (_, i) => ({ id: 't' + (i + 1), name: 'الفريق ' + (i + 1) }))), 'أُضيفت 12 فرقة تجريبية.', { lost: false });
      } }));
    }
    if (A.mode === 'manager') {
      tools.push(btn('استيراد الفرق المعتمدة', { icon: 'download', act: 'import-approved', on: loadApproved }));
    }
    if (tools.length) kids.push(h('div', { class: 'tn-tiectl' }, tools));
    if (A.mode === 'local') kids.push(h('p', { class: 'tn-fine' }, 'الفرق التجريبية أسماؤها للتجربة فقط، وتبقى على هذا الجهاز.'));
    if (A.mode === 'manager') kids.push(approvedBox());
    return card('الفرق', kids, 'tn-setup', 'tn-s-teams');
  }
  async function loadApproved() {
    A.approved = { loading: true }; render(true);
    try {
      const rows = await YB.q('teams', { select: 'id,name,area', filter: { status: 'eq.approved' }, order: 'name.asc' });
      const list = Array.isArray(rows) ? rows : [];
      A.approved = { rows: list };
      A.checked = new Set(list.slice(0, 12).map(r => r.id));
    } catch (e) { A.approved = { error: YB.errorText(e) }; }
    render(true);
  }
  function approvedBox() {
    const a = A.approved;
    if (!a) return null;
    if (a.loading) return h('p', { class: 'tn-fine', role: 'status' }, 'جارٍ تحميل الفرق المعتمدة…');
    if (a.error) return h('p', { class: 'tn-fine', role: 'alert' }, a.error);
    if (!a.rows.length) return h('p', { class: 'tn-fine' }, 'لا توجد فرق معتمدة بعد.');
    const count = () => A.checked.size;
    const useBtn = btn('استخدم الفرق المحددة', { cls: 'primary', act: 'use-approved', disabled: !count(), on: async () => {
      const chosen = a.rows.filter(r => A.checked.has(r.id)).map(r => ({ id: r.id, name: r.name }));
      if (!chosen.length) return;
      const same = canon(chosen.map(x => x.id)) === canon(A.S.teams.map(x => x.id));
      if (!same && !(await guard('تغيير قائمة الفرق يلغي القرعة والنتائج الحالية. هل تتابع؟', 'غيّر القائمة'))) return;
      if (act(S => YT.setTeams(S, chosen), `استُوردت ${chosen.length} فرق معتمدة.`, { lost: false })) { A.approved = null; render(true); }
    } });
    return h('div', { class: 'tn-approved' },
      h('p', { class: 'tn-fine' }, `الفرق المعتمدة: ${a.rows.length}. الحد الأقصى للبطولة 12 فريقًا.`),
      h('ul', { class: 'tn-checks' }, a.rows.map(r => h('li', null, h('label', null,
        h('input', { type: 'checkbox', value: r.id, checked: A.checked.has(r.id), 'data-fk': 'ap:' + r.id, onchange: e => {
          if (e.target.checked) { if (A.checked.size >= 12) { e.target.checked = false; say('الحد الأقصى 12 فريقًا.', true); return; } A.checked.add(r.id); } else A.checked.delete(r.id);
          useBtn.disabled = !A.checked.size;
        } }), h('span', null, r.name), r.area ? h('small', null, r.area) : null)))),
      useBtn);
  }
  function groupsCard() {
    const n = A.S.teams.length, g = A.S.groups;
    const kids = [];
    if (n !== 12) kids.push(h('p', { class: 'tn-fine' }, `يلزم 12 فريقًا لقرعة المجموعات (الآن ${n}).`));
    kids.push(h('div', { class: 'tn-tiectl' }, btn(g ? 'قرعة جديدة للمجموعات' : 'قرعة المجموعات', { icon: 'shuffle', cls: 'primary', disabled: n !== 12, act: 'draw-groups', on: async () => {
      if (!(await guard('قرعة جديدة تلغي المجموعات والنتائج الحالية. هل تتابع؟', 'اقرع من جديد'))) return;
      act(S => YT.drawGroups(S), 'أُجريت قرعة المجموعات.', { lost: false });
    } })));
    if (g) {
      const sizes = g.map(x => x.length).join(' / ');
      kids.push(h('p', { class: 'tn-fine', 'data-groups-ok': YT.groupsValid(A.S) ? '1' : '0' }, `توزيع الفرق: ${sizes} ${YT.groupsValid(A.S) ? '· صحيح' : '· غير صحيح'}. نقل فريق إلى مجموعة يعيد فريقًا من تلك المجموعة ليبقى في كل مجموعة 4 فرق.`));
      kids.push(h('div', { class: 'tn-gcols' }, g.map((ids, gi) => h('div', { class: 'tn-gcol' }, h('h4', null, 'المجموعة ' + GN[gi]),
        h('ul', null, ids.map(id => h('li', null, h('span', null, nm(id)),
          h('select', { 'aria-label': 'انقل ' + nm(id) + ' إلى مجموعة', 'data-fk': 'mv:' + id, onchange: async e => {
            const to = +e.target.value;
            if (to === gi) return;
            const back = A.S.groups[to][A.S.groups[to].length - 1];
            if (Object.keys(A.S.fb.res).length && !(await ask('نقل فريق يلغي نتائجه الحالية. هل تتابع؟', 'انقل الفريق', true))) { e.target.value = String(gi); return; }
            act(S => YT.moveTeam(S, id, to), `نُقل «${nm(id)}» إلى المجموعة ${GN[to]} وعاد «${nm(back)}» إلى المجموعة ${GN[gi]}.`, { lost: undefined });
          } }, GN.map((nme, k) => h('option', { value: String(k), selected: k === gi }, 'المجموعة ' + nme))))))))));
    }
    return card('المجموعات', kids, 'tn-setup', 'tn-s-groups');
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 1024 * 1024) { say('الملف كبير أكثر من اللازم.', true); return; }
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (e) { say('الملف ليس JSON صالحًا.', true); return; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.v !== YT.VERSION) { say('هذا الملف ليس ملف بطولة من هذه اللوحة.', true); return; }
    let problems = [];
    try { problems = YT.validate(obj); } catch (e) { problems = ['bad_state']; }
    if (A.S.teams.length && !(await ask('سيحل الملف محل بيانات البطولة الحالية. هل تتابع؟', 'استورد الملف', true))) return;
    act(() => YT.normalize(obj), 'تم استيراد الملف.' + (problems.length ? ' نُظّفت بعض البيانات غير المتسقة.' : ''), { lost: false });
  }
  function shareCard() {
    const kids = [];
    if (A.mode === 'manager') {
      kids.push(h('p', { class: 'tn-fine' }, A.dirty ? 'لديك تغييرات غير منشورة. لا يراها الجمهور قبل أن تنشرها.' : (A.base ? 'كل التغييرات منشورة.' : 'لم يُنشر شيء بعد.')));
      kids.push(h('div', { class: 'tn-tiectl' },
        btn('نشر للجميع', { cls: 'primary', icon: 'cloud', act: 'publish2', disabled: A.busy || !A.dirty, on: () => publish() }),
        btn('انسخ رابط المتابعة', { icon: 'link', act: 'copy-page', on: () => copyText(location.href.split('#')[0]) })));
    }
    if (A.mode === 'local') {
      kids.push(h('div', { class: 'tn-tiectl' }, btn('رابط المشاركة', { icon: 'link', act: 'share2', on: toggleShare })));
    }
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'tn-file', 'aria-label': 'ملف JSON للاستيراد', onchange: e => { importFile(e.target.files[0]); e.target.value = ''; } });
    kids.push(h('div', { class: 'tn-tiectl' },
      btn('صدّر ملف JSON', { icon: 'download', act: 'export', on: () => { download('tournament.json', JSON.stringify(A.S, null, 1), 'application/json'); say('صُدّر ملف البطولة.'); } }),
      btn('استورد ملف JSON', { icon: 'upload', act: 'import', on: () => file.click() }), file));
    return card(A.mode === 'manager' ? 'النشر والملفات' : 'المشاركة والملفات', kids, 'tn-setup', 'tn-s-share');
  }
  function resetCard() {
    return card('تصفير', [
      h('p', { class: 'tn-fine' }, 'يمكنك التراجع بعد التصفير بزر «تراجع» في أعلى الصفحة.'),
      h('div', { class: 'tn-tiectl' },
        btn('تصفير القرعة والنتائج (إبقاء الفرق)', { cls: 'danger', act: 'reset-results', disabled: !hasProgress(), on: async () => {
          if (!(await ask('ستُمسح المجموعات والنتائج وأزواج الشطرنج، وتبقى الفرق. هل تتابع؟', 'صفّر', true))) return;
          act(S => YT.setTeams(YT.emptyState(), teamsList()), 'صُفّرت القرعة والنتائج.', { lost: false });
        } }),
        btn('مسح كل شيء', { cls: 'danger', icon: 'trash', act: 'reset-all', disabled: !A.S.teams.length, on: async () => {
          if (!(await ask('ستُمسح الفرق والمجموعات والنتائج كلها. هل تتابع؟', 'امسح كل شيء', true))) return;
          act(() => YT.emptyState(), 'مُسح كل شيء.', { lost: false });
        } }))
    ], 'tn-setup', 'tn-s-reset');
  }
  function renderSetup(box) {
    box.append(h('div', { class: 'tn-head' }, h('h2', null, 'الإعداد')),
      A.mode === 'local' ? h('p', { class: 'tn-fine' }, 'وضع محلي: كل ما تفعله هنا يُحفظ على هذا الجهاز فقط، ولا يراه أحد غيرك.') : null,
      teamsCard(), groupsCard(), shareCard(), resetCard());
  }

  /* ------------------------------------------------------------------ start */
  buildShell();
  render();
  boot();
  window.addEventListener('hashchange', () => {
    const hs = parseHash();
    if (hs.v !== A.shareV && (hs.v || A.mode === 'share')) { boot(); return; }
    if (hs.tab && hs.tab !== A.tab) setTab(hs.tab, { noWrite: true });
  });
  if (YB.onAuth) {
    let t = 0;
    YB.onAuth(() => { clearTimeout(t); t = setTimeout(() => { if (A.mode !== 'share' && !A.forcedLocal && YB.configured) boot(); }, 50); });
  }
  window.__yanabeeTournament = { mode: () => A.mode, state: () => A.S };
})();
