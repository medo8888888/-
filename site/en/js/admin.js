// @i18n-self — association admin panel (Arabic only). Every write goes through RLS-checked
// tables or SECURITY DEFINER RPCs that verify is_admin() server-side.
(() => {
  const root = document.querySelector('[data-admin]');
  if (!root || !window.TakamulSB) return;
  const { client: sb, esc, date, money, daysLeft, toast, retry, locale, printReceipt, printCard } = window.TakamulSB;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const drawer = document.querySelector('[data-drawer]');
  const ST = { pending: 'قيد المراجعة', approved: 'مقبول – بانتظار الدفع', active: 'فعّال', expired: 'منتهية', suspended: 'معلّق', rejected: 'مرفوض', draft: 'لم يُرسل' };
  const PAY = { pending: 'بانتظار التأكيد', approved: 'مؤكدة', rejected: 'مرفوضة' };
  const METHOD = { bank_transfer: 'تحويل بنكي', cash: 'نقداً', other: 'أخرى' };
  const SEV = { notice: 'تنبيه', warning: 'إنذار', serious: 'مخالفة جسيمة' };
  const view = v => $$('[data-view]').forEach(x => { x.hidden = x.dataset.view !== v; });
  const eff = p => (!p.submitted_at && p.status === 'pending' ? 'draft'
    : p.status === 'active' && p.expires_at && daysLeft(p.expires_at) < 0 ? 'expired' : p.status);
  const badge = (k, n) => $$(`[data-badge=${k}]`).forEach(b => { b.hidden = !n; b.textContent = n; });
  const stB = s => `<span class="st-badge" data-st="${s}">${esc(ST[s] || s)}</span>`;
  let members = [], payments = [], events = [], requests = [], settings = {}, me = null;
  const RQK = { certificate: 'شهادة عضوية', data_change: 'تعديل بيانات', complaint: 'شكوى', suggestion: 'اقتراح', other: 'أخرى' };
  const RQS = { open: 'قيد المتابعة', answered: 'تم الرد', closed: 'مغلق' };
  const EVS = { open: 'التسجيل مفتوح', closed: 'التسجيل مغلق', cancelled: 'ملغى' };
  const dtf = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  let bootedFor;
  sb.auth.onAuthStateChange((_e, session) => {
    const key = session ? session.user.id : null;
    if (key === bootedFor) return;
    bootedFor = key;
    setTimeout(() => boot(session), 0);
  });

  async function boot(session) {
    if (!session) { view('denied'); return; }
    const { data } = await retry(() => sb.from('profiles').select('*').eq('id', session.user.id).single());
    me = data;
    if (!me || me.role !== 'admin') { view('denied'); return; }
    view('app');
    $$('[data-me=name]').forEach(x => { x.textContent = me.full_name || session.user.email; });
    $$('[data-me=initial]').forEach(x => { x.textContent = (me.full_name || '?').charAt(0); });
    await loadAll();
    go((location.hash || '').slice(1) || 'stats');
  }

  async function loadAll() {
    const [m, p, v, s, ev, rq] = await Promise.all([
      retry(() => sb.from('profiles').select('*').order('created_at', { ascending: false })),
      retry(() => sb.from('payments').select('*').order('created_at', { ascending: false })),
      retry(() => sb.from('violations').select('*').order('issued_at', { ascending: false })),
      retry(() => sb.from('settings').select('*').eq('id', 1).single()),
      retry(() => sb.rpc('list_events')),
      retry(() => sb.from('requests').select('*').order('created_at', { ascending: false })),
    ]);
    members = m.data || []; payments = p.data || []; settings = s.data || {}; events = ev.data || []; requests = rq.data || [];
    renderStats(); renderReports(); renderApplications(); renderMembers(); renderPayments(); renderViolations(v.data || []);
    renderEvents(); renderRequests(); fillSettings(settings); fillNotify();
  }
  const name = id => { const x = members.find(m => m.id === id); return x ? (x.full_name || x.email) : '—'; };

  /* ---------------- stats ---------------- */
  function renderStats() {
    const c = k => members.filter(m => eff(m) === k).length;
    const pend = payments.filter(p => p.status === 'pending').length;
    const soon = members.filter(m => m.status === 'active' && m.expires_at && daysLeft(m.expires_at) >= 0 && daysLeft(m.expires_at) <= 30);
    const total = payments.filter(p => p.status === 'approved' && new Date(p.paid_on).getFullYear() === new Date().getFullYear())
      .reduce((a, p) => { a[p.currency] = (a[p.currency] || 0) + +p.amount; return a; }, {});
    const k = [
      ['users', 'إجمالي الأعضاء', members.filter(m => m.submitted_at).length, 'members'],
      ['check', 'عضويات فعّالة', c('active'), 'members'],
      ['file', 'طلبات بانتظار المراجعة', c('pending'), 'applications'],
      ['coins', 'دفعات بانتظار التأكيد', pend, 'payments'],
      ['clock', 'تنتهي خلال 30 يوماً', soon.length, 'stats'],
      ['heart', 'تحصيل هذا العام', Object.entries(total).map(([cur, v]) => money(v, cur)).join(' + ') || '0', 'payments'],
    ];
    $('[data-kpis]').innerHTML = k.map(([i, t, n, g]) => `<button type="button" class="kpi" data-go="${g}"><b>${esc(n)}</b><span>${esc(t)}</span></button>`).join('');
    $('[data-list=expiring]').innerHTML = soon.length ? soon.map(m =>
      `<tr><td>${esc(m.full_name)}</td><td>${esc(m.member_no || '—')}</td><td>${date(m.expires_at)} <small>(${daysLeft(m.expires_at)} يوماً)</small></td>` +
      `<td><button type="button" class="btn btn-soft btn-sm" data-remind="${m.id}">إرسال تذكير</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">لا توجد عضويات قريبة الانتهاء.</td></tr>';
    badge('applications', c('pending')); badge('payments', pend); badge('requests', requests.filter(r => r.status === 'open').length);
  }

  /* ---------------- reports (single-series bar charts, values always printed) ---------------- */
  const count = (arr, key) => arr.reduce((a, x) => { const k = key(x); if (k) a[k] = (a[k] || 0) + 1; return a; }, {});
  function hbars(title, obj, top = 8) {
    let rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (rows.length > top) { const rest = rows.slice(top - 1).reduce((a, r) => a + r[1], 0); rows = rows.slice(0, top - 1).concat([['أخرى', rest]]); }
    const max = Math.max(1, ...rows.map(r => r[1]));
    return `<figure class="rp"><figcaption>${esc(title)}</figcaption>` + (rows.length
      ? `<ul class="hb">${rows.map(([k, v]) => `<li title="${esc(k)}: ${v}"><span class="hb-l">${esc(k)}</span><span class="hb-t"><i style="--w:${(v / max * 100).toFixed(1)}%"></i></span><b>${v}</b></li>`).join('')}</ul>`
      : '<p class="empty">لا توجد بيانات بعد.</p>') + '</figure>';
  }
  function renderReports() {
    const sub = members.filter(m => m.submitted_at);
    const byStatus = {}; sub.forEach(m => { const k = ST[eff(m)]; byStatus[k] = (byStatus[k] || 0) + 1; });
    const interests = {}; sub.forEach(m => (m.interests || []).forEach(i => { interests[i] = (interests[i] || 0) + 1; }));
    // monthly collection, last 12 months, in the association's main currency
    const cur = settings.currency || 'TRY', months = [];
    const d0 = new Date(); d0.setDate(1);
    for (let i = 11; i >= 0; i--) { const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString(locale, { month: 'short' }), v: 0 }); }
    payments.filter(p => p.status === 'approved' && p.currency === cur).forEach(p => { const mo = months.find(x => x.key === String(p.paid_on).slice(0, 7)); if (mo) mo.v += +p.amount; });
    const max = Math.max(1, ...months.map(x => x.v)), sum = months.reduce((a, x) => a + x.v, 0);
    const att = {}; events.forEach(e => { if (new Date(e.starts_at) < new Date() && e.registered) att[e.title] = e.registered; });
    $('[data-reports]').innerHTML =
      `<figure class="rp rp-wide"><figcaption>التحصيل الشهري — آخر 12 شهراً (${esc(cur)}) <small>الإجمالي: ${esc(money(sum, cur))}</small></figcaption>` +
      `<div class="cols">${months.map(x => `<div class="col" title="${esc(x.label)}: ${esc(money(x.v, cur))}"><span class="col-v">${x.v ? esc(new Intl.NumberFormat(locale, { notation: 'compact' }).format(x.v)) : ''}</span><span class="col-t"><i style="--h:${(x.v / max * 100).toFixed(1)}%"></i></span><small>${esc(x.label)}</small></div>`).join('')}</div></figure>` +
      hbars('الأعضاء حسب الحالة', byStatus) +
      hbars('الأعضاء حسب المدينة', count(sub, m => (m.city || '').trim())) +
      hbars('مجالات المشاركة', interests) +
      hbars('الجنسيات', count(sub, m => (m.nationality || '').trim())) +
      hbars('المسجّلون في الأنشطة السابقة', att, 6);
  }
  root.addEventListener('click', async e => {
    const r = e.target.closest('[data-remind]'); if (!r) return;
    const m = members.find(x => x.id === r.dataset.remind);
    const { error } = await sb.rpc('send_notification', { p_member: m.id, p_title: 'تذكير بتجديد الاشتراك',
      p_body: `تنتهي عضويتك في ${m.expires_at}. يرجى تجديد الاشتراك السنوي من صفحة الاشتراكات.` });
    toast(error ? 'تعذّر الإرسال' : 'تم إرسال التذكير ✓', error ? 'err' : 'ok');
  });

  /* ---------------- applications ---------------- */
  const detail = m => {
    const rows = [['البريد', m.email], ['الجوال', m.phone], ['الجنسية', m.nationality], ['رقم الهوية / الإقامة', m.id_number], ['تاريخ الميلاد', m.birth_date],
      ['الإقامة', m.residence_status], ['المدينة', m.city], ['العنوان', m.address], ['المهنة', m.occupation], ['المؤهل', m.education],
      ['مجالات المشاركة', (m.interests || []).join('، ')], ['المهارات', m.skills], ['تاريخ الإرسال', date(m.submitted_at)]];
    return `<dl class="ad-dl">${rows.filter(r => r[1]).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  };
  function renderApplications() {
    const list = members.filter(m => eff(m) === 'pending');
    $('[data-list=applications]').innerHTML = list.length ? list.map(m =>
      `<article class="ad-card"><header><b>${esc(m.full_name)}</b>${stB('pending')}</header>${detail(m)}` +
      `<div class="ad-actions"><button type="button" class="btn btn-gold" data-app="${m.id}" data-ok="1">قبول الطلب</button>` +
      `<button type="button" class="btn btn-soft" data-app="${m.id}" data-ok="0">رفض مع ملاحظة</button></div></article>`).join('')
      : '<p class="empty">لا توجد طلبات جديدة.</p>';
  }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-app]'); if (!b) return;
    const ok = b.dataset.ok === '1';
    const note = ok ? null : prompt('سبب الرفض / الملاحظة للعضو:');
    if (!ok && note === null) return;
    b.disabled = true;
    const { error } = await sb.rpc('review_application', { p_member: b.dataset.app, p_approve: ok, p_note: note });
    toast(error ? 'تعذّر الحفظ' : ok ? 'تم قبول الطلب وإشعار العضو ✓' : 'تم الرفض وإشعار العضو', error ? 'err' : 'ok');
    loadAll();
  });

  /* ---------------- members ---------------- */
  function renderMembers() {
    const q = ($('[data-q]').value || '').trim().toLowerCase(), f = $('[data-status]').value;
    const list = members.filter(m => m.submitted_at || m.status !== 'pending')
      .filter(m => !f || eff(m) === f)
      .filter(m => !q || [m.full_name, m.email, m.phone, String(m.member_no || '')].some(x => (x || '').toLowerCase().includes(q)));
    $('[data-list=members]').innerHTML = list.length ? list.map(m =>
      `<tr class="ad-row" data-member="${m.id}" tabindex="0"><td>${esc(m.member_no || '—')}</td><td><b>${esc(m.full_name || m.email)}</b><br><small>${esc(m.email)}</small></td>` +
      `<td dir="ltr">${esc(m.phone || '')}</td><td>${stB(eff(m))}</td><td>${date(m.joined_at)}</td><td>${date(m.expires_at)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">لا توجد نتائج.</td></tr>';
  }
  $('[data-q]').addEventListener('input', renderMembers);
  $('[data-status]').addEventListener('change', renderMembers);
  $('[data-export]').addEventListener('click', () => {
    const cols = ['member_no', 'full_name', 'email', 'phone', 'nationality', 'city', 'occupation', 'status', 'joined_at', 'expires_at'];
    const csv = [cols.join(',')].concat(members.filter(m => m.submitted_at).map(m => cols.map(c => `"${String(c === 'status' ? ST[eff(m)] : m[c] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `takamul-members-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  });
  root.addEventListener('click', e => { const r = e.target.closest('[data-member]'); if (r) openMember(r.dataset.member); });
  root.addEventListener('keydown', e => { const r = e.target.closest('[data-member]'); if (r && e.key === 'Enter') openMember(r.dataset.member); });

  async function openMember(id) {
    const m = members.find(x => x.id === id); if (!m) return;
    const [{ data: v }] = await Promise.all([sb.from('violations').select('*').eq('member_id', id).order('issued_at', { ascending: false })]);
    const pays = payments.filter(p => p.member_id === id);
    const s = eff(m);
    let photo = null;
    if (m.avatar_path) { const { data } = await sb.storage.from('avatars').createSignedUrl(m.avatar_path, 600); photo = data ? data.signedUrl : null; }
    const { data: regs } = await sb.from('event_registrations').select('event_id, attended, cancelled_at').eq('member_id', id);
    const done = (regs || []).filter(r => r.attended && !r.cancelled_at);
    const hrs = done.reduce((a, r) => { const e = events.find(x => x.id === r.event_id); return a + (e ? +e.hours || 0 : 0); }, 0);
    const mrq = requests.filter(r => r.member_id === id);
    $('[data-drawer-body]', document).innerHTML = `
      <header class="dr-head"><span class="pt-avatar dr-photo">${photo ? `<img src="${esc(photo)}" alt="">` : esc((m.full_name || '?').charAt(0))}</span><div><h2>${esc(m.full_name || m.email)}</h2><p>${stB(s)} · رقم العضوية: <b>${esc(m.member_no || '—')}</b> · ينتهي: <b>${date(m.expires_at)}</b></p></div>
        <button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header>
      ${detail(m)}
      <div class="ad-actions">
        ${s === 'pending' ? `<button class="btn btn-gold" data-app="${m.id}" data-ok="1">قبول الطلب</button>` : ''}
        ${m.status !== 'suspended' && ['active', 'approved', 'expired'].includes(s) ? `<button class="btn btn-soft" data-st-set="suspended" data-id="${m.id}">تعليق العضوية</button>` : ''}
        ${m.status === 'suspended' ? `<button class="btn btn-soft" data-st-set="active" data-id="${m.id}">إعادة التفعيل</button>` : ''}
        ${m.member_no ? `<button class="btn btn-soft" data-card="${m.id}">طباعة بطاقة العضوية</button>` : ''}
      </div>
      <p class="dr-sum">الأنشطة: حضر <b>${done.length}</b> من <b>${(regs || []).filter(r => !r.cancelled_at).length}</b> تسجيلاً · <b>${hrs}</b> ساعة تطوعية · الطلبات: <b>${mrq.length}</b></p>
      <h3>تسجيل دفعة (نقداً / يدوياً)</h3>
      <form class="pt-form inline" data-cash="${m.id}"><input name="amount" type="number" min="1" step="0.01" placeholder="المبلغ" required dir="ltr">
        <select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select><input name="paid_on" type="date" required dir="ltr" value="${new Date().toISOString().slice(0, 10)}">
        <button class="btn btn-gold" type="submit">تسجيل وتأكيد</button></form>
      <h3>الدفعات</h3>
      <ul class="dr-list">${pays.map(p => `<li>${esc(money(p.amount, p.currency))} · ${date(p.paid_on)} · ${esc(PAY[p.status])}${p.period_end ? ` · حتى ${date(p.period_end)}` : ''}${p.receipt_no ? ` <button type="button" class="pt-link" data-print-receipt="${p.id}">سند #${p.receipt_no}</button>` : ''}</li>`).join('') || '<li class="empty">لا توجد دفعات.</li>'}</ul>
      <h3>تسجيل ملاحظة / مخالفة</h3>
      <form class="pt-form" data-viol="${m.id}"><div class="fgrid">
        <label class="fld"><span>العنوان</span><input name="title" required maxlength="160"></label>
        <label class="fld"><span>الدرجة</span><select name="sev"><option value="notice">تنبيه</option><option value="warning">إنذار</option><option value="serious">مخالفة جسيمة</option></select></label>
        <label class="fld full"><span>التفاصيل</span><textarea name="details" rows="2"></textarea></label></div>
        <button class="btn btn-soft" type="submit">تسجيل وإشعار العضو</button></form>
      <ul class="dr-list">${(v || []).map(x => `<li>${esc(SEV[x.severity])}: ${esc(x.title)} · ${date(x.issued_at)} · ${x.status === 'open' ? 'مفتوحة' : 'مغلقة'}${x.member_response ? `<br><small>ردّ العضو: ${esc(x.member_response)}</small>` : ''}</li>`).join('')}</ul>
      <h3>إرسال إشعار لهذا العضو</h3>
      <form class="pt-form" data-note="${m.id}"><label class="fld"><span>العنوان</span><input name="title" required></label>
        <label class="fld"><span>النص</span><textarea name="body" rows="2"></textarea></label><button class="btn btn-soft" type="submit">إرسال</button></form>`;
    if (!drawer.open) drawer.showModal();
  }
  drawer.addEventListener('click', async e => {
    if (e.target === drawer || e.target.closest('[data-close]')) { drawer.close(); return; }
    const cd = e.target.closest('[data-card]');
    if (cd) { const m = members.find(x => x.id === cd.dataset.card); const img = drawer.querySelector('.dr-photo img'); printCard(m, img ? img.src : null); return; }
    const pr = e.target.closest('[data-print-receipt]');
    if (pr) { const p = payments.find(x => x.id === pr.dataset.printReceipt); if (p) printReceipt(p, members.find(m => m.id === p.member_id) || {}); return; }
    const at = e.target.closest('[data-att]');
    if (at) {
      const { error } = await sb.rpc('set_attendance', { p_event: at.dataset.ev, p_member: at.dataset.att, p_attended: at.checked });
      toast(error ? 'تعذّر الحفظ' : 'تم تسجيل الحضور ✓', error ? 'err' : 'ok'); return;
    }
    const st = e.target.closest('[data-st-set]');
    if (st) {
      const note = st.dataset.stSet === 'suspended' ? prompt('سبب التعليق (يظهر للعضو):') : null;
      if (st.dataset.stSet === 'suspended' && note === null) return;
      const { error } = await sb.rpc('set_member_status', { p_member: st.dataset.id, p_status: st.dataset.stSet, p_note: note });
      toast(error ? 'تعذّر الحفظ' : 'تم التحديث ✓', error ? 'err' : 'ok'); await loadAll(); openMember(st.dataset.id);
    }
    const ap = e.target.closest('[data-app]');
    if (ap) { const { error } = await sb.rpc('review_application', { p_member: ap.dataset.app, p_approve: true, p_note: null }); toast(error ? 'تعذّر' : 'تم القبول ✓', error ? 'err' : 'ok'); await loadAll(); openMember(ap.dataset.app); }
  });
  drawer.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    let error = null, id = null;
    if (f.dataset.cash) {
      id = f.dataset.cash;
      const ins = await sb.from('payments').insert({ member_id: id, amount: +f.amount.value, currency: f.currency.value, paid_on: f.paid_on.value, method: 'cash' }).select('id').single();
      error = ins.error || (await sb.rpc('review_payment', { p_payment: ins.data.id, p_approve: true, p_note: 'دفعة مسجّلة من الإدارة' })).error;
    } else if (f.dataset.viol) {
      id = f.dataset.viol;
      ({ error } = await sb.rpc('issue_violation', { p_member: id, p_title: f.title.value.trim(), p_details: f.details.value.trim(), p_severity: f.sev.value }));
    } else if (f.dataset.note) {
      id = f.dataset.note;
      ({ error } = await sb.rpc('send_notification', { p_member: id, p_title: f.title.value.trim(), p_body: f.body.value.trim() }));
    }
    toast(error ? 'تعذّر الحفظ: ' + error.message : 'تم ✓', error ? 'err' : 'ok');
    if (!error) { await loadAll(); openMember(id); }
  });

  /* ---------------- payments ---------------- */
  function renderPayments() {
    const f = $('[data-pay-status]').value;
    const list = payments.filter(p => !f || p.status === f);
    $('[data-list=payments]').innerHTML = list.length ? list.map(p =>
      `<tr><td><button type="button" class="pt-link" data-member="${p.member_id}">${esc(name(p.member_id))}</button></td><td><b>${esc(money(p.amount, p.currency))}</b></td><td>${date(p.paid_on)}</td>` +
      `<td>${esc(METHOD[p.method] || p.method)}${p.reference ? `<br><small dir="ltr">${esc(p.reference)}</small>` : ''}</td>` +
      `<td>${p.receipt_path ? `<button type="button" class="btn btn-soft btn-sm" data-receipt="${esc(p.receipt_path)}">عرض</button>` : '—'}</td>` +
      `<td><span class="st-badge" data-st="pay-${p.status}">${esc(PAY[p.status])}</span></td>` +
      `<td>${p.status === 'pending' ? `<button type="button" class="btn btn-gold btn-sm" data-pay="${p.id}" data-ok="1">تأكيد</button> <button type="button" class="btn btn-soft btn-sm" data-pay="${p.id}" data-ok="0">رفض</button>` : esc(p.admin_note || '')}` +
      `${p.receipt_no ? ` <button type="button" class="btn btn-soft btn-sm" data-print-receipt="${p.id}">سند قبض #${p.receipt_no}</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">لا توجد دفعات.</td></tr>';
  }
  $('[data-pay-status]').addEventListener('change', renderPayments);
  root.addEventListener('click', async e => {
    const pr = e.target.closest('[data-print-receipt]');
    if (pr) { const p = payments.find(x => x.id === pr.dataset.printReceipt); if (p) printReceipt(p, members.find(m => m.id === p.member_id) || {}); return; }
    const r = e.target.closest('[data-receipt]');
    if (r) { const { data } = await sb.storage.from('receipts').createSignedUrl(r.dataset.receipt, 300); if (data) window.open(data.signedUrl, '_blank', 'noopener'); return; }
    const b = e.target.closest('[data-pay]'); if (!b) return;
    const ok = b.dataset.ok === '1';
    const note = ok ? null : prompt('سبب الرفض (يظهر للعضو):');
    if (!ok && note === null) return;
    b.disabled = true;
    const { error } = await sb.rpc('review_payment', { p_payment: b.dataset.pay, p_approve: ok, p_note: note });
    toast(error ? 'تعذّر: ' + error.message : ok ? 'تم تأكيد الدفعة وتجديد العضوية ✓' : 'تم الرفض وإشعار العضو', error ? 'err' : 'ok');
    loadAll();
  });

  /* ---------------- violations ---------------- */
  function renderViolations(list) {
    $('[data-list=violations]').innerHTML = list.length ? list.map(v =>
      `<article class="vl" data-sev="${v.severity}"><header><span class="st-badge" data-st="sev-${v.severity}">${esc(SEV[v.severity])}</span>` +
      `<b>${esc(name(v.member_id))}</b><small>${date(v.issued_at)}</small></header><h3>${esc(v.title)}</h3>${v.details ? `<p>${esc(v.details)}</p>` : ''}` +
      `${v.member_response ? `<div class="vl-reply"><b>ردّ العضو:</b> ${esc(v.member_response)}</div>` : ''}` +
      `${v.status === 'open' ? `<button type="button" class="btn btn-soft btn-sm" data-resolve="${v.id}">إغلاق الملاحظة</button>` : '<span class="st-badge" data-st="v-resolved">مغلقة</span>'}</article>`).join('')
      : '<p class="empty">لا توجد ملاحظات. يمكنك تسجيل ملاحظة من صفحة العضو.</p>';
  }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-resolve]'); if (!b) return;
    const { error } = await sb.rpc('resolve_violation', { p_violation: b.dataset.resolve });
    toast(error ? 'تعذّر' : 'تم الإغلاق ✓', error ? 'err' : 'ok'); loadAll();
  });

  /* ---------------- activities ---------------- */
  function renderEvents() {
    $('[data-list=events]').innerHTML = events.length ? events.map(e =>
      `<tr><td><b>${esc(e.title)}</b>${e.place ? `<br><small>${esc(e.place)}</small>` : ''}</td><td>${esc(dtf.format(new Date(e.starts_at)))}</td>` +
      `<td><button type="button" class="pt-link" data-regs="${e.id}">${e.registered}${e.capacity ? ' / ' + e.capacity : ''}</button></td>` +
      `<td><span class="st-badge" data-st="${e.status === 'open' ? 'active' : e.status === 'cancelled' ? 'rejected' : 'draft'}">${esc(EVS[e.status])}</span></td>` +
      `<td class="nowrap"><button type="button" class="btn btn-soft btn-sm" data-regs="${e.id}">المسجّلون والحضور</button>` +
      `${e.status === 'open' ? ` <button type="button" class="btn btn-soft btn-sm" data-ev-st="closed" data-id="${e.id}">إغلاق التسجيل</button>` : ''}` +
      `${e.status === 'closed' ? ` <button type="button" class="btn btn-soft btn-sm" data-ev-st="open" data-id="${e.id}">فتح التسجيل</button>` : ''}` +
      `${e.status !== 'cancelled' && new Date(e.starts_at) > new Date() ? ` <button type="button" class="btn btn-soft btn-sm" data-ev-st="cancelled" data-id="${e.id}">إلغاء النشاط</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">لا توجد أنشطة بعد. أضف أول نشاط من النموذج أعلاه.</td></tr>';
  }
  $('[data-form=event]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; if (!f.reportValidity()) return;
    const iso = v => (v ? new Date(v).toISOString() : null);
    const row = { title: f.title.value.trim(), starts_at: iso(f.starts_at.value), ends_at: iso(f.ends_at.value), place: f.place.value.trim() || null,
      capacity: f.capacity.value ? +f.capacity.value : null, hours: +f.hours.value || 0, description: f.description.value.trim() || null, created_by: me.id };
    const { error } = await sb.from('events').insert(row);
    if (error) { toast('تعذّر الحفظ: ' + error.message, 'err'); return; }
    if (f.announce.checked) {
      await sb.rpc('send_notification', { p_member: null, p_title: 'نشاط جديد: ' + row.title,
        p_body: `${dtf.format(new Date(row.starts_at))}${row.place ? ' · ' + row.place : ''}. سجّل من صفحة «الأنشطة والفعاليات» في حسابك.` });
    }
    toast('تمت إضافة النشاط ✓'); f.reset(); loadAll();
  });
  root.addEventListener('click', async e => {
    const st = e.target.closest('[data-ev-st]');
    if (st) {
      const ev = events.find(x => x.id === st.dataset.id);
      if (st.dataset.evSt === 'cancelled' && !confirm('إلغاء النشاط وإشعار المسجّلين؟')) return;
      const { error } = await sb.from('events').update({ status: st.dataset.evSt }).eq('id', st.dataset.id);
      if (!error && st.dataset.evSt === 'cancelled') {
        const { data: regs } = await sb.from('event_registrations').select('member_id').eq('event_id', ev.id).is('cancelled_at', null);
        await Promise.all((regs || []).map(r => sb.rpc('send_notification', { p_member: r.member_id, p_title: 'تم إلغاء نشاط: ' + ev.title, p_body: 'نعتذر عن إلغاء النشاط. سنُعلمك بالأنشطة القادمة.' })));
      }
      toast(error ? 'تعذّر الحفظ' : 'تم التحديث ✓', error ? 'err' : 'ok'); loadAll(); return;
    }
    const rg = e.target.closest('[data-regs]'); if (rg) openEvent(rg.dataset.regs);
  });
  async function openEvent(id) {
    const ev = events.find(x => x.id === id); if (!ev) return;
    const { data } = await sb.from('event_registrations').select('*').eq('event_id', id).is('cancelled_at', null).order('registered_at');
    const regs = data || [];
    $('[data-drawer-body]', document).innerHTML = `
      <header class="dr-head"><div><h2>${esc(ev.title)}</h2><p>${esc(dtf.format(new Date(ev.starts_at)))}${ev.place ? ' · ' + esc(ev.place) : ''} · ${regs.length}${ev.capacity ? ' / ' + ev.capacity : ''} مسجّل</p></div>
        <button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header>
      ${ev.description ? `<p>${esc(ev.description)}</p>` : ''}
      <h3>المسجّلون — علّم من حضر (تُحتسب ${esc(+ev.hours)} ساعة تطوعية للحاضر)</h3>
      <ul class="dr-list att-list">${regs.map(r => { const m = members.find(x => x.id === r.member_id) || {}; return `<li><label class="agree"><input type="checkbox" data-att="${r.member_id}" data-ev="${id}" ${r.attended ? 'checked' : ''}><span><b>${esc(m.full_name || m.email || '—')}</b> ${m.member_no ? '· ' + m.member_no : ''} <small dir="ltr">${esc(m.phone || '')}</small></span></label></li>`; }).join('') || '<li class="empty">لا يوجد مسجّلون بعد.</li>'}</ul>
      ${regs.length ? `<button type="button" class="btn btn-soft" data-ev-csv="${id}">تصدير القائمة CSV</button>` : ''}`;
    if (!drawer.open) drawer.showModal();
  }
  drawer.addEventListener('click', async e => {
    const b = e.target.closest('[data-ev-csv]'); if (!b) return;
    const { data } = await sb.from('event_registrations').select('*').eq('event_id', b.dataset.evCsv).is('cancelled_at', null);
    const rows = (data || []).map(r => { const m = members.find(x => x.id === r.member_id) || {}; return [m.member_no, m.full_name, m.phone, m.email, r.attended ? 'حضر' : '']; });
    const csv = [['رقم العضوية', 'الاسم', 'الجوال', 'البريد', 'الحضور']].concat(rows).map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })); a.download = 'takamul-activity.csv'; a.click();
  });

  /* ---------------- member requests ---------------- */
  function renderRequests() {
    const f = $('[data-rq-status]').value;
    const list = requests.filter(r => !f || r.status === f);
    $('[data-list=requests]').innerHTML = list.length ? list.map(r =>
      `<article class="rq" data-st="${r.status}"><header><span class="st-badge" data-st="rq-${r.status}">${esc(RQS[r.status])}</span><span class="st-badge">${esc(RQK[r.kind])}</span>` +
      `<button type="button" class="pt-link" data-member="${r.member_id}">${esc(name(r.member_id))}</button><small>${date(r.created_at)}</small></header>` +
      `<h3>${esc(r.subject)}</h3><p>${esc(r.body)}</p>` +
      `${r.admin_reply ? `<div class="vl-reply"><b>الرد:</b> ${esc(r.admin_reply)}</div>` : ''}` +
      `${r.status !== 'closed' ? `<form class="pt-form rq-reply" data-rq="${r.id}"><textarea name="reply" rows="2" placeholder="اكتب الرد للعضو…"></textarea>` +
        `<div class="row-btns"><button class="btn btn-gold btn-sm" type="submit" name="act" value="reply">إرسال الرد</button><button class="btn btn-soft btn-sm" type="submit" name="act" value="close">إرسال وإغلاق</button></div></form>` : ''}</article>`).join('')
      : '<p class="empty">لا توجد طلبات في هذا التصنيف.</p>';
  }
  $('[data-rq-status]').addEventListener('change', renderRequests);
  $('[data-list=requests]').addEventListener('submit', async e => {
    const f = e.target.closest('[data-rq]'); if (!f) return; e.preventDefault();
    const close = e.submitter && e.submitter.value === 'close';
    if (!close && !f.reply.value.trim()) { f.reply.focus(); return; }
    const { error } = await sb.rpc('reply_request', { p_request: f.dataset.rq, p_reply: f.reply.value.trim(), p_close: close });
    toast(error ? 'تعذّر الإرسال' : 'تم إرسال الرد وإشعار العضو ✓', error ? 'err' : 'ok'); if (!error) loadAll();
  });

  /* ---------------- notify + settings ---------------- */
  function fillNotify() {
    const sel = $('[data-form=notify]').to;
    sel.innerHTML = '<option value="">جميع الأعضاء</option>' + members.filter(m => m.submitted_at).map(m => `<option value="${m.id}">${esc(m.full_name)} ${m.member_no ? '(' + m.member_no + ')' : ''}</option>`).join('');
  }
  $('[data-form=notify]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    const { error } = await sb.rpc('send_notification', { p_member: f.to.value || null, p_title: f.title.value.trim(), p_body: f.body.value.trim() });
    toast(error ? 'تعذّر الإرسال' : 'تم إرسال الإشعار ✓', error ? 'err' : 'ok'); if (!error) f.reset();
  });
  function fillSettings(s) { const f = $('[data-form=settings]'); ['annual_fee', 'currency', 'bank_name', 'account_holder', 'iban', 'payment_note'].forEach(k => { if (s[k] != null) f[k].value = s[k]; }); }
  $('[data-form=settings]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    const { error } = await sb.from('settings').update({ annual_fee: +f.annual_fee.value || 0, currency: f.currency.value, bank_name: f.bank_name.value.trim() || null,
      account_holder: f.account_holder.value.trim() || null, iban: f.iban.value.trim() || null, payment_note: f.payment_note.value.trim() || null, updated_at: new Date().toISOString() }).eq('id', 1);
    toast(error ? 'تعذّر الحفظ' : 'تم حفظ الإعدادات ✓', error ? 'err' : 'ok');
  });
  $('[data-refresh]').addEventListener('click', loadAll);

  /* ---------------- navigation ---------------- */
  function go(k) {
    if (!$(`[data-panel="${k}"]`)) k = 'stats';
    $$('.pt-tab[data-tab]').forEach(t => t.classList.toggle('is-on', t.dataset.tab === k));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== k; });
    if (history.replaceState) history.replaceState(null, '', '#' + k);
  }
  root.addEventListener('click', e => { const t = e.target.closest('[data-tab], [data-go]'); if (t) go(t.dataset.tab || t.dataset.go); });
})();
