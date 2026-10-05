// @i18n-self — public membership check (QR on the member card). Shows the state only, never personal data.
(() => {
  const root = document.querySelector('[data-verify]');
  if (!root || !window.TakamulSB) return;
  const { client: sb, esc, date, lang, retry } = window.TakamulSB;
  const T = {
    ar: { ok: 'عضوية فعّالة وسارية', bad: 'العضوية غير سارية', none: 'لم يتم العثور على عضوية بهذه البيانات.', no: 'رقم العضوية', until: 'سارية حتى', since: 'عضو منذ', err: 'تعذّر التحقق الآن، حاول مرة أخرى.',
      st: { active: 'فعّالة', expired: 'منتهية', suspended: 'معلّقة', approved: 'مقبولة – بانتظار الاشتراك', pending: 'قيد المراجعة', rejected: 'غير مقبولة' } },
    en: { ok: 'Active, valid membership', bad: 'Membership not valid', none: 'No membership found for these details.', no: 'Membership no.', until: 'Valid until', since: 'Member since', err: 'Could not verify right now, please try again.',
      st: { active: 'Active', expired: 'Expired', suspended: 'Suspended', approved: 'Approved – fee pending', pending: 'Under review', rejected: 'Not accepted' } },
    tr: { ok: 'Aktif ve geçerli üyelik', bad: 'Üyelik geçerli değil', none: 'Bu bilgilerle bir üyelik bulunamadı.', no: 'Üye no.', until: 'Geçerlilik', since: 'Üyelik başlangıcı', err: 'Şu anda doğrulanamadı, tekrar deneyin.',
      st: { active: 'Aktif', expired: 'Süresi doldu', suspended: 'Askıya alındı', approved: 'Onaylandı – aidat bekleniyor', pending: 'İnceleniyor', rejected: 'Kabul edilmedi' } },
  }[lang] || {};
  const f = root.querySelector('[data-form=verify]'), out = root.querySelector('[data-result]');

  async function check(n, c) {
    out.innerHTML = '<span class="spin"></span>';
    const { data, error } = await retry(() => sb.rpc('verify_member', { p_no: parseInt(n, 10), p_code: c }));
    if (error) { out.innerHTML = `<div class="vf-card" data-ok="0"><b>${esc(T.err)}</b></div>`; return; }
    const m = (data || [])[0];
    if (!m) { out.innerHTML = `<div class="vf-card" data-ok="0"><span class="vf-mark">✕</span><div><b>${esc(T.none)}</b></div></div>`; return; }
    const ok = m.status === 'active';
    out.innerHTML = `<div class="vf-card" data-ok="${ok ? 1 : 0}"><span class="vf-mark">${ok ? '✓' : '!'}</span><div>` +
      `<b>${esc(ok ? T.ok : T.bad)}</b><h2>${esc(m.name)}</h2>` +
      `<dl><div><dt>${esc(T.no)}</dt><dd>${esc(m.member_no)}</dd></div>` +
      `<div><dt>${esc(T.since)}</dt><dd>${date(m.joined_at)}</dd></div>` +
      `<div><dt>${esc(T.until)}</dt><dd>${date(m.expires_at)}</dd></div>` +
      `<div><dt>&nbsp;</dt><dd><span class="st-badge" data-st="${esc(m.status)}">${esc(T.st[m.status] || m.status)}</span></dd></div></dl></div></div>`;
  }
  f.addEventListener('submit', e => { e.preventDefault(); if (f.reportValidity()) check(f.n.value.trim(), f.c.value.trim()); });
  const q = new URLSearchParams(location.search);
  if (q.get('n') && q.get('c')) { f.n.value = q.get('n'); f.c.value = q.get('c'); check(q.get('n'), q.get('c')); }
})();
