// Membership application: validation, review sheet, print/PDF and optional e-mail.
// Personal data stays in the visitor's browser (nothing is stored or uploaded).
(() => {
  const form = document.querySelector('.join-form');
  if (!form) return;
  const done = document.querySelector('.join-done');
  const sheet = done.querySelector('.done-sheet');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MSG = {
    valueMissing: 'هذا الحقل مطلوب',
    typeMismatch: 'الصيغة غير صحيحة',
    tooShort: 'القيمة قصيرة جداً',
    pattern: 'الصيغة غير صحيحة',
  };
  const labelOf = el => (el.closest('label') && el.closest('label').querySelector('span')
    ? el.closest('label').querySelector('span').childNodes[0].textContent.trim() : el.name);

  function check(el) {
    const box = el.closest('label') && el.closest('label').querySelector('.err');
    let msg = '';
    if (el.name === 'phone' && el.value.trim() && !/^\+?[\d\s()-]{8,20}$/.test(el.value.trim())) msg = 'اكتب رقماً صحيحاً مع رمز الدولة';
    else if (!el.validity.valid) {
      const k = Object.keys(MSG).find(key => el.validity[key]);
      msg = MSG[k] || 'القيمة غير صحيحة';
    }
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (box) box.textContent = msg;
    return !msg;
  }
  form.querySelectorAll('input:not([type=checkbox]), select, textarea').forEach(el => {
    el.addEventListener('blur', () => { if (el.value) check(el); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') check(el); });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    let first = null;
    form.querySelectorAll('input:not([type=checkbox]), select, textarea').forEach(el => { if (!check(el) && !first) first = el; });
    const agree = form.elements.agree;
    const agreeErr = form.querySelector('.agree-err');
    agreeErr.textContent = agree.checked ? '' : 'يجب الموافقة على الإقرار لإرسال الطلب';
    if (!agree.checked && !first) first = agree;
    if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    const data = new FormData(form);
    const rows = [];
    form.querySelectorAll('input:not([type=checkbox]), select, textarea').forEach(el => {
      const v = (data.get(el.name) || '').toString().trim();
      if (v) rows.push([labelOf(el), v]);
    });
    const interests = data.getAll('interest');
    if (interests.length) rows.push(['مجالات المشاركة', interests.join('، ')]);
    const today = new Date().toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' });
    sheet.innerHTML =
      `<div class="sheet-title"><img src="assets/logo.png" alt="" width="56" height="56"><div><b>جمعية تكامل لبناء القيم والتنمية</b><span>استمارة طلب العضوية · ${esc(today)}</span></div></div>` +
      `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` +
      `<p class="sheet-agree">✔ أقرّ مقدّم الطلب بصحة البيانات والتزامه بأهداف الجمعية ونظامها الأساسي وواجبات العضو.</p>` +
      `<div class="sheet-sign"><span>توقيع مقدّم الطلب: ..................</span><span>اعتماد الجمعية: ..................</span></div>`;

    const to = form.dataset.email;
    const mail = done.querySelector('[data-join-mail]');
    if (to) {
      const body = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
      mail.href = `mailto:${to}?subject=${encodeURIComponent('طلب عضوية — ' + (data.get('full_name') || ''))}&body=${encodeURIComponent(body)}`;
      mail.hidden = false;
    }
    form.hidden = true;
    done.hidden = false;
    done.focus({ preventScroll: true });
    done.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  form.addEventListener('reset', () => {
    form.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
  });
  done.querySelector('[data-join-print]').addEventListener('click', () => {
    document.body.classList.add('printing-join');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-join'), 500);
  });
  done.querySelector('[data-join-edit]').addEventListener('click', () => {
    done.hidden = true; form.hidden = false;
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
})();
