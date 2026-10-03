/* palette — search / command palette overlay (see docs/ARCHITECTURE.md)
   window.TakamulPalette = { open(query?), close() }
   Searches window.TAKAMUL_KB with Arabic normalization, prefix + typo-tolerant matching. */
(() => {
  'use strict';
  if (window.TakamulPalette) return;

  const doc = document, root = doc.documentElement;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceMQ.matches;
  const RECENT_KEY = 'takamul-palette-recent';
  const FLASH_KEY = 'takamul-palette-flash';
  const MAX_RECENT = 6;

  /* ---------------- icons (lucide-style, inline) ---------------- */
  const P = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    arrow: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    enter: '<polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>'
  };
  const svg = (n, cls) => '<svg class="' + (cls || 'pal-i') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (P[n] || P.hash) + '</svg>';

  /* ---------------- text helpers ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIAC = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ‌‍‎‏]/;
  const normChar = c => {
    if (DIAC.test(c)) return '';
    const code = c.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06F0 && code <= 0x06F9) return String(code - 0x06F0);
    switch (c) {
      case 'أ': case 'إ': case 'آ': case 'ٱ': return 'ا';
      case 'ة': return 'ه';
      case 'ى': return 'ي';
      case 'ؤ': return 'و';
      case 'ئ': return 'ي';
      case '–': case '—': case '_': return '-';
      default: return c.toLowerCase();
    }
  };
  /* normalized string + map from normalized index to original index */
  const normMap = s => {
    s = String(s || '');
    let n = ''; const map = [];
    for (let i = 0; i < s.length; i++) {
      const c = normChar(s[i]);
      for (let k = 0; k < c.length; k++) { n += c[k]; map.push(i); }
    }
    return { s, n, map };
  };
  const norm = s => normMap(s).n;
  const WORD_RE = /[\p{L}\p{N}]+/gu;
  const PREFIXES = ['وبال', 'وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ل'];
  const stripPrefix = w => {
    for (const p of PREFIXES) if (w.length - p.length >= 2 && w.startsWith(p)) return [w.slice(p.length), p.length];
    return null;
  };
  const words = n => {
    const out = []; let m; WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(n))) {
      const w = m[0], v = [[w, 0]], st = stripPrefix(w);
      if (st) { v.push(st); if (st[0].startsWith('ال') && st[0].length > 3) v.push([st[0].slice(2), st[1] + 2]); }
      out.push({ w, start: m.index, v });
    }
    return out;
  };
  /* Damerau-Levenshtein (optimal string alignment), early exit above max */
  const dist = (a, b, max) => {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let p2 = null, p1 = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        cur.push(v); if (v < best) best = v;
      }
      if (best > max) return max + 1;
      p2 = p1; p1 = cur;
    }
    return p1[lb];
  };

  /* ---------------- index ---------------- */
  const GROUPS = [
    { key: 'page', label: 'Sayfalar', icon: 'compass' },
    { key: 'section', label: 'Bölümler', icon: 'layers' },
    { key: 'pillar', label: 'Sütunlar', icon: 'landmark' },
    { key: 'stage', label: 'Genişleme aşamaları', icon: 'pin' },
    { key: 'faq', label: 'Sık Sorulan Sorular', icon: 'help' },
    { key: 'action', label: 'İşlemler', icon: 'sparkles' }
  ];
  const GROUP_OF = { section: 'section', subsection: 'section', intro: 'section', pillar: 'pillar', stage: 'stage', faq: 'faq' };
  const GROUP_LIMIT = { page: 4, section: 6, pillar: 5, stage: 5, faq: 6, action: 6 };
  const ITEM_ICON = { section: 'layers', subsection: 'hash', intro: 'book', pillar: 'landmark', stage: 'pin', faq: 'help' };
  const PAGE_ICON = { home: 'home', info: 'info', sprout: 'sprout', globe: 'globe', shield: 'shield', users: 'users', help: 'help', chart: 'chart' };

  let INDEX = null;
  const field = (s, weight) => { const m = normMap(s); return { s: m.s, n: m.n, map: m.map, words: words(m.n), weight }; };
  const cleanTitle = t => String(t || '').replace(/^\s*\d+(\.\d+)?\s+/, '').trim();
  const pageLabel = page => {
    const kb = window.TAKAMUL_KB; const p = kb && kb.pages && kb.pages.find(x => x.url === page);
    return p ? p.title : '';
  };
  const buildIndex = () => {
    const kb = window.TAKAMUL_KB || { pages: [], items: [] };
    const entries = [];
    (kb.pages || []).forEach(p => entries.push({
      kind: 'page', group: 'page', id: 'page-' + p.id, url: p.url, icon: PAGE_ICON[p.icon] || 'compass',
      title: p.title, num: '', page: p.url, f: [field(p.title, 10)]
    }));
    (kb.items || []).forEach(it => {
      const title = cleanTitle(it.title);
      entries.push({
        kind: 'item', group: GROUP_OF[it.type] || 'section', type: it.type, id: it.id, url: it.url, page: it.page,
        icon: ITEM_ICON[it.type] || 'hash', title, subtitle: it.subtitle || '', num: it.num || '',
        f: [field(title, 10), field(it.subtitle || '', 5), field(it.num || '', 6), field(it.text || '', 1.6)]
      });
    });
    return entries;
  };

  /* match one token against a field: returns {score, ranges:[[nStart,nEnd]]} */
  const matchField = (fl, tok, allowFuzzy) => {
    let score = 0; const ranges = [];
    if (!fl.n) return null;
    for (const wd of fl.words) {
      let hit = 0, rs = 0, re = 0;
      for (const [v, off] of wd.v) {
        if (v === tok) { hit = 3; rs = wd.start + off; re = rs + tok.length; break; }
        if (v.startsWith(tok) && hit < 2) { hit = 2; rs = wd.start + off; re = rs + tok.length; }
      }
      if (!hit && /^\d+$/.test(tok) === false && wd.w.length > tok.length && tok.length >= 3) {
        const at = wd.w.indexOf(tok); // infix (e.g. compound words)
        if (at > 0) { hit = 1; rs = wd.start + at; re = rs + tok.length; }
      }
      if (!hit && allowFuzzy && tok.length >= 4) {
        const max = tok.length >= 7 ? 2 : 1;
        for (const [v, off] of wd.v) {
          if (v.length < tok.length - max) continue;
          const pre = v.slice(0, tok.length);
          const d = Math.min(dist(tok, v, max), dist(tok, pre, max));
          if (d <= max) { hit = 0.6; rs = wd.start + off; re = wd.start + wd.w.length; break; }
        }
      }
      if (hit) {
        const s = hit === 3 ? 1 : hit === 2 ? 0.8 : hit === 1 ? 0.45 : 0.5;
        if (!ranges.length) score = s; else score += s * 0.08;
        ranges.push([rs, re]);
        if (ranges.length > 24) break;
      }
    }
    return ranges.length ? { score: Math.min(score, 1.6) * fl.weight, ranges } : null;
  };

  const tokenize = q => {
    const n = norm(q); const out = []; let m; WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(n))) {
      let t = m[0];
      const st = stripPrefix(t);
      if (st && t.startsWith('ال')) t = st[0]; // "المنافع" -> "Menâfi" (articles are matched on both sides)
      if (t.length >= 1) out.push(t);
    }
    return { n: n.trim(), tokens: [...new Set(out)] };
  };

  const search = q => {
    if (!INDEX) INDEX = buildIndex();
    const { n: qn, tokens } = tokenize(q);
    if (!tokens.length) return [];
    const res = [];
    for (const e of INDEX) {
      let total = 0, matched = 0; const ranges = e.f.map(() => []);
      for (const tok of tokens) {
        let best = 0;
        e.f.forEach((fl, fi) => {
          let r = matchField(fl, tok, false);
          if (!r) r = matchField(fl, tok, true);
          if (r) { ranges[fi].push(...r.ranges); if (r.score > best) best = r.score; }
        });
        if (best) { matched++; total += best; }
      }
      if (!matched) continue;
      const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
      if (matched < need) continue;
      if (qn.length >= 3) {
        if (e.f[0].n.includes(qn)) total += 12;
        else if (e.f[1] && e.f[1].n.includes(qn)) total += 5;
        else if (e.f[3] && e.f[3].n.includes(qn)) total += 3;
      }
      if (e.f[0].n === qn) total += 10;
      if (e.kind === 'page') total += 1;
      if (e.type === 'section') total += 0.6;
      res.push({ e, score: total * (matched / tokens.length), ranges });
    }
    res.sort((a, b) => b.score - a.score);
    return res;
  };

  /* safe highlight: escape every plain segment, wrap matched segments in <mark> */
  const highlight = (fl, nRanges, from, to) => {
    const s = fl.s; from = from || 0; to = to == null ? s.length : to;
    const rs = [];
    (nRanges || []).forEach(([a, b]) => {
      if (a >= fl.map.length || b <= a) return;
      let oa = fl.map[a], ob = fl.map[Math.min(b, fl.map.length) - 1] + 1;
      while (ob < s.length && DIAC.test(s[ob])) ob++;
      oa = Math.max(oa, from); ob = Math.min(ob, to);
      if (ob > oa) rs.push([oa, ob]);
    });
    rs.sort((a, b) => a[0] - b[0]);
    const merged = [];
    rs.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); });
    let out = '', pos = from;
    merged.forEach(([a, b]) => { out += esc(s.slice(pos, a)) + '<mark>' + esc(s.slice(a, b)) + '</mark>'; pos = b; });
    return out + esc(s.slice(pos, to));
  };
  /* a short snippet around the first text match (or the first line) */
  const snippet = (fl, nRanges) => {
    if (!fl || !fl.s) return '';
    const s = fl.s, LEN = 120;
    let at = -1;
    if (nRanges && nRanges.length) {
      const first = nRanges.reduce((m, r) => (r[0] < m[0] ? r : m), nRanges[0]);
      at = fl.map[first[0]];
    }
    let ls, le;
    if (at < 0) { ls = 0; le = s.indexOf('\n'); if (le < 0) le = s.length; }
    else { ls = s.lastIndexOf('\n', at) + 1; le = s.indexOf('\n', at); if (le < 0) le = s.length; }
    let a = ls, b = le, pre = '', post = '';
    if (b - a > LEN) {
      if (at >= 0 && at - a > 40) { a = Math.max(ls, at - 40); const sp = s.indexOf(' ', a); if (sp > 0 && sp < at) a = sp + 1; pre = '… '; }
      if (b - a > LEN) { b = a + LEN; const sp = s.lastIndexOf(' ', b); if (sp > a + 40) b = sp; post = ' …'; }
    }
    return pre + highlight(fl, at >= 0 ? nRanges : [], a, b) + post;
  };

  /* ---------------- state ---------------- */
  let el = null, input, listEl, ind, live, countEl, emptyEl, clearBtn, panel;
  let rows = [], active = -1, isOpen = false, lastFocus = null, hideTimer = 0, liveTimer = 0, inerted = [];
  let currentQuery = '';

  const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, MAX_RECENT) : []; } catch (e) { return []; } };
  const writeRecent = list => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch (e) { /* storage blocked */ } };
  const pushRecent = q => {
    q = String(q || '').trim(); if (q.length < 2) return;
    const nq = norm(q); writeRecent([q].concat(readRecent().filter(x => norm(x) !== nq)));
  };

  const SUGGEST = ['Menâfi', 'Yenâbî', 'Yönetişim', 'Finansal sürdürülebilirlik', 'Ankara', 'Riskler', 'Üyelik', 'Vizyon'];

  const themeNow = () => (window.TakamulTheme && window.TakamulTheme.get ? window.TakamulTheme.get() : root.dataset.theme) === 'dark' ? 'dark' : 'light';
  const toggleTheme = () => {
    if (window.TakamulTheme && typeof window.TakamulTheme.toggle === 'function') window.TakamulTheme.toggle();
    else { const b = doc.querySelector('.theme-toggle'); if (b) b.click(); }
  };
  const openChat = () => {
    if (window.TakamulChat && typeof window.TakamulChat.open === 'function') window.TakamulChat.open();
    else { const b = doc.querySelector('[data-open-chat]'); if (b) b.click(); }
  };
  const askChat = q => {
    if (window.TakamulChat && typeof window.TakamulChat.ask === 'function') { window.TakamulChat.ask(q); return; }
    openChat();
    setTimeout(() => { const ta = doc.querySelector('.chat-form textarea'); if (ta) { ta.value = q; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); } }, 80);
  };

  const ACTIONS = () => [
    { id: 'theme', icon: themeNow() === 'dark' ? 'sun' : 'moon', title: themeNow() === 'dark' ? 'Açık görünüme geç' : 'Koyu görünüme geç', meta: 'Görünüm', keys: 'görünüm tema mod koyu açık gece gündüz renkler theme dark light', keep: true, run: () => { toggleTheme(); setTimeout(() => render(), 30); } },
    { id: 'chat', icon: 'sparkles', title: 'Akıllı asistanı aç', meta: 'Asistan', keys: 'akıllı asistan sohbet soru sor chat ai', run: () => after(openChat) },
    { id: 'dash', icon: 'chart', title: 'Gösterge Paneline git', meta: 'dashboard.html', keys: 'gösterge paneli kontrol paneli dashboard göstergeler', run: () => go('dashboard.html') },
    { id: 'toc', icon: 'book', title: 'Kitapçık içindekilere git', meta: 'Ana Sayfa', keys: 'kitapçık içindekiler fihrist toc', run: () => go('index.html#toc') }
  ];
  const askAction = q => ({ id: 'ask', icon: 'message', title: 'Asistana Sor: ', query: q, meta: 'Akıllı Asistan', run: () => { pushRecent(q); after(() => askChat(q)); } });

  /* ---------------- navigation ---------------- */
  const currentPage = () => { const p = location.pathname.split('/').pop(); return p && /\.html?$/.test(p) ? p : 'index.html'; };
  const reveal = (id, smooth) => {
    const t = id && doc.getElementById(id);
    if (!t) return false;
    const det = t.tagName === 'DETAILS' ? t : t.closest('details');
    if (det && !det.open) det.open = true;
    t.scrollIntoView({ behavior: smooth && !reduced() ? 'smooth' : 'auto', block: 'start' });
    t.classList.remove('pal-flash'); void t.offsetWidth; t.classList.add('pal-flash');
    setTimeout(() => t.classList.remove('pal-flash'), 2200);
    return true;
  };
  const go = url => {
    const [path, hash] = String(url).split('#');
    const samePage = (path || 'index.html') === currentPage();
    close(true);
    if (samePage) {
      if (hash) {
        setTimeout(() => {
          if (reveal(hash, true)) { try { history.replaceState(history.state, '', '#' + hash); } catch (e) { /* file:// */ } }
        }, reduced() ? 0 : 120);
      } else {
        scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
      }
      return;
    }
    if (hash) { try { sessionStorage.setItem(FLASH_KEY, hash); } catch (e) { /* ignore */ } }
    location.href = url;
  };
  const after = fn => { close(true); setTimeout(fn, reduced() ? 0 : 60); };

  /* ---------------- DOM ---------------- */
  const build = () => {
    el = doc.createElement('div');
    el.className = 'pal'; el.hidden = true;
    el.innerHTML =
      '<div class="pal-backdrop" data-pal-close></div>' +
      '<div class="pal-panel" role="dialog" aria-modal="true" aria-label="Kitapçıkta arama">' +
        '<div class="pal-glow" aria-hidden="true"></div>' +
        '<div class="pal-head">' +
          svg('search', 'pal-i pal-search-i') +
          '<input class="pal-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pal-list" aria-haspopup="listbox" ' +
            'placeholder="Kitapçıkta ara…" aria-label="Kitapçıkta ara" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" dir="rtl">' +
          '<button type="button" class="pal-clear" aria-label="Aramayı temizle" hidden>' + svg('x') + '</button>' +
          '<button type="button" class="pal-close" data-pal-close aria-label="Aramayı kapat"><span class="pal-close-t">Kapat</span><kbd class="pal-esc">Esc</kbd></button>' +
        '</div>' +
        '<div class="pal-body">' +
          '<div class="pal-empty" hidden></div>' +
          '<div class="pal-list" id="pal-list" role="listbox" aria-label="Arama sonuçları"><div class="pal-ind" aria-hidden="true"></div></div>' +
        '</div>' +
        '<div class="pal-foot">' +
          '<span class="pal-hints" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> gezin</span><span><kbd>↵</kbd> aç</span><span><kbd>Esc</kbd> kapat</span></span>' +
          '<span class="pal-count"></span>' +
        '</div>' +
        '<div class="pal-live" role="status" aria-live="polite" aria-atomic="true"></div>' +
      '</div>';
    doc.body.appendChild(el);
    panel = el.querySelector('.pal-panel');
    input = el.querySelector('.pal-input');
    listEl = el.querySelector('.pal-list');
    ind = el.querySelector('.pal-ind');
    live = el.querySelector('.pal-live');
    countEl = el.querySelector('.pal-count');
    emptyEl = el.querySelector('.pal-empty');
    clearBtn = el.querySelector('.pal-clear');

    input.addEventListener('input', () => { currentQuery = input.value; render(); });
    input.addEventListener('keydown', onKey);
    clearBtn.addEventListener('click', () => { input.value = ''; currentQuery = ''; render(); input.focus(); });
    el.addEventListener('click', e => { if (e.target.closest('[data-pal-close]')) close(); });
    el.addEventListener('keydown', trap);
    listEl.addEventListener('mousemove', e => {
      const o = e.target.closest('[role=option]'); if (!o) return;
      const i = +o.dataset.i; if (i !== active) setActive(i, false);
    });
    listEl.addEventListener('mousedown', e => { if (e.target.closest('[role=option]')) e.preventDefault(); }); // keep focus in the input
    listEl.addEventListener('click', e => {
      const o = e.target.closest('[role=option]'); if (!o) return;
      setActive(+o.dataset.i, false); activate(+o.dataset.i, false);
    });
    window.addEventListener('resize', () => { if (isOpen) placeInd(false); });
    window.addEventListener('themechange', () => { if (isOpen) render(true); });
  };

  const countText = n => n === 0 ? 'Sonuç yok' : n === 1 ? '1 sonuç' : n === 2 ? '2 sonuç' : n <= 10 ? n + ' sonuç' : n + ' sonuç';

  const rowHTML = (r, i) => {
    const id = 'pal-opt-' + i;
    let title, sub = '', badge = '', meta = '';
    if (r.kind === 'result') {
      const e = r.e, rg = r.ranges;
      title = highlight(e.f[0], rg[0]);
      if (e.num) badge = '<span class="pal-num">' + highlight(e.f[2], rg[2]) + '</span>';
      if (e.kind === 'page') meta = esc(e.url);
      else {
        meta = esc(pageLabel(e.page));
        const sn = rg[3] && rg[3].length ? snippet(e.f[3], rg[3]) : (e.subtitle ? highlight(e.f[1], rg[1]) : snippet(e.f[3], []));
        sub = sn;
      }
    } else if (r.kind === 'action') {
      title = esc(r.a.title) + (r.a.query ? '<b class="pal-q">' + esc(r.a.query) + '</b>' : '');
      meta = esc(r.a.meta || '');
    } else if (r.kind === 'recent' || r.kind === 'suggest') {
      title = esc(r.q);
      meta = r.kind === 'recent' ? 'Önceki arama' : '';
    } else if (r.kind === 'clear') {
      title = 'Son aramaları temizle';
    }
    return '<div class="pal-opt" role="option" id="' + id + '" data-i="' + i + '" data-g="' + r.g + '" aria-selected="false">' +
      '<span class="pal-ic">' + svg(r.icon) + '</span>' +
      '<span class="pal-main"><span class="pal-t">' + badge + '<span class="pal-tt">' + title + '</span></span>' +
        (sub ? '<span class="pal-sn">' + sub + '</span>' : '') + '</span>' +
      (meta ? '<span class="pal-meta">' + meta + '</span>' : '') +
      (r.kind === 'suggest' ? '' : '<span class="pal-go" aria-hidden="true">' + svg(r.kind === 'result' || (r.kind === 'action' && /^(dash|toc)$/.test(r.a.id)) ? 'arrow' : 'enter') + '</span>') +
    '</div>';
  };

  const render = keepActive => {
    if (!el) return;
    const q = currentQuery.trim();
    const prevId = keepActive && rows[active] ? rowKey(rows[active]) : null;
    clearBtn.hidden = !currentQuery;
    const groups = [];
    let resultCount = 0;
    emptyEl.hidden = true; emptyEl.innerHTML = '';
    if (!q) {
      const recent = readRecent();
      if (recent.length) {
        const g = recent.map(x => ({ kind: 'recent', q: x, icon: 'clock', g: 'recent' }));
        g.push({ kind: 'clear', icon: 'trash', g: 'recent' });
        groups.push({ label: 'Son aramalar', rows: g });
      }
      groups.push({ label: 'Öneriler', kind: 'chips', rows: SUGGEST.map(x => ({ kind: 'suggest', q: x, icon: 'search', g: 'suggest' })) });
      groups.push({ label: 'İşlemler', rows: ACTIONS().map(a => ({ kind: 'action', a, icon: a.icon, g: 'action' })) });
    } else {
      const res = search(q);
      const by = {};
      res.forEach(r => { (by[r.e.group] = by[r.e.group] || []).push(r); });
      GROUPS.forEach(G => {
        if (G.key === 'action') return;
        const list = (by[G.key] || []).slice(0, GROUP_LIMIT[G.key]);
        if (list.length) {
          resultCount += list.length;
          groups.push({ label: G.label, icon: G.icon, rows: list.map(r => ({ kind: 'result', e: r.e, ranges: r.ranges, icon: r.e.icon, g: G.key })), top: list[0].score });
        }
      });
      // order groups by best score so the most relevant group leads (pages stay first when strong)
      groups.sort((a, b) => b.top - a.top);
      const tq = tokenize(q).tokens;
      const acts = ACTIONS().filter(a => {
        const ks = words(norm(a.title + ' ' + a.keys));
        return tq.length && tq.every(t => ks.some(w => w.v.some(([v]) => v.startsWith(t))));
      }).map(a => ({ kind: 'action', a, icon: a.icon, g: 'action' }));
      const strong = acts.length > 0;
      acts.push({ kind: 'action', a: askAction(q), icon: 'message', g: 'action' });
      if (strong) groups.unshift({ label: 'İşlemler', rows: acts }); else groups.push({ label: 'İşlemler', rows: acts });
      if (!resultCount) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = '<div class="pal-none-ic">' + svg('search') + '</div><p class="pal-none-t">Sonuç bulunamadı: «' + esc(q) + '»</p>' +
          '<p class="pal-none-s">Başka bir kelime veya daha kısa bir ifade deneyin ya da doğrudan akıllı asistana sorun.</p>';
      }
    }
    rows = [];
    let html = '';
    groups.forEach((g, gi) => {
      const hid = 'pal-gh-' + gi;
      html += '<div class="pal-group' + (g.kind === 'chips' ? ' pal-chips' : '') + '" role="group" aria-labelledby="' + hid + '"><div class="pal-gh" id="' + hid + '" role="presentation">' + esc(g.label) +
        (g.rows[0] && g.rows[0].kind === 'result' ? '<span class="pal-gc">' + g.rows.length + '</span>' : '') + '</div>';
      if (g.kind === 'chips') html += '<div class="pal-chipwrap">';
      g.rows.forEach(r => { html += rowHTML(r, rows.length); rows.push(r); });
      if (g.kind === 'chips') html += '</div>';
      html += '</div>';
    });
    listEl.innerHTML = '<div class="pal-ind" aria-hidden="true"></div>' + html;
    ind = listEl.querySelector('.pal-ind');
    input.setAttribute('aria-expanded', rows.length ? 'true' : 'false');
    let next = 0;
    if (prevId) { const k = rows.findIndex(r => rowKey(r) === prevId); if (k >= 0) next = k; }
    active = -1;
    setActive(rows.length ? next : -1, false, true);
    if (!keepActive) listEl.scrollTop = 0;
    const msg = q ? countText(resultCount) : '';
    countEl.textContent = q ? msg : 'Aramak için yazmaya başlayın';
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => { live.textContent = q ? msg + (resultCount ? '' : '. Asistana sorabilirsiniz') : ''; }, 450);
  };
  const rowKey = r => r.kind + ':' + (r.e ? r.e.id : r.a ? r.a.id : r.q || '');

  const placeInd = instant => {
    const o = active >= 0 && listEl.querySelector('#pal-opt-' + active);
    if (!o) { ind.style.opacity = '0'; return; }
    if (instant || ind.style.opacity !== '1') ind.classList.add('no-anim');
    ind.style.height = o.offsetHeight + 'px';
    ind.style.width = o.offsetWidth + 'px';
    ind.classList.toggle('is-chip', !!o.closest('.pal-chips'));
    ind.style.transform = 'translate(' + o.offsetLeft + 'px,' + o.offsetTop + 'px)';
    ind.style.opacity = '1';
    if (ind.classList.contains('no-anim')) { void ind.offsetWidth; ind.classList.remove('no-anim'); }
  };
  const setActive = (i, scroll, instant) => {
    const prev = active >= 0 && listEl.querySelector('#pal-opt-' + active);
    if (prev) { prev.setAttribute('aria-selected', 'false'); prev.classList.remove('is-active'); }
    active = i;
    const o = i >= 0 && listEl.querySelector('#pal-opt-' + i);
    if (o) {
      o.setAttribute('aria-selected', 'true'); o.classList.add('is-active');
      input.setAttribute('aria-activedescendant', o.id);
      if (scroll) {
        const lt = listEl.scrollTop, lh = listEl.clientHeight, ot = o.offsetTop, oh = o.offsetHeight;
        const grp = o.closest('.pal-group'), gh = grp && grp.firstChild;
        const pad = gh && gh.classList.contains('pal-gh') && grp.querySelector('[role=option]') === o ? gh.offsetHeight + 8 : 8;
        if (ot - pad < lt) listEl.scrollTo({ top: Math.max(0, ot - pad), behavior: reduced() ? 'auto' : 'smooth' });
        else if (ot + oh + 8 > lt + lh) listEl.scrollTo({ top: ot + oh + 8 - lh, behavior: reduced() ? 'auto' : 'smooth' });
      }
    } else input.removeAttribute('aria-activedescendant');
    placeInd(instant);
  };

  const activate = (i, viaKey) => {
    const r = rows[i]; if (!r) return;
    const o = listEl.querySelector('#pal-opt-' + i);
    const run = () => {
      if (r.kind === 'result') { pushRecent(currentQuery); go(r.e.url); }
      else if (r.kind === 'action') { r.a.run(); }
      else if (r.kind === 'recent' || r.kind === 'suggest') { input.value = r.q; currentQuery = r.q; render(); input.focus(); }
      else if (r.kind === 'clear') { writeRecent([]); render(); input.focus(); }
    };
    if (o && !reduced()) {
      o.classList.add('is-press'); ind.classList.add('is-press');
      setTimeout(() => { o.classList.remove('is-press'); ind.classList.remove('is-press'); run(); }, viaKey ? 140 : 90);
    } else run();
  };

  const onKey = e => {
    if (e.isComposing) return;
    const n = rows.length;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (n) setActive(active < n - 1 ? active + 1 : 0, true); break;
      case 'ArrowUp': e.preventDefault(); if (n) setActive(active > 0 ? active - 1 : n - 1, true); break;
      case 'Home': if (n && !e.shiftKey) { e.preventDefault(); setActive(0, true); } break;
      case 'End': if (n && !e.shiftKey) { e.preventDefault(); setActive(n - 1, true); } break;
      case 'PageDown': if (n) { e.preventDefault(); setActive(Math.min(n - 1, active + 5), true); } break;
      case 'PageUp': if (n) { e.preventDefault(); setActive(Math.max(0, active - 5), true); } break;
      case 'Enter': e.preventDefault(); if (active >= 0) activate(active, true); break;
      case 'Escape':
        e.preventDefault(); e.stopPropagation();
        if (input.value) { input.value = ''; currentQuery = ''; render(); } else close();
        break;
    }
  };
  const trap = e => {
    if (e.key === 'Escape' && e.target !== input) { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('input, button:not([hidden])')].filter(x => x.offsetParent !== null || x === input);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!el.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
  };

  /* ---------------- open / close ---------------- */
  const BEHIND = ['main', '.nav', '.footer', '.tabbar', '.chat-fab', '.totop', '.progress', '.skip', '.chat'];
  const open = query => {
    if (!el) build();
    if (typeof query === 'string') { input.value = query; currentQuery = query; }
    if (isOpen) { render(); input.focus(); input.select(); return; }
    clearTimeout(hideTimer);
    isOpen = true;
    const ae = doc.activeElement;
    lastFocus = ae && ae !== doc.body && !el.contains(ae) ? ae : lastFocus;
    inerted = [];
    BEHIND.forEach(sel => doc.querySelectorAll(sel).forEach(n => { if (!n.inert && !el.contains(n)) { n.inert = true; inerted.push(n); } }));
    root.classList.add('pal-lock');
    el.hidden = false;
    render();
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('is-open'); placeInd(true); }));
    input.focus({ preventScroll: true });
    if (input.value) input.select();
  };
  const close = keepRestore => {
    if (!el || !isOpen) return;
    isOpen = false;
    el.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    inerted.forEach(n => { n.inert = false; }); inerted = [];
    root.classList.remove('pal-lock');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!isOpen) el.hidden = true; }, reduced() ? 160 : 300);
    const lf = lastFocus;
    if (lf && lf.isConnected && typeof lf.focus === 'function') { try { lf.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    void keepRestore;
  };

  /* ---------------- triggers ---------------- */
  const inField = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  doc.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === 'k' || e.code === 'KeyK')) {
      e.preventDefault();
      if (isOpen) close(); else open();
      return;
    }
    if (!isOpen && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !inField(e.target)) {
      e.preventDefault(); open();
    }
  }, true);
  doc.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-open-palette]');
    if (!t) return;
    e.preventDefault();
    lastFocus = t;
    open(t.getAttribute('data-open-palette') || undefined);
  });

  /* deep link arrival from a palette navigation on another page: open <details>, flash */
  const arrive = () => {
    let id = null;
    try { id = sessionStorage.getItem(FLASH_KEY); sessionStorage.removeItem(FLASH_KEY); } catch (e) { /* ignore */ }
    if (id && location.hash === '#' + id) setTimeout(() => reveal(id, false), 60);
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arrive); else arrive();

  window.TakamulPalette = {
    open: q => open(typeof q === 'string' ? q : undefined),
    close: () => close()
  };
})();
