// quran.html: axis navigator helpers. main.js ([data-spy]) marks the current link with
// .current; here we (1) keep that link visible inside the navigator itself (the phone chip
// strip scrolls sideways, the desktop column scrolls vertically) without ever scrolling the
// page, and (2) fill the desktop progress track up to the current axis.
// Classic script (no modules) so the page also works from file://.
(() => {
  const nav = document.querySelector('.q-nav');
  if (!nav) return;
  const scroller = nav.querySelector('.q-nav-scroll');
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = null;

  const reveal = (a, smooth) => {
    if (!scroller) return;
    const sr = scroller.getBoundingClientRect(), r = a.getBoundingClientRect();
    const opts = { behavior: smooth && !reduce ? 'smooth' : 'auto' };
    if (scroller.scrollWidth > scroller.clientWidth + 2) {
      opts.left = (r.left + r.width / 2) - (sr.left + sr.width / 2);
    } else if (scroller.scrollHeight > scroller.clientHeight + 2) {
      if (r.top >= sr.top + 8 && r.bottom <= sr.bottom - 8) return; // already visible
      opts.top = (r.top + r.height / 2) - (sr.top + sr.height / 2);
    } else return;
    scroller.scrollBy(opts);
  };

  const sync = () => {
    const cur = nav.querySelector('a.current');
    if (!cur || cur === last) return;
    last = cur;
    const i = links.indexOf(cur);
    nav.style.setProperty('--q-p', links.length > 1 ? (i / (links.length - 1)).toFixed(4) : '0');
    reveal(cur, true);
  };

  new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  // Keyboard users tabbing through the strip: keep the focused chip in view.
  nav.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a) reveal(a, false); });
})();
