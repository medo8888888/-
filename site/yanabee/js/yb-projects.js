// «من مشاريع الفرق» — the public showcase on the home page (migration 0008, the owner's rule: the admin picks).
// Shows only the accepted work the admin put on the home page: the team's name, the work, where, what it achieved,
// and its photos (short signed links; the files stay in a private bucket that opens only these photos to visitors).
// No member names, no review notes. Hidden when the site is not connected, when nothing is picked, or when a read fails.
// Classic script, after js/yb-api.js. Every piece of text goes in with textContent.
(() => {
  'use strict';
  const box = document.querySelector('[data-yb-projects]');
  const YB = window.YB;
  if (!box || !YB || !YB.configured || !YB.rpc) return;
  const list = box.querySelector('[data-yb-projects-list]');
  const PLACE = { family: 'الأسرة', neighborhood: 'السكن والحي', school: 'المدرسة أو الجامعة' };
  const KIND = { project: 'مشروع', activity: 'مبادرة أو نشاط' };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const teamWord = n => (/^فريق\s/.test(n || '') ? n : 'فريق ' + (n || ''));
  async function run() {
    let r;
    try { r = await YB.rpc('yb_public_projects', {}); } catch (e) { return; }
    const rows = r && r.ok && Array.isArray(r.data) ? r.data.slice(0, 6) : [];
    if (!rows.length) return;
    let urls = {};
    const paths = [].concat(...rows.map(x => (Array.isArray(x.photos) ? x.photos.slice(0, 3) : [])));
    if (paths.length && YB.signedUrls) {
      try { const s = await YB.signedUrls('yanabee-submissions', paths, 3600); if (s && s.ok) urls = s.data || {}; } catch (e) { urls = {}; }
    }
    list.replaceChildren(...rows.map(x => {
      const li = el('li', 'ybp-i');
      const pics = (Array.isArray(x.photos) ? x.photos.slice(0, 3) : []).filter(p => urls[p]);
      if (pics.length) {
        const fig = el('div', 'ybp-pics' + (pics.length > 1 ? ' many' : ''));
        pics.forEach((p, i) => {
          const img = el('img');
          img.src = urls[p];
          img.alt = i === 0 ? `صورة من عمل ${teamWord(x.team_name)}: ${x.title}` : '';
          img.loading = 'lazy';
          img.decoding = 'async';
          img.width = 480; img.height = 320;
          img.addEventListener('error', () => img.remove());
          fig.append(img);
        });
        li.append(fig);
      }
      const body = el('div', 'ybp-b');
      body.append(el('p', 'ybp-team', teamWord(x.team_name)), el('h3', 'ybp-t', x.title),
        el('p', 'ybp-meta', [KIND[x.kind], PLACE[x.place], x.value_text ? 'القيمة: ' + x.value_text : ''].filter(Boolean).join(' · ')),
        el('p', 'ybp-s', x.summary));
      if (x.results) body.append(el('p', 'ybp-r', x.results));
      li.append(body);
      return li;
    }));
    box.hidden = false;
  }
  if (document.readyState === 'complete') run(); else addEventListener('load', run);
})();
