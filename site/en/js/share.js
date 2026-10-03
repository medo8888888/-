// @i18n-self — carries its own ar/en/tr strings (tools/i18n.py copies it unchanged).
// [data-share] buttons: native share sheet on phones; elsewhere a small menu
// (WhatsApp, Telegram, X, Facebook, copy link). data-share-title / data-share-url optional.
(() => {
  const lang = (document.documentElement.lang || 'ar').slice(0, 2);
  const T = {
    ar: { menu: 'مشاركة', copy: 'نسخ الرابط', copied: 'تم نسخ الرابط ✓' },
    en: { menu: 'Share', copy: 'Copy link', copied: 'Link copied ✓' },
    tr: { menu: 'Paylaş', copy: 'Bağlantıyı kopyala', copied: 'Bağlantı kopyalandı ✓' },
  }[lang] || {};
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  const enc = encodeURIComponent;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-share]');
    if (!b) { if (pop && !e.target.closest('.share-pop')) close(); return; }
    e.preventDefault();
    const url = new URL(b.dataset.shareUrl || location.href, location.href).href;
    const title = b.dataset.shareTitle || document.title;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, text: title, url }); } catch (err) { /* cancelled */ }
      return;
    }
    close();
    const links = [
      ['WhatsApp', `https://wa.me/?text=${enc(title + ' ' + url)}`],
      ['Telegram', `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}`],
      ['X', `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(url)}`],
      ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
    ];
    pop = document.createElement('div');
    pop.className = 'share-pop';
    pop.setAttribute('role', 'menu');
    pop.setAttribute('aria-label', T.menu);
    pop.innerHTML = links.map(([n, h]) => `<a role="menuitem" href="${h}" target="_blank" rel="noopener noreferrer">${n}</a>`).join('') +
      `<button type="button" role="menuitem" data-copy>${T.copy}</button>`;
    document.body.appendChild(pop);
    const r = b.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8) + 'px';
    pop.style.top = (r.bottom + h + 12 < innerHeight ? r.bottom + 8 : r.top - h - 8) + 'px';
    pop.querySelector('[data-copy]').addEventListener('click', async ev => {
      try { await navigator.clipboard.writeText(url); } catch (err) { /* blocked */ }
      ev.target.textContent = T.copied;
      setTimeout(close, 1200);
    });
    pop.querySelector('a').focus();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('scroll', close, { passive: true });
})();
