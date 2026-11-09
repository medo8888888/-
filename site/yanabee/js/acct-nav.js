// Account button in the top bar: shows a green dot when a session is stored in this browser.
// Reads localStorage only — no network, no tokens exposed. The full client is js/yb-api.js (account and tournament pages).
(() => {
  try {
    const raw = localStorage.getItem('yanabee-session-v1');
    const s = raw && JSON.parse(raw);
    if (!(s && s.access_token)) return;
    document.querySelectorAll('[data-acct]').forEach(a => {
      const d = a.querySelector('.acct-dot');
      if (d) d.hidden = false;
      a.setAttribute('aria-label', 'حسابي: أنت مسجّل الدخول');
    });
  } catch (e) { /* storage blocked */ }
})();
