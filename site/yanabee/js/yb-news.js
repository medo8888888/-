// «آخر الإعلانات» — the public strip on the home page and the tournament board (migration 0009, SPEC 4.4).
// Shows the latest 3 published announcements meant for everybody. Classic script, after js/yb-api.js.
// Nothing shows when the site is not connected, when there is nothing published, or when the read fails.
// Every piece of text goes in with textContent.
(() => {
  'use strict';
  const box = document.querySelector('[data-yb-news]');
  const YB = window.YB;
  if (!box || !YB || !YB.configured || !YB.q) return;
  const list = box.querySelector('[data-yb-news-list]');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const when = iso => { try { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long' }); } catch (e) { return ''; } };
  async function run() {
    let rows;
    try {
      rows = await YB.q('yb_announcements', { select: 'id,title,body,published_at,created_at', filter: { published: 'eq.true', audience: 'eq.all' }, order: 'created_at.desc', limit: 3 });
    } catch (e) { return; }
    if (!Array.isArray(rows) || !rows.length) return;
    list.replaceChildren(...rows.map(r => {
      const li = el('li', 'ybn-i');
      const t = el('time', 'ybn-d', when(r.published_at || r.created_at));
      if (r.published_at || r.created_at) t.dateTime = String(r.published_at || r.created_at);
      li.append(t, el('h3', 'ybn-t', r.title), el('p', 'ybn-b', r.body));
      if (String(r.body || '').length > 180) {
        const more = el('button', 'ybn-more', 'اقرأ الإعلان كاملًا');
        more.type = 'button';
        more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', () => {
          const open = li.classList.toggle('open');
          more.textContent = open ? 'اختصر' : 'اقرأ الإعلان كاملًا';
          more.setAttribute('aria-expanded', String(open));
        });
        li.append(more);
      }
      return li;
    }));
    box.hidden = false;
  }
  if (document.readyState === 'complete') run(); else addEventListener('load', run);
})();
