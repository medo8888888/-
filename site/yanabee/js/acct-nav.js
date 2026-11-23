// Account button in the top bar: shows a green dot when a session is stored in this browser (an orange one for the demo).
// Reads localStorage only — no network, no tokens exposed. The full client is js/yb-api.js (account and tournament pages).
// Demo mode (js/yb-demo.js) keeps a fake session whose token starts with 'demo-' and a tab-only flag in sessionStorage. A demo token
// found WITHOUT that flag (the demo tab was closed, or this is another tab) is stale and is removed here, on every page, before
// js/yb-api.js can read it: a demo token must never be sent to a real backend.
(() => {
  try {
    let demoOn = false;
    try { demoOn = sessionStorage.getItem('yanabee-demo') === '1'; } catch (e) { /* storage blocked */ }
    const raw = localStorage.getItem('yanabee-session-v1');
    const s = raw && JSON.parse(raw);
    if (!(s && s.access_token)) return;
    const demo = String(s.access_token).indexOf('demo-') === 0;
    if (demo && !demoOn) { localStorage.removeItem('yanabee-session-v1'); return; }
    document.querySelectorAll('[data-acct]').forEach(a => {
      const d = a.querySelector('.acct-dot');
      if (d) { d.hidden = false; if (demo) d.style.background = 'var(--sun)'; }
      a.setAttribute('aria-label', demo ? 'حسابي: وضع تجريبي' : 'حسابي: أنت مسجّل الدخول');
    });
  } catch (e) { /* storage blocked */ }
})();
