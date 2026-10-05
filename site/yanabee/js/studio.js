// «ستوديو الفريق» — playable prototype of the Yanabee app (lab.html, panel #panel-studio).
// Classic script, no libraries, no network. Data (team names, 'طبيعة العمل', bodies, rules, KPI texts and
// targets) is embedded by tools/yanabee/lab_studio.py as <script type="application/json" id="studio-data">;
// every sentence from the documents arrives as ready, verbatim HTML. The simulation layer (steps, points,
// rivals, survey, microcopy) is marked «تجريبي». Files / voice stay in the browser (object URLs only).
(() => {
  'use strict';
  const root = document.getElementById('studio');
  const dataEl = document.getElementById('studio-data');
  if (!root || !dataEl) return;
  let D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }

  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'yanabee-studio-v1';
  const WEEKS = D.weeks, MONTH = D.month;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, c = 'i') => `<svg class="${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${D.icons[n] || ''}</svg>`;
  const fun = () => window.YanabeeFun || null;
  const sleep = ms => new Promise(r => setTimeout(r, reduced() ? 0 : ms));

  /* ------------------------------------------------------------------ state ------------------------------------------------------------------ */
  const fresh = () => ({
    v: 1, step: 'found', sub: 0, edit: false, crisis: false, week: 1, ended: false, famSel: 0,
    team: { id: null, name: '', size: 5, members: [], roles: { leader: 0, quality: 1, media: 2 }, crest: { shape: 0, pat: 0, col: 0, em: 0 }, launched: false, rot: 0 },
    weeks: {}, wallet: { custody: 500, seq: 0, ledger: [] }, feed: [], awards: { shield: [], mshield: [], medal: [] }, ranks: {}, certDone: false,
  });
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } },
    del() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } },
  };
  function load() {
    try {
      const j = JSON.parse(store.get());
      if (j && j.v === 1 && j.team && (!j.team.id || D.teams.some(t => t.id === j.team.id))) {
        const f = fresh();
        const s = Object.assign(f, j);
        s.team = Object.assign(f.team, j.team);
        s.team.roles = Object.assign({ leader: 0, quality: 1, media: 2 }, j.team.roles);
        s.team.crest = Object.assign({ shape: 0, pat: 0, col: 0, em: 0 }, j.team.crest);
        s.wallet = Object.assign({ custody: 500, seq: 0, ledger: [] }, j.wallet);
        s.awards = Object.assign({ shield: [], mshield: [], medal: [] }, j.awards);
        return s;
      }
    } catch (e) { /* corrupt storage */ }
    return fresh();
  }
  let S = load();
  const save = () => store.set(JSON.stringify(S));

  // session-only memory (never persisted): local object URLs, drafts, animation flags
  const blobURL = {}, voiceURL = {};
  let demoK = 0, wheelTurns = null, flipFx = false, coinFx = false, checking = null, lastVault = '', survDraft = {}, wDraft = { purpose: 0, amt: 60 }, shake = '';
  let confirmReset = 0;

  /* ----------------------------------------------------------------- selectors ----------------------------------------------------------------- */
  const T = () => D.teams.find(x => x.id === S.team.id) || null;
  const N = () => S.team.size;
  const chalOf = id => { const t = T(); return t ? t.chal.find(c => c.id === id) || null : null; };
  const wk = w => (S.weeks[w] || (S.weeks[w] = { ch: null, steps: [0, 0, 0], proof: null, present: {}, init: false, buddy: null, rep: {}, sur: {} }));
  const cnt = o => Object.keys(o).filter(k => o[k]).length;
  const monthOf = w => Math.ceil(w / MONTH);
  const mname = i => (S.team.members[i] || '').trim() || `عضو ${i + 1}`;
  const initial = s => [...String(s).trim()][0] || '؟';
  const tname = () => (S.team.name || '').trim() || 'فريقك الجديد';
  const leaderIdx = () => (S.team.roles.leader + S.team.rot) % N();
  const rotDue = () => monthOf(S.week) - 1;
  const done3 = w => wk(w).steps.reduce((a, b) => a + b, 0);
  const isDone = w => { const k = wk(w); return !!(k.ch && done3(w) === 3 && k.proof); };
  function pts(w) {
    const k = wk(w), c = k.ch && chalOf(k.ch);
    const exec = c ? Math.round(c.pts * done3(w) / 3) : 0;
    const proof = k.proof ? 20 : 0;
    const commit = Math.round(20 * cnt(k.present) / N());
    const init = k.init ? 25 : 0;
    return { exec, proof, commit, init, total: exec + proof + commit + init, max: c ? c.pts : 40 };
  }
  const cum = w => { let s = 0; for (let i = 1; i <= w; i++) s += pts(i).total; return s; };
  const rv = (i, w) => 52 + ((i * 37 + w * 53 + i * w * 17) % 40) + (i % 3 === 0 ? 4 : 0);   // simulated rivals: deterministic
  function league(w) {
    const rows = D.rivals.map((nm, i) => {
      let tot = 0; for (let x = 1; x <= w; x++) tot += rv(i, x);
      return { id: 'r' + i, name: nm, wk: rv(i, w), total: tot, c: (i % 7) + 1 };
    });
    rows.push({ id: 'me', me: true, name: tname(), wk: pts(w).total, total: cum(w), c: S.team.id ? +S.team.id.slice(1) : 1 });
    rows.sort((a, b) => b.total - a.total || (a.me ? 1 : b.me ? -1 : 0));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  const myRank = w => league(w || S.week).find(r => r.me).rank;
  const weeklyTop = w => { const rs = league(w); const me = rs.find(r => r.me); return rs.every(r => r.me || r.wk < me.wk) && me.wk > 0; };
  function streak() {
    let s = 0;
    for (let w = S.week; w >= 1; w--) {
      if (isDone(w)) s++;
      else if (w === S.week && !S.ended) continue;
      else break;
    }
    return s;
  }
  function certProg() {
    const c = [
      { k: 'أتمّ الفريق شهراً كاملاً من التحديات', ok: S.week > MONTH || S.ended },
      { k: 'نفّذ مبادرة مجتمعية واحدة على الأقل', ok: Array.from({ length: S.week }, (_, i) => wk(i + 1).init).some(Boolean) },
      { k: 'أنجز تحدي الأسبوع في ثلاثة أسابيع', ok: Array.from({ length: S.week }, (_, i) => isDone(i + 1)).filter(Boolean).length >= 3 },
    ];
    return { items: c, n: c.filter(x => x.ok).length };
  }
  function kpiVals() {
    const ws = Array.from({ length: S.week }, (_, i) => i + 1), n = N();
    const avg = fn => Math.round(ws.reduce((a, w) => a + fn(w), 0) / ws.length * 100);
    const mWeeks = ws.filter(w => monthOf(w) === monthOf(S.week));
    const due = rotDue();
    const buddies = ws.filter(w => wk(w).buddy).length;
    return {
      2: avg(w => cnt(wk(w).rep) / n), 3: avg(w => cnt(wk(w).sur) / n), 5: avg(w => cnt(wk(w).present) / n),
      4: mWeeks.filter(w => wk(w).init).length, 6: due === 0 ? 100 : Math.round(Math.min(S.team.rot, due) / due * 100),
      8: Math.min(100, buddies * 10),
    };
  }
  const famMeter = () => {
    let sum = 0, c = 0;
    for (let w = 1; w <= S.week; w++) Object.values(wk(w).sur).forEach(s => { if (s && s.a) s.a.forEach(a => { sum += [100, 60, 20][a]; c++; }); });
    return c ? Math.round(sum / c) : 0;
  };
  const wallet = () => {
    const L = S.wallet.ledger;
    const held = L.filter(x => x.st === 'held').reduce((a, x) => a + x.amt, 0);
    const spent = L.filter(x => x.st === 'settled').reduce((a, x) => a + x.amt, 0);
    return { held, spent, avail: S.wallet.custody - held - spent };
  };

  /* ---------------------------------------------------------------- small UI bits ---------------------------------------------------------------- */
  const src = (k, place) => `<a class="sd-src" href="${esc(D.src[k] || k)}" target="_blank" rel="noopener">${ic('landmark')}<span>من الوثيقة${place ? ` · ${place}` : ''}</span><span class="sr-only"> (يفتح في نافذة جديدة)</span></a>`;
  const sim = (txt = 'تجريبي') => `<span class="sd-sim" title="من تصميمنا للتجربة، وليس من الوثيقة">${txt}</span>`;
  const av = (i, name) => `<span class="sd-av" style="--c:var(--t${(i % 7) + 1})" aria-hidden="true">${esc(initial(name))}</span>`;
  const dots = l => `<span class="sd-lv" role="img" aria-label="الصعوبة ${l} من 3">${[1, 2, 3].map(i => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`;
  const proofName = { photo: 'صورة', video: 'فيديو قصير', invoice: 'فاتورة أو إيصال' };
  const proofIc = { photo: 'camera', video: 'video', invoice: 'receipt' };
  const announce = m => { const l = $('#sd-live'); if (!l) return; l.textContent = ''; setTimeout(() => { l.textContent = m; }, 30); };
  const feed = (text, k = 'info') => { S.feed.unshift({ t: text, k, w: S.week }); S.feed = S.feed.slice(0, 14); };
  const boom = (el, big) => {
    const f = fun(); if (!f || !f.confetti) return;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    f.confetti(r ? r.left + r.width / 2 : undefined, r ? r.top + r.height / 3 : undefined, big);
  };
  const toast = (m, ms) => { const f = fun(); if (f && f.toast) f.toast(m, ms); };

  /* ----------------------------------------------------------------------- crest ----------------------------------------------------------------------- */
  const SHAPES = ['M50 4 L90 18 V54 C90 82 70 98 50 106 C30 98 10 82 10 54 V18 Z', 'M50 4 C50 4 14 44 14 68 A36 36 0 0 0 86 68 C86 44 50 4 50 4Z', 'M50 4 L90 27 V77 L50 100 L10 77 V27 Z'];
  const SHAPE_NAMES = ['درع', 'قطرة', 'سداسي'], PAT_NAMES = ['أشعة', 'موج', 'نقاط'], COL_NAMES = ['لون الفريق', 'تركواز', 'برتقالي', 'أزرق'];
  const EMBLEMS = ['team', 'star', 'heart', 'flag', 'sparkles', 'droplet'], EM_NAMES = ['شعار التخصص', 'نجمة', 'قلب', 'راية', 'بريق', 'قطرة'];
  const COLS = ['var(--tc)', 'var(--brand)', 'var(--sun)', 'var(--sky)'];
  function crest(c, size, tid) {
    const uid = 'k' + Math.random().toString(36).slice(2, 7);
    const t = tid ? D.teams.find(x => x.id === tid) : T();
    const em = c.em === 0 ? (t ? t.ic : 'star') : EMBLEMS[c.em];
    let pat = '';
    if (c.pat === 0) for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; pat += `<line x1="50" y1="58" x2="${(50 + 90 * Math.cos(a)).toFixed(1)}" y2="${(58 + 90 * Math.sin(a)).toFixed(1)}"/>`; }
    else if (c.pat === 1) for (let i = 0; i < 5; i++) pat += `<path d="M-5 ${22 + i * 20} q13 -9 27 0 t27 0 t27 0 t27 0" fill="none"/>`;
    else for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) pat += `<circle cx="${14 + x * 14 + (y % 2) * 7}" cy="${14 + y * 16}" r="2.4" stroke="none" fill="#fff"/>`;
    const ty = c.shape === 1 ? 46 : 38;
    return `<svg class="sd-crest" viewBox="0 0 100 110" width="${size}" height="${Math.round(size * 1.1)}" role="img" aria-label="شعار الفريق" style="--cc:${COLS[c.col]}">
<defs><clipPath id="${uid}c"><path d="${SHAPES[c.shape]}"/></clipPath><linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
<path d="${SHAPES[c.shape]}" style="fill:var(--cc)"/>
<g clip-path="url(#${uid}c)"><g stroke="#fff" stroke-opacity=".2" stroke-width="3" stroke-linecap="round" fill="#fff" fill-opacity=".2">${pat}</g><rect width="100" height="110" fill="url(#${uid}g)"/></g>
<path d="${SHAPES[c.shape]}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.4" transform="translate(50 55) scale(.88) translate(-50 -55)"/>
<g transform="translate(33 ${ty}) scale(1.45)" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--sd-on)">${D.icons[em] || ''}</g></svg>`;
  }
  const placeholderCrest = size => `<svg class="sd-crest" viewBox="0 0 100 110" width="${size}" height="${Math.round(size * 1.1)}" aria-hidden="true"><path d="${SHAPES[0]}" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 6" opacity=".55"/><g transform="translate(33 38) scale(1.45)" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".55" stroke-linecap="round" stroke-linejoin="round">${D.icons.users}</g></svg>`;

  /* ------------------------------------------------------------------ app bar + phone ------------------------------------------------------------------ */
  function renderApp() {
    const t = T(), tm = S.team;
    const crestHTML = tm.id ? crest(tm.crest, 44) : placeholderCrest(40);
    const rank = tm.launched ? '#' + myRank() : '—';
    $('#sd-appbar').innerHTML = `
<div class="sd-ab-top"><span class="sd-ab-crest">${crestHTML}</span>
  <div class="sd-ab-t"><b>${esc(tname())}</b><small>${t ? esc(t.short) + ' · ' : ''}الأسبوع ${S.week} من ${WEEKS}</small></div></div>
<ul class="sd-ab-stats" aria-label="حالة فريقك">
  <li class="sd-pill" data-k="pts">${ic('star')}<b>${tm.launched ? cum(S.week) : 0}</b><span>نقطة</span></li>
  <li class="sd-pill" data-k="streak">${ic('flame')}<b>${tm.launched ? streak() : 0}</b><span>تتابع</span></li>
  <li class="sd-pill" data-k="rank">${ic('trophy')}<b>${rank}</b><span>الترتيب</span></li>
</ul>${S.crisis ? `<p class="sd-ab-crisis">${ic('zap')}<span>وضع الأزمة: التحديات رقمية الآن</span></p>` : ''}`;
    const k = wk(S.week), c = k.ch && chalOf(k.ch);
    const today = !tm.launched ? `<p class="sd-sc-empty">أسّس الفريق لتبدأ شاشة التطبيق في العمل.</p>`
      : c ? `<div class="sd-sc-card"><small>مهمة هذا الأسبوع${S.crisis ? ' · رقمية' : ''}</small><b>${esc(c.t)}</b>
          <div class="sd-sc-prog"><i style="width:${Math.round(done3(S.week) / 3 * 100)}%"></i></div>
          <span>${done3(S.week)}/3 خطوات · ${k.proof ? 'الإثبات مرفوع' : 'بانتظار الإثبات'}</span></div>`
        : `<div class="sd-sc-card"><small>مهمة هذا الأسبوع</small><b>لم تختاروا تحدياً بعد</b><span>افتحوا «تحدي الأسبوع» واختاروا واحداً.</span></div>`;
    const v = D.values[(S.week - 1) % D.values.length];
    const items = S.feed.slice(0, 5).map(f => `<li class="k-${f.k}">${ic(f.k === 'win' ? 'star' : f.k === 'money' ? 'coins' : 'bell')}<span>${esc(f.t)}</span></li>`).join('');
    $('#sd-screen').innerHTML = `${today}
<div class="sd-sc-note">${ic('bell')}<span><small>محدد المهام السلوكية</small>قيمة هذا الأسبوع: <b>${esc(v.v)}</b></span></div>
<h3 class="sd-sc-h">آخر الأحداث</h3><ul class="sd-sc-feed" aria-label="آخر الأحداث">${items || '<li class="k-info">' + ic('sparkles') + '<span>ستظهر هنا نقاطك وإشعاراتك.</span></li>'}</ul>
<span class="sd-sc-home" aria-hidden="true"></span>`;
  }

  /* -------------------------------------------------------------------- step bar -------------------------------------------------------------------- */
  function renderSteps() {
    const done = { found: S.team.launched, chal: S.team.launched && isDone(S.week), score: S.ended, wallet: S.wallet.ledger.some(x => x.st === 'settled'), family: cnt(wk(S.week).rep) > 0 && cnt(wk(S.week).sur) > 0, impact: false };
    $$('.sd-step-b').forEach(b => {
      const k = b.dataset.i;
      b.setAttribute('aria-current', S.step === k ? 'step' : 'false');
      const lock = k !== 'found' && !S.team.launched;
      b.disabled = lock;
      b.title = lock ? 'أسّس الفريق أولاً' : '';
      b.classList.toggle('is-done', !!done[k]);
    });
  }

  /* ------------------------------------------------------------------------ wheel ------------------------------------------------------------------------ */
  function wheelHTML(base, k, idPrefix) {
    const n = N(), step = 360 / n, rot = -((base + k) * step), lead = (base + k) % n;
    const R = n > 8 ? 112 : 106;
    const ms = Array.from({ length: n }, (_, i) => `<li class="sd-wh-m${i === lead ? ' is-lead' : ''}" style="--a:${(i * step).toFixed(2)}deg" data-i="${i}"><span class="sd-wh-in" style="--c:var(--t${(i % 7) + 1})" title="${esc(mname(i))}">${esc(initial(mname(i)))}</span></li>`).join('');
    return `<div class="sd-wheel" id="${idPrefix}" style="--rot:${rot}deg;--R:${R}px" data-base="${base}" data-k="${k}">
  <div class="sd-wh-ring" aria-hidden="true"><ul>${ms}</ul></div>
  <span class="sd-wh-crown" aria-hidden="true">${ic('crown')}</span>
  <div class="sd-wh-c"><small>قائد الشهر ${monthOf(S.week) + (demoK && !S.team.launched ? 0 : 0)}</small><b class="sd-wh-name">${esc(mname(lead))}</b></div>
</div>`;
  }
  function spinWheel(el, k, label) {
    const n = N(), base = +el.dataset.base, step = 360 / n;
    el.dataset.k = k;
    el.style.setProperty('--rot', `${-((base + k) * step)}deg`);
    const lead = (base + k) % n;
    $$('.sd-wh-m', el).forEach(m => m.classList.toggle('is-lead', +m.dataset.i === lead));
    $('.sd-wh-name', el).textContent = mname(lead);
    if (label) $('small', $('.sd-wh-c', el)).textContent = label;
    const cr = $('.sd-wh-crown', el);
    cr.classList.remove('bump'); void cr.offsetWidth; cr.classList.add('bump');
    announce(`انتقل التاج إلى ${mname(lead)}`);
  }

  /* ------------------------------------------------------------------ panel: تأسيس الفريق ------------------------------------------------------------------ */
  const namesOk = () => !!S.team.id;
  function resizeMembers() {
    const n = S.team.size;
    while (S.team.members.length < n) S.team.members.push('');
    S.team.members.length = n;
    const r = S.team.roles, used = new Set();
    ['leader', 'quality', 'media'].forEach((k, i) => { if (r[k] >= n || used.has(r[k])) { let j = 0; while (used.has(j) || j >= n) j++; r[k] = j; } used.add(r[k]); });
  }
  function pFound() {
    const tm = S.team;
    if (tm.launched && !S.edit) return foundSummary();
    const rail = ['التخصص', 'الأعضاء', 'الأدوار والشعار'].map((l, i) => {
      const dis = (i > 0 && !tm.id) || (tm.launched && i === 0);
      return `<li><button type="button" class="sd-rail-b" data-act="sub" data-i="${i}" aria-current="${S.sub === i ? 'step' : 'false'}"${dis ? ' disabled' : ''}><span class="sd-rail-n">${i + 1}</span>${l}</button></li>`;
    }).join('');
    const body = S.sub === 0 ? subSpec() : S.sub === 1 ? subMembers() : subRoles();
    return `<h2 class="sd-h" tabindex="-1">${ic('users')}تأسيس الفريق</h2><ol class="sd-rail">${rail}</ol>${body}`;
  }
  function subSpec() {
    const sel = S.team.id, t = T();
    const cards = D.teams.map(x => `<button type="button" class="card sd-team" style="--tc:var(--${x.id})" data-act="pick" data-i="${x.id}" aria-pressed="${sel === x.id}">
<span class="sd-team-ph" style="background-image:url(${x.photo})"></span><span class="sd-team-ic">${ic(x.ic)}</span><b>${esc(x.short)}</b><small>${esc(x.paren)}</small><span class="sd-team-ck">${ic('check')}</span></button>`).join('');
    let detail = '<p class="sd-empty">اختر تخصصاً لترى طبيعة عمله والجهات الراعية له.</p>';
    if (t) detail = `<section class="sd-detail" style="--tc:var(--${t.id})" aria-live="polite">
<div class="sd-detail-h"><span class="sd-team-ic">${ic(t.ic)}</span><h3>${esc(t.short)}</h3>${src(t.id, 'الفرق السبع')}</div>
<h4>${esc(t.natLabel)}</h4><p class="sd-nat">${t.nat}</p>
<p class="sd-hint">${ic('sparkles')}الكلمات المظلّلة تحوّلت إلى تحديات ميدانية في الخطوة التالية — ${t.chal.length} تحدياً لهذا التخصص ${sim()}</p>
<h4>${esc(t.bodLabel)} <small>(الجهة الراعية)</small></h4><ul class="sd-bodies">${t.bodies.map(b => `<li>${ic('landmark')}<span>${b}</span></li>`).join('')}</ul></section>`;
    return `<p class="sd-p">يتألف الفريق في ينابيع من أعضاء يتنافسون <b>معاً</b> لا فرادى. اختاروا أحد التخصصات السبعة: ${src('teams', 'الفرق السبع')}</p>
<div class="sd-teams" role="group" aria-label="التخصصات السبعة">${cards}</div>${detail}
<div class="sd-nav"><span></span><button type="button" class="btn btn-primary" data-act="sub" data-i="1"${sel ? '' : ' disabled'}>التالي: الأعضاء ${ic('arrow-left')}</button></div>`;
  }
  function subMembers() {
    const t = T(), tm = S.team;
    resizeMembers();
    const sizes = (t.id === 't1' ? D.sizes.t1 : D.sizes.platform);
    const rows = tm.members.map((m, i) => `<li class="sd-mrow">${av(i, mname(i))}<label class="sd-field sd-field-m"><span class="sr-only">اسم العضو ${i + 1}</span><input class="sd-input" data-in="mname" data-i="${i}" value="${esc(m)}" maxlength="16" placeholder="${esc(D.nicks[i % D.nicks.length])}" autocomplete="off"></label></li>`).join('');
    return `<div class="sd-two">
<div><label class="sd-field"><span>اسم الفريق</span><input class="sd-input" data-in="tname" value="${esc(tm.name)}" maxlength="28" placeholder="مثال: ${esc(t.names[0])}" autocomplete="off"></label>
<p class="sd-sugg"><span>اقتراحات ${sim()}:</span>${t.names.map((n, i) => `<button type="button" class="sd-chipb" data-act="tnsug" data-i="${i}">${esc(n)}</button>`).join('')}</p></div>
<fieldset class="sd-size"><legend>عدد الأعضاء</legend><div class="sd-sizes">${sizes.map(n => `<button type="button" class="sd-sz" data-act="size" data-i="${n}" aria-pressed="${tm.size === n}"${tm.launched ? ' disabled' : ''}>${n}</button>`).join('')}</div>
<p class="sd-hint">${t.id === 't1' ? `${D.q.teamForm.l} ${src('a3', 'المبادرة')} — وفي المنصة ${src('teams', '«فرق خماسية أو سباعية»')}` : `${src('teams', '«فرق خماسية أو سباعية»')}`}</p></fieldset></div>
<div class="sd-mhead"><h3>أسماء الأعضاء <small>(ألقاب فقط — بلا بيانات شخصية ${sim()})</small></h3>
<span class="sd-mbtns"><button type="button" class="btn btn-soft" data-act="nicks">${ic('dice')}<span>اقترح ألقاباً لطيفة</span></button><button type="button" class="btn btn-ghost" data-act="nicks-clear">${ic('trash')}<span>امسح</span></button></span></div>
<ul class="sd-members">${rows}</ul>
<div class="sd-nav"><button type="button" class="btn btn-ghost" data-act="sub" data-i="0"${tm.launched ? ' disabled' : ''}>${ic('arrow-left', 'i flip')}السابق</button><button type="button" class="btn btn-primary" data-act="sub" data-i="2">التالي: الأدوار والشعار ${ic('arrow-left')}</button></div>`;
  }
  function subRoles() {
    const tm = S.team, r = tm.roles;
    resizeMembers();
    const roleCard = (key, qk, icon) => `<section class="sd-role" aria-labelledby="role-${key}"><div class="sd-role-h">${ic(icon)}<h3 id="role-${key}">${D.q[qk].l}</h3></div><p>${D.q[qk].b}</p>
<div class="sd-pick" role="group" aria-label="اختيار ${esc(D.q[qk].l.replace(/<[^>]+>/g, ''))}">${tm.members.map((_, i) => `<button type="button" class="sd-who" data-act="role" data-r="${key}" data-i="${i}" aria-pressed="${r[key] === i}" style="--c:var(--t${(i % 7) + 1})">${av(i, mname(i))}<span>${esc(mname(i))}</span></button>`).join('')}</div></section>`;
    const c = tm.crest;
    const opt = (k, names, cur) => `<fieldset class="sd-opt"><legend>${{ shape: 'الشكل', pat: 'النقش', col: 'اللون', em: 'الرمز' }[k]}</legend><div>${names.map((n, i) => `<button type="button" class="sd-chipb" data-act="crest" data-k="${k}" data-i="${i}" aria-pressed="${cur === i}">${n}</button>`).join('')}</div></fieldset>`;
    const lead = (r.leader + tm.rot) % N();
    return `<p class="sd-p">وفق الوثيقة، لكل فريق ثلاثة أدوار واضحة. ${src('a3', 'المحور الثالث')}</p>
<div class="sd-roles">${roleCard('leader', 'roleLead', 'crown')}${roleCard('quality', 'roleQuality', 'shield')}${roleCard('media', 'roleMedia', 'smartphone')}</div>
<div class="sd-two sd-build">
<section class="sd-card"><h3>${ic('sparkles')}شعار الفريق ${sim()}</h3><div class="sd-crest-stage" id="sd-crest-stage">${crest(c, 150)}</div>
${opt('shape', SHAPE_NAMES, c.shape)}${opt('pat', PAT_NAMES, c.pat)}${opt('col', COL_NAMES, c.col)}${opt('em', EM_NAMES, c.em)}</section>
<section class="sd-card"><h3>${ic('repeat')}عجلة المداورة الشهرية</h3><p class="sd-quote">${D.q.roleLead.h} ${src('a3', 'قائد الفريق')}</p>
${wheelHTML(r.leader, tm.rot + demoK, 'sd-wheel-demo')}
<div class="sd-wh-btns"><button type="button" class="btn btn-soft" data-act="spin">${ic('repeat')}<span>داوِر إلى الشهر التالي (معاينة)</span></button></div>
<p class="sd-hint">${ic('sparkles')}المعاينة للتجربة فقط؛ في الموسم تُمرَّر القيادة عند بداية كل شهر ${sim()}</p></section></div>
<div class="sd-nav"><button type="button" class="btn btn-ghost" data-act="sub" data-i="1">${ic('arrow-left', 'i flip')}السابق</button>
<button type="button" class="btn btn-primary btn-lg" data-act="launch">${ic('flag')}<span>${tm.launched ? 'احفظ التعديلات' : 'أطلق الفريق'}</span></button></div>`;
  }
  function foundSummary() {
    const tm = S.team, t = T(), r = tm.roles, lead = leaderIdx();
    const roleOf = i => (r.leader === i ? 'قائد (الدور الأول)' : '') ;
    const badge = i => (i === lead ? `<em class="sd-rb lead">${ic('crown')}قائد الشهر</em>` : '') + (i === r.quality ? `<em class="sd-rb">${ic('shield')}الجودة والسلوك</em>` : '') + (i === r.media ? `<em class="sd-rb">${ic('smartphone')}التقني والإعلامي</em>` : '');
    return `<h2 class="sd-h" tabindex="-1">${ic('users')}فريقك جاهز</h2>
<div class="sd-sum"><div class="sd-sum-id"><div class="sd-sum-crest">${crest(tm.crest, 160)}</div><h3>${esc(tname())}</h3><p class="sd-sum-t" style="--tc:var(--${t.id})">${ic(t.ic)}<span>${esc(t.short)}</span></p>
<div class="sd-btns"><button type="button" class="btn btn-ghost" data-act="edit">${ic('pencil')}<span>عدّل الأسماء والأدوار والشعار</span></button></div></div>
<div class="sd-sum-body"><ul class="sd-roster">${tm.members.map((_, i) => `<li>${av(i, mname(i))}<b>${esc(mname(i))}</b><span class="sd-rbs">${badge(i)}</span></li>`).join('')}</ul>
<section class="sd-card sd-card-wheel"><h3>${ic('repeat')}المداورة الشهرية</h3><p class="sd-quote">${D.q.roleLead.h} ${src('a3', 'قائد الفريق')}</p>
${wheelHTML(r.leader, tm.rot + demoK, 'sd-wheel-sum')}
<div class="sd-wh-btns"><button type="button" class="btn btn-soft" data-act="spin">${ic('repeat')}<span>شاهد انتقال التاج (معاينة)</span></button></div></section></div></div>
<div class="sd-nav"><span class="sd-hint">${ic('sparkles')}${tm.rot < rotDue() ? 'حان موعد المداورة! ' : ''}الدور الأول للقائد المختار، ثم يمر التاج على الجميع شهرياً.</span>
${tm.rot < rotDue() ? `<button type="button" class="btn btn-soft" data-act="rotate-now">${ic('crown')}<span>مرّر التاج الآن</span></button>` : ''}
<button type="button" class="btn btn-primary btn-lg" data-act="go" data-i="chal">ابدأ تحدي الأسبوع ${ic('arrow-left')}</button></div>`;
  }

  /* -------------------------------------------------------------------- panel: تحدي الأسبوع -------------------------------------------------------------------- */
  const digitalSteps = c => ['افتحوا النسخة الرقمية التفاعلية من التحدي في التطبيق', c.d, 'ارفعوا لقطة شاشة لنتيجة الفريق'];
  function pChal() {
    const t = T(), k = wk(S.week), sel = k.ch && chalOf(k.ch), dig = S.crisis;
    const locked = done3(S.week) > 0 || !!k.proof;
    const board = t.chal.map((c, i) => `<li class="card sd-ch${sel && sel.id === c.id ? ' is-sel' : ''}${sel && sel.id !== c.id ? ' is-off' : ''}${dig ? ' is-dig' : ''}${flipFx ? ' do-flip' : ''}" style="--tc:var(--${t.id});--i:${i}">
<div class="sd-ch-top"><span class="sd-ch-ic">${ic(dig ? 'smartphone' : t.ic)}</span>${dig ? `<span class="sd-badge dig">${ic('zap')}نسخة رقمية</span>` : ''}<span class="sd-ch-pts">+${c.pts}</span></div>
<h3>${esc(c.t)}</h3>
<p class="sd-ch-from">${c.own ? 'من عبارة طبيعة العمل' : 'من بند آخر في الوثيقة'}: «${esc(c.f)}» ${src(c.own ? t.id : c.src.replace(/^.*#/, ''), '')}</p>
${dig ? `<p class="sd-ch-d">${esc(c.d)}</p>` : `<ul class="sd-ch-s">${c.s.map(s => `<li>${esc(s)}</li>`).join('')}</ul>`}
<div class="sd-ch-meta">${dots(c.l)}<span class="sd-badge">${ic(dig ? 'image' : proofIc[c.p])}${dig ? 'لقطة شاشة' : proofName[c.p]}</span>${sim('تجريبي')}</div>
<button type="button" class="btn ${sel && sel.id === c.id ? 'btn-soft' : 'btn-primary'}" data-act="chal" data-i="${c.id}"${sel && sel.id !== c.id && locked ? ' disabled' : ''}>${sel && sel.id === c.id ? (locked ? 'تحدي هذا الأسبوع' : 'ألغِ الاختيار') : 'اختره لهذا الأسبوع'}</button></li>`).join('');
    flipFx = false;
    return `<h2 class="sd-h" tabindex="-1">${ic('flag')}تحدي الأسبوع ${S.week}</h2>
<div class="sd-crisis${dig ? ' on' : ''}"><div class="sd-crisis-t"><span class="sd-crisis-ic">${ic('zap')}</span><div><b>وضع الأزمة</b><p>${D.q.crisis.h} ${src('s7', 'إدارة المخاطر')}</p></div></div>
<button type="button" class="sd-switch" role="switch" aria-checked="${dig}" data-act="crisis" aria-label="وضع الأزمة: تحويل كل التحديات الميدانية إلى رقمية"><span></span></button></div>
<p class="sd-p">كل تحدٍّ هنا <b>مشتقّ من عبارة «طبيعة العمل» لتخصصكم</b> ${src(t.id, t.short)} — اختاروا تحدياً واحداً هذا الأسبوع: ${sim('النقاط والصعوبة تجريبية')}</p>
<ul class="sd-board">${board}</ul>${sel ? mission(sel) : '<p class="sd-empty">اختر تحدياً لتبدأ المهمة وتظهر خطواتها.</p>'}${sideQuests()}${rules()}`;
  }
  function stepsOf(c) { return S.crisis ? digitalSteps(c) : c.s; }
  function mission(c) {
    const k = wk(S.week), n = done3(S.week), kind = S.crisis ? 'photo' : c.p;
    const r = 28, circ = 2 * Math.PI * r;
    const list = stepsOf(c).map((s, i) => `<li><button type="button" class="sd-chk" data-act="step" data-i="${i}" aria-pressed="${!!k.steps[i]}"><span class="sd-chk-b">${ic('check')}</span><span>${esc(s)}</span></button></li>`).join('');
    const all = isDone(S.week);
    return `<section class="sd-mission${all ? ' is-done' : ''}" id="sd-mission" aria-labelledby="ms-h"><header><div><small>${S.crisis ? 'مهمة رقمية' : 'مهمة ميدانية'} · الأسبوع ${S.week}</small><h3 id="ms-h">${esc(c.t)}</h3></div>
<div class="sd-ring" role="img" aria-label="${n} من 3 خطوات"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" class="bg"/><circle cx="32" cy="32" r="${r}" class="fg" style="stroke-dasharray:${(circ * n / 3).toFixed(1)} ${circ.toFixed(1)}"/></svg><b>${n}/3</b></div></header>
<ol class="sd-chks">${list}</ol>
<div class="sd-proof" id="sd-proof">${proofBox(c, kind)}</div>
${all ? `<p class="sd-win" role="status">${ic('star')}<span>أنجزتم التحدي! النقاط محتسبة تلقائياً، وصار صرف العهدة المرتبط به ممكناً.</span></p>` : ''}</section>`;
  }
  function proofBox(c, kind) {
    const k = wk(S.week), p = k.proof;
    const need = S.crisis ? 'لقطة شاشة أو تسجيل شاشة لنتيجة التحدي الرقمي' : proofName[kind];
    const accept = S.crisis ? 'image/*,video/*' : kind === 'video' ? 'video/*' : kind === 'invoice' ? 'image/*,application/pdf' : 'image/*';
    let inner;
    if (!p) inner = `<div class="sd-drop-row"><label class="sd-drop">${ic('upload')}<span><b>ارفع الإثبات</b><small>${need}</small></span><input class="sr-only" type="file" data-in="file" accept="${accept}"></label>
<button type="button" class="btn btn-soft" data-act="proof-sim">${ic('sparkles')}<span>محاكاة إثبات (للتجربة)</span></button></div>`;
    else {
      const u = blobURL[S.week];
      let prev;
      if (p.sim) prev = `<div class="sd-pv sim sim-${kind}" role="img" aria-label="معاينة إثبات تجريبي">${ic(S.crisis ? 'smartphone' : proofIc[kind])}<span>إثبات تجريبي</span></div>`;
      else if (u && p.type && p.type.startsWith('image/')) prev = `<img class="sd-pv" src="${u}" alt="معاينة الإثبات المرفوع">`;
      else if (u && p.type && p.type.startsWith('video/')) prev = `<video class="sd-pv" src="${u}" controls muted playsinline aria-label="معاينة الفيديو المرفوع"></video>`;
      else prev = `<div class="sd-pv file">${ic(p.type === 'application/pdf' ? 'file-text' : 'image')}<span>${u ? 'ملف مرفوع' : 'لا تتوفر المعاينة بعد إعادة تحميل الصفحة'}</span></div>`;
      inner = `<div class="sd-proof-ok">${prev}<div class="sd-pmeta"><b>${ic('check')}الإثبات مرفوع</b><span dir="auto">${esc(p.name)}${p.size ? ` · ${(p.size / 1024 / 1024 >= 1 ? (p.size / 1024 / 1024).toFixed(1) + ' م.ب' : Math.max(1, Math.round(p.size / 1024)) + ' ك.ب')}` : ''}</span>
<button type="button" class="btn btn-ghost" data-act="proof-clear">${ic('trash')}<span>احذف الإثبات</span></button></div></div>`;
    }
    return `<h4>${ic('camera')}الإثبات المطلوب: ${need}</h4>${inner}
<p class="sd-hint">${ic('lock')}يبقى الملف في متصفحك للمعاينة فقط ولا يُرفع إلى أي خادم. ${src('s7', 'حماية البيانات')}</p>`;
  }
  function sideQuests() {
    const k = wk(S.week), n = N(), pc = cnt(k.present);
    const who = Array.from({ length: n }, (_, i) => `<button type="button" class="sd-who sm${k.present[i] ? ' on' : ''}" data-act="pres" data-i="${i}" aria-pressed="${!!k.present[i]}" style="--c:var(--t${(i % 7) + 1})">${av(i, mname(i))}<span>${esc(mname(i))}</span></button>`).join('');
    const b = k.buddy || { h: 0, s: 1 };
    const opts = sel => Array.from({ length: n }, (_, i) => `<option value="${i}"${sel === i ? ' selected' : ''}>${esc(mname(i))}</option>`).join('');
    return `<div class="sd-quests"><h3 class="sd-sub-h">أنشطة الأسبوع الجانبية <small>تُغذّي النقاط ولوحة الأثر</small></h3><div class="sd-q3">
<section class="sd-card sd-quest"><h4>${ic('users')}التزام الفريق</h4><p>من فتح التطبيق وحضر هذا الأسبوع؟ <b>${pc}/${n}</b> ${src('a3', '«التزام الفريق»')}</p><div class="sd-pick">${who}</div>
<button type="button" class="btn btn-soft" data-act="pres-all">${ic('check')}<span>حضّر الجميع</span></button></section>
<section class="sd-card sd-quest"><h4>${ic('handshake')}مبادرة مجتمعية مصغّرة</h4><p>${D.q.initiatives.h} ${src('a4', 'المبادرات المجتمعية المصغرة')}</p>
<button type="button" class="sd-switch" role="switch" aria-checked="${k.init}" data-act="init" aria-label="نفّذنا مبادرة مجتمعية هذا الأسبوع"><span></span></button><span class="sd-sw-l">${k.init ? 'نفّذنا مبادرة هذا الأسبوع (+25)' : 'لم ننفّذ بعد'}</span></section>
<section class="sd-card sd-quest"><h4>${ic('heart')}الرفيق والرفاق${k.buddy ? '<span class="sd-badge win">' + ic('medal') + 'وسام الرفيق التكافلي</span>' : ''}</h4><p>${D.q.buddy.h.length > 170 ? D.q.buddy.b : D.q.buddy.h} ${src('a3', 'الرفيق القرآني')} ${sim('التعميم على الفرق الأخرى تجريبي')}</p>
<div class="sd-bd"><label>الرفيق المتميّز<select class="sd-select" data-in="bh">${opts(b.h)}</select></label><label>الزميل الذي يحتاج دعماً<select class="sd-select" data-in="bs">${opts(b.s)}</select></label></div>
<button type="button" class="btn ${k.buddy ? 'btn-soft' : 'btn-primary'}" data-act="buddy">${k.buddy ? 'ألغِ الجلسة' : 'سجّل جلسة رفيق'}</button></section></div></div>`;
  }
  function rules() {
    const items = [[D.q.crisis.h, 's7', 'إدارة المخاطر'], [D.q.conservative.h, 's7', 'إدارة المخاطر'], [D.q.privacy.h, 's7', 'حماية البيانات'], [`${D.q.politics.l}: ${D.q.politics.b}`, 's8', 'منع التعارض']];
    return `<details class="sd-rules"><summary>${ic('scale')}قواعد التشغيل والسلامة من الوثيقة</summary><ul>${items.map(([h, k, pl]) => `<li><span>${h}</span>${src(k, pl)}</li>`).join('')}</ul></details>`;
  }

  /* ------------------------------------------------------------------- panel: النقاط والدوري ------------------------------------------------------------------- */
  function pScore() {
    const p = pts(S.week), t = T();
    const rows = league(S.week);
    const parts = [['exec', 'تنفيذ التحدي', p.max, 'الحفظ والتفسير وتنفيذ المبادرات في المعادلة الأصلية'], ['proof', 'التوثيق', 20, ''], ['commit', 'التزام الفريق', 20, ''], ['init', 'مبادرة مجتمعية', 25, '']];
    const bar = parts.map(([k, l]) => `<i class="p-${k}" style="flex-grow:${Math.max(p[k], 0.001)}" title="${l}: ${p[k]}"></i>`).join('');
    const list = parts.map(([k, l, mx]) => `<li class="p-${k}"><span class="sd-dot"></span><span class="sd-pl">${l}</span><b>${p[k]}<small> / ${mx}</small></b></li>`).join('');
    const me = rows.find(r => r.me), prevRank = S.week > 1 ? league(S.week - 1).find(r => r.me).rank : null;
    const lg = rows.map(r => {
      const delta = r.me && prevRank ? prevRank - r.rank : 0;
      return `<li class="sd-lg-row${r.me ? ' me' : ''}" data-id="${r.id}" data-rank="${r.rank}" style="--tc:var(--t${r.c})"><span class="sd-lg-r">${r.rank}</span>
<span class="sd-lg-n"><i class="sd-lg-dot"></i><b>${esc(r.name)}</b>${r.me ? '<em>فريقك</em>' : '<em class="rival">فريق تجريبي</em>'}${r.me && delta ? `<span class="sd-delta ${delta > 0 ? 'up' : 'dn'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</span>` : ''}${r.me && r.rank === 1 ? `<span class="sd-shield" title="درع الفريق المثالي">${ic('shield')}</span>` : ''}</span>
<span class="sd-lg-w">+${r.wk}</span><span class="sd-lg-t">${r.total}</span></li>`;
    }).join('');
    const a = S.awards, cp = certProg();
    const hist = Array.from({ length: WEEKS }, (_, i) => { const w = i + 1, v = w <= S.week ? pts(w).total : 0; return `<li class="${w === S.week ? 'cur' : ''}${w > S.week ? ' future' : ''}"><i style="height:${Math.round(v / 105 * 100)}%"></i><span>${w}</span></li>`; }).join('');
    const cr = 2 * Math.PI * 28;
    return `<h2 class="sd-h" tabindex="-1">${ic('trophy')}النقاط والدوري</h2>
<div class="sd-two sd-score">
<section class="sd-card sd-break"><h3>نقاط الأسبوع ${S.week} <span class="sd-big" aria-live="polite">${p.total}<small>/ ${p.max + 65}</small></span></h3>
<div class="sd-bar" role="img" aria-label="توزيع النقاط">${bar}</div><ul class="sd-parts">${list}</ul>
<p class="sd-quote">${D.q.league.h} ${src('a3', 'الدوري القيمي')}</p>
<p class="sd-hint">${ic('sparkles')}عدّلنا المعادلة لتناسب التحدي الميداني: تنفيذ التحدي + التوثيق + التزام الفريق + مبادرة مجتمعية. الأوزان تجريبية ${sim()}</p></section>
<section class="sd-card sd-league"><h3>الدوري القيمي — الأسبوع ${S.week} من ${WEEKS}</h3><p class="sd-hint">${D.rivals.length} فرق منافسة <b>تجريبية</b> بنقاط محاكاة ${sim('فرق تجريبية')}</p>
<ol class="sd-lg" aria-label="ترتيب الدوري"><li class="sd-lg-head" aria-hidden="true"><span></span><span>الفريق</span><span>الأسبوع</span><span>المجموع</span></li>${lg}</ol></section></div>
<div class="sd-btns sd-weekbtns">${S.ended ? `<p class="sd-win">${ic('award')}<span>انتهى الموسم التجريبي (${WEEKS} أسابيع). يمكنك مراجعة كل الخطوات أو البدء من جديد.</span></p>`
      : `<button type="button" class="btn btn-primary btn-lg" data-act="close-week">${ic('calendar')}<span>${S.week >= WEEKS ? 'أنهِ الموسم' : `أغلق الأسبوع ${S.week} وانتقل للتالي`}</span></button>
<button type="button" class="btn btn-soft" data-act="sim-week">${ic('zap')}<span>محاكاة أسبوع كامل ${'(للتجربة)'}</span></button>`}</div>
<div class="sd-two sd-awards">
<section class="sd-card"><h3>${ic('award')}الدروع والأوسمة</h3>
<ul class="sd-aw"><li class="${a.shield.length || (weeklyTop(S.week)) ? 'on' : ''}">${ic('shield')}<div><b>درع الفريق المثالي</b><span>${a.shield.length ? `حصلتم عليه في ${a.shield.length} أسبوع` : weeklyTop(S.week) ? 'تتصدرون هذا الأسبوع!' : 'لأعلى نقاط في الدوري'}</span>${src('a10', 'الجوائز الدورية')}</div></li>
<li class="${a.medal.length || wk(S.week).buddy ? 'on' : ''}">${ic('medal')}<div><b>وسام الرفيق التكافلي</b><span>${a.medal.length || wk(S.week).buddy ? 'سجّلتم جلسة رفيق' : 'سجّلوا جلسة رفيق في تحدي الأسبوع'}</span>${src('a10', 'الجوائز الدورية')}</div></li>
<li class="${a.mshield.length ? 'on' : ''}">${ic('trophy')}<div><b>درع الشهر</b><span>${a.mshield.length ? 'تصدّرتم نهاية شهر' : 'لمن يتصدر عند نهاية الشهر'} ${sim()}</span></div></li></ul>
<p class="sd-hint">${D.q.shield.h}</p></section>
<section class="sd-card sd-cert${S.certDone ? ' on' : ''}"><h3>${ic('cap')}نحو شهادة «قائد مجتمعي معتمد»</h3>
<div class="sd-cert-row"><div class="sd-ring big" role="img" aria-label="${cp.n} من 3"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" class="bg"/><circle cx="32" cy="32" r="28" class="fg" style="stroke-dasharray:${(cr * cp.n / 3).toFixed(1)} ${cr.toFixed(1)}"/></svg><b>${cp.n}/3</b></div>
<ul class="sd-cert-l">${cp.items.map(x => `<li class="${x.ok ? 'ok' : ''}">${ic(x.ok ? 'check' : 'clock')}<span>${x.k}</span></li>`).join('')}</ul></div>
<p class="sd-hint">${D.q.cert.h} ${src('a10', 'الجوائز الختامية')}<br>شروط الاكتساب هنا ${sim('تجريبية')}</p></section></div>
<section class="sd-card"><h3>نقاطك عبر الأسابيع</h3><ol class="sd-hist" aria-label="نقاط كل أسبوع">${hist}</ol></section>`;
  }

  /* ------------------------------------------------------------------- panel: العهدة الإلكترونية ------------------------------------------------------------------- */
  const condsOf = w => ({ chal: done3(w) === 3 && !!wk(w).ch, proof: !!wk(w).proof });
  function pWallet() {
    const W = wallet(), L = S.wallet.ledger, k = wk(S.week), c = k.ch && chalOf(k.ch);
    const heldItems = L.filter(x => x.st === 'held');
    const anyHeld = heldItems.length > 0;
    const anyReady = heldItems.some(x => { const q = condsOf(x.w); return q.chal && q.proof; });
    const vstate = !anyHeld ? 'idle' : anyReady ? 'open' : 'locked';
    const anim = vstate !== lastVault; lastVault = vstate;
    const pct = S.wallet.custody ? Math.round(W.avail / S.wallet.custody * 100) : 0;
    const vault = `<div class="sd-vault v-${vstate}${anim ? ' anim' : ''}" role="img" aria-label="${vstate === 'locked' ? 'العهدة محجوزة (مقفلة) بانتظار الإنجاز والإثبات' : vstate === 'open' ? 'شروط الصرف مكتملة (مفتوحة)' : 'لا مبالغ محجوزة'}">
<svg viewBox="0 0 220 170" aria-hidden="true"><rect x="22" y="52" width="176" height="108" rx="22" class="v-body"/><rect x="22" y="52" width="176" height="108" rx="22" class="v-sheen"/><rect x="34" y="70" width="152" height="12" rx="6" class="v-slot"/>
<g class="v-shackle"><path d="M80 52 V40 a30 30 0 0 1 60 0 V52" fill="none" stroke-width="12" stroke-linecap="round"/></g>
<g class="v-key"><circle cx="110" cy="116" r="17"/><rect x="106" y="116" width="8" height="22" rx="3"/></g></svg>
${coinFx ? '<span class="sd-coin" style="--i:0"></span><span class="sd-coin" style="--i:1"></span><span class="sd-coin" style="--i:2"></span><span class="sd-coin" style="--i:3"></span>' : ''}</div>`;
    coinFx = false;
    const amts = `<div class="sd-wstats"><div><small>متاح</small><b data-count="${W.avail}">${W.avail}</b></div><div class="held"><small>محجوز</small><b>${W.held}</b></div><div class="set"><small>مُسوّى</small><b>${W.spent}</b></div></div>`;
    const fillbar = `<div class="sd-wbar" role="img" aria-label="المتاح ${pct}% من العهدة"><i style="width:${pct}%"></i></div>`;
    const reqDisabled = !c || W.avail <= 0;
    const form = `<form class="sd-form" data-form="request" novalidate><h3>${ic('send')}اطلب صرفاً</h3>
${c ? `<p class="sd-hint">${ic('flag')}مرتبط بتحدي هذا الأسبوع: <b>${esc(c.t)}</b></p>` : `<p class="sd-warn">${ic('alert')}اختر تحدي الأسبوع أولاً — الصرف في ينابيع مرتبط بتحدٍّ.</p><button type="button" class="btn btn-soft" data-act="go" data-i="chal">اذهب إلى تحدي الأسبوع</button>`}
<label class="sd-field"><span>الغرض</span><select class="sd-select" data-in="purpose">${D.purposes.map((p, i) => `<option value="${i}"${wDraft.purpose === i ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
<label class="sd-field"><span>المبلغ (وحدة تجريبية)</span><input class="sd-input" type="number" min="1" step="5" data-in="amt" value="${wDraft.amt}" inputmode="numeric"></label>
<button type="submit" class="btn btn-primary" data-act="request"${reqDisabled ? ' disabled' : ''}>${ic('lock')}<span>اطلب الصرف وحجز المبلغ</span></button></form>`;
    const rows = L.slice().reverse().map(x => {
      const q = condsOf(x.w), ok = q.chal && q.proof, ch = chalOf(wk(x.w).ch);
      const st = { held: ['محجوز', 'lock'], settled: ['مُسوّى رقمياً', 'check'], returned: ['أُعيد للعهدة', 'refresh'] }[x.st];
      let extra = '';
      if (x.st === 'held') {
        const stages = ['قراءة الفيديو/الفاتورة', 'مطابقة المبلغ والغرض', 'ربطها بالتحدي', 'اعتماد التسوية'];
        extra = `<ul class="sd-cond" aria-label="شروط تسوية الصرف"><li class="${q.chal ? 'ok' : ''}">${ic(q.chal ? 'check' : 'clock')}<span>التحدي مكتمل (الخطوات الثلاث)</span></li><li class="${q.proof ? 'ok' : ''}">${ic(q.proof ? 'check' : 'clock')}<span>الفيديو/الفاتورة مرفوعة</span></li></ul>
${checking && checking.id === x.id ? `<ol class="sd-check">${stages.map((s, i) => `<li class="${i < checking.k ? 'ok' : i === checking.k ? 'cur' : ''}">${ic(i < checking.k ? 'check' : 'clock')}<span>${s}</span></li>`).join('')}</ol>` : ''}
<button type="button" class="btn ${ok ? 'btn-primary' : 'btn-ghost'} sd-settle${shake === x.id ? ' shake' : ''}" data-act="settle" data-i="${x.id}" aria-disabled="${!ok || !!checking}">${ic(ok ? 'unlock' : 'lock')}<span>${ok ? 'سوِّ المبلغ رقمياً' : 'مقفل: أكمل التحدي وارفع الإثبات'}</span></button>`;
      }
      if (x.st === 'settled') extra = `<p class="sd-ref">${ic('receipt')}مرجع التسوية <bdi>${esc(x.ref)}</bdi> ${sim()}</p>`;
      if (x.st === 'returned') extra = `<p class="sd-ref">${ic('refresh')}لم يكتمل التحدي قبل إغلاق الأسبوع ${x.w}، فعاد المبلغ إلى العهدة.</p>`;
      return `<li class="sd-led st-${x.st}"><div class="sd-led-h"><span class="sd-led-st">${ic(st[1])}${st[0]}</span><b>${x.amt}</b></div><p><span>${esc(x.p)}</span> · الأسبوع ${x.w}${ch ? ' · ' + esc(ch.t) : ''}</p>${extra}</li>`;
    }).join('');
    return `<h2 class="sd-h" tabindex="-1">${ic('wallet')}العهدة الإلكترونية</h2>
<blockquote class="sd-rule sm"><span class="sd-rule-k">${ic('landmark')}الربط الشرطي</span><p>${D.q.gov.h}</p>${src('s6', 'الإدارة المالية')}</blockquote>
<div class="sd-two sd-wal"><section class="sd-card sd-wcard">${vault}<div class="sd-wmain"><h3>العهدة المسبقة الدفع ${sim('المبالغ تجريبية')}</h3>${amts}${fillbar}
<form class="sd-cust" data-form="custody"><label class="sd-field"><span>مبلغ العهدة الكلي</span><input class="sd-input" type="number" min="${W.held + W.spent}" step="50" data-in="custody" value="${S.wallet.custody}" inputmode="numeric"></label></form></div></section>${form}</div>
<section class="sd-card"><h3>${ic('file-text')}سجل العهدة</h3>${rows ? `<ul class="sd-ledger">${rows}</ul>` : '<p class="sd-empty">لا توجد طلبات صرف بعد. اطلب مبلغاً، وانظر كيف يُحجز حتى تُنجز التحدي وترفع الدليل.</p>'}</section>`;
  }

  /* ----------------------------------------------------------------------- panel: ركن الأسرة ----------------------------------------------------------------------- */
  const rec = { st: 'idle', sim: false, t0: 0, tm: 0, chunks: [], stream: null, mr: null, url: null, dur: 0, note: '', mode: 'text' };
  function pFamily() {
    const n = N(), k = wk(S.week), i = Math.min(S.famSel, n - 1), v = D.values[(S.week - 1) % D.values.length];
    const rp = k.rep[i], sv = k.sur[i];
    const chips = Array.from({ length: n }, (_, j) => `<button type="button" class="sd-who sm" data-act="fam-m" data-i="${j}" aria-pressed="${j === i}" style="--c:var(--t${(j % 7) + 1})">${av(j, mname(j))}<span>${esc(mname(j))}</span><em class="sd-mk">${k.rep[j] ? ic('message') : ''}${k.sur[j] ? ic('heart') : ''}</em></button>`).join('');
    let report;
    if (rp) report = `<div class="sd-sent">${ic('check')}<div><b>رُفع تقرير ${esc(mname(i))}</b><p>${rp.type === 'voice' ? `تقرير صوتي (${rp.dur || 0} ث)${rp.sim ? ' — تسجيل تجريبي محاكى' : ''}` : esc(rp.text)}</p>${voiceURL[S.week + ':' + i] ? `<audio controls src="${voiceURL[S.week + ':' + i]}"></audio>` : ''}<button type="button" class="btn btn-ghost" data-act="rep-clear">${ic('trash')}<span>احذف التقرير</span></button></div></div>`;
    else if (rec.mode === 'text') report = `<label class="sd-field"><span>اكتب تقريراً قصيراً عن موقف طبّقتَ فيه القيمة</span><textarea class="sd-input" rows="3" maxlength="400" data-in="reptext" placeholder="مثال: ساعدتُ أختي في ...">${esc(rec.text || '')}</textarea></label><button type="button" class="btn btn-primary" data-act="rep-text">${ic('send')}<span>أرسل التقرير</span></button>`;
    else report = voiceUI();
    const surv = sv ? `<div class="sd-sent">${ic('heart')}<div><b>شكراً لولي أمر ${esc(mname(i))}</b><p>سُجّلت إجابات الاستبيان، وارتفع «التواصل الأسري» لفريقكم.</p><button type="button" class="btn btn-ghost" data-act="surv-clear">${ic('trash')}<span>أعد الاستبيان</span></button></div></div>`
      : `<form data-form="survey">${D.survey.map((q, qi) => `<fieldset class="sd-q"><legend>${qi + 1}. ${esc(q.q)}</legend><div>${q.o.map((o, oi) => `<label class="sd-opt-r"><input type="radio" name="sv${qi}" value="${oi}" data-in="sv" data-q="${qi}"${survDraft[qi] === oi ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`).join('')}
<button type="submit" class="btn btn-primary" data-act="surv-send">${ic('send')}<span>أرسل الاستبيان</span></button></form>`;
    const fm = famMeter(), kv = kpiVals();
    return `<h2 class="sd-h" tabindex="-1">${ic('home')}ركن الأسرة</h2>
<p class="sd-p">التطبيق لا يخاطب الطالب وحده: يصل الأسرة أيضاً. ${src('a5', 'التوظيف التكنولوجي')}</p>
<div class="sd-who-row"><span>أي عضو تجرّب معه؟</span><div class="sd-pick">${chips}</div></div>
<div class="sd-two sd-fam">
<section class="sd-card sd-kid"><h3>${ic('smartphone')}شاشة الطالب</h3>
<div class="sd-notif"><span class="sd-notif-ic">${ic('bell')}</span><div><small>${D.q.tracker.l}</small><b>المهمة السلوكية والقيمية الأسبوعية: ${esc(v.v)}</b><p>${esc(v.task)} ${sim()}</p></div></div>
<p class="sd-quote">${D.q.tracker.b} ${src('a5', 'محدد المهام السلوكية')}</p>
<div class="sd-seg" role="group" aria-label="طريقة التقرير"><button type="button" class="sd-chipb" data-act="rep-mode" data-i="text" aria-pressed="${rec.mode === 'text'}">${ic('pencil')}تقرير مكتوب</button><button type="button" class="sd-chipb" data-act="rep-mode" data-i="voice" aria-pressed="${rec.mode === 'voice'}">${ic('mic')}تقرير صوتي</button></div>
${report}
<p class="sd-hint">${ic('lock')}التقرير والتسجيل يبقيان في متصفحك فقط. ${src('s7', 'حماية البيانات')}</p></section>
<section class="sd-card sd-par"><h3>${ic('heart')}شاشة ولي الأمر</h3><p class="sd-quote">${D.q.comms.h} ${src('a5', 'مساحة التواصل')}</p>
<p class="sd-hint">استبيان سريع من ثلاثة أسئلة ${sim('الأسئلة من صياغتنا')}</p>${surv}</section></div>
<div class="sd-two sd-famstats"><section class="sd-card"><h3>التواصل الأسري لفريقك</h3><div class="sd-meter" role="img" aria-label="دفء التواصل الأسري ${fm}%"><i style="width:${fm}%"></i></div>
<p class="sd-hint">استجابة أولياء الأمور: <b>${kv[3]}%</b> مقابل <b>${D.kpi['3'].target}%</b> من الوثيقة ${src('kpi3', 'KPI 3')}</p></section>
<section class="sd-card"><h3>تسريع التجربة</h3><p class="sd-hint">سجّل تقارير واستبيانات كل الأعضاء دفعة واحدة لترى أثر ذلك في لوحة الأثر ${sim()}</p><button type="button" class="btn btn-soft" data-act="fam-sim">${ic('zap')}<span>حاكِ مشاركة الجميع</span></button></section></div>`;
  }
  function voiceUI() {
    const bars = Array.from({ length: 28 }, (_, j) => `<i style="--j:${j}"></i>`).join('');
    if (rec.st === 'idle') return `<div class="sd-voice"><p class="sd-hint">${ic('mic')}اضغط للتسجيل (قد يطلب المتصفح إذن الميكروفون). إن لم يتوفر فسنحاكي التسجيل.</p><div class="sd-wave idle">${bars}</div><div class="sd-btns"><button type="button" class="btn btn-primary" data-act="rec-start">${ic('mic')}<span>ابدأ التسجيل</span></button><button type="button" class="btn btn-soft" data-act="rec-sim">${ic('sparkles')}<span>محاكاة تسجيل</span></button></div></div>`;
    if (rec.st === 'rec') return `<div class="sd-voice rec"><p class="sd-hint" role="status">${rec.sim ? esc(rec.note || 'تسجيل تجريبي محاكى') : 'جارٍ التسجيل…'} <b data-rec-time>0:00</b></p><div class="sd-wave">${bars}</div><button type="button" class="btn btn-primary" data-act="rec-stop">${ic('stop')}<span>أوقف التسجيل</span></button></div>`;
    return `<div class="sd-voice done"><p class="sd-hint" role="status">${ic('check')}تم التسجيل (${rec.dur} ث)${rec.sim ? ' — محاكاة' : ''}</p>${rec.url ? `<audio controls src="${rec.url}"></audio>` : '<div class="sd-wave idle">' + bars + '</div>'}
<div class="sd-btns"><button type="button" class="btn btn-primary" data-act="rep-voice">${ic('send')}<span>أرسل التقرير الصوتي</span></button><button type="button" class="btn btn-ghost" data-act="rec-reset">${ic('refresh')}<span>أعد التسجيل</span></button></div></div>`;
  }
  async function recStart() {
    rec.st = 'rec'; rec.sim = false; rec.chunks = []; rec.url = null; rec.t0 = Date.now(); rec.note = '';
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec.stream = stream;
        const mr = new MediaRecorder(stream);
        rec.mr = mr;
        mr.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
        mr.onstop = () => {
          stream.getTracks().forEach(tk => tk.stop());
          rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: mr.mimeType || 'audio/webm' }));
          rec.dur = Math.max(1, Math.round((Date.now() - rec.t0) / 1000)); rec.st = 'done';
          if (S.step === 'family') renderPanel();
        };
        mr.start();
      } catch (e) { rec.sim = true; rec.note = 'تعذّر الوصول إلى الميكروفون — تسجيل تجريبي محاكى'; }
    } else { rec.sim = true; rec.note = 'التسجيل غير مدعوم هنا — تسجيل تجريبي محاكى'; }
    clearInterval(rec.tm);
    rec.tm = setInterval(() => {
      const s = Math.round((Date.now() - rec.t0) / 1000), el = $('[data-rec-time]');
      if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 60) recStop();
    }, 500);
    if (S.step === 'family') renderPanel();
  }
  function recStop() {
    clearInterval(rec.tm);
    if (rec.mr && rec.mr.state !== 'inactive' && !rec.sim) { rec.mr.stop(); return; }
    rec.dur = Math.max(2, Math.round((Date.now() - rec.t0) / 1000)); rec.st = 'done'; rec.url = null;
    if (S.step === 'family') renderPanel();
  }
  function recReset() { clearInterval(rec.tm); if (rec.stream) rec.stream.getTracks().forEach(tk => tk.stop()); if (rec.url) URL.revokeObjectURL(rec.url); Object.assign(rec, { st: 'idle', sim: false, url: null, mr: null, stream: null, chunks: [], note: '' }); }

  /* ------------------------------------------------------------------------ panel: لوحة الأثر ------------------------------------------------------------------------ */
  function gauge(val, scale, target) {
    const pct = Math.max(0, Math.min(100, val / scale * 100)), tp = target / scale;
    const a = Math.PI * (1 - tp), x1 = 60 + 41 * Math.cos(a), y1 = 62 - 41 * Math.sin(a), x2 = 60 + 57 * Math.cos(a), y2 = 62 - 57 * Math.sin(a);
    return `<svg class="sd-g" viewBox="0 0 120 70" aria-hidden="true"><path d="M10 62 A50 50 0 0 1 110 62" pathLength="100" class="g-bg"/><path d="M10 62 A50 50 0 0 1 110 62" pathLength="100" class="g-fg" style="--v:${pct.toFixed(1)}"/><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="g-t"/></svg>`;
  }
  function pImpact() {
    const kv = kpiVals();
    const defs = [
      { n: 2, v: kv[2], u: '%', go: 'family', hint: 'ارفعوا تقارير كل الأعضاء في «ركن الأسرة»' },
      { n: 3, v: kv[3], u: '%', go: 'family', hint: 'أرسلوا استبيان أولياء الأمور لكل عضو' },
      { n: 5, v: kv[5], u: '%', go: 'chal', hint: 'سجّلوا حضور الأعضاء في «تحدي الأسبوع»' },
      { n: 4, v: kv[4], u: '', go: 'chal', scale: 2, hint: 'فعّلوا «مبادرة مجتمعية مصغّرة» هذا الشهر' },
      { n: 6, v: kv[6], u: '%', go: 'found', hint: S.team.rot < rotDue() ? 'مرّروا التاج: حان موعد المداورة' : 'يمر التاج على أعضاء الفريق عند كل شهر جديد' },
      { n: 8, v: kv[8], u: '%', go: 'chal', hint: 'سجّلوا جلسات «الرفيق» كل أسبوع' },
    ];
    const met = defs.filter(d => d.v >= D.kpi[d.n].target).length;
    const cards = defs.map(d => {
      const K = D.kpi[d.n], ok = d.v >= K.target, tgt = d.n === 4 ? `${K.target}` : `${K.target}%`, val = d.n === 4 ? `${d.v}` : `${d.v}%`;
      return `<li class="card sd-gc${ok ? ' met' : ''}"><div class="sd-gc-h"><span class="sd-kpi-n"><bdi lang="en">KPI ${K.n}</bdi></span><h3>${esc(K.name)}</h3></div>
<div class="sd-gwrap">${gauge(d.v, d.scale || 100, K.target)}<div class="sd-gval"><b>${val}</b><small>فريقك</small></div></div>
<p class="sd-gt"><span>المستهدف من الوثيقة</span><b>${d.n === 4 ? 'مبادرة واحدة على الأقل' : '≥ ' + tgt}</b></p>
<span class="sd-gs ${ok ? 'ok' : ''}">${ic(ok ? 'check' : 'clock')}${ok ? 'تحقق المستهدف' : 'قيد الاقتراب'}</span>
<p class="sd-gx">${K.h}</p>
<div class="sd-gl"><a class="sd-src" href="${K.href}" target="_blank" rel="noopener">${ic('landmark')}<span>من الوثيقة · <bdi lang="en">KPI ${K.n}</bdi></span><span class="sr-only"> (يفتح في نافذة جديدة)</span></a>
${ok ? '' : `<button type="button" class="sd-hintb" data-act="go" data-i="${d.go}">${ic('arrow-left')}<span>${d.hint}</span></button>`}</div></li>`;
    }).join('');
    return `<h2 class="sd-h" tabindex="-1">${ic('gauge')}لوحة الأثر</h2>
<div class="sd-impact-top"><div class="sd-ring big" role="img" aria-label="${met} من 6 مستهدفات"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" class="bg"/><circle cx="32" cy="32" r="28" class="fg" style="stroke-dasharray:${(2 * Math.PI * 28 * met / 6).toFixed(1)} ${(2 * Math.PI * 28).toFixed(1)}"/></svg><b>${met}/6</b></div>
<div><h3>${met} من 6 مؤشرات حققت مستهدف الوثيقة</h3><p class="sd-hint">أرقام المستهدفات حرفية من وثيقة مبادرة «حفظ، فهم، تطبيق» ${src('a11', 'مؤشرات الأداء')}، أما قيم فريقك فمحسوبة من أفعالك في الستوديو ${sim('قيم محاكاة')}</p></div></div>
<ul class="sd-gauges">${cards}</ul>`;
  }

  /* ----------------------------------------------------------------------------- render ----------------------------------------------------------------------------- */
  const PANELS = { found: pFound, chal: pChal, score: pScore, wallet: pWallet, family: pFamily, impact: pImpact };
  function renderPanel() {
    const stage = $('#sd-stage');
    const ae = document.activeElement;
    let fk = null;
    if (ae && stage.contains(ae) && ae.dataset && ae.dataset.act && ae.dataset.act !== 'go') fk = { a: ae.dataset.act, i: ae.dataset.i, r: ae.dataset.r, k: ae.dataset.k };
    if (S.step !== 'found' && !S.team.launched) S.step = 'found';
    const prevTop = stage.getBoundingClientRect().top;
    stage.innerHTML = PANELS[S.step]();
    stage.dataset.step = S.step;
    if (fk) {
      const el = $$('[data-act]', stage).find(e => e.dataset.act === fk.a && e.dataset.i === fk.i && e.dataset.r === fk.r && e.dataset.k === fk.k);
      if (el) el.focus({ preventScroll: true });
    }
    void prevTop;
    if (S.step === 'score') flipLeague();
    if (S.step === 'family' && rec.st === 'rec') { /* timer keeps running */ }
  }
  function render() {
    root.style.setProperty('--tc', S.team.id ? `var(--${S.team.id})` : 'var(--brand)');
    root.classList.toggle('is-crisis', !!S.crisis);
    renderSteps(); renderApp(); renderPanel();
  }
  function flipLeague() {
    const rows = $$('.sd-lg-row');
    if (!rows.length) return;
    const h = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0;
    rows.forEach(r => {
      const old = S.ranks[r.dataset.id], now = +r.dataset.rank;
      if (old && old !== now && h && !reduced() && r.animate) r.animate([{ transform: `translateY(${(old - now) * h}px)`, zIndex: 2 }, { transform: 'none', zIndex: 2 }], { duration: 800, easing: 'cubic-bezier(.22,.8,.24,1)' });
    });
    rows.forEach(r => { S.ranks[r.dataset.id] = +r.dataset.rank; });
    save();
  }
  function focusStage() {
    const h = $('.sd-h', $('#sd-stage'));
    if (h) h.focus({ preventScroll: true });
    const nav = $('.sd-steps');
    if (nav) nav.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }
  function goStep(k, focus = true) {
    if (k !== 'found' && !S.team.launched) return;
    S.step = k; save(); render(); if (focus) focusStage();
  }

  /* -------------------------------------------------------------------------- change tracking -------------------------------------------------------------------------- */
  const snap = () => ({ pts: S.team.launched ? pts(S.week).total : 0, done: S.team.launched && isDone(S.week), rank: S.team.launched ? myRank() : 99, cert: certProg().n });
  function act(fn, opts = {}) {
    const b = snap();
    fn();
    const a = snap();
    if (a.pts !== b.pts) { announce(`نقاط الأسبوع ${a.pts}`); }
    if (!b.done && a.done) {
      feed(`أنجزتم «${chalOf(wk(S.week).ch).t}» — النقاط محتسبة تلقائياً`, 'win');
      toast('أنجزتم تحدي الأسبوع! 🎉'.replace(' 🎉', ''), 2600);
      setTimeout(() => boom($('.sd-ring') || $('#sd-mission'), false), 80);
    }
    if (a.rank < b.rank && S.team.launched) {
      feed(`صعد فريقكم إلى المركز ${a.rank} في الدوري`, 'win');
      if (a.rank === 1) { toast('أنتم في الصدارة — درع الفريق المثالي', 3000); setTimeout(() => boom($('.sd-ring') || root, true), 80); }
    }
    if (a.cert === 3 && !S.certDone) { S.certDone = true; feed('اكتملت شروط شهادة «قائد مجتمعي معتمد»', 'win'); toast('اكتملت شروط شهادة «قائد مجتمعي معتمد»', 3600); setTimeout(() => boom(root, true), 120); }
    save();
    if (!opts.quiet) render();
    pulse(a.pts !== b.pts ? 'pts' : null);
  }
  function pulse(k) {
    if (!k) return;
    const el = $(`.sd-pill[data-k="${k}"]`);
    if (el && !reduced()) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }

  /* ------------------------------------------------------------------------------ actions ------------------------------------------------------------------------------ */
  const pickNicks = () => { const pool = D.nicks.slice().sort(() => Math.random() - 0.5); return pool; };
  function simProofObj(kind) { return { name: S.crisis ? 'لقطة-شاشة-تجريبية.png' : kind === 'video' ? 'فيديو-تجريبي.mp4' : kind === 'invoice' ? 'فاتورة-تجريبية.pdf' : 'صورة-تجريبية.jpg', type: 'sim', size: 0, sim: true }; }
  function autoWeek() {
    act(() => {
      const t = T(), k = wk(S.week), w = S.week, n = N();
      if (!k.ch) k.ch = t.chal[(w * 2 + 1) % t.chal.length].id;
      k.steps = [1, 1, 1];
      if (!k.proof) k.proof = simProofObj(chalOf(k.ch).p);
      for (let i = 0; i < n; i++) k.present[i] = true;
      k.init = w % 2 === 1;
      k.buddy = w % 3 === 0 ? null : { h: 0, s: Math.min(1, n - 1) };
      for (let i = 0; i < n; i++) { if (!(w % 3 === 0 && i === n - 1)) { k.rep[i] = { type: 'text', text: 'طبّقتُ القيمة هذا الأسبوع مع أسرتي. (تجريبي)' }; k.sur[i] = { a: [0, w % 2, 1 - (w % 2)] }; } }
    });
    toast('حاكينا أسبوعاً كاملاً — راجع النقاط والدوري', 2600);
  }
  function openDialog() {
    let dlg = $('#sd-dialog');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sd-dialog'; dlg.className = 'sd-dialog'; dlg.setAttribute('aria-labelledby', 'sd-dlg-h'); root.appendChild(dlg); }
    const w = S.week, p = pts(w), rows = league(w), me = rows.find(r => r.me), last = w >= WEEKS;
    const newMonth = !last && monthOf(w + 1) > monthOf(w);
    const prev = w > 1 ? league(w - 1).find(r => r.me).rank : null;
    const next = (leaderIdx() + 1) % N();
    const earned = [weeklyTop(w) ? 'درع الفريق المثالي' : '', wk(w).buddy ? 'وسام الرفيق التكافلي' : ''].filter(Boolean);
    const unmet = S.wallet.ledger.filter(x => x.st === 'held' && x.w === w && !(condsOf(w).chal && condsOf(w).proof));
    dlg.innerHTML = `<div class="sd-dlg"><h2 id="sd-dlg-h" tabindex="-1">${last ? 'ختام الموسم التجريبي' : `ملخص الأسبوع ${w}`}</h2>
<ul class="sd-dlg-l"><li>${ic('star')}<span>نقاط الأسبوع</span><b>${p.total}</b></li><li>${ic('trophy')}<span>ترتيبكم في الدوري</span><b>#${me.rank}${prev ? ` <small>(${prev > me.rank ? 'صعود' : prev < me.rank ? 'هبوط' : 'ثبات'})</small>` : ''}</b></li>
<li>${ic('flame')}<span>التتابع</span><b>${streak()}</b></li><li>${ic('award')}<span>الدروع والأوسمة</span><b>${earned.length ? earned.join('، ') : 'لا شيء هذا الأسبوع'}</b></li></ul>
${unmet.length ? `<p class="sd-warn">${ic('lock')}لم يكتمل التحدي، لذا سيعود المبلغ المحجوز (${unmet.reduce((a, x) => a + x.amt, 0)}) إلى العهدة.</p>` : ''}
${newMonth ? `<div class="sd-dlg-rot"><h3>${ic('crown')}بداية شهر جديد: حان موعد المداورة</h3><p>${D.q.roleLead.h}</p><p>القائد الحالي <b>${esc(mname(leaderIdx()))}</b> ← القائد القادم <b>${esc(mname(next))}</b></p></div>
<div class="sd-btns"><button type="button" class="btn btn-primary" data-act="dlg-next" data-i="rotate">${ic('crown')}<span>مرّر التاج وابدأ الأسبوع ${w + 1}</span></button><button type="button" class="btn btn-ghost" data-act="dlg-next" data-i="keep">ابدأ دون مداورة</button><button type="button" class="btn btn-ghost" data-act="dlg-x">رجوع</button></div>`
      : `<div class="sd-btns"><button type="button" class="btn btn-primary" data-act="dlg-next" data-i="go">${last ? 'أنهِ الموسم' : `ابدأ الأسبوع ${w + 1}`}</button><button type="button" class="btn btn-ghost" data-act="dlg-x">رجوع</button></div>`}</div>`;
    if (dlg.showModal) { try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); } } else dlg.setAttribute('open', '');
    const first = $('[data-act="dlg-next"]', dlg); if (first) first.focus();
  }
  function closeDialog() { const dlg = $('#sd-dialog'); if (dlg && dlg.open) dlg.close(); }
  function closeWeek(mode) {
    const w = S.week, last = w >= WEEKS;
    act(() => {
      if (weeklyTop(w)) S.awards.shield.push(w);
      if (wk(w).buddy) S.awards.medal.push(w);
      if (w % MONTH === 0 && myRank(w) === 1) S.awards.mshield.push(w);
      S.wallet.ledger.forEach(x => { if (x.st === 'held' && x.w === w && !(condsOf(w).chal && condsOf(w).proof)) { x.st = 'returned'; feed(`أُعيد ${x.amt} إلى العهدة لأن التحدي لم يكتمل`, 'money'); } });
      const rk = myRank(w);
      feed(`أُغلق الأسبوع ${w}: ${cum(w)} نقطة · المركز ${rk}`, 'win');
      if (mode === 'rotate') { S.team.rot++; feed(`مُرّر التاج إلى ${mname(leaderIdx())}`, 'win'); }
      if (last) { S.ended = true; feed('انتهى الموسم التجريبي', 'win'); } else { S.week++; }
      S.ranks = S.ranks; demoK = 0;
    }, { quiet: true });
    render();
    if (mode === 'rotate') setTimeout(() => boom($('.sd-ab-crest'), false), 100);
    else if (!last) setTimeout(() => boom($('.sd-ab-crest'), false), 100);
    if (last) setTimeout(() => boom(root, true), 120);
    announce(last ? 'انتهى الموسم التجريبي' : `بدأ الأسبوع ${S.week}`);
  }
  async function settle(id) {
    const x = S.wallet.ledger.find(l => l.id === id);
    if (!x || x.st !== 'held' || checking) return;
    const q = condsOf(x.w);
    if (!(q.chal && q.proof)) {
      shake = id; renderPanel(); shake = '';
      announce(!q.chal ? 'مقفل: أكملوا خطوات التحدي أولاً' : 'مقفل: ارفعوا الفيديو أو الفاتورة أولاً');
      toast(!q.chal ? 'مقفل: أكملوا خطوات التحدي أولاً' : 'مقفل: ارفعوا الفيديو أو الفاتورة أولاً', 2600);
      return;
    }
    checking = { id, k: 0 };
    renderPanel();
    for (let k = 1; k <= 4; k++) { await sleep(520); if (!checking) return; checking.k = k; renderPanel(); }
    await sleep(260);
    checking = null;
    act(() => { x.st = 'settled'; x.ref = 'YNB-' + String(1000 + S.wallet.seq * 7 + x.w * 13).slice(-4) + '-' + x.id.slice(1); feed(`سُوّيت العهدة (${x.amt}) رقمياً بعد التحقق`, 'money'); });
    toast('سُوّيت العهدة رقمياً', 2400);
    setTimeout(() => boom($('.sd-vault'), false), 80);
  }

  root.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a || !root.contains(a)) return;
    const d = a.dataset, tm = S.team;
    const stop = () => { e.preventDefault(); };
    switch (d.act) {
      case 'go': stop(); goStep(d.i); break;
      case 'sub': stop(); if (a.disabled) break; S.sub = +d.i; save(); renderPanel(); focusStage(); break;
      case 'pick': {
        const first = tm.id !== d.i; tm.id = d.i; tm.name = first && !tm.name ? '' : tm.name;
        if (tm.size === 7 || tm.size === 5) { /* keep */ } else if (d.i !== 't1') tm.size = 5;
        save(); render(); if (first) { const dt = $('.sd-detail'); if (dt && !reduced()) dt.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        break;
      }
      case 'tnsug': tm.name = T().names[+d.i]; save(); renderPanel(); break;
      case 'size': tm.size = +d.i; resizeMembers(); save(); renderPanel(); break;
      case 'nicks': { const pool = pickNicks(); resizeMembers(); tm.members = tm.members.map((m, i) => m.trim() ? m : pool[i % pool.length]); save(); renderPanel(); break; }
      case 'nicks-clear': tm.members = tm.members.map(() => ''); save(); renderPanel(); break;
      case 'role': {
        const key = d.r, i = +d.i, r = tm.roles, prev = r[key];
        const other = ['leader', 'quality', 'media'].find(k => k !== key && r[k] === i);
        if (other) r[other] = prev;
        r[key] = i; save(); renderPanel(); break;
      }
      case 'crest': {
        tm.crest[d.k] = +d.i; save();
        const st = $('#sd-crest-stage'); if (st) { st.innerHTML = crest(tm.crest, 150); st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop'); }
        $$(`[data-act="crest"][data-k="${d.k}"]`).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.i === +d.i)));
        renderApp(); break;
      }
      case 'spin': {
        const wh = $('.sd-wheel'); if (!wh) break;
        demoK++; spinWheel(wh, tm.rot + demoK, `قائد الشهر ${monthOf(S.week) + demoK} (معاينة)`); break;
      }
      case 'launch': {
        const t = T(); resizeMembers();
        const pool = pickNicks();
        tm.members = tm.members.map((m, i) => m.trim() ? m : pool[i % pool.length]);
        if (!tm.name.trim()) tm.name = t.names[0];
        const first = !tm.launched;
        tm.launched = true; S.edit = false; S.sub = 0; demoK = 0;
        if (first) { feed(`تأسّس فريق «${tm.name}» (${t.short})`, 'win'); toast(`تأسّس فريق ${tm.name}`, 2800); setTimeout(() => boom($('.sd-ab-crest'), true), 160); }
        save(); render(); focusStage(); announce(first ? 'تأسّس الفريق' : 'حُفظت التعديلات'); break;
      }
      case 'edit': S.edit = true; S.sub = 1; save(); renderPanel(); focusStage(); break;
      case 'rotate-now': act(() => { tm.rot++; feed(`مُرّر التاج إلى ${mname(leaderIdx())}`, 'win'); }); setTimeout(() => boom($('.sd-wheel'), false), 80); break;
      case 'crisis': flipFx = true; act(() => { S.crisis = !S.crisis; feed(S.crisis ? 'وضع الأزمة: تحوّلت الأنشطة فوراً إلى تحديات رقمية تفاعلية' : 'عادت الأنشطة الميدانية', 'info'); }); announce(S.crisis ? 'تحولت كل التحديات إلى نسخ رقمية تفاعلية' : 'عادت التحديات الميدانية'); break;
      case 'chal': act(() => { const k = wk(S.week); if (k.ch === d.i) k.ch = null; else { k.ch = d.i; feed(`اخترتم تحدي «${chalOf(d.i).t}»`, 'info'); } }); setTimeout(() => { const m = $('#sd-mission'); if (m && !reduced()) m.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60); break;
      case 'step': act(() => { const k = wk(S.week); k.steps[+d.i] = k.steps[+d.i] ? 0 : 1; }); break;
      case 'proof-sim': act(() => { const k = wk(S.week); k.proof = simProofObj(chalOf(k.ch).p); feed('رُفع إثبات تجريبي', 'info'); }); break;
      case 'proof-clear': act(() => { const k = wk(S.week); k.proof = null; if (blobURL[S.week]) { URL.revokeObjectURL(blobURL[S.week]); delete blobURL[S.week]; } }); break;
      case 'pres': act(() => { const k = wk(S.week); k.present[d.i] = !k.present[d.i]; }); break;
      case 'pres-all': act(() => { const k = wk(S.week); for (let i = 0; i < N(); i++) k.present[i] = true; }); break;
      case 'init': act(() => { const k = wk(S.week); k.init = !k.init; if (k.init) feed('نفّذتم مبادرة مجتمعية مصغّرة (+25)', 'win'); }); break;
      case 'buddy': act(() => { const k = wk(S.week); if (k.buddy) k.buddy = null; else { const h = +($('[data-in="bh"]') || { value: 0 }).value, s = +($('[data-in="bs"]') || { value: 1 }).value; k.buddy = { h, s }; feed(`${mname(h)} رافق ${mname(s)} — وسام الرفيق التكافلي`, 'win'); } });
        if (wk(S.week).buddy) setTimeout(() => boom(a, false), 80); break;
      case 'close-week': openDialog(); break;
      case 'sim-week': autoWeek(); break;
      case 'dlg-x': closeDialog(); break;
      case 'dlg-next': closeDialog(); closeWeek(d.i); focusStage(); break;
      case 'settle': stop(); if (a.getAttribute('aria-disabled') === 'true' && !checking) settle(d.i); else if (!checking) settle(d.i); break;
      case 'fam-m': S.famSel = +d.i; survDraft = {}; save(); renderPanel(); break;
      case 'rep-mode': rec.mode = d.i; renderPanel(); break;
      case 'rep-text': {
        const txt = ($('[data-in="reptext"]') || { value: '' }).value.trim();
        if (!txt) { announce('اكتب سطراً واحداً على الأقل'); const ta = $('[data-in="reptext"]'); if (ta) ta.focus(); break; }
        act(() => { wk(S.week).rep[S.famSel] = { type: 'text', text: txt }; rec.text = ''; feed(`رفع ${mname(S.famSel)} تقريره المكتوب`, 'info'); }); break;
      }
      case 'rep-voice': act(() => { wk(S.week).rep[S.famSel] = { type: 'voice', dur: rec.dur, sim: rec.sim }; if (rec.url) voiceURL[S.week + ':' + S.famSel] = rec.url; rec.url = null; rec.st = 'idle'; feed(`رفع ${mname(S.famSel)} تقريره الصوتي`, 'info'); }); break;
      case 'rep-clear': act(() => { delete wk(S.week).rep[S.famSel]; }); break;
      case 'rec-start': recStart(); break;
      case 'rec-sim': rec.sim = true; rec.note = 'تسجيل تجريبي محاكى'; rec.st = 'rec'; rec.t0 = Date.now(); clearInterval(rec.tm); rec.tm = setInterval(() => { const s = Math.round((Date.now() - rec.t0) / 1000), el = $('[data-rec-time]'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500); renderPanel(); break;
      case 'rec-stop': recStop(); break;
      case 'rec-reset': recReset(); renderPanel(); break;
      case 'surv-clear': act(() => { delete wk(S.week).sur[S.famSel]; survDraft = {}; }); break;
      case 'fam-sim': act(() => { const k = wk(S.week), n = N(); for (let i = 0; i < n; i++) { if (!k.rep[i]) k.rep[i] = { type: 'text', text: 'طبّقتُ القيمة هذا الأسبوع. (تجريبي)' }; if (!k.sur[i]) k.sur[i] = { a: [0, 1, 0] }; } feed('شارك كل الأعضاء وأولياء أمورهم (محاكاة)', 'info'); }); break;
      case 'reset':
        if (confirmReset) { clearTimeout(confirmReset); confirmReset = 0; resetAll(); } else {
          a.textContent = 'اضغط مرة أخرى لتأكيد المسح'; a.classList.add('confirm');
          confirmReset = setTimeout(() => { confirmReset = 0; a.textContent = 'ابدأ من جديد'; a.classList.remove('confirm'); }, 4000);
        } break;
      default: break;
    }
  });
  function resetAll() {
    Object.values(blobURL).forEach(u => URL.revokeObjectURL(u)); Object.keys(blobURL).forEach(k => delete blobURL[k]);
    recReset(); rec.mode = 'text'; rec.text = '';
    store.del(); S = fresh(); demoK = 0; survDraft = {}; wDraft = { purpose: 0, amt: 60 }; checking = null; lastVault = '';
    closeDialog();
    const rb = $('.sd-reset'); if (rb) { rb.textContent = 'ابدأ من جديد'; rb.classList.remove('confirm'); }
    render(); focusStage(); announce('بدأت تجربة جديدة'); toast('بدأت تجربة جديدة', 1800);
  }

  /* inputs: no re-render while typing */
  root.addEventListener('input', e => {
    const el = e.target, d = el.dataset ? el.dataset.in : null;
    if (!d) return;
    if (d === 'tname') { S.team.name = el.value; save(); renderApp(); }
    else if (d === 'mname') { S.team.members[+el.dataset.i] = el.value; save(); const av2 = el.closest('.sd-mrow').querySelector('.sd-av'); if (av2) av2.textContent = initial(mname(+el.dataset.i)); }
    else if (d === 'amt') wDraft.amt = Math.max(0, Math.round(+el.value || 0));
    else if (d === 'reptext') rec.text = el.value;
  });
  root.addEventListener('change', e => {
    const el = e.target, d = el.dataset ? el.dataset.in : null;
    if (!d) return;
    if (d === 'file') {
      const f = el.files && el.files[0]; if (!f) return;
      act(() => {
        const k = wk(S.week);
        if (blobURL[S.week]) URL.revokeObjectURL(blobURL[S.week]);
        blobURL[S.week] = URL.createObjectURL(f);
        k.proof = { name: f.name, type: f.type || '', size: f.size, sim: false };
        feed('رُفع الإثبات (يبقى في المتصفح)', 'info');
      });
    } else if (d === 'purpose') wDraft.purpose = +el.value;
    else if (d === 'bh' || d === 'bs') { const k = wk(S.week); if (k.buddy) { k.buddy[d === 'bh' ? 'h' : 's'] = +el.value; save(); } }
    else if (d === 'sv') { survDraft[el.dataset.q] = +el.value; survDraft[+el.dataset.q] = +el.value; }
    else if (d === 'custody') {
      const W = wallet(); let v = Math.round(+el.value || 0); v = Math.max(W.held + W.spent, v);
      act(() => { S.wallet.custody = v; feed(`عُدّلت العهدة المسبقة إلى ${v}`, 'money'); });
    }
  });
  root.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.form === 'request') {
      const k = wk(S.week), c = k.ch && chalOf(k.ch), W = wallet(), amt = wDraft.amt;
      if (!c) { announce('اختر تحدي الأسبوع أولاً'); return; }
      if (!(amt > 0) || amt > W.avail) { announce('المبلغ غير صالح أو أكبر من المتاح'); toast('المبلغ أكبر من المتاح في العهدة', 2400); return; }
      coinFx = true;
      act(() => { S.wallet.seq++; S.wallet.ledger.push({ id: 'L' + S.wallet.seq, w: S.week, p: D.purposes[wDraft.purpose], amt, st: 'held' }); feed(`حُجز ${amt} للصرف — بانتظار الإنجاز والإثبات`, 'money'); });
      announce(`حُجز مبلغ ${amt}. يُقفل حتى يكتمل التحدي ويُرفع الإثبات`);
    } else if (f.dataset.form === 'survey') {
      if ([0, 1, 2].some(q => survDraft[q] === undefined)) { announce('أجب عن الأسئلة الثلاثة'); toast('أجب عن الأسئلة الثلاثة أولاً', 2200); return; }
      act(() => { wk(S.week).sur[S.famSel] = { a: [survDraft[0], survDraft[1], survDraft[2]] }; survDraft = {}; feed(`أجاب ولي أمر ${mname(S.famSel)} على الاستبيان`, 'info'); });
    } else if (f.dataset.form === 'custody') { /* handled on change */ }
  });
  // buttons inside forms that are not submit
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const dlg = $('#sd-dialog'); if (dlg && dlg.open) { e.preventDefault(); dlg.close(); } }
  });

  /* ---------------------------------------------------------------------------- boot ---------------------------------------------------------------------------- */
  window.YanabeeStudio = { state: () => JSON.parse(JSON.stringify(S)), version: 1 };
  render();
})();
