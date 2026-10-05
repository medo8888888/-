// @i18n-self — member portal (bilingual strings below). Talks to Supabase through TakamulSB.
// Flow: register → confirm e-mail → application form (status pending) → admin approves →
// member uploads the payment receipt → admin confirms → membership active with dates.
(() => {
  const root = document.querySelector('[data-portal]');
  if (!root || !window.TakamulSB) return;
  const { client: sb, esc, date, money, daysLeft, toast, lang, locale, retry, qrSvg, verifyUrl, printReceipt, printCard } = window.TakamulSB;
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
      ev: { register: 'سجّلني', cancel: 'إلغاء التسجيل', full: 'اكتمل العدد', registered: 'مسجّل ✓', attended: 'حضرت ✓', absent: 'لم يُسجَّل حضور', closed: 'التسجيل مغلق', cancelled: 'أُلغي النشاط', seats: 'مقعد', left: 'متبقٍ', hours: 'ساعة تطوعية', noUp: 'لا توجد أنشطة قادمة حالياً. سيصلك إشعار عند الإعلان عن نشاط جديد.', noPast: 'لم تشارك في أنشطة بعد.', regOk: 'تم تسجيلك في النشاط ✓', cancelOk: 'تم إلغاء التسجيل', notActive: 'التسجيل في الأنشطة متاح للأعضاء المقبولين والفعّالين.', fullErr: 'اكتمل العدد في هذا النشاط.' },
      rq: { kind: { certificate: 'شهادة عضوية', data_change: 'تعديل بيانات', complaint: 'شكوى', suggestion: 'اقتراح', other: 'أخرى' }, st: { open: 'قيد المتابعة', answered: 'تم الرد', closed: 'مغلق' }, none: 'لا توجد طلبات بعد.', sent: 'تم إرسال طلبك ✓ — سيصلك إشعار عند الرد', reply: 'ردّ الإدارة' },
      printReceipt: 'سند القبض', photoOk: 'تم تحديث الصورة ✓', bigPhoto: 'حجم الصورة أكبر من 2MB.',
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
      ev: { register: 'Register', cancel: 'Cancel registration', full: 'Fully booked', registered: 'Registered ✓', attended: 'Attended ✓', absent: 'No attendance recorded', closed: 'Registration closed', cancelled: 'Cancelled', seats: 'seats', left: 'left', hours: 'volunteer hours', noUp: 'No upcoming activities right now. You will be notified when a new one is announced.', noPast: 'You have not taken part in any activities yet.', regOk: 'You are registered ✓', cancelOk: 'Registration cancelled', notActive: 'Activity registration is open to approved and active members.', fullErr: 'This activity is fully booked.' },
      rq: { kind: { certificate: 'Membership certificate', data_change: 'Data change', complaint: 'Complaint', suggestion: 'Suggestion', other: 'Other' }, st: { open: 'In progress', answered: 'Answered', closed: 'Closed' }, none: 'No requests yet.', sent: 'Request sent ✓ — you will be notified of the reply', reply: 'Reply from the administration' },
      printReceipt: 'Receipt', photoOk: 'Photo updated ✓', bigPhoto: 'The photo is larger than 2MB.',
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
      ev: { register: 'Kaydol', cancel: 'Kaydı iptal et', full: 'Kontenjan doldu', registered: 'Kayıtlı ✓', attended: 'Katıldım ✓', absent: 'Katılım kaydı yok', closed: 'Kayıt kapalı', cancelled: 'İptal edildi', seats: 'kişilik', left: 'kalan', hours: 'gönüllü saat', noUp: 'Şu anda yaklaşan etkinlik yok. Yeni bir etkinlik duyurulduğunda bildirim alacaksınız.', noPast: 'Henüz bir etkinliğe katılmadınız.', regOk: 'Etkinliğe kaydoldunuz ✓', cancelOk: 'Kayıt iptal edildi', notActive: 'Etkinlik kaydı onaylı ve aktif üyelere açıktır.', fullErr: 'Bu etkinliğin kontenjanı doldu.' },
      rq: { kind: { certificate: 'Üyelik belgesi', data_change: 'Bilgi değişikliği', complaint: 'Şikâyet', suggestion: 'Öneri', other: 'Diğer' }, st: { open: 'İşlemde', answered: 'Yanıtlandı', closed: 'Kapandı' }, none: 'Henüz talep yok.', sent: 'Talebiniz gönderildi ✓ — yanıtlandığında bildirim alacaksınız', reply: 'Yönetimin yanıtı' },
      printReceipt: 'Makbuz', photoOk: 'Fotoğraf güncellendi ✓', bigPhoto: 'Fotoğraf 2MB’tan büyük.',
    },
  }[lang] || {};

  let user = null, me = null, settings = null, photoUrl = null, payRows = [];
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
    await Promise.all([loadPhoto(), loadPayments(), loadNotifications(), loadViolations(), loadEvents(), loadRequests()]);
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
    paintPhoto();
    const card = $('[data-card-actions]');
    card.hidden = !me.member_no;
    if (me.member_no) {
      $('[data-qr]').innerHTML = qrSvg(verifyUrl(me.member_no, me.verify_code));
      $('[data-verify-link]').href = verifyUrl(me.member_no, me.verify_code);
      $('[data-me=vcode]').textContent = me.verify_code;
    }
  }

  /* ---------------- photo ---------------- */
  function paintPhoto() {
    const init = esc((me.full_name || user.email || '?').trim().charAt(0));
    $$('[data-me=photo], .pt-me .pt-avatar').forEach(x => { x.innerHTML = photoUrl ? `<img src="${esc(photoUrl)}" alt="">` : init; });
  }
  async function loadPhoto() {
    photoUrl = null;
    if (me.avatar_path) {
      const { data } = await sb.storage.from('avatars').createSignedUrl(me.avatar_path, 3600);
      photoUrl = data ? data.signedUrl : null;
    }
    paintPhoto();
  }
  $('[data-form=avatar]').photo.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast(T.bigPhoto, 'err'); return; }
    const ext = { 'image/png': 'png', 'image/webp': 'webp' }[file.type] || 'jpg';
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const up = await sb.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) { toast(T.err, 'err'); return; }
    const { error } = await sb.from('profiles').update({ avatar_path: path }).eq('id', user.id);
    if (error) { toast(T.err, 'err'); return; }
    me.avatar_path = path; await loadPhoto(); toast(T.photoOk); e.target.value = '';
  });
  $('[data-print-card]').addEventListener('click', () => printCard(me, photoUrl));

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
    const rows = payRows = data || [];
    $('[data-count=payments]').textContent = rows.length;
    $('[data-list=payments]').innerHTML = rows.length ? rows.map(p =>
      `<tr><td>${date(p.paid_on)}</td><td><b>${esc(money(p.amount, p.currency))}</b></td><td>${esc(T.method[p.method] || p.method)}${p.reference ? `<br><small dir="ltr">${esc(p.reference)}</small>` : ''}</td>` +
      `<td><span class="st-badge" data-st="pay-${p.status}">${esc(T.pay[p.status])}</span></td>` +
      `<td>${p.period_start ? `${date(p.period_start)} → ${date(p.period_end)}` : '—'}</td><td>${esc(p.admin_note || '')}` +
      `${p.status === 'approved' && p.receipt_no ? ` <button type="button" class="btn btn-soft btn-sm" data-print-receipt="${p.id}">${esc(T.printReceipt)}</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="6" class="empty">${esc(T.noPayments)}</td></tr>`;
    badge('payments', rows.filter(p => p.status === 'pending').length);
  }

  $('[data-list=payments]').addEventListener('click', e => {
    const b = e.target.closest('[data-print-receipt]'); if (!b) return;
    const p = payRows.find(x => x.id === b.dataset.printReceipt); if (p) printReceipt(p, { ...me, email: user.email });
  });

  /* ---------------- activities ---------------- */
  const dtf = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const evCard = (e, past) => {
    const d = new Date(e.starts_at);
    const left = e.capacity ? Math.max(0, e.capacity - e.registered) : null;
    let act = '';
    if (past) act = e.mine ? `<span class="st-badge" data-st="${e.attended ? 'active' : 'draft'}">${esc(e.attended ? T.ev.attended : T.ev.absent)}</span>` : '';
    else if (e.status === 'cancelled') act = `<span class="st-badge" data-st="rejected">${esc(T.ev.cancelled)}</span>`;
    else if (e.mine) act = `<span class="st-badge" data-st="active">${esc(T.ev.registered)}</span> <button type="button" class="btn btn-soft btn-sm" data-ev-cancel="${e.id}">${esc(T.ev.cancel)}</button>`;
    else if (e.status !== 'open') act = `<span class="st-badge">${esc(T.ev.closed)}</span>`;
    else if (left === 0) act = `<span class="st-badge" data-st="pending">${esc(T.ev.full)}</span>`;
    else act = `<button type="button" class="btn btn-gold btn-sm" data-ev-reg="${e.id}">${esc(T.ev.register)}</button>`;
    return `<article class="ev${e.mine ? ' is-mine' : ''}" data-status="${e.status}">` +
      `<div class="ev-date"><b>${d.toLocaleDateString(locale, { day: 'numeric' })}</b><span>${d.toLocaleDateString(locale, { month: 'short' })}</span></div>` +
      `<div class="ev-body"><h3>${esc(e.title)}</h3><p class="ev-meta">${esc(dtf.format(d))}${e.place ? ` · ${esc(e.place)}` : ''}` +
      `${+e.hours ? ` · ${esc(+e.hours)} ${esc(T.ev.hours)}` : ''}${e.capacity && !past ? ` · ${esc(e.registered)}/${esc(e.capacity)} ${esc(T.ev.seats)}` : ''}</p>` +
      `${e.description ? `<p>${esc(e.description)}</p>` : ''}</div><div class="ev-act">${act}</div></article>`;
  };
  async function loadEvents() {
    const { data } = await retry(() => sb.rpc('list_events'));
    const all = data || [], now = Date.now();
    const up = all.filter(e => new Date(e.starts_at) >= now && e.status !== 'cancelled').reverse();
    const past = all.filter(e => new Date(e.starts_at) < now && e.mine);
    const done = past.filter(e => e.attended);
    $('[data-ev=upcoming]').textContent = up.filter(e => e.mine).length;
    $('[data-ev=attended]').textContent = done.length;
    $('[data-ev=hours]').textContent = done.reduce((a, e) => a + (+e.hours || 0), 0);
    $('[data-count=events]').textContent = up.length;
    badge('events', up.filter(e => !e.mine && e.status === 'open').length);
    $('[data-list=events-up]').innerHTML = up.length ? up.map(e => evCard(e, false)).join('') : `<p class="empty">${esc(T.ev.noUp)}</p>`;
    $('[data-list=events-past]').innerHTML = past.length ? past.map(e => evCard(e, true)).join('') : `<p class="empty">${esc(T.ev.noPast)}</p>`;
  }
  root.addEventListener('click', async e => {
    const r = e.target.closest('[data-ev-reg]'), c = e.target.closest('[data-ev-cancel]');
    if (!r && !c) return;
    (r || c).disabled = true;
    const { error } = r ? await sb.rpc('register_event', { p_event: r.dataset.evReg }) : await sb.rpc('cancel_registration', { p_event: c.dataset.evCancel });
    if (error) {
      const m = String(error.message || '');
      toast(/not active/.test(m) ? T.ev.notActive : /full/.test(m) ? T.ev.fullErr : /closed/.test(m) ? T.ev.closed : T.err, 'err');
    } else toast(r ? T.ev.regOk : T.ev.cancelOk);
    loadEvents();
  });

  /* ---------------- requests ---------------- */
  async function loadRequests() {
    const { data } = await retry(() => sb.from('requests').select('*').order('created_at', { ascending: false }));
    const rows = data || [];
    badge('requests', rows.filter(r => r.status === 'answered').length);
    $('[data-list=requests]').innerHTML = rows.length ? rows.map(r =>
      `<article class="rq" data-st="${r.status}"><header><span class="st-badge" data-st="rq-${r.status}">${esc(T.rq.st[r.status])}</span>` +
      `<span class="st-badge">${esc(T.rq.kind[r.kind])}</span><small>${date(r.created_at)}</small></header>` +
      `<h3>${esc(r.subject)}</h3><p>${esc(r.body)}</p>` +
      `${r.admin_reply ? `<div class="vl-reply"><b>${esc(T.rq.reply)}</b> <small>${date(r.replied_at)}</small><br>${esc(r.admin_reply)}</div>` : ''}</article>`).join('')
      : `<p class="empty">${esc(T.rq.none)}</p>`;
  }
  $('[data-form=request]').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; if (!f.reportValidity()) return; busy(f, true);
    const { error } = await sb.from('requests').insert({ member_id: user.id, kind: f.kind.value, subject: f.subject.value.trim(), body: f.body.value.trim() });
    busy(f, false);
    if (error) { toast(T.err, 'err'); return; }
    toast(T.rq.sent); f.reset(); loadRequests();
  });

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
