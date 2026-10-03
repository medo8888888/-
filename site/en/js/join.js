// Membership application: validation, review sheet, print/PDF and optional e-mail.
// Personal data stays in the visitor's browser (nothing is stored or uploaded).
(() => {
  // donation presets / program buttons (support page)
  const donate = document.querySelector('.donate-form');
  if (donate) {
    donate.querySelectorAll('[name=amount_preset]').forEach(r => r.addEventListener('change', () => {
      donate.elements.amount.value = r.value; donate.elements.amount.dispatchEvent(new Event('input'));
    }));
    donate.elements.amount.addEventListener('input', () => {
      donate.querySelectorAll('[name=amount_preset]').forEach(r => { r.checked = r.value === donate.elements.amount.value; });
    });
    document.querySelectorAll('[data-program]').forEach(b => b.addEventListener('click', () => {
      donate.elements.program.value = b.dataset.program;
      document.getElementById('donate').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => donate.elements.amount.focus({ preventScroll: true }), 600);
    }));
  }
  document.querySelectorAll('.join-form').forEach(setup);
  function setup(form) {
  const done = form.nextElementSibling;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MSG = {
    valueMissing: 'This field is required',
    typeMismatch: 'Invalid format',
    tooShort: 'The value is too short',
    pattern: 'Invalid format',
  };
  const labelOf = el => (el.closest('label') && el.closest('label').querySelector('span')
    ? el.closest('label').querySelector('span').childNodes[0].textContent.trim() : el.name);

  function check(el) {
    const box = el.closest('label') && el.closest('label').querySelector('.err');
    let msg = '';
    if (el.name === 'phone' && el.value.trim() && !/^\+?[\d\s()-]{8,20}$/.test(el.value.trim())) msg = 'Enter a valid number with the country code';
    else if (!el.validity.valid) {
      const k = Object.keys(MSG).find(key => el.validity[key]);
      msg = MSG[k] || 'Invalid value';
    }
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (box) box.textContent = msg;
    return !msg;
  }
  form.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => {
    el.addEventListener('blur', () => { if (el.value) check(el); });
    el.addEventListener('input', () => { if (el.getAttribute('aria-invalid') === 'true') check(el); });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    let first = null;
    form.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => { if (!check(el) && !first) first = el; });
    const agree = form.elements.agree;
    const agreeErr = form.querySelector('.agree-err');
    agreeErr.textContent = agree.checked ? '' : 'You must accept the declaration to submit the application';
    if (!agree.checked && !first) first = agree;
    if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

    const data = new FormData(form);
    const rows = [];
    form.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea').forEach(el => {
      const v = (data.get(el.name) || '').toString().trim();
      if (v) rows.push([labelOf(el), v]);
    });
    const interests = data.getAll('interest');
    if (interests.length) rows.push(['Areas of participation', interests.join(', ')]);
    if (form._extraRows) rows.push(...form._extraRows());
    const today = new Date().toLocaleDateString(document.documentElement.lang || 'ar', { year: 'numeric', month: 'long', day: 'numeric' });
    done.querySelector('.done-sheet').innerHTML =
      `<div class="sheet-title"><img src="assets/logo.png" alt="" width="56" height="56"><div><b>Takamul Association for Building Values and Development</b><span>${esc(form.dataset.title || 'Membership Application Form')} · ${esc(today)}</span></div></div>` +
      `<dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` +
      `<p class="sheet-agree">✔ The applicant confirms that the information is accurate and commits to the Association’s objectives, its bylaws and the member duties.</p>` +
      `<div class="sheet-sign"><span>Applicant’s signature: ..................</span><span>Association approval: ..................</span></div>`;

    if (form._afterSheet) form._afterSheet(done);
    const to = form.dataset.email;
    const mail = done.querySelector('[data-join-mail]');
    if (to) {
      const body = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
      mail.href = `mailto:${to}?subject=${encodeURIComponent((form.dataset.title || 'Membership Application') + ' — ' + (data.get('full_name') || ''))}&body=${encodeURIComponent(body)}`;
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
    const sec = form.closest('section');
    sec.classList.add('print-target');
    document.body.classList.add('printing-join');
    window.print();
    setTimeout(() => { document.body.classList.remove('printing-join'); sec.classList.remove('print-target'); }, 500);
  });
  done.querySelector('[data-join-edit]').addEventListener('click', () => {
    done.hidden = true; form.hidden = false;
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  }
})();
