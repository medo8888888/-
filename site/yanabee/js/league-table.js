// league-table: «احسب ترتيب الدوري» on competition.html (#league-table). Rules come from #lt-data (built from
// content/yanabee/competition.txt by tools/yanabee/feat_league_table.py): lg6 points and tie-break order, the lg2/lg4
// results by regulation, the lg2 exclusion row. Head-to-head is decided only when it is unambiguous; every other
// case is flagged for the committee. Data stays in this browser (localStorage 'yanabee-league-v1'); nothing is sent.
// Classic script (IIFE), no modules, works from file://.
(() => {
  const box = document.getElementById('league-table');
  if (!box) return;
  let D;
  try { D = JSON.parse(document.getElementById('lt-data').textContent); } catch (e) { return; }
  box.hidden = false;

  const KEY = 'yanabee-league-v1';
  const $ = s => box.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const isInt = v => /^\d+$/.test(String(v).trim());
  const STEP = D.steps; // ['فارق الأهداف','الأهداف المسجلة','المواجهات المباشرة','الأقل بطاقات حمراء فصفراء','قرعة علنية']

  /* ---------------- state + storage ---------------- */
  let S = { v: 1, teams: [], results: [] };
  let stored = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); if (valid(d)) S = norm(d); }
  } catch (e) { stored = false; }
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {
      if (stored) { stored = false; msg('#lt-tools-msg', 'لا يمكن الحفظ في هذا المتصفح الآن؛ ستضيع البيانات عند إغلاق الصفحة. احفظ نسخة في ملف.'); }
    }
  };

  function valid(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.teams) || !Array.isArray(d.results)) return false;
    const ids = new Set();
    for (const t of d.teams) {
      if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !t.name.trim() || (t.group != null && typeof t.group !== 'string')) return false;
      if (ids.has(t.id)) return false;
      ids.add(t.id);
    }
    for (const r of d.results) {
      if (!r || typeof r !== 'object' || !ids.has(r.a) || !ids.has(r.b) || r.a === r.b) return false;
      for (const k of ['ga', 'gb', 'ra', 'ya', 'rb', 'yb']) if (!Number.isInteger(r[k]) || r[k] < 0) return false;
      if (r.kind !== 'play' && r.kind !== 'reg') return false;
      if (r.kind === 'reg' && (!(r.off === r.a || r.off === r.b) || !Number.isInteger(r.reason) || !D.reasons[r.reason])) return false;
      if (r.date != null && typeof r.date !== 'string') return false;
    }
    return true;
  }
  function norm(d) {
    return {
      v: 1,
      teams: d.teams.map(t => ({ id: t.id, name: t.name.trim().slice(0, 60), group: (t.group || '').trim().slice(0, 30) })),
      results: d.results.map(r => ({
        id: typeof r.id === 'string' ? r.id : uid(), kind: r.kind, a: r.a, b: r.b, ga: r.ga, gb: r.gb, ra: r.ra, ya: r.ya, rb: r.rb, yb: r.yb,
        date: r.date || '', off: r.kind === 'reg' ? r.off : null, reason: r.kind === 'reg' ? r.reason : null, keep: !!r.keep,
        cur: Array.isArray(r.cur) && r.cur.length === 2 && r.cur.every(n => Number.isInteger(n) && n >= 0) ? r.cur.slice() : null,
      })),
    };
  }

  const team = id => S.teams.find(t => t.id === id);
  const tname = id => (team(id) || { name: '؟' }).name;
  const sameGroup = (a, b) => team(a) && team(b) && team(a).group === team(b).group;
  const msgTimers = {};
  function msg(sel, text, bad) {
    const m = box.querySelector(sel);
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('bad', !!bad);
    clearTimeout(msgTimers[sel]);
    if (text && !bad) msgTimers[sel] = setTimeout(() => { m.textContent = ''; }, 6000);
  }

  /* ---------------- standings ---------------- */
  const winner = r => (r.ga > r.gb ? r.a : r.gb > r.ga ? r.b : null);
  function statsFor(ids) {
    const st = {};
    ids.forEach(id => { st[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, red: 0, yel: 0 }; });
    S.results.forEach(r => {
      if (!st[r.a] || !st[r.b]) return;
      const A = st[r.a], B = st[r.b];
      A.p++; B.p++;
      A.gf += r.ga; A.ga += r.gb; B.gf += r.gb; B.ga += r.ga;
      A.red += r.ra; A.yel += r.ya; B.red += r.rb; B.yel += r.yb;
      if (r.ga > r.gb) { A.w++; B.l++; A.pts += D.points.win; B.pts += D.points.loss; }
      else if (r.gb > r.ga) { B.w++; A.l++; B.pts += D.points.win; A.pts += D.points.loss; }
      else { A.d++; B.d++; A.pts += D.points.draw; B.pts += D.points.draw; }
    });
    Object.values(st).forEach(s => { s.gd = s.gf - s.ga; });
    return st;
  }
  const mutual = (ids) => S.results.filter(r => ids.includes(r.a) && ids.includes(r.b));

  // -> [{s, rank, notes:[str], flag:'committee'|'draw'|null, mutual:[results]}]
  function rankGroup(ids) {
    const st = statsFor(ids);
    const list = Object.values(st).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || tname(x.id).localeCompare(tname(y.id), 'ar'));
    const clusters = [];
    list.forEach(s => {
      const c = clusters[clusters.length - 1];
      if (c && c[0].pts === s.pts && c[0].gd === s.gd && c[0].gf === s.gf) c.push(s); else clusters.push([s]);
    });
    const rows = [];
    const add = (s, extra) => rows.push(Object.assign({ s, notes: [], flag: null, mutual: null, tied: false }, extra || {}));
    clusters.forEach(c => {
      if (c.length === 1) { add(c[0]); return; }
      const ids2 = c.map(s => s.id);
      const mm = mutual(ids2);
      if (c.length > 2) {
        c.forEach(s => add(s, { flag: 'committee', mutual: mm, tied: true,
          notes: [`تساوت ${c.length} فرق في النقاط (${s.pts}) و${STEP[0]} (${sg(s.gd)}) و${STEP[1]} (${s.gf}). لا تحسم الأداة ${STEP[2]} بين أكثر من فريقين.`] }));
        return;
      }
      const [x, y] = c;
      const leadFor = s => `تساوى مع «${tname(s.id === x.id ? y.id : x.id)}» في النقاط (${x.pts}) و${STEP[0]} (${sg(x.gd)}) و${STEP[1]} (${x.gf}).`;
      if (!mm.length) {
        c.forEach(s => add(s, { flag: 'committee', mutual: mm, tied: true, notes: [leadFor(s) + ` ${STEP[2]}: لم يلتقِ الفريقان بعد في نتيجة مسجلة.`] }));
        return;
      }
      const ws = mm.map(winner);
      const n = mm.length;
      if (ws.every(w => w === x.id) || ws.every(w => w === y.id)) {
        const w = ws[0], first = w === x.id ? x : y, second = w === x.id ? y : x;
        [first, second].forEach(s => add(s, { notes: [leadFor(s) + ` الفاصل: ${STEP[2]} — فاز «${tname(w)}» في ${n} من ${n}.`] }));
        return;
      }
      if (ws.every(w => w === null)) {
        const pre = ` ${STEP[2]}: تعادل في ${n} من ${n}.`;
        const cmp = s => `حمراء ${s.red}، صفراء ${s.yel}`;
        let order = null, why = '';
        if (x.red !== y.red) { order = x.red < y.red ? [x, y] : [y, x]; why = 'حمراء'; }
        else if (x.yel !== y.yel) { order = x.yel < y.yel ? [x, y] : [y, x]; why = 'صفراء'; }
        if (order) {
          order.forEach(s => add(s, { notes: [leadFor(s) + pre + ` الفاصل: ${STEP[3]} (بطاقات ${why}: «${tname(x.id)}» ${why === 'حمراء' ? x.red : x.yel}، «${tname(y.id)}» ${why === 'حمراء' ? y.red : y.yel}).`] }));
        } else {
          c.forEach(s => add(s, { flag: 'draw', tied: true, notes: [leadFor(s) + pre + ` ${STEP[3]}: متساويان (${cmp(s)}). الفاصل: ${STEP[4]} — الأداة لا تجري القرعة.`] }));
        }
        return;
      }
      c.forEach(s => add(s, { flag: 'committee', mutual: mm, tied: true, notes: [leadFor(s) + ` ${STEP[2]}: نتائج المواجهات بينهما مختلفة.`] }));
    });
    // steps 1–2 (goal difference, goals scored) between neighbours with the same points
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i].s, b = rows[i + 1].s;
      if (a.pts !== b.pts || (a.gd === b.gd && a.gf === b.gf)) continue;
      const k = a.gd !== b.gd ? 0 : 1;
      const va = k === 0 ? sg(a.gd) : a.gf, vb = k === 0 ? sg(b.gd) : b.gf;
      const txt = `تساوى «${tname(a.id)}» و«${tname(b.id)}» في النقاط (${a.pts})، والفاصل: ${STEP[k]} (${va} مقابل ${vb}).`;
      if (!rows[i].notes.includes(txt)) rows[i].notes.push(txt);
      rows[i + 1].notes.push(txt);
    }
    // positions: tied (flagged) rows share one position
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (prev && r.tied && prev.tied && prev.flag === r.flag && prev.s.pts === r.s.pts && prev.s.gd === r.s.gd && prev.s.gf === r.s.gf) r.rank = prev.rank;
      else r.rank = i + 1;
    });
    return rows;
  }
  const sg = n => (n > 0 ? '+' + n : String(n));

  function groups() {
    const out = [];
    S.teams.forEach(t => { if (!out.includes(t.group)) out.push(t.group); });
    return out.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
  }
  const groupTitle = g => (g ? 'المجموعة: ' + g : (groups().length > 1 ? 'فرق بلا مجموعة' : ''));

  function resLine(r) {
    return `«${tname(r.a)}» ${r.ga} — «${tname(r.b)}» ${r.gb}`;
  }

  function renderStandings() {
    const host = $('#lt-standings');
    host.textContent = '';
    if (!S.teams.length) { host.appendChild(el('p', 'lt-empty', 'أضف الفرق ثم النتائج ليظهر الترتيب.')); return; }
    const cols = ['الفريق', 'لعب', 'فوز', 'تعادل', 'خسارة', 'له', 'عليه', 'الفارق', 'النقاط'];
    groups().forEach((g, gi) => {
      const ids = S.teams.filter(t => t.group === g).map(t => t.id);
      const rows = rankGroup(ids);
      const wrap = el('div', 'lt-group');
      if (groupTitle(g)) wrap.appendChild(el('h5', 'lt-gtitle', groupTitle(g)));
      const sc = el('div', 'lt-scroll');
      sc.tabIndex = 0;
      sc.setAttribute('role', 'region');
      sc.setAttribute('aria-label', groupTitle(g) || 'الترتيب');
      const table = el('table', 'lt-table');
      const thead = el('thead');
      const htr = el('tr');
      cols.forEach((c, i) => { const th = el('th', i ? '' : 'lt-team', c); th.scope = 'col'; htr.appendChild(th); });
      thead.appendChild(htr);
      table.appendChild(thead);
      const tb = el('tbody');
      rows.forEach((r, ri) => {
        const tr = el('tr', r.flag ? 'lt-flag-' + r.flag : '');
        tr.dataset.team = r.s.id;
        const thc = el('th', 'lt-team');
        thc.scope = 'row';
        const th = el('div', 'lt-tcell');
        thc.appendChild(th);
        const rk = el('span', 'lt-rank', String(r.rank));
        th.appendChild(rk);
        th.appendChild(el('span', 'lt-tn', tname(r.s.id)));
        if (r.flag === 'committee') th.appendChild(el('span', 'lt-badge', 'تحتاج قرار اللجنة'));
        if (r.flag === 'draw') th.appendChild(el('span', 'lt-badge', STEP[4]));
        tr.appendChild(thc);
        const s = r.s;
        [s.p, s.w, s.d, s.l, s.gf, s.ga, sg(s.gd), s.pts].forEach((v, i) => {
          const td = el('td', i === 7 ? 'lt-pts-c' : '');
          const b = el('bdi', '', String(v));
          td.appendChild(b);
          tr.appendChild(td);
        });
        tb.appendChild(tr);
        if (r.notes.length || r.flag) {
          const id = `lt-why-${gi}-${ri}`;
          const btn = el('button', 'lt-why', 'لماذا؟');
          btn.type = 'button';
          btn.setAttribute('aria-expanded', 'false');
          btn.setAttribute('aria-controls', id);
          btn.setAttribute('aria-label', 'لماذا هذا الترتيب: ' + tname(s.id));
          th.appendChild(btn);
          const ntr = el('tr', 'lt-note');
          ntr.id = id;
          ntr.hidden = true;
          const td = el('td');
          td.colSpan = cols.length;
          r.notes.forEach(n => td.appendChild(el('p', '', n)));
          if (r.flag === 'committee') {
            if (r.mutual && r.mutual.length) {
              td.appendChild(el('p', 'lt-sub', `${STEP[2]} المسجلة:`));
              const ul = el('ul', 'lt-mm');
              r.mutual.forEach(m => ul.appendChild(el('li', '', resLine(m))));
              td.appendChild(ul);
            }
            td.appendChild(el('p', 'lt-q', D.gen));
          }
          ntr.appendChild(td);
          tb.appendChild(ntr);
          btn.addEventListener('click', () => {
            const open = btn.getAttribute('aria-expanded') !== 'true';
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            ntr.hidden = !open;
          });
        }
      });
      table.appendChild(tb);
      sc.appendChild(table);
      wrap.appendChild(sc);
      host.appendChild(wrap);
    });
  }

  function absences() {
    const out = [];
    S.teams.forEach(t => {
      const kinds = {};
      let total = 0;
      S.results.forEach(r => {
        if (r.kind !== 'reg' || r.off !== t.id || !D.reasons[r.reason].count) return;
        const k = D.reasons[r.reason].k;
        kinds[k] = (kinds[k] || 0) + 1;
        total++;
      });
      if (total) out.push({ t, kinds, total });
    });
    return out;
  }
  function renderFlags() {
    const host = $('#lt-flags');
    host.textContent = '';
    const list = absences();
    if (!list.length) return;
    host.appendChild(el('h5', 'lt-gtitle', 'الغياب والانسحاب'));
    list.forEach(({ t, kinds, total }) => {
      const c = el('div', 'lt-flag' + (total >= 2 ? ' on' : ''));
      c.appendChild(el('b', '', t.name));
      const ul = el('ul');
      Object.keys(kinds).forEach(k => ul.appendChild(el('li', '', `${k}: ${kinds[k]}`)));
      c.appendChild(ul);
      if (total >= 2) {
        c.appendChild(el('span', 'lt-badge', 'للعرض على لجنة المسابقة'));
        const dl = el('dl', 'lt-row');
        [[D.exclHead[0], D.excl[0]], [D.exclHead[1], D.excl[1]]].forEach(([h, v]) => {
          const d = el('div');
          d.appendChild(el('dt', '', h));
          d.appendChild(el('dd', '', v));
          dl.appendChild(d);
        });
        c.appendChild(dl);
      }
      host.appendChild(c);
    });
  }

  /* ---------------- teams ---------------- */
  function renderTeams() {
    const ul = $('#lt-teams');
    ul.textContent = '';
    S.teams.forEach(t => {
      const li = el('li', 'lt-team-row');
      const n = el('input', 'lt-in-name');
      n.type = 'text'; n.value = t.name; n.maxLength = 60;
      n.setAttribute('aria-label', 'اسم الفريق');
      const g = el('input', 'lt-in-group');
      g.type = 'text'; g.value = t.group; g.maxLength = 30; g.placeholder = 'المجموعة';
      g.setAttribute('aria-label', 'مجموعة الفريق ' + t.name);
      const del = el('button', 'lt-icon-btn', '×');
      del.type = 'button';
      del.setAttribute('aria-label', 'احذف الفريق ' + t.name);
      n.addEventListener('change', () => {
        const v = n.value.trim();
        if (!v || S.teams.some(o => o !== t && o.name === v)) { n.value = t.name; msg('#lt-team-msg', v ? 'يوجد فريق بهذا الاسم.' : 'اكتب اسم الفريق.', true); return; }
        t.name = v; commit();
      });
      g.addEventListener('change', () => { t.group = g.value.trim(); commit(); });
      del.addEventListener('click', () => {
        const n2 = S.results.filter(r => r.a === t.id || r.b === t.id).length;
        if (n2 && !ask(`سيُحذف الفريق «${t.name}» ومعه ${n2} من النتائج المسجلة. هل تتابع؟`)) return;
        S.results = S.results.filter(r => r.a !== t.id && r.b !== t.id);
        S.teams = S.teams.filter(o => o !== t);
        commit();
        msg('#lt-team-msg', 'حُذف الفريق.');
      });
      li.append(n, g, del);
      ul.appendChild(li);
    });
  }
  const ask = q => { try { return window.confirm(q); } catch (e) { return true; } };

  $('.lt-addteam').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#lt-tname').value.trim(), group = $('#lt-tgroup').value.trim();
    if (!name) { msg('#lt-team-msg', 'اكتب اسم الفريق.', true); $('#lt-tname').focus(); return; }
    if (S.teams.some(t => t.name === name)) { msg('#lt-team-msg', 'يوجد فريق بهذا الاسم.', true); return; }
    S.teams.push({ id: uid(), name: name.slice(0, 60), group: group.slice(0, 30) });
    $('#lt-tname').value = '';
    commit();
    msg('#lt-team-msg', `أُضيف «${name}».`);
    $('#lt-tname').focus();
  });

  /* ---------------- selects ---------------- */
  function fillSelect(sel, ids, keep) {
    const prev = keep !== undefined ? keep : sel.value;
    sel.textContent = '';
    const o0 = el('option', '', '— اختر —');
    o0.value = '';
    sel.appendChild(o0);
    ids.forEach(id => {
      const t = team(id);
      const o = el('option', '', t.name + (t.group ? ' (' + t.group + ')' : ''));
      o.value = id;
      sel.appendChild(o);
    });
    if (ids.includes(prev)) sel.value = prev;
  }
  function renderSelects() {
    const ids = S.teams.map(t => t.id);
    ['#lt-ra', '#lt-rb', '#lt-fa', '#lt-fb'].forEach(s => fillSelect($(s), ids));
    syncForfeit();
  }

  /* ---------------- result form ---------------- */
  let editing = null; // result id
  const rf = $('.lt-result');
  const num = id => $(id).value.trim();
  rf.addEventListener('submit', e => {
    e.preventDefault();
    const a = $('#lt-ra').value, b = $('#lt-rb').value;
    const err = t => { msg('#lt-res-msg', t, true); };
    if (!a || !b) return err('اختر الفريقين.');
    if (a === b) return err('اختر فريقين مختلفين.');
    if (!sameGroup(a, b)) return err('الفريقان في مجموعتين مختلفتين.');
    const f = ['#lt-rga', '#lt-rgb', '#lt-rra', '#lt-rya', '#lt-rrb', '#lt-ryb'];
    for (const s of f) if (!isInt(num(s))) { $(s).focus(); return err('اكتب أعدادًا صحيحة من 0 فأكثر.'); }
    const [ga, gb, ra, ya, rb, yb] = f.map(s => parseInt(num(s), 10));
    const r = { id: editing || uid(), kind: 'play', a, b, ga, gb, ra, ya, rb, yb, date: $('#lt-rdate').value || '', off: null, reason: null, keep: false, cur: null };
    put(r);
    msg('#lt-res-msg', editing ? 'حُفظ التعديل.' : 'أُضيفت النتيجة.');
    resetResult();
  });
  function resetResult() {
    editing = null;
    ['#lt-rga', '#lt-rgb', '#lt-rra', '#lt-rya', '#lt-rrb', '#lt-ryb'].forEach(s => { $(s).value = '0'; });
    $('#lt-rdate').value = '';
    $('#lt-radd span').textContent = 'أضف النتيجة';
    $('#lt-rcancel').hidden = true;
  }
  $('#lt-rcancel').addEventListener('click', () => { resetResult(); msg('#lt-res-msg', ''); });

  /* ---------------- result by regulation ---------------- */
  let editingF = null;
  const KEEP = D.reasons.findIndex(r => r.keep);
  function syncForfeit() {
    const a = $('#lt-fa').value, b = $('#lt-fb').value;
    const off = $('#lt-foff');
    const ids = [a, b].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    fillSelect(off, ids);
    const ri = +$('#lt-freason').value;
    const R = D.reasons[ri];
    const dec = $('#lt-fdec');
    dec.textContent = '';
    if (R) {
      dec.appendChild(el('b', '', R.h[1] + ': '));
      dec.appendChild(document.createTextNode(R.d));
    }
    const isKeep = ri === KEEP;
    $('#lt-fcur').hidden = !isKeep;
    const offId = off.value, oppId = offId ? (offId === a ? b : a) : '';
    $('#lt-fcur-off-l').textContent = offId ? `أهداف «${tname(offId)}» (المنسحب)` : 'أهداف الفريق المنسحب';
    $('#lt-fcur-opp-l').textContent = oppId ? `أهداف «${tname(oppId)}» (المنافس)` : 'أهداف الفريق المنافس';
    const co = num('#lt-fcoff'), cp = num('#lt-fcopp');
    const ahead = isKeep && offId && oppId && isInt(co) && isInt(cp) && +cp > +co;
    $('#lt-fchoice').hidden = !ahead;
    if (!ahead) box.querySelectorAll('input[name=keep]').forEach(i => { i.checked = false; });
  }
  ['#lt-fa', '#lt-fb', '#lt-foff', '#lt-freason'].forEach(s => $(s).addEventListener('change', syncForfeit));
  ['#lt-fcoff', '#lt-fcopp'].forEach(s => $(s).addEventListener('input', syncForfeit));
  $('.lt-forfeit').addEventListener('submit', e => {
    e.preventDefault();
    const a = $('#lt-fa').value, b = $('#lt-fb').value, off = $('#lt-foff').value, ri = +$('#lt-freason').value;
    const err = t => { msg('#lt-ff-msg', t, true); };
    if (!a || !b) return err('اختر الفريقين.');
    if (a === b) return err('اختر فريقين مختلفين.');
    if (!sameGroup(a, b)) return err('الفريقان في مجموعتين مختلفتين.');
    if (!off || (off !== a && off !== b)) return err('اختر الفريق المخالف.');
    if (!D.reasons[ri]) return err('اختر السبب.');
    let keep = false, cur = null;
    if (ri === KEEP) {
      const co = num('#lt-fcoff'), cp = num('#lt-fcopp');
      if (co !== '' || cp !== '') {
        if (!isInt(co) || !isInt(cp)) return err('اكتب النتيجة القائمة أعدادًا صحيحة من 0 فأكثر، أو اتركها فارغة.');
        cur = [+co, +cp];
        if (cur[1] > cur[0]) {
          const pick = box.querySelector('input[name=keep]:checked');
          if (!pick) return err('اختر ما تقرره اللجنة: خسارة 0 – 3 أو تثبيت النتيجة القائمة.');
          keep = pick.value === '1';
        }
      }
    }
    const go = keep ? cur[0] : 0, gp = keep ? cur[1] : 3;
    const r = { id: editingF || uid(), kind: 'reg', a, b, ga: off === a ? go : gp, gb: off === a ? gp : go, ra: 0, ya: 0, rb: 0, yb: 0,
      date: $('#lt-fdate').value || '', off, reason: ri, keep, cur };
    put(r);
    msg('#lt-ff-msg', editingF ? 'حُفظ التعديل.' : 'أُضيفت النتيجة.');
    resetForfeit();
  });
  function resetForfeit() {
    editingF = null;
    $('#lt-fcoff').value = ''; $('#lt-fcopp').value = ''; $('#lt-fdate').value = '';
    $('#lt-fadd span').textContent = 'أضف النتيجة';
    $('#lt-fcancel').hidden = true;
    syncForfeit();
  }
  $('#lt-fcancel').addEventListener('click', () => { resetForfeit(); msg('#lt-ff-msg', ''); });

  function put(r) {
    const i = S.results.findIndex(x => x.id === r.id);
    if (i >= 0) S.results[i] = r; else S.results.push(r);
    commit();
  }

  /* ---------------- results list ---------------- */
  function renderResults() {
    const host = $('#lt-results');
    host.textContent = '';
    if (!S.results.length) { host.appendChild(el('p', 'lt-empty', 'لا نتائج بعد.')); return; }
    const ol = el('ol', 'lt-rlist');
    S.results.forEach((r, i) => {
      const li = el('li', 'lt-r');
      const sides = el('div', 'lt-sides');
      [[r.a, r.ga, r.kind === 'play' ? [r.ra, r.ya] : null], [r.b, r.gb, r.kind === 'play' ? [r.rb, r.yb] : null]].forEach(([id, g, c]) => {
        const s = el('div', 'lt-sd');
        s.appendChild(el('span', 'lt-sn', tname(id)));
        const gg = el('b', 'lt-sg', String(g));
        gg.setAttribute('aria-label', 'الأهداف ' + g);
        s.appendChild(gg);
        if (c && (c[0] || c[1])) s.appendChild(el('small', 'lt-sc', `حمراء ${c[0]} · صفراء ${c[1]}`));
        sides.appendChild(s);
      });
      li.appendChild(sides);
      const meta = el('div', 'lt-meta');
      if (r.date) meta.appendChild(el('span', 'lt-date', r.date));
      if (r.kind === 'reg') {
        const R = D.reasons[r.reason];
        const tag = el('span', 'lt-tag2');
        tag.appendChild(el('b', '', R.k + ' — ' + tname(r.off) + ': '));
        tag.appendChild(document.createTextNode(r.keep ? 'تثبيت النتيجة القائمة' : R.d));
        meta.appendChild(tag);
      }
      if (!sameGroup(r.a, r.b)) meta.appendChild(el('span', 'lt-warn', 'لا تُحسب: الفريقان الآن في مجموعتين مختلفتين.'));
      li.appendChild(meta);
      const acts = el('div', 'lt-racts');
      const ed = el('button', 'lt-sm', 'عدّل');
      ed.type = 'button';
      ed.setAttribute('aria-label', `عدّل النتيجة ${i + 1}`);
      ed.addEventListener('click', () => edit(r));
      const del = el('button', 'lt-sm lt-danger', 'احذف');
      del.type = 'button';
      del.setAttribute('aria-label', `احذف النتيجة ${i + 1}`);
      del.addEventListener('click', () => {
        if (!ask('هل تحذف هذه النتيجة؟')) return;
        S.results = S.results.filter(x => x !== r);
        if (editing === r.id) resetResult();
        if (editingF === r.id) resetForfeit();
        commit();
      });
      acts.append(ed, del);
      li.appendChild(acts);
      ol.appendChild(li);
    });
    host.appendChild(ol);
  }
  function edit(r) {
    if (r.kind === 'play') {
      $('#lt-ra').value = r.a; $('#lt-rb').value = r.b;
      $('#lt-rga').value = r.ga; $('#lt-rgb').value = r.gb; $('#lt-rra').value = r.ra; $('#lt-rya').value = r.ya; $('#lt-rrb').value = r.rb; $('#lt-ryb').value = r.yb;
      $('#lt-rdate').value = r.date || '';
      editing = r.id;
      $('#lt-radd span').textContent = 'احفظ التعديل';
      $('#lt-rcancel').hidden = false;
      $('#lt-ra').focus();
      rf.scrollIntoView({ block: 'nearest' });
    } else {
      $('#lt-fa').value = r.a; $('#lt-fb').value = r.b;
      syncForfeit();
      $('#lt-foff').value = r.off; $('#lt-freason').value = String(r.reason);
      $('#lt-fcoff').value = r.cur ? r.cur[0] : ''; $('#lt-fcopp').value = r.cur ? r.cur[1] : '';
      $('#lt-fdate').value = r.date || '';
      syncForfeit();
      if (r.cur && r.cur[1] > r.cur[0]) { const i = box.querySelector(`input[name=keep][value="${r.keep ? 1 : 0}"]`); if (i) i.checked = true; }
      editingF = r.id;
      $('#lt-fadd span').textContent = 'احفظ التعديل';
      $('#lt-fcancel').hidden = false;
      $('#lt-fa').focus();
    }
  }

  /* ---------------- tools: print, CSV, file ---------------- */
  const printOnly = cls => {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    const off = () => { document.body.classList.remove(cls); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  };
  $('#lt-print').addEventListener('click', () => {
    box.querySelectorAll('.lt-note').forEach(n => { n.dataset.was = n.hidden ? '1' : ''; n.hidden = false; });
    const back = () => { box.querySelectorAll('.lt-note').forEach(n => { if (n.dataset.was === '1') n.hidden = true; }); removeEventListener('afterprint', back); };
    addEventListener('afterprint', back);
    printOnly('print-league-table');
  });
  const download = (name, text, type) => {
    const blob = new Blob([text], { type });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  $('#lt-csv').addEventListener('click', () => {
    if (!S.teams.length) { msg('#lt-tools-msg', 'لا توجد فرق بعد.', true); return; }
    const lines = [['المجموعة', 'الترتيب', 'الفريق', 'لعب', 'فوز', 'تعادل', 'خسارة', 'له', 'عليه', 'الفارق', 'النقاط', 'ملاحظة'].map(q).join(',')];
    groups().forEach(g => {
      rankGroup(S.teams.filter(t => t.group === g).map(t => t.id)).forEach(r => {
        const s = r.s;
        const note = r.flag === 'committee' ? 'تحتاج قرار اللجنة' : r.flag === 'draw' ? STEP[4] : '';
        lines.push([g, r.rank, tname(s.id), s.p, s.w, s.d, s.l, s.gf, s.ga, s.gd, s.pts, note].map(q).join(','));
      });
    });
    download('league-table.csv', '﻿' + lines.join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    msg('#lt-tools-msg', 'نُزّل الملف.');
  });
  $('#lt-save').addEventListener('click', () => {
    download('yanabee-league.json', JSON.stringify({ app: 'yanabee-league', v: 1, teams: S.teams, results: S.results }, null, 2), 'application/json');
    msg('#lt-tools-msg', 'نُزّلت النسخة.');
  });
  $('#lt-open').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let d = null;
      try { d = JSON.parse(String(rd.result)); } catch (err) { d = null; }
      if (!valid(d)) { msg('#lt-tools-msg', 'الملف ليس نسخة صالحة من هذه الأداة.', true); return; }
      if (!ask('ستحل بيانات الملف محل البيانات الحالية. هل تتابع؟')) return;
      S = norm(d);
      resetResult(); resetForfeit();
      commit();
      msg('#lt-tools-msg', `فُتحت النسخة: ${S.teams.length} فرق، ${S.results.length} نتائج.`);
    };
    rd.onerror = () => msg('#lt-tools-msg', 'تعذرت قراءة الملف.', true);
    rd.readAsText(f);
  });
  $('#lt-clear').addEventListener('click', () => {
    if (!S.teams.length && !S.results.length) return;
    if (!ask('هل تمسح كل الفرق والنتائج من هذا المتصفح؟')) return;
    S = { v: 1, teams: [], results: [] };
    resetResult(); resetForfeit();
    commit();
    msg('#lt-tools-msg', 'مُسحت البيانات.');
  });

  function commit() {
    save();
    render();
  }
  function render() {
    renderTeams();
    renderSelects();
    renderResults();
    renderStandings();
    renderFlags();
  }
  render();
  if (!stored) msg('#lt-tools-msg', 'لا يمكن الحفظ في هذا المتصفح الآن؛ ستضيع البيانات عند إغلاق الصفحة. احفظ نسخة في ملف.');

  // test hook (read-only)
  window.YanabeeLeague = { state: () => JSON.parse(JSON.stringify(S)), rank: g => rankGroup(S.teams.filter(t => t.group === (g || '')).map(t => t.id)) };
})();
