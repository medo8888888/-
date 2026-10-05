// @i18n-self — shared helpers for the member portal and the admin panel.
// Supabase project "takamul-members". The publishable key is meant for browsers:
// every table is protected by row-level security (members see only their own rows).
(() => {
  const CFG = {
    url: 'https://lkokmbtwowqbhepqgjef.supabase.co',
    key: 'sb_publishable_-9kR_rE04m4nc8W0T7UYfg_moMpe6cP',
  };
  if (!window.supabase || !window.supabase.createClient) { console.error('supabase-js missing'); return; }
  const client = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'takamul-auth' },
  });
  const lang = (document.documentElement.lang || 'ar').slice(0, 2);
  const locale = { ar: 'ar', en: 'en-GB', tr: 'tr-TR' }[lang] || 'ar';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = d => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const money = (n, c) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(+n || 0) + ' ' + (c || '');
  const daysLeft = d => (d ? Math.ceil((new Date(d + 'T23:59:59') - new Date()) / 864e5) : null);
  function toast(msg, kind) {
    let t = document.querySelector('.pt-toast');
    if (!t) { t = document.createElement('div'); t.className = 'pt-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.dataset.kind = kind || 'ok'; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 4200);
  }
  // retry a Supabase query on transient network failures (weak mobile connections)
  async function retry(fn, tries = 3) {
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fn();
        const msg = r && r.error && String(r.error.message || '');
        if (!(msg && /fetch|network|Failed/i.test(msg))) return r;
        last = r;
      } catch (e) { last = { data: null, error: e }; }
      await new Promise(res => setTimeout(res, 700 * (i + 1)));
    }
    return last;
  }
  // QR code as inline SVG (vendor/qrcode.js); returns '' when the library is not on the page
  function qrSvg(text) {
    if (!window.qrcode) return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  // public verification link for a member card (works from /, /en/, /tr/)
  const verifyUrl = (no, code) => new URL(`verify.html?n=${encodeURIComponent(no)}&c=${encodeURIComponent(code)}`, location.href).href;

  // print one filled <template data-tpl=...> on its own sheet (receipt, member card)
  function printTpl(name, fill) {
    const tpl = document.querySelector(`template[data-tpl="${name}"]`);
    if (!tpl) return;
    const sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    sheet.appendChild(tpl.content.cloneNode(true));
    const set = (k, v, html) => sheet.querySelectorAll(`[data-r="${k}"]`).forEach(x => { if (html) x.innerHTML = v; else x.textContent = v == null || v === '' ? '—' : v; });
    fill(set);
    document.body.appendChild(sheet);
    document.body.classList.add('is-printing');
    const done = () => { sheet.remove(); document.body.classList.remove('is-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    const imgs = [...sheet.querySelectorAll('img')].filter(i => !i.complete);
    Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60));
  }
  const METHOD = { ar: { bank_transfer: 'تحويل بنكي', cash: 'نقداً', other: 'أخرى' }, en: { bank_transfer: 'Bank transfer', cash: 'Cash', other: 'Other' }, tr: { bank_transfer: 'Banka havalesi', cash: 'Nakit', other: 'Diğer' } }[lang] || {};
  function printReceipt(p, member) {
    printTpl('receipt', set => {
      set('no', String(p.receipt_no || '').padStart(5, '0'));
      set('name', member.full_name || member.email); set('member', member.member_no);
      set('amount', money(p.amount, p.currency)); set('method', METHOD[p.method] || p.method);
      set('paid', date(p.paid_on)); set('ref', p.reference); set('from', date(p.period_start)); set('to', date(p.period_end));
      set('issued', date(new Date().toISOString()));
    });
  }
  function printCard(member, photoUrl) {
    printTpl('card', set => {
      set('name', member.full_name); set('no', member.member_no); set('joined', date(member.joined_at)); set('expires', date(member.expires_at));
      set('photo', photoUrl ? `<img src="${esc(photoUrl)}" alt="">` : esc((member.full_name || '?').trim().charAt(0)), true);
      set('qr', member.member_no ? qrSvg(verifyUrl(member.member_no, member.verify_code)) : '', true);
      set('code', member.verify_code);
    });
  }
  window.TakamulSB = { client, lang, locale, esc, date, money, daysLeft, toast, retry, qrSvg, verifyUrl, printReceipt, printCard };
})();
