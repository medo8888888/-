// @i18n-self — association admin panel (Arabic only). Every write goes through RLS-checked
// tables or SECURITY DEFINER RPCs that verify is_admin() server-side.
(() => {
  const root = document.querySelector('[data-admin]');
  if (!root || !window.TakamulSB) return;
  const { client: sb, esc, date, money, daysLeft, toast, retry } = window.TakamulSB;
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
  let members = [], payments = [], me = null;

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
    const [m, p, v, s] = await Promise.all([
      retry(() => sb.from('profiles').select('*').order('created_at', { ascending: false })),
      retry(() => sb.from('payments').select('*').order('created_at', { ascending: false })),
      retry(() => sb.from('violations').select('*').order('issued_at', { ascending: false })),
      retry(() => sb.from('settings').select('*').eq('id', 1).single()),
    ]);
    members = m.data || []; payments = p.data || [];
    renderStats(); renderApplications(); renderMembers(); renderPayments(); renderViolations(v.data || []); fillSettings(s.data || {}); fillNotify();
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
    badge('applications', c('pending')); badge('payments', pend);
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
    $('[data-drawer-body]', document).innerHTML = `
      <header class="dr-head"><div><h2>${esc(m.full_name || m.email)}</h2><p>${stB(s)} · رقم العضوية: <b>${esc(m.member_no || '—')}</b> · ينتهي: <b>${date(m.expires_at)}</b></p></div>
        <button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button></header>
      ${detail(m)}
      <div class="ad-actions">
        ${s === 'pending' ? `<button class="btn btn-gold" data-app="${m.id}" data-ok="1">قبول الطلب</button>` : ''}
        ${m.status !== 'suspended' && ['active', 'approved', 'expired'].includes(s) ? `<button class="btn btn-soft" data-st-set="suspended" data-id="${m.id}">تعليق العضوية</button>` : ''}
        ${m.status === 'suspended' ? `<button class="btn btn-soft" data-st-set="active" data-id="${m.id}">إعادة التفعيل</button>` : ''}
      </div>
      <h3>تسجيل دفعة (نقداً / يدوياً)</h3>
      <form class="pt-form inline" data-cash="${m.id}"><input name="amount" type="number" min="1" step="0.01" placeholder="المبلغ" required dir="ltr">
        <select name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select><input name="paid_on" type="date" required dir="ltr" value="${new Date().toISOString().slice(0, 10)}">
        <button class="btn btn-gold" type="submit">تسجيل وتأكيد</button></form>
      <h3>الدفعات</h3>
      <ul class="dr-list">${pays.map(p => `<li>${esc(money(p.amount, p.currency))} · ${date(p.paid_on)} · ${esc(PAY[p.status])}${p.period_end ? ` · حتى ${date(p.period_end)}` : ''}</li>`).join('') || '<li class="empty">لا توجد دفعات.</li>'}</ul>
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
      `<td>${p.status === 'pending' ? `<button type="button" class="btn btn-gold btn-sm" data-pay="${p.id}" data-ok="1">تأكيد</button> <button type="button" class="btn btn-soft btn-sm" data-pay="${p.id}" data-ok="0">رفض</button>` : esc(p.admin_note || '')}</td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">لا توجد دفعات.</td></tr>';
  }
  $('[data-pay-status]').addEventListener('change', renderPayments);
  root.addEventListener('click', async e => {
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
