// teams.html: keeps the current team visible inside the team index. main.js ([data-spy])
// marks the current link with .current; on phones/tablets the index is a sideways chip
// strip, so we scroll the strip itself (never the page) to the current or focused chip.
// Classic script (no modules) so the page also works from file://.
(() => {
  const nav = document.querySelector('.tm-nav');
  if (!nav) return;
  const scroller = nav.querySelector('.tm-nav-scroll');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = null;

  const reveal = (a, smooth) => {
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 2) return; // desktop column: nothing to do
    const sr = scroller.getBoundingClientRect(), r = a.getBoundingClientRect();
    if (r.left >= sr.left + 24 && r.right <= sr.right - 24) return; // already in view
    scroller.scrollBy({ left: (r.left + r.width / 2) - (sr.left + sr.width / 2), behavior: smooth && !reduce ? 'smooth' : 'auto' });
  };

  const sync = () => {
    const cur = nav.querySelector('a.current');
    if (!cur || cur === last) return;
    last = cur;
    reveal(cur, true);
  };

  new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  nav.addEventListener('focusin', e => { const a = e.target.closest('a'); if (a) reveal(a, false); });
})();
