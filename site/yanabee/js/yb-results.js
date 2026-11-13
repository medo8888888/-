// «النتائج النهائية» — the public ranking on the tournament board (migration 0010, SPEC 4.3).
// Shows nothing until the admin publishes the results; then every team's points per axis, its total and its rank
// (ties share a rank, as the documents set no tie-break). Team names and points only: no reasons, no judges.
// Classic script, after js/yb-api.js. Every piece of text goes in with textContent.
(() => {
  'use strict';
  const box = document.querySelector('[data-yb-results]');
  const YB = window.YB;
  if (!box || !YB || !YB.configured || !YB.rpc) return;
  const body = box.querySelector('[data-yb-results-body]');
  const AX = ['hifz', 'fahm', 'tatbiq', 'football', 'chess'];
  const num = v => (v === null || v === undefined ? '—' : String(Math.round(Number(v) * 100) / 100));
  const el = (tag, text, attrs) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  async function run() {
    let r;
    try { r = await YB.rpc('yb_public_results', {}); } catch (e) { return; }
    const rows = r && r.ok && Array.isArray(r.data) ? r.data : [];
    if (!rows.length) return;
    body.replaceChildren(...rows.map(x => {
      const tr = el('tr');
      if (x.rank === 1) tr.className = 'ybr-top';
      tr.append(el('td', String(x.rank)), el('th', x.team_name, { scope: 'row' }), ...AX.map(a => el('td', num(x[a]))), el('td', num(x.total)));
      return tr;
    }));
    box.hidden = false;
  }
  if (document.readyState === 'complete') run(); else addEventListener('load', run);
})();
