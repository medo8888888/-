// @i18n-self — member portal (bilingual strings below). Talks to Supabase through TakamulSB.
// Flow: register → confirm e-mail → application form (status pending) → admin approves →
// member uploads the payment receipt → admin confirms → membership active with dates.
(() => {
  const root = document.querySelector('[data-portal]');
  if (!root || !window.TakamulSB) return;
  const { client: sb, esc, date, money, daysLeft, toast, lang, retry } = window.TakamulSB;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];

  const T = {
    ar: {
      st: { pending: 'قيد المراجعة', approved: 'مقبول – بانتظار الاشتراك', active: 'عضوية فعّالة', expired: 'منتهية', suspended: 'معلّقة', rejected: 'لم يُقبل', draft: 'لم يُرسل بعد' },
      pay: { pending: 'بانتظار التأكيد', approved: 'مؤكدة', rejected: 'مرفوضة' },
      method: { bank_transfer: 'تحويل بنكي', cash: 'نقداً', other: 'أخرى' },
      sev: { notice: 'تنبيه', warning: 'إنذار', serious: 'مخالفة جسيمة' }, vst: { open: 'مفتوحة', resolved: 'مغلقة' },
      next: {
        draft: ['أكمل استمارة العضوية', 'املأ بياناتك وأرسل الطلب ليتم مراجعته من الإدارة.', 'application', 'املأ الاستمارة'],
        pending: ['طلبك قيد المراجعة', 'سنُشعرك فور اعتماد طلبك. يمكنك تعديل بياناتك حتى ذلك الحين.', 'application', 'عرض الطلب'],
        approved: ['تم قبول طلبك 🎉 — بقي سداد الاشتراك', 'حوّل الاشتراك السنوي وارفع صورة الإيصال لتفعيل عضويتك.', 'payments', 'سداد الاشتراك'],
        active: ['عضويتك فعّالة', 'شكراً لانتمائك إلى أسرة «تكامل».', 'notifications', 'الإشعارات'],
        expiring: ['عضويتك تنتهي قريباً', 'جدّد اشتراكك قبل تاريخ الانتهاء لتبقى عضويتك فعّالة.', 'payments', 'تجديد الاشتراك'],
        expired: ['انتهت عضويتك', 'جدّد الاشتراك السنوي لإعادة تفعيل العضوية.', 'payments', 'تجديد الاشتراك'],
        suspended: ['عضويتك معلّقة', 'تواصل مع إدارة الجمعية لمعرفة التفاصيل.', 'notifications', 'الإشعارات'],
        rejected: ['لم يُقبل الطلب', 'راجع ملاحظة الإدارة، ثم عدّل الطلب وأعد إرساله.', 'application', 'تعديل الطلب'],
      },
      checkMail: 'تم إنشاء الحساب. افتح الرسالة التي وصلت إلى بريدك واضغط رابط التأكيد، ثم سجّل الدخول.',
      badLogin: 'البريد أو كلمة المرور غير صحيحة، أو لم يتم تأكيد البريد بعد.',
      resetSent: 'أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك.', needEmail: 'اكتب بريدك الإلكتروني أولاً.',
      saved: 'تم الحفظ ✓', sent: 'تم إرسال الطلب ✓ — سيصلك إشعار بعد المراجعة', paySent: 'تم رفع الإيصال ✓ — سيصلك إشعار بعد التأكيد',
      err: 'حدث خطأ، حاول مرة أخرى.', bigFile: 'حجم الملف أكبر من 5MB.', noFee: 'يحدده مجلس الإدارة',
      noPayments: 'لا توجد دفعات بعد.', noNotes: 'لا توجد إشعارات.', noViol: 'لا توجد ملاحظات على عضويتك. شكراً لالتزامك 🌿',
      respond: 'ردّك على الملاحظة', send: 'إرسال الرد', yourReply: 'ردّك', adminNote: 'ملاحظة الإدارة', pwd: 'تم تحديث كلمة المرور ✓',
      receipt: 'الإيصال', copied: 'تم نسخ IBAN ✓', all: 'إشعار عام',
    },
    en: {
      st: { pending: 'Under review', approved: 'Approved – awaiting fee', active: 'Active membership', expired: 'Expired', suspended: 'Suspended', rejected: 'Not accepted', draft: 'Not submitted' },
      pay: { pending: 'Awaiting confirmation', approved: 'Confirmed', rejected: 'Rejected' },
      method: { bank_transfer: 'Bank transfer', cash: 'Cash', other: 'Other' },
      sev: { notice: 'Notice', warning: 'Warning', serious: 'Serious violation' }, vst: { open: 'Open', resolved: 'Closed' },
      next: {
        draft: ['Complete the membership form', 'Fill in your details and submit the application for review.', 'application', 'Fill in the form'],
        pending: ['Your application is under review', 'We will notify you as soon as it is approved. You can still edit your details.', 'application', 'View application'],
        approved: ['Application approved 🎉 — one step left', 'Transfer the annual fee and upload the receipt to activate your membership.', 'payments', 'Pay the fee'],
        active: ['Your membership is active', 'Thank you for being part of the “Takamul” family.', 'notifications', 'Notifications'],
        expiring: ['Your membership expires soon', 'Renew before the expiry date to keep your membership active.', 'payments', 'Renew'],
        expired: ['Your membership has expired', 'Renew the annual fee to reactivate it.', 'payments', 'Renew'],
        suspended: ['Your membership is suspended', 'Please contact the Association for details.', 'notifications', 'Notifications'],
        rejected: ['Application not accepted', 'Read the note from the administration, edit and resubmit.', 'application', 'Edit application'],
      },
      checkMail: 'Account created. Open the email we sent you and click the confirmation link, then sign in.',
      badLogin: 'Wrong email or password, or the email is not confirmed yet.',
      resetSent: 'We sent a password reset link to your email.', needEmail: 'Enter your email first.',
      saved: 'Saved ✓', sent: 'Application sent ✓ — you will be notified after review', paySent: 'Receipt uploaded ✓ — you will be notified once confirmed',
      err: 'Something went wrong, please try again.', bigFile: 'The file is larger than 5MB.', noFee: 'Set by the Board',
      noPayments: 'No payments yet.', noNotes: 'No notifications.', noViol: 'No notes on your membership. Thank you 🌿',
      respond: 'Your reply', send: 'Send reply', yourReply: 'Your reply', adminNote: 'Administration note', pwd: 'Password updated ✓',
      receipt: 'Receipt', copied: 'IBAN copied ✓', all: 'General notice',
    },
    tr: {
      st: { pending: 'İnceleniyor', approved: 'Onaylandı – aidat bekleniyor', active: 'Aktif üyelik', expired: 'Süresi doldu', suspended: 'Askıya alındı', rejected: 'Kabul edilmedi', draft: 'Gönderilmedi' },
      pay: { pending: 'Onay bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' },
      method: { bank_transfer: 'Banka havalesi', cash: 'Nakit', other: 'Diğer' },
      sev: { notice: 'Bildirim', warning: 'Uyarı', serious: 'Ciddi ihlal' }, vst: { open: 'Açık', resolved: 'Kapandı' },
      next: {
        draft: ['Üyelik formunu doldurun', 'Bilgilerinizi girip başvurunuzu incelemeye gönderin.', 'application', 'Formu doldur'],
        pending: ['Başvurunuz inceleniyor', 'Onaylandığında size bildirim göndereceğiz. Bilgilerinizi hâlâ düzenleyebilirsiniz.', 'application', 'Başvuruyu gör'],
        approved: ['Başvurunuz onaylandı 🎉 — son adım', 'Yıllık aidatı havale edip dekontu yükleyin, üyeliğiniz aktifleşsin.', 'payments', 'Aidatı öde'],
        active: ['Üyeliğiniz aktif', '«Takamul» ailesinin bir parçası olduğunuz için teşekkürler.', 'notifications', 'Bildirimler'],
        expiring: ['Üyeliğiniz yakında sona eriyor', 'Üyeliğinizin aktif kalması için süre dolmadan yenileyin.', 'payments', 'Yenile'],
        expired: ['Üyeliğinizin süresi doldu', 'Yeniden aktifleştirmek için yıllık aidatı yenileyin.', 'payments', 'Yenile'],
        suspended: ['Üyeliğiniz askıya alındı', 'Ayrıntılar için dernekle iletişime geçin.', 'notifications', 'Bildirimler'],
        rejected: ['Başvuru kabul edilmedi', 'Yönetimin notunu okuyun, düzenleyip yeniden gönderin.', 'application', 'Başvuruyu düzenle'],
      },
      checkMail: 'Hesap oluşturuldu. E-postanıza gelen onay bağlantısına tıklayın, ardından giriş yapın.',
      badLogin: 'E-posta veya şifre hatalı ya da e-posta henüz onaylanmadı.',
      resetSent: 'Şifre sıfırlama bağlantısını e-postanıza gönderdik.', needEmail: 'Önce e-postanızı yazın.',
      saved: 'Kaydedildi ✓', sent: 'Başvuru gönderildi ✓ — incelemeden sonra bildirim alacaksınız', paySent: 'Dekont yüklendi ✓ — onaylandığında bildirim alacaksınız',
      err: 'Bir hata oluştu, tekrar deneyin.', bigFile: 'Dosya 5MB’tan büyük.', noFee: 'Yönetim Kurulu belirler',
      noPayments: 'Henüz ödeme yok.', noNotes: 'Bildirim yok.', noViol: 'Üyeliğinizle ilgili not yok. Teşekkürler 🌿',
      respond: 'Yanıtınız', send: 'Yanıtı gönder', yourReply: 'Yanıtınız', adminNote: 'Yönetim notu', pwd: 'Şifre güncellendi ✓',
      receipt: 'Dekont', copied: 'IBAN kopyalandı ✓', all: 'Genel bildirim',
    },
  }[lang] || {};

  let user = null, me = null, settings = null;
  const view = v => $$('[data-view]').forEach(x => { x.hidden = x.dataset.view !== v; });
  const setMsg = m => { $('[data-auth-msg]').textContent = m || ''; };
  const busy = (form, on) => { const b = form.querySelector('[type=submit]'); if (b) { b.disabled = on; b.classList.toggle('is-busy', on); } };

  /* ---------------- auth ---------------- */
  $$('[data-auth]').forEach(b => b.addEventListener('click', () => {
    $$('[data-auth]').forEach(x => x.classList.toggle('is-on', x === b));
    $('[data-form=login]').hidden = b.dataset.auth !== 'login';
    $('[data-form=register]').hidden = b.dataset.auth !== 'register';
    setMsg('');
  }));
  $('[data-form=login]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; busy(f, true); setMsg('');
    const { error } = await retry(() => sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }));
    busy(f, false);
    if (error) setMsg(T.badLogin);
  });
  $('[data-form=register]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; busy(f, true); setMsg('');
    const { data, error } = await sb.auth.signUp({
      email: f.email.value.trim(), password: f.password.value,
      options: { data: { full_name: f.full_name.value.trim() }, emailRedirectTo: location.origin + location.pathname },
    });
    busy(f, false);
    if (error) { setMsg(error.message); return; }
    if (!data.session) { setMsg(T.checkMail); f.reset(); }
  });
  $('[data-forgot]').addEventListener('click', async () => {
    const email = $('[data-form=login]').email.value.trim();
    if (!email) { setMsg(T.needEmail); return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#profile' });
    setMsg(T.resetSent);
  });
  $('[data-logout]').addEventListener('click', () => sb.auth.signOut());

  // INITIAL_SESSION and SIGNED_IN can both fire: load once per user (and leave the auth callback first)
  let bootedFor;  // undefined until the first auth event
  sb.auth.onAuthStateChange((ev, session) => {
    user = session ? session.user : null;
    const key = user ? user.id : null;
    if (key === bootedFor && ev !== 'USER_UPDATED') return;
    bootedFor = key;
    setTimeout(boot, 0);
  });

  /* ---------------- data ---------------- */
  const effective = p => {
    if (!p.submitted_at && p.status === 'pending') return 'draft';
    if (p.status === 'active' && p.expires_at && daysLeft(p.expires_at) < 0) return 'expired';
    return p.status;
  };
  async function boot() {
    if (!user) { view('auth'); return; }
    view('loading');
    const [{ data: prof }, { data: set }] = await Promise.all([
      retry(() => sb.from('profiles').select('*').eq('id', user.id).single()),
      retry(() => sb.from('settings').select('*').eq('id', 1).single()),
    ]);
    me = prof; settings = set;
    if (!me) { toast(T.err, 'err'); view('auth'); return; }
    view('app');
    renderMe();
    fillApplication();
    renderSettings();
    await Promise.all([loadPayments(), loadNotifications(), loadViolations()]);
    go((location.hash || '').slice(1) || 'overview');
  }

  function renderMe() {
    const st = effective(me);
    $$('[data-me=name]').forEach(x => { x.textContent = me.full_name || user.email; });
    $$('[data-me=email]').forEach(x => { x.textContent = user.email; });
    $$('[data-me=initial]').forEach(x => { x.textContent = (me.full_name || user.email || '?').trim().charAt(0); });
    $$('[data-me=status]').forEach(x => { x.textContent = T.st[st]; x.dataset.st = st; });
    $('[data-me=no]').textContent = me.member_no || '—';
    $('[data-me=joined]').textContent = date(me.joined_at);
    $('[data-me=expires]').textContent = date(me.expires_at);
    const dl = daysLeft(me.expires_at);
    $('[data-me=days]').textContent = dl == null ? '—' : Math.max(dl, 0);
    const pct = dl == null ? 0 : Math.max(0, Math.min(100, dl / 365 * 100));
    $('.mcard .r-fg').style.strokeDasharray = `${pct} ${100 - pct}`;
    $('.pt-admin-link').hidden = me.role !== 'admin';
    let key = st;
    if (st === 'active' && dl != null && dl <= 30) key = 'expiring';
    const n = T.next[key] || T.next.active;
    $('[data-next]').innerHTML = `<div><b>${esc(n[0])}</b><p>${esc(n[1])}</p>${me.admin_note && (st === 'rejected' || st === 'suspended') ? `<p class="note"><b>${esc(T.adminNote)}:</b> ${esc(me.admin_note)}</p>` : ''}</div>` +
      `<button type="button" class="btn btn-gold" data-go="${n[2]}">${esc(n[3])}</button>`;
    $('[data-next]').dataset.st = key;
    $('[data-app-lock]').hidden = !['approved', 'active', 'suspended', 'expired'].includes(st);
  }

  function fillApplication() {
    const f = $('[data-form=application]');
    ['full_name', 'nationality', 'id_number', 'birth_date', 'phone', 'residence_status', 'city', 'address', 'occupation', 'education', 'skills']
      .forEach(k => { if (f[k] && me[k] != null) f[k].value = me[k]; });
    $$('[name=interests]', f).forEach(c => { c.checked = (me.interests || []).includes(c.value); });
    f.agree.checked = !!me.agreed_at;
    const locked = ['approved', 'active', 'suspended'].includes(me.status);
    ['full_name', 'nationality', 'id_number', 'birth_date'].forEach(k => { f[k].readOnly = locked; });
    const c = $('[data-form=contact]');
    ['phone', 'city', 'address'].forEach(k => { c[k].value = me[k] || ''; });
  }

  function renderSettings() {
    const s = settings || {};
    $('[data-set=fee]').textContent = +s.annual_fee > 0 ? money(s.annual_fee, s.currency) : T.noFee;
    ['bank_name', 'account_holder', 'iban', 'payment_note'].forEach(k => { $(`[data-set=${k}]`).textContent = s[k] || (k === 'payment_note' ? '' : '—'); });
    const f = $('[data-form=payment]');
    if (+s.annual_fee > 0 && !f.amount.value) f.amount.value = s.annual_fee;
    if (s.currency) f.currency.value = s.currency;
    if (!f.paid_on.value) f.paid_on.value = new Date().toISOString().slice(0, 10);
  }

  async function loadPayments() {
    const { data } = await retry(() => sb.from('payments').select('*').order('created_at', { ascending: false }));
    const rows = data || [];
    $('[data-count=payments]').textContent = rows.length;
    $('[data-list=payments]').innerHTML = rows.length ? rows.map(p =>
      `<tr><td>${date(p.paid_on)}</td><td><b>${esc(money(p.amount, p.currency))}</b></td><td>${esc(T.method[p.method] || p.method)}${p.reference ? `<br><small dir="ltr">${esc(p.reference)}</small>` : ''}</td>` +
      `<td><span class="st-badge" data-st="pay-${p.status}">${esc(T.pay[p.status])}</span></td>` +
      `<td>${p.period_start ? `${date(p.period_start)} → ${date(p.period_end)}` : '—'}</td><td>${esc(p.admin_note || '')}</td></tr>`).join('')
      : `<tr><td colspan="6" class="empty">${esc(T.noPayments)}</td></tr>`;
    badge('payments', rows.filter(p => p.status === 'pending').length);
  }

  let reads = new Set();
  async function loadNotifications() {
    const [{ data: ns }, { data: rd }] = await Promise.all([
      retry(() => sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
      retry(() => sb.from('notification_reads').select('notification_id')),
    ]);
    reads = new Set((rd || []).map(r => r.notification_id));
    const list = ns || [];
    const unread = list.filter(n => !reads.has(n.id));
    $('[data-count=unread]').textContent = unread.length;
    badge('notifications', unread.length);
    $('[data-list=notifications]').innerHTML = list.length ? list.map(n =>
      `<article class="nt${reads.has(n.id) ? '' : ' unread'}" data-id="${n.id}" data-kind="${esc(n.kind)}"><span class="nt-dot"></span>` +
      `<div><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}<small>${date(n.created_at)}${n.member_id ? '' : ' · ' + esc(T.all)}</small></div></article>`).join('')
      : `<p class="empty">${esc(T.noNotes)}</p>`;
  }
  async function markRead(ids) {
    const rows = ids.filter(id => !reads.has(id)).map(id => ({ notification_id: id, member_id: user.id }));
    if (!rows.length) return;
    await sb.from('notification_reads').upsert(rows, { onConflict: 'notification_id,member_id', ignoreDuplicates: true });
    await loadNotifications();
  }
  $('[data-list=notifications]').addEventListener('click', e => { const a = e.target.closest('.nt.unread'); if (a) markRead([a.dataset.id]); });
  $('[data-read-all]').addEventListener('click', () => markRead($$('.nt.unread').map(a => a.dataset.id)));

  async function loadViolations() {
    const { data } = await retry(() => sb.from('violations').select('*').order('issued_at', { ascending: false }));
    const rows = data || [];
    const open = rows.filter(v => v.status === 'open');
    $('[data-count=violations]').textContent = open.length;
    badge('violations', open.filter(v => !v.member_response).length);
    $('[data-list=violations]').innerHTML = rows.length ? rows.map(v =>
      `<article class="vl" data-sev="${v.severity}"><header><span class="st-badge" data-st="sev-${v.severity}">${esc(T.sev[v.severity])}</span>` +
      `<span class="st-badge" data-st="v-${v.status}">${esc(T.vst[v.status])}</span><small>${date(v.issued_at)}</small></header>` +
      `<h3>${esc(v.title)}</h3>${v.details ? `<p>${esc(v.details)}</p>` : ''}` +
      (v.member_response ? `<div class="vl-reply"><b>${esc(T.yourReply)}:</b> ${esc(v.member_response)}</div>`
        : v.status === 'open' ? `<form class="vl-form" data-v="${v.id}"><label class="fld full"><span>${esc(T.respond)}</span><textarea name="r" rows="2" required maxlength="2000"></textarea></label><button class="btn btn-soft" type="submit">${esc(T.send)}</button></form>` : '') +
      `</article>`).join('') : `<p class="empty">${esc(T.noViol)}</p>`;
  }
  $('[data-list=violations]').addEventListener('submit', async e => {
    const f = e.target.closest('.vl-form'); if (!f) return; e.preventDefault(); busy(f, true);
    const { error } = await sb.rpc('respond_violation', { p_violation: f.dataset.v, p_response: f.r.value.trim() });
    busy(f, false); toast(error ? T.err : T.saved, error ? 'err' : 'ok'); if (!error) loadViolations();
  });

  const badge = (k, n) => $$(`[data-badge=${k}]`).forEach(b => { b.hidden = !n; b.textContent = n; });

  /* ---------------- forms ---------------- */
  $('[data-form=application]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (!f.reportValidity()) return;
    busy(f, true);
    const v = k => (f[k].value || '').trim() || null;
    const patch = {
      full_name: v('full_name'), nationality: v('nationality'), id_number: v('id_number'), birth_date: v('birth_date'),
      phone: v('phone'), residence_status: v('residence_status'), city: v('city'), address: v('address'),
      occupation: v('occupation'), education: v('education'), skills: v('skills'),
      interests: $$('[name=interests]:checked', f).map(c => c.value), agreed_at: new Date().toISOString(), submitted_at: new Date().toISOString(),
    };
    const { error } = await sb.from('profiles').update(patch).eq('id', user.id);
    busy(f, false);
    if (error) { toast(T.err, 'err'); return; }
    toast(T.sent); await boot();
  });

  $('[data-form=payment]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (!f.reportValidity()) return;
    const file = f.receipt.files[0];
    if (file && file.size > 5 * 1024 * 1024) { toast(T.bigFile, 'err'); return; }
    busy(f, true);
    let path = null;
    if (file) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      path = `${user.id}/${Date.now()}.${ext}`;
      const up = await sb.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) { busy(f, false); toast(T.err, 'err'); return; }
    }
    const { error } = await sb.from('payments').insert({
      member_id: user.id, amount: +f.amount.value, currency: f.currency.value, paid_on: f.paid_on.value,
      // f.method would be the <form> "method" attribute — read the field through f.elements
      method: f.elements.method.value, reference: f.reference.value.trim() || null, receipt_path: path,
    });
    busy(f, false);
    if (error) { toast(T.err, 'err'); return; }
    toast(T.paySent); f.reference.value = ''; f.receipt.value = ''; loadPayments();
  });
  $('[data-copy-iban]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText((settings && settings.iban) || ''); toast(T.copied); } catch (err) { /* blocked */ }
  });

  $('[data-form=contact]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; busy(f, true);
    const { error } = await sb.from('profiles').update({ phone: f.phone.value.trim(), city: f.city.value.trim(), address: f.address.value.trim() }).eq('id', user.id);
    busy(f, false); toast(error ? T.err : T.saved, error ? 'err' : 'ok');
  });
  $('[data-form=password]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; busy(f, true);
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    busy(f, false); toast(error ? T.err : T.pwd, error ? 'err' : 'ok'); if (!error) f.reset();
  });

  /* ---------------- navigation ---------------- */
  function go(k) {
    if (!$(`[data-panel="${k}"]`)) k = 'overview';
    $$('.pt-tab[data-tab]').forEach(t => t.classList.toggle('is-on', t.dataset.tab === k));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== k; });
    if (history.replaceState) history.replaceState(null, '', '#' + k);
  }
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-tab], [data-go]');
    if (t) { go(t.dataset.tab || t.dataset.go); if (innerWidth < 900) $('.pt-main').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
})();
