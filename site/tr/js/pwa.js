// @i18n-self — carries its own ar/en/tr strings.
// Installable app: registers the service worker and drives every [data-install] button.
// Chrome/Edge/Android: native install prompt. iOS Safari: short "Add to Home Screen" hint.
(() => {
  const lang = (document.documentElement.lang || 'ar').slice(0, 2);
  const T = {
    ar: { ios: 'لتثبيت التطبيق على iPhone: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».', done: 'تم تثبيت التطبيق ✓', other: 'افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».' },
    en: { ios: 'To install on iPhone: tap the Share button, then “Add to Home Screen”.', done: 'App installed ✓', other: 'Open your browser menu and choose “Install app” or “Add to Home screen”.' },
    tr: { ios: 'iPhone’a yüklemek için: Paylaş düğmesine, ardından «Ana Ekrana Ekle»ye dokunun.', done: 'Uygulama yüklendi ✓', other: 'Tarayıcı menüsünü açıp «Uygulamayı yükle» veya «Ana ekrana ekle»yi seçin.' },
  }[lang] || {};
  const base = lang === 'ar' ? './' : '../';
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', () => navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {}));
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  const btns = [...document.querySelectorAll('[data-install]')];
  let deferred = null;
  const show = on => btns.forEach(b => { b.hidden = !on; });
  const toast = msg => {
    let t = document.querySelector('.pwa-toast');
    if (!t) { t = document.createElement('div'); t.className = 'pwa-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 6000);
  };
  if (standalone) { show(false); return; }
  if (ios) show(true);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; show(true); });
  addEventListener('appinstalled', () => { deferred = null; show(false); toast(T.done); });
  btns.forEach(b => b.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r && r.outcome === 'accepted') show(false); }
    else toast(ios ? T.ios : T.other);
  }));
})();
