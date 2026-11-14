/* ينابيع as a phone app (PWA). Loaded on every page (tools/yanabee/core.py) before the page's own scripts.
   - Registers sw.js (it saves the site's own pages for offline use; never Supabase, accounts or photos).
   - Android, Chrome, Edge, Samsung: keeps the browser's install offer and shows «ثبّت» in the menu sheet, a small
     banner from the second page view (once every 3 weeks at most), and in the dashboard's «المزيد».
   - iPhone and iPad (no install offer exists there): the same places open a 3-step how-to for Safari's
     «إضافة إلى الشاشة الرئيسية».
   - Installed (opened from the home screen): html.is-app, no install prompts at all.
   - A notice when the connection drops or comes back, and «حدّث» when a new upload replaced the app.
   window.YBPWA = { state() -> 'installed' | 'prompt' | 'ios' | 'none', install(), on(fn) }, plus the 'yb-pwa' event. */
(() => {
  'use strict';
  const D = document, root = D.documentElement;
  const STORE = 'yanabee-pwa';                        // { n: page views, later: time of «لاحقًا» }
  const LATER_MS = 21 * 24 * 3600 * 1000;
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosOther = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return navigator.standalone === true; } };

  let deferred = null;
  let installed = standalone();
  if (installed) root.classList.add('is-app');
  // the app opens on the dashboard for someone signed in (the home page is the cover; inside is where the work is).
  // Only the presence of the session key is checked, never its content.
  if (installed && /[?&]source=app\b/.test(location.search)) {
    let signed = false;
    try { signed = !!localStorage.getItem('yanabee-session-v1'); } catch (e) { /* private mode */ }
    if (signed) { location.replace('account.html'); return; }
  }

  /* --------------------------------------------------------------- small helpers */
  const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; } };
  const write = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } };
  const NS = 'http://www.w3.org/2000/svg';
  const PATHS = {
    download: ['M12 15V3', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5'],
    share: ['M12 2v13', 'm16 6-4-4-4 4', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'],
    plus: ['M8 12h8', 'M12 8v8'],
    check: ['M20 6 9 17l-5-5'],
    x: ['M18 6 6 18', 'm6 6 12 12'],
    wifiOff: ['M12 20h.01', 'M8.5 16.429a5 5 0 0 1 7 0', 'M5 12.859a10 10 0 0 1 5.17-2.69', 'M19 12.859a10 10 0 0 0-2.007-1.523', 'M2 8.82a15 15 0 0 1 4.177-2.643', 'M22 8.82a15 15 0 0 0-11.288-3.764', 'm2 2 20 20'],
    wifi: ['M12 20h.01', 'M2 8.82a15 15 0 0 1 20 0', 'M5 12.859a10 10 0 0 1 14 0', 'M8.5 16.429a5 5 0 0 1 7 0'],
    refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  };
  function icon(name) {
    const s = D.createElementNS(NS, 'svg');
    s.setAttribute('class', 'i'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    if (name === 'plus') { const r = D.createElementNS(NS, 'rect'); [['width', 18], ['height', 18], ['x', 3], ['y', 3], ['rx', 2]].forEach(([k, v]) => r.setAttribute(k, v)); s.append(r); }
    (PATHS[name] || []).forEach(d => { const p = D.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); });
    return s;
  }
  function el(tag, attrs, ...kids) {
    const e = D.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(k => { if (k !== null && k !== undefined && k !== false) e.append(k); });
    return e;
  }

  /* --------------------------------------------------------------- state and listeners */
  const listeners = new Set();
  const state = () => installed ? 'installed' : deferred ? 'prompt' : isIOS ? 'ios' : 'none';
  function emit() {
    paintButtons();
    if (state() === 'installed' || state() === 'none') hideBanner();
    listeners.forEach(f => { try { f(state()); } catch (e) { /* a listener's problem stays its own */ } });
    try { window.dispatchEvent(new CustomEvent('yb-pwa', { detail: state() })); } catch (e) { /* old browser */ }
  }
  function paintButtons() {
    const can = state() === 'prompt' || state() === 'ios';
    D.querySelectorAll('[data-pwa-install]').forEach(b => {
      b.hidden = !can;
      if (!b.dataset.pwaBound) { b.dataset.pwaBound = '1'; b.addEventListener('click', () => install(b)); }
    });
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                                  // our own button and banner offer it instead
    deferred = e;
    emit();
    maybeBanner();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; deferred = null;
    hideBanner(); closeHowTo();
    toast('تم تثبيت ينابيع. تجده الآن على شاشتك الرئيسية.', null, 5000);
    emit();
  });

  async function install(from) {
    if (deferred) {
      const ev = deferred;
      deferred = null;                                   // a prompt can be shown only once
      try { await ev.prompt(); await ev.userChoice; } catch (e) { /* refused: the browser's own menu still offers it */ }
      emit();
      return;
    }
    if (isIOS && !installed) openHowTo(from);
  }

  /* --------------------------------------------------------------- the iPhone how-to */
  let sheet = null, lastFocus = null;
  function openHowTo(from) {
    closeHowTo(true);
    lastFocus = from || D.activeElement;
    const close = el('button', { type: 'button', class: 'pwa-x', 'aria-label': 'إغلاق', onclick: () => closeHowTo() }, icon('x'));
    const step = (n, ic, title, text) => el('li', { class: 'pwa-step' },
      el('span', { class: 'pwa-step-n', 'aria-hidden': 'true', text: String(n) }),
      el('div', {}, el('b', {}, el('span', { text: title }), el('span', { class: 'pwa-key' }, icon(ic))), el('small', { text })));
    const panel = el('div', { class: 'pwa-sheet-p', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pwa-how-h', tabindex: '-1' },
      el('div', { class: 'pwa-sheet-head' },
        el('img', { src: 'assets/icon-192.png', alt: '', width: '48', height: '48', class: 'pwa-app-ic' }),
        el('div', {}, el('h2', { id: 'pwa-how-h', text: 'أضف ينابيع إلى شاشتك الرئيسية' }), el('p', { text: 'ثلاث خطوات، ثم يفتح مثل أي تطبيق وبلا شريط المتصفح.' })),
        close),
      el('ol', { class: 'pwa-steps' },
        step(1, 'share', 'اضغط زر المشاركة', 'في أسفل Safari على iPhone، أو أعلاه على iPad.'),
        step(2, 'plus', 'اختر «إضافة إلى الشاشة الرئيسية»', 'مرّر قائمة المشاركة إلى الأسفل إن لم تره.'),
        step(3, 'check', 'اضغط «إضافة»', 'يظهر رمز ينابيع بين تطبيقاتك. افتحه من هناك.')),
      iosOther ? el('p', { class: 'pwa-note', text: 'إن لم تجد الخيار في هذا المتصفح، افتح الموقع في Safari وكرّر الخطوات.' }) : null,
      el('button', { type: 'button', class: 'btn btn-primary pwa-ok', text: 'فهمت', onclick: () => closeHowTo() }));
    sheet = el('div', { class: 'pwa-sheet' }, el('div', { class: 'pwa-sheet-bg', onclick: () => closeHowTo() }), panel);
    sheet.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeHowTo(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(panel.querySelectorAll('button'));
      if (e.shiftKey && (D.activeElement === f[0] || D.activeElement === panel)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && D.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    D.body.append(sheet);
    root.classList.add('pwa-lock');
    panel.focus();
    requestAnimationFrame(() => sheet && sheet.classList.add('on'));
  }
  function closeHowTo(quiet) {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    root.classList.remove('pwa-lock');
    if (!quiet && lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') lastFocus.focus();
    if (!quiet) lastFocus = null;
  }

  /* --------------------------------------------------------------- the banner (phones, second page view on) */
  let banner = null;
  function maybeBanner() {
    if (banner || installed) return;
    if (state() !== 'prompt' && state() !== 'ios') return;
    if (!D.body || window.innerWidth > 860) return;
    if (D.querySelector('.yd-bar')) return;              // the demo bar owns the bottom of the screen
    const s = read();
    if ((s.n || 0) < 2) return;
    if (s.later && Date.now() - s.later < LATER_MS) return;
    banner = el('div', { class: 'pwa-banner', role: 'region', 'aria-label': 'تثبيت ينابيع على هاتفك' },
      el('img', { src: 'assets/icon-192.png', alt: '', width: '44', height: '44', class: 'pwa-app-ic' }),
      el('div', { class: 'pwa-banner-t' }, el('b', { text: 'ثبّت ينابيع على هاتفك' }), el('small', { text: 'يفتح من شاشتك الرئيسية مثل أي تطبيق، والصفحات المحفوظة تعمل بلا إنترنت.' })),
      el('button', { type: 'button', class: 'btn btn-primary btn-sm pwa-go', 'data-pwa-install': '' }, icon('download'), el('span', { text: 'ثبّت' })),
      el('button', { type: 'button', class: 'pwa-x', 'aria-label': 'لاحقًا', title: 'لاحقًا', 'data-pwa-later': '', onclick: () => { write(Object.assign(read(), { later: Date.now() })); hideBanner(); } }, icon('x')));
    D.body.append(banner);
    paintButtons();
    requestAnimationFrame(() => banner && banner.classList.add('on'));
  }
  function hideBanner() { if (banner) { banner.remove(); banner = null; } }

  /* --------------------------------------------------------------- toasts: update, installed, connection */
  let toastEl = null, toastTimer = 0;
  function toast(text, action, ms) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = el('div', { class: 'pwa-toast', role: 'status', 'aria-live': 'polite' },
      el('span', { text }),
      action ? el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-pwa-reload': '', onclick: action.run }, icon('refresh'), el('span', { text: action.label })) : null,
      el('button', { type: 'button', class: 'pwa-x', 'aria-label': 'إغلاق', onclick: () => { if (toastEl) toastEl.remove(); toastEl = null; } }, icon('x')));
    D.body.append(toastEl);
    requestAnimationFrame(() => toastEl && toastEl.classList.add('on'));
    if (ms) toastTimer = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; }, ms);
  }

  let net = null, netTimer = 0;
  function connection(online) {
    clearTimeout(netTimer);
    if (!net) { net = el('div', { class: 'pwa-net', role: 'status', 'aria-live': 'polite' }); D.body.append(net); }
    net.replaceChildren(icon(online ? 'wifi' : 'wifiOff'), el('span', { text: online ? 'عاد الاتصال.' : 'لا يوجد اتصال بالإنترنت. تعرض آخر نسخة محفوظة.' }));
    net.className = 'pwa-net on' + (online ? ' ok' : '');
    root.classList.toggle('is-offline', !online);
    if (online) netTimer = setTimeout(() => { if (net) net.className = 'pwa-net'; }, 2600);
  }
  window.addEventListener('offline', () => connection(false));
  window.addEventListener('online', () => connection(true));

  /* --------------------------------------------------------------- the offline page */
  function offlinePage() {
    D.querySelectorAll('[data-pwa-retry]').forEach(b => b.addEventListener('click', () => location.reload()));
    const box = D.querySelector('[data-pwa-saved]');
    if (!box || !window.caches) return;
    const labels = {};
    D.querySelectorAll('.sheet-item[href]').forEach(a => { labels[a.getAttribute('href')] = a.textContent.trim(); });
    caches.keys().then(ks => Promise.all(ks.filter(k => /^yb-pages-/.test(k)).map(k => caches.open(k).then(c => c.keys())))).then(lists => {
      const files = new Set();
      lists.flat().forEach(r => { const f = new URL(r.url).pathname.split('/').pop(); if (labels[f]) files.add(f); });
      if (!files.size) return;
      box.querySelector('ul').replaceChildren(...Array.from(files).map(f => el('li', {}, el('a', { href: f, text: labels[f] }))));
      box.hidden = false;
    }).catch(() => {});
  }

  /* --------------------------------------------------------------- the service worker */
  // Automated browsers (the test suites) keep the old behaviour unless a test asks for the worker (YB_PWA_TEST).
  const allowSW = 'serviceWorker' in navigator && window.isSecureContext && !(navigator.webdriver && !window.YB_PWA_TEST);
  function startWorker() {
    if (!allowSW) return;
    const had = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || refreshing) return;
      toast('وصلت نسخة جديدة من ينابيع.', { label: 'حدّث', run: () => { refreshing = true; location.reload(); } });
    });
    navigator.serviceWorker.register('sw.js').then(reg => {
      // an installed app can stay open for days: look for a new upload whenever it comes back to the front
      D.addEventListener('visibilitychange', () => { if (D.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => { /* no worker: the site works as before */ });
  }

  function start() {
    const s = read();
    write(Object.assign(s, { n: (s.n || 0) + 1 }));
    paintButtons();
    if (navigator.onLine === false) connection(false);
    if (D.body && D.body.dataset.page === 'offline.html') offlinePage();
    startWorker();
    if (isIOS && !installed) maybeBanner();
  }

  window.YBPWA = { state, install, on: fn => { listeners.add(fn); return () => listeners.delete(fn); }, openHowTo };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
