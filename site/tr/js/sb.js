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
  window.TakamulSB = { client, lang, locale, esc, date, money, daysLeft, toast, retry };
})();
