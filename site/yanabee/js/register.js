// register.html: team registration form (competition.txt c-form) + parent consent copies (c-consent).
// A draft in localStorage, a printable form, consent copies, copyable text, a WhatsApp link to the organisers' number.
// With the backend configured (yb-config.js) two more things: «أرسل التسجيل» sends the checked form once
// (yb_register_team, supabase/migrations/0005_yb_register_fee.sql) and returns a request number; «تابع طلبك» shows
// the team checklist from that number + the leader's phone (yb_track_request). Nothing else leaves the page.
(() => {
  const WA = '905305175431'; // c-ad-how «للتسجيل والاستفسار: 05305175431» in international form without + (Turkey, 90)
  const KEY = 'yanabee-reg-draft';
  const MIN = 5, MAX = 7;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $('[data-reg]');
  if (!form) return;
  const body = $('[data-members]', form);
  const count = $('[data-member-count]', form);
  const addBtn = $('[data-add-member]', form);
  const errBox = $('[data-errors]', form);
  const saved = $('[data-saved]', form);
  const done = $('[data-done]');
  const F = n => form.elements[n];
  const trashIcon = ($('[data-clear] svg') || {}).outerHTML || '×';
  const YBX = window.YB;
  const ONLINE = !!(YBX && YBX.configured);
  const SENT_KEY = 'yanabee-reg-sent';

  /* ---------------- member rows ---------------- */
  const row = (m = {}) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td>'
      + '<td><input type="text" data-m="n" autocomplete="off" aria-label="الاسم الثلاثي"></td>'
      + '<td><input type="number" data-m="a" min="1" inputmode="numeric" aria-label="العمر"></td>'
      + '<td><input type="tel" data-m="c" autocomplete="off" aria-label="رقم التواصل / ولي الأمر"></td>'
      + '<td><button type="button" class="mdel" aria-label="احذف هذا العضو">' + trashIcon + '</button></td>';
    $('[data-m="n"]', tr).value = m.n || '';
    $('[data-m="a"]', tr).value = m.a || '';
    $('[data-m="c"]', tr).value = m.c || '';
    return tr;
  };
  const rows = () => $$('tr', body);
  const members = () => rows().map(tr => ({ n: $('[data-m="n"]', tr).value.trim(), a: $('[data-m="a"]', tr).value.trim(), c: $('[data-m="c"]', tr).value.trim() }));
  const named = () => members().filter(m => m.n);

  const renumber = () => {
    const rs = rows();
    rs.forEach((tr, i) => {
      tr.cells[0].textContent = i + 1;
      tr.classList.toggle('is-leader', i === 0);
      const del = $('.mdel', tr);
      del.disabled = rs.length <= MIN || i === 0;
      $('[data-m="n"]', tr).readOnly = i === 0;
      if (i === 0) $('[data-m="n"]', tr).title = 'اسم القائد يُكتب في خانة «اسم قائد الفريق»';
    });
    addBtn.disabled = rs.length >= MAX;
    const n = named().length;
    count.textContent = `${n} من ${rs.length} أعضاء مكتوبة أسماؤهم · المطلوب من ${MIN} إلى ${MAX} شاملًا القائد`;
    count.classList.toggle('bad', n < MIN || n > MAX);
  };

  // The members' names feed every nominee list; a chosen name stays chosen while it exists.
  const fillSelects = () => {
    const names = named().map(m => m.n);
    $$('select[data-member-select]', form).forEach(sel => {
      // data-want holds a choice restored from the draft (or whose name is being edited) until the name exists.
      const want = sel.dataset.want || sel.value;
      const first = sel.options[0].cloneNode(true);
      sel.replaceChildren(first, ...names.map(n => new Option(n, n)));
      sel.value = names.includes(want) ? want : '';
      if (sel.value) delete sel.dataset.want; else if (want) sel.dataset.want = want;
    });
  };

  const syncLeader = () => {
    const first = rows()[0];
    if (first) $('[data-m="n"]', first).value = F('leader').value.trim();
  };

  const refresh = () => { syncLeader(); renumber(); fillSelects(); };

  addBtn.addEventListener('click', () => {
    if (rows().length >= MAX) return;
    const tr = row();
    body.append(tr);
    refresh();
    $('[data-m="n"]', tr).focus();
    save();
  });
  body.addEventListener('click', e => {
    const del = e.target.closest('.mdel');
    if (!del || del.disabled) return;
    del.closest('tr').remove();
    refresh();
    save();
  });

  /* ---------------- draft (this browser only) ---------------- */
  let timer = 0;
  const snapshot = () => {
    const f = {};
    [...form.elements].forEach(el => {
      if (!el.name) return;
      f[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return { f, m: members() };
  };
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(snapshot()));
        const t = new Date();
        saved.textContent = `حُفظت المسودة على هذا الجهاز ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      } catch (e) { saved.textContent = 'لا يمكن حفظ المسودة في هذا المتصفح؛ أكمل الاستمارة واطبعها الآن.'; }
    }, 400);
  };
  const load = () => {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    const ms = d && Array.isArray(d.m) && d.m.length ? d.m.slice(0, MAX) : [];
    while (ms.length < MIN) ms.push({});
    body.replaceChildren(...ms.map(row));
    if (d && d.f) {
      Object.entries(d.f).forEach(([k, v]) => {
        const el = F(k);
        if (!el || el instanceof RadioNodeList) return;
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.tagName === 'SELECT') el.dataset.want = v || '';
        else el.value = v;
      });
      saved.textContent = 'استُعيدت مسودتك المحفوظة على هذا الجهاز.';
    }
    refresh();
  };

  form.addEventListener('input', e => {
    if (e.target.name === 'leader' || e.target.dataset.m === 'n') refresh();
    if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
    save();
  });
  form.addEventListener('change', e => {
    if (e.target.matches('select[data-member-select]')) delete e.target.dataset.want;
    save();
  });

  $('[data-clear]', form).addEventListener('click', () => {
    if (!confirm('مسح كل ما كتبته في الاستمارة من هذا الجهاز؟')) return;
    try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    form.reset();
    $$('select[data-member-select]', form).forEach(s => { delete s.dataset.want; });
    body.replaceChildren(...Array.from({ length: MIN }, () => row()));
    refresh();
    errBox.hidden = true;
    done.hidden = true;
    saved.textContent = 'مُسحت البيانات.';
  });

  /* ---------------- checks ---------------- */
  const digits = s => s.replace(/[^\d٠-٩۰-۹]/g, '');
  const validate = () => {
    const errs = [];
    const bad = (el, msg) => { if (el) el.setAttribute('aria-invalid', 'true'); errs.push({ el, msg }); };
    $$('[aria-invalid]', form).forEach(el => el.removeAttribute('aria-invalid'));
    if (!F('team').value.trim()) bad(F('team'), 'اكتب اسم الفريق.');
    if (!F('leader').value.trim()) bad(F('leader'), 'اكتب اسم قائد الفريق.');
    if (digits(F('phone').value).length < 7) bad(F('phone'), 'اكتب رقم تواصل صحيحًا للقائد.');
    const em = F('email').value.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) bad(F('email'), 'البريد الإلكتروني غير صحيح، أو اتركه فارغًا.');
    const rs = rows();
    const ms = members();
    const n = ms.filter(m => m.n).length;
    if (n < MIN || n > MAX) bad($('[data-m="n"]', rs.find((tr, i) => !ms[i].n) || rs[0]), `عدد الأعضاء ${n}؛ المطلوب من ${MIN} إلى ${MAX} شاملًا القائد.`);
    ms.forEach((m, i) => {
      if (!m.n) return;
      const tr = rs[i];
      if (!m.a) bad($('[data-m="a"]', tr), `اكتب عمر العضو ${i + 1} (${m.n}).`);
      else if (!(+m.a > 0 && +m.a < 100)) bad($('[data-m="a"]', tr), `عمر العضو ${i + 1} (${m.n}) يبدو غير صحيح.`);
      if (digits(m.c).length < 7) bad($('[data-m="c"]', tr), `اكتب رقم تواصل العضو ${i + 1} (${m.n}) أو رقم ولي أمره.`);
    });
    const seen = new Set();
    ms.forEach((m, i) => { if (m.n && seen.has(m.n)) bad($('[data-m="n"]', rs[i]), `الاسم «${m.n}» مكرر في الجدول.`); seen.add(m.n); });
    ['rec1', 'rec2', 'chess'].forEach(k => { if (!F(k).value) bad(F(k), `اختر ${F(k).closest('.f').querySelector('.f-l').textContent.replace('*', '').trim()}.`); });
    if (F('rec1').value && F('rec1').value === F('rec2').value) bad(F('rec2'), 'المرشح الأول والمرشح الثاني للتسميع يجب أن يكونا عضوين مختلفين.');
    $$('input[type=checkbox][required]', form).forEach(c => { if (!c.checked) bad(c, 'وافق على التعهد: ' + c.closest('.chk').textContent.trim()); });
    return errs;
  };

  const minors = () => named().filter(m => !m.a || +m.a < 18);
  const summary = () => {
    const ms = named();
    return `فريق «${F('team').value.trim()}» بقيادة ${F('leader').value.trim()}، ${ms.length} أعضاء. `
      + `يحتاج ${minors().length} منهم إلى موافقة ولي الأمر. اطبع الاستمارة والموافقات وسلّمها لمسؤول التسجيل مع الرسوم.`;
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      errBox.replaceChildren();
      const h = document.createElement('b');
      h.textContent = `راجع ${errs.length === 1 ? 'ملاحظة واحدة' : errs.length + ' ملاحظات'} قبل الطباعة:`;
      const ul = document.createElement('ul');
      errs.forEach(x => { const li = document.createElement('li'); li.textContent = x.msg; ul.append(li); });
      errBox.append(h, ul);
      errBox.hidden = false;
      done.hidden = true;
      const first = errs.find(x => x.el);
      if (first) { first.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); first.el.focus({ preventScroll: true }); }
      return;
    }
    errBox.hidden = true;
    $('[data-done-sum]', done).textContent = summary();
    const sb = $('[data-send-box]', done);
    if (sb) { sb.hidden = !ONLINE; $('[data-send-err]', done).hidden = true; }
    const wa = $('[data-wa]', done);
    if (WA) { wa.href = `https://wa.me/${WA}?text=${encodeURIComponent(text())}`; wa.hidden = false; $('[data-wa-note]', done).hidden = true; }
    done.hidden = false;
    done.scrollIntoView({ block: 'center', behavior: 'smooth' });
    done.focus({ preventScroll: true });
    save();
  });

  /* ---------------- outputs: text, form print, consent print ---------------- */
  const label = n => { const el = F(n); const l = el && el.closest('.f'); return l ? l.querySelector('.f-l').textContent.replace('*', '').trim() : n; };
  const text = () => {
    const lines = ['طلب تسجيل فريق · المسابقة الأولى (سورة الصف) · مشروع ينابيع', ''];
    ['team', 'leader', 'phone', 'email', 'area'].forEach(n => { if (F(n).value.trim()) lines.push(`${label(n)} ${F(n).value.trim()}`); });
    lines.push('', 'الأعضاء:');
    named().forEach((m, i) => lines.push(`${i + 1}. ${m.n} · ${m.a || '—'} سنة · ${m.c || '—'}${i === 0 ? ' (القائد)' : ''}`));
    lines.push('');
    ['rec1', 'rec2', 'chess', 'coord'].forEach(n => { if (F(n).value) lines.push(`${label(n)} ${F(n).value}`); });
    if (F('idea').value.trim()) lines.push(`${label('idea')} ${F('idea').value.trim()}`);
    lines.push('', 'وافق القائد على تعهد الفريق.');
    return lines.join('\n');
  };

  const printOnly = window.__yanabeePrintOnly || (cls => {
    document.body.classList.add(cls);
    const off = () => { document.body.classList.remove(cls); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  });

  $('[data-print-form]', done).addEventListener('click', () => printOnly('print-form'));

  const tpl = $('[data-consent-tpl]');
  const area = $('[data-consent-print]');
  const consentCopies = list => {
    area.replaceChildren(...list.map(m => {
      const c = tpl.cloneNode(true);
      c.removeAttribute('data-consent-tpl');
      c.classList.remove('rv');
      c.classList.add('in');
      const put = (k, v) => { const i = $(`i[data-k="${k}"]`, c); if (i && v) i.textContent = v; };
      put(0, m.n);
      put(2, m.team);
      put(5, m.c);
      return c;
    }));
  };
  $('[data-print-consent]', done).addEventListener('click', () => {
    const team = F('team').value.trim();
    const list = minors().map(m => ({ ...m, team }));
    consentCopies(list.length ? list : [{ team }]);
    printOnly('print-consent');
  });
  const blank = $('[data-print-blank]');
  if (blank) blank.addEventListener('click', () => { consentCopies([{}]); printOnly('print-consent'); });

  $('[data-copy]', done).addEventListener('click', async e => {
    const b = e.currentTarget;
    const span = $('span', b);
    const old = span.textContent;
    const t = text();
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (err2) { ok = false; }
      ta.remove();
    }
    span.textContent = ok ? 'نُسخ النص' : 'تعذّر النسخ';
    setTimeout(() => { span.textContent = old; }, 2200);
  });

  /* ---------------- online: send once, get a request number ---------------- */
  const readSent = () => { try { const v = JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const writeSent = list => { try { localStorage.setItem(SENT_KEY, JSON.stringify(list.slice(0, 5))); } catch (e) { /* storage blocked */ } };
  const fmtRef = ref => (window.YBChecklist ? YBChecklist.fmtRef(ref) : ref);
  const payload = () => ({
    team: F('team').value.trim(), leader: F('leader').value.trim(), phone: F('phone').value.trim(),
    email: F('email').value.trim() || null, area: F('area').value.trim() || null,
    members: named().map((m, i) => ({ name: i === 0 ? F('leader').value.trim() : m.n, age: Number(digits(m.a)) || null, contact: m.c })),
    reciter1: F('rec1').value, reciter2: F('rec2').value, chess: F('chess').value,
    coordinator: F('coord').value || null, idea: F('idea').value.trim() || null,
    pledges: $$('input[type=checkbox][required]', form).every(c => c.checked)
  });
  const waSent = (team, ref) => `https://wa.me/${WA}?text=${encodeURIComponent(`السلام عليكم، سجّلنا فريق «${team}» في مسابقة ينابيع. رقم الطلب: ${fmtRef(ref)}`)}`;
  const elx = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v === null || v === undefined || v === false) return; if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v); });
    kids.forEach(k => { if (k !== null && k !== undefined) n.append(k); });
    return n;
  };
  const sentBox = $('[data-sent]', done);
  const showSent = (team, ref, phone, again) => {
    const copyB = elx('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-copy-ref': true }, elx('span', { text: 'انسخ الرقم' }));
    copyB.addEventListener('click', async () => {
      let okc = false;
      try { await navigator.clipboard.writeText(fmtRef(ref)); okc = true; } catch (e) { okc = false; }
      copyB.firstChild.textContent = okc ? 'نُسخ الرقم' : 'تعذّر النسخ';
      setTimeout(() => { copyB.firstChild.textContent = 'انسخ الرقم'; }, 2200);
    });
    const trackB = elx('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-go-track': true }, elx('span', { text: 'تابع حالة الطلب' }));
    trackB.addEventListener('click', () => runTrack(ref, phone, true));
    const wa = elx('a', { class: 'btn btn-ghost btn-sm', href: waSent(team, ref), target: '_blank', rel: 'noopener', 'data-wa-sent': true }, elx('span', { text: 'أبلغ الإدارة عبر واتساب' }));
    const claim = elx('a', { class: 'btn btn-ghost btn-sm', href: `account.html?claim=${encodeURIComponent(ref)}`, 'data-claim-link': true }, elx('span', { text: 'أنشئ حساب قائد واربط الفريق' }));
    sentBox.replaceChildren(
      elx('h4', { text: again ? 'وصل طلبكم من قبل: هذا رقمه' : 'وصل تسجيل فريقكم إلى إدارة المسابقة' }),
      elx('div', { class: 'sent-ref' }, elx('span', { text: 'رقم الطلب' }), elx('b', { 'data-ref': true, text: fmtRef(ref) }), copyB),
      elx('p', { class: 'f-hint', text: 'احتفظ بالرقم: تتابع به حالة الفريق مع رقم هاتف القائد. حُفظ أيضًا على هذا الجهاز.' }),
      elx('ol', { class: 'sent-next' },
        elx('li', { text: 'سدّد رسوم الفريق لمسؤول التسجيل مقابل إيصال.' }),
        elx('li', { text: 'اطبع موافقات أولياء الأمور، ووقّعها كل ولي أمر، ثم سلّمها.' }),
        elx('li', { text: 'تابع حالة الطلب هنا، أو أنشئ حساب قائد واربط الفريق به لتصلك التنبيهات.' })),
      elx('div', { class: 'btns' }, trackB, wa, claim));
    sentBox.hidden = false;
    sentBox.focus({ preventScroll: true });
    sentBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const sendBtn = $('[data-send]', done);
  if (sendBtn) sendBtn.addEventListener('click', async () => {
    if (!ONLINE || sendBtn.disabled) return;
    const errs = validate();
    const sendErr = $('[data-send-err]', done);
    if (errs.length) { sendErr.textContent = 'تغيّرت الاستمارة: اضغط «تحقق من الاستمارة» أولًا.'; sendErr.hidden = false; return; }
    sendErr.hidden = true;
    const label = $('span', sendBtn), old = label.textContent;
    sendBtn.disabled = true; label.textContent = 'جارٍ الإرسال…';
    const p = payload();
    const r = await YBX.rpc('yb_register_team', { p });
    sendBtn.disabled = false; label.textContent = old;
    if (!r.ok || !r.data || !r.data.ref) {
      sendErr.textContent = r.error === 'network' || r.error === 'timeout'
        ? 'لم يُرسل التسجيل: تحقق من الاتصال ثم اضغط «أرسل التسجيل» مرة أخرى. بياناتك محفوظة في هذا المتصفح.'
        : YBX.errorText(r);
      sendErr.hidden = false;
      return;
    }
    const list = readSent().filter(x => x.ref !== r.data.ref);
    list.unshift({ ref: r.data.ref, team: p.team, phone: p.phone, at: new Date().toISOString() });
    writeSent(list);
    $('[data-send-box]', done).hidden = true;
    showSent(p.team, r.data.ref, p.phone, !!r.data.duplicate);
    paintMine();
  });

  /* ---------------- «تابع طلبك» ---------------- */
  const tBox = $('[data-track]');
  const tForm = $('[data-track-form]');
  const tOut = $('[data-track-out]');
  const tErr = $('[data-track-err]');
  const mine = $('[data-track-mine]');
  async function runTrack(ref, phone, scroll) {
    if (!tForm) return;
    tForm.elements.ref.value = fmtRef(String(ref).replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^YN(?=.{8}$)/, ''));
    tForm.elements.tphone.value = phone;
    if (scroll) tBox.scrollIntoView({ block: 'start', behavior: 'smooth' });
    tErr.hidden = true;
    tOut.replaceChildren(elx('p', { class: 'f-hint', text: 'جارٍ البحث عن الطلب…' }));
    const r = await YBX.rpc('yb_track_request', { ref: String(ref), phone: String(phone) });
    if (!r.ok || !r.data || !r.data.team) {
      tOut.replaceChildren();
      tErr.textContent = r.error === 'not_found'
        ? 'لم نجد طلبًا بهذا الرقم وهذا الهاتف. اكتبهما كما ظهرا عند الإرسال.'
        : YBX.errorText(r);
      tErr.hidden = false;
      return;
    }
    const c = r.data.team;
    tOut.replaceChildren(YBChecklist.render(c, { claim: true, claimHref: `account.html?claim=${encodeURIComponent(c.ref || ref)}` }));
  }
  function paintMine() {
    if (!mine) return;
    const list = readSent();
    mine.hidden = !list.length;
    mine.replaceChildren(...(list.length ? [elx('small', { text: 'طلبات أُرسلت من هذا الجهاز:' })].concat(list.map(x => {
      const b = elx('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-mine': x.ref }, elx('span', { text: `${x.team} · ${fmtRef(x.ref)}` }));
      b.addEventListener('click', () => runTrack(x.ref, x.phone));
      return b;
    })) : []));
  }
  if (tBox) {
    $$('[data-priv-local]').forEach(n => { n.hidden = ONLINE; });
    $$('[data-priv-online]').forEach(n => { n.hidden = !ONLINE; });
    if (!ONLINE) {
      tForm.hidden = true;
      $('[data-track-off]').hidden = false;
    } else {
      paintMine();
      tForm.addEventListener('submit', e => {
        e.preventDefault();
        const ref = tForm.elements.ref.value.trim(), ph = tForm.elements.tphone.value.trim();
        if (!ref || digits(ph).length < 7) { tErr.textContent = 'اكتب رقم الطلب ورقم هاتف القائد.'; tErr.hidden = false; return; }
        runTrack(ref, ph);
      });
      const qref = new URLSearchParams(location.search).get('ref');
      if (qref) tForm.elements.ref.value = qref.slice(0, 16);
    }
  }

  load();
})();
