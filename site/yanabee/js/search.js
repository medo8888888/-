// «ينابيع» site search: a Ctrl/Cmd+K (or "/") overlay over window.YANABEE_KB, plus the
// Arabic-aware text engine shared with the assistant's offline answers (js/chat.js).
// Classic script (no modules) so the site also works from file:// and plain static hosting.
//
//   window.YanabeeSearch = { open(query?), close(), engine }
//   engine: { norm, prepare(query) -> tokens, rank(tokens) -> [{item, score}], scoreText(text, tokens),
//             marks(text, tokens) -> [[start, end]…], items, byId }
(() => {
  const KB = window.YANABEE_KB && Array.isArray(window.YANABEE_KB.items) ? window.YANABEE_KB : { items: [], pages: [], icons: {} };

  /* =====================================================================
     Text engine
     ===================================================================== */
  // tashkeel, superscript alef, Quranic marks, tatweel
  const DIAC = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;
  const FOLD = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ة': 'ه', 'ى': 'ي', 'ؤ': 'و', 'ئ': 'ي' };
  let WORD;
  try { WORD = new RegExp('[\\p{L}\\p{N}]', 'u'); } catch (e) { WORD = /[A-Za-z0-9ء-ي٠-٩۰-۹ٱ-ۓﭐ-﷿ﹰ-﻿]/; }
  const fold = c => {
    if (FOLD[c]) return FOLD[c];
    const k = c.charCodeAt(0);
    if (k >= 0x660 && k <= 0x669) return String(k - 0x660); // Arabic-Indic digits
    if (k >= 0x6F0 && k <= 0x6F9) return String(k - 0x6F0); // Eastern Arabic-Indic digits
    return c.toLowerCase();
  };
  // Normalised text plus map[i] = index in the original string of normalised char i.
  function normMap(s) {
    let n = '';
    const map = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (DIAC.test(c)) continue;
      if ((c === ',' || c === '٬') && /\d/.test(s[i - 1] || '') && /\d/.test(s[i + 1] || '')) continue; // 1,000 -> 1000
      const f = fold(c);
      if (!WORD.test(f)) {
        if (n && n[n.length - 1] !== ' ') { n += ' '; map.push(i); }
        continue;
      }
      for (let j = 0; j < f.length; j++) { n += f[j]; map.push(i); }
    }
    if (n.endsWith(' ')) { n = n.slice(0, -1); map.pop(); }
    return { n, map };
  }
  const norm = s => normMap(String(s || '')).n;

  const STOP = new Set(('ما ماذا من في عن على علي الى الي إلى هي هو هم هن هل كيف لماذا لما متى اين أين او أو ثم مع و ان إن أن كان كانت يكون ' +
    'التي الذي الذين اللذين هذا هذه ذلك تلك هناك كل اي أي اذا إذا قد لا لم لن بين عند حول بعد قبل كم لي لنا انا نحن انت انتم ' +
    'اريد أريد اعرف أعرف اشرح وضح تحدث حدثني اخبرني أخبرني عرفني ممكن يمكن رجاء فضلك سمحت لو بماذا عما مما فيما ' +
    'the a an of and or is are what how why who which in on for to me about tell').split(' ').map(norm));
  // Words that are everywhere on this site: they count, but little.
  const SOFT = new Set(['مشروع', 'ينابيع', 'منص', 'وثيق', 'موقع']); // stems
  // A few verb forms -> the nouns the documents use.
  const SYN = {
    'يشرف': ['اشراف', 'مشرف'], 'تمويل': ['ماليه'], 'يمول': ['تمويل', 'ماليه'], 'تمول': ['تمويل'], 'ممول': ['تمويل'], 'نمول': ['تمويل'], 'مموله': ['تمويل'],
    'يدار': ['اداره', 'تدار'], 'تدار': ['اداره', 'تدار'], 'ادار': ['اداره'],
    'يقاس': ['قياس'], 'يقيس': ['قياس'], 'نقيس': ['قياس'], 'تقاس': ['قياس'],
    'قايد': ['قاده'], 'قاد': ['قايد'], 'فريق': ['فرق'], 'فرق': ['فريق'],
    'هدف': ['اهداف'], 'اهداف': ['هدف'], 'تهدف': ['هدف', 'اهداف'], 'يهدف': ['هدف', 'اهداف'],
    'يسجل': ['تسجيل'], 'اسجل': ['تسجيل'], 'تسجل': ['تسجيل'], 'ينضم': ['تسجيل', 'انضمام'], 'انضم': ['تسجيل', 'انضمام'],
    'يكرم': ['تكريم'], 'تكرم': ['تكريم'], 'جايز': ['جوايز'], 'جوايز': ['جايز'],
  };
  const PREFIX2 = ['وبال', 'فبال', 'وال', 'بال', 'فال', 'كال', 'ولل', 'لل', 'ال'];
  const PREFIX1 = ['و', 'ف', 'ب', 'ل'];
  const SUFFIX = ['يات', 'ات', 'ون', 'ين', 'ها', 'هم', 'يه', 'ه', 'ي'];
  const WORD_PREFIX = new Set(['ال', 'و', 'ف', 'ب', 'ل', 'ك', 'وال', 'بال', 'فال', 'كال', 'لل', 'ولل', 'وبال', 'فبال', 'وب', 'ول', 'فل', 'لي']);

  function stem(w) {
    if (/^[0-9a-z]+$/.test(w)) return w;
    let s = w;
    for (const p of PREFIX2) if (s.startsWith(p) && s.length - p.length >= 3) { s = s.slice(p.length); break; }
    if (s === w) for (const p of PREFIX1) if (s.startsWith(p) && s.length >= 5) { s = s.slice(1); break; }
    for (const x of SUFFIX) if (s.endsWith(x) && s.length - x.length >= 3) { s = s.slice(0, -x.length); break; }
    return s;
  }

  /* ---------- per-item prepared text ---------- */
  const items = KB.items;
  const byId = Object.create(null);
  const prepared = items.map(it => {
    byId[it.id] = it;
    return { it, tn: norm((it.kicker ? it.kicker + ' ' : '') + it.title), xn: norm(it.text) };
  });

  // Occurrences of one token in normalised text: {count, strong} (strong = starts a word, maybe after ال/و/ب…).
  function find(tok, n) {
    let count = 0, strong = false;
    for (const a of tok.alts) {
      let i = n.indexOf(a);
      while (i >= 0) {
        const ws = n.lastIndexOf(' ', i - 1) + 1;
        const pre = n.slice(ws, i);
        const end = i + a.length;
        const atStart = pre === '' || WORD_PREFIX.has(pre);
        const whole = end === n.length || n[end] === ' ';
        if (tok.short ? atStart && whole : atStart || a.length >= 4) {
          count++;
          if (atStart) strong = true;
        }
        i = n.indexOf(a, i + 1);
      }
    }
    return { count, strong };
  }

  function prepare(query) {
    const words = norm(query).split(' ').filter(Boolean);
    let kept = words.filter(w => !STOP.has(w));
    if (!kept.length) kept = words;
    const seen = new Set();
    const toks = [];
    for (const w of kept) {
      const s = stem(w);
      if (!s || seen.has(s)) continue;
      seen.add(s);
      const alts = [s].concat(SYN[s] || SYN[w] || []);
      if (/^[يتن][^ ]{3}$/.test(w) && !alts.includes(w.slice(1))) alts.push(w.slice(1)); // يشرف -> شرف (إشراف)
      const tok = { w, s, alts, short: s.length <= 2, soft: SOFT.has(s) };
      if (tok.short && !/^[0-9a-z]+$/.test(s) && kept.length > 1) continue; // stray 1–2 letter Arabic words
      let df = 0;
      for (const p of prepared) if (find(tok, p.tn).count || find(tok, p.xn).count) df++;
      tok.w8 = Math.log(1 + prepared.length / (1 + df)) * (tok.soft ? 0.3 : 1);
      toks.push(tok);
    }
    // phrase patterns for adjacent token pairs ("مصادر التمويل", "قائد الفريق")
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    toks.pairs = [];
    for (let i = 0; i + 1 < toks.length; i++) {
      toks.pairs.push(new RegExp('(?:^| )\\S{0,4}' + esc(toks[i].s) + '\\S* \\S{0,4}' + esc(toks[i + 1].s)));
    }
    toks.q = words.join(' ');
    toks.doc = /(^| )(مبادره|حلق|حلقات|قران|قرانيه|طلاب|طالب|محور)( |$)/.test(words.join(' ')) ? 'quran'
      : /(^| )(مشروع|المشروع|منصه|المنصه|ينابيع)( |$)/.test(words.join(' ')) ? 'platform' : '';
    return toks;
  }

  function scorePrepared(p, toks) {
    let sum = 0, got = 0, total = 0;
    for (const tok of toks) {
      total += tok.w8;
      const t = find(tok, p.tn), x = find(tok, p.xn);
      if (t.count) sum += tok.w8 * 10 * (t.strong ? 1 : 0.6);
      if (x.count) sum += tok.w8 * (3 + Math.min(x.count - 1, 4) * 0.6) * (x.strong ? 1 : 0.6);
      if (t.count || x.count) got += tok.w8;
    }
    if (!got || !total) return 0;
    const cov = got / total;
    sum *= cov * cov;
    if (cov === 1 && toks.length > 1) sum += 4;
    for (const re of toks.pairs) {
      if (re.test(p.tn)) sum += 8;
      else if (re.test(p.xn)) sum += 5;
    }
    if (toks.q && p.tn === toks.q) sum += 12;                 // exact title ("الرؤية")
    else if (toks.q && p.tn.startsWith(toks.q + ' ')) sum += 3;
    if (toks.doc) sum *= p.it.doc === toks.doc ? 1.15 : 0.5;  // the question names a document: prefer it
    return sum;
  }

  function rank(toks) {
    if (!toks || !toks.length) return [];
    const out = [];
    for (const p of prepared) {
      const score = scorePrepared(p, toks);
      if (score > 0) out.push({ item: p.it, score });
    }
    out.sort((a, b) => b.score - a.score);
    if (!out.length) return out;
    const floor = Math.max(out[0].score * 0.1, 2.5);
    return out.filter(r => r.score >= floor);
  }

  // Weighted share of the query found in a piece of text (0…1) — used to pick relevant lines.
  function scoreText(text, toks) {
    const n = norm(text);
    let got = 0, total = 0;
    for (const tok of toks) { total += tok.w8; if (find(tok, n).count) got += tok.w8; }
    return total ? got / total : 0;
  }

  // Whole-word highlight ranges [start, end) in the ORIGINAL string for every token hit.
  function marks(text, toks) {
    const { n, map } = normMap(text);
    const ranges = [];
    for (const tok of toks) {
      for (const a of tok.alts) {
        let i = n.indexOf(a);
        while (i >= 0) {
          const ws = n.lastIndexOf(' ', i - 1) + 1;
          let we = n.indexOf(' ', i + a.length);
          if (we < 0) we = n.length;
          const atStart = ws === i || WORD_PREFIX.has(n.slice(ws, i));
          const ok = tok.short ? atStart && we === i + a.length : atStart || a.length >= 4;
          if (ok) {
            let s = map[ws], e = map[we - 1] + 1;
            while (e < text.length && DIAC.test(text[e])) e++; // keep trailing tashkeel inside the mark
            ranges.push([s, e]);
          }
          i = n.indexOf(a, i + 1);
        }
      }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && (r[0] <= last[1] || !text.slice(last[1], r[0]).trim())) last[1] = Math.max(last[1], r[1]); // «قادة الفرق» = one mark
      else merged.push(r.slice());
    }
    return merged;
  }

  const engine = { norm, prepare, rank, scoreText, marks, items, byId, kb: KB };
  window.YanabeeSearch = { engine, open() {}, close() {} };

  /* =====================================================================
     Overlay
     ===================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const box = $('.search');
  if (!box) return;
  const panel = $('.search-panel', box), input = $('.search-bar input', box), list = $('#search-results', box);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX = 12;
  const SAMPLES = ['الكشافة', 'التمويل', 'مؤشرات الأداء', 'قائد الفريق', 'حماية البيانات', 'الدمج'];

  /* ---------- DOM helpers (content always goes in as text, never as HTML) ---------- */
  // Text goes in as text nodes; Latin runs (KPI 1, CSR, Peer-to-Peer) are isolated in <bdi>
  // like core.t() does on the pages, so brackets around them don't flip in RTL lines.
  const LATIN = /[A-Za-z][A-Za-z0-9&+\-/.]*(?:\s+[A-Za-z0-9&+\-/.]+)*/g;
  const put = (el, s) => {
    let pos = 0;
    s.replace(LATIN, (m, i) => {
      if (i > pos) el.appendChild(document.createTextNode(s.slice(pos, i)));
      const b = document.createElement('bdi');
      b.lang = 'en';
      b.textContent = m;
      el.appendChild(b);
      pos = i + m.length;
      return m;
    });
    if (pos < s.length) el.appendChild(document.createTextNode(s.slice(pos)));
    return el;
  };
  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) put(el, String(text));
    return el;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Icon paths are trusted, generated markup (core.ICONS via build_kb.py), not content.
  const icon = (name, cls = 'i') => {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = (KB.icons && KB.icons[name]) || '';
    return svg;
  };
  const withMarks = (el, text, toks) => {
    let pos = 0;
    for (const [s, e] of toks && toks.length ? marks(text, toks) : []) {
      if (s > pos) put(el, text.slice(pos, s));
      el.appendChild(h('mark', '', text.slice(s, e)));
      pos = e;
    }
    if (pos < text.length) put(el, text.slice(pos));
    return el;
  };
  const tone = name => `var(--${name || 'brand'})`;
  const plural = n => (n === 1 ? 'نتيجة واحدة' : n === 2 ? 'نتيجتان' : n <= 10 ? `${n} نتائج` : `${n} نتيجة`);
  const shortTitle = t => t.replace(/\s*\([^)]*\)\s*$/, '');

  /* ---------- extra UI around the listbox (hints, empty state, live status) ---------- */
  const hints = h('div', 'search-hints');
  hints.appendChild(h('span', 'search-hints-label', 'جرّب:'));
  SAMPLES.forEach(q => {
    const b = h('button', 'search-hint', q);
    b.type = 'button';
    b.addEventListener('click', () => { input.value = q; render(); input.focus(); });
    hints.appendChild(b);
  });
  $('.search-bar', panel).after(hints);
  const empty = h('div', 'search-empty');
  empty.hidden = true;
  list.after(empty);
  const live = h('p', 'sr-only');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  panel.appendChild(live);
  let liveTimer = 0;
  const announce = msg => { clearTimeout(liveTimer); liveTimer = setTimeout(() => { live.textContent = msg; }, 350); };

  /* ---------- rendering ---------- */
  let opts = [], active = -1;

  function option(href, id) {
    const a = h('a', 'sr-opt');
    a.href = href;
    a.id = 'sr-opt-' + id;
    a.setAttribute('role', 'option');
    a.setAttribute('aria-selected', 'false');
    a.tabIndex = -1;
    opts.push(a);
    return a;
  }
  function group(label, iconName, cls) {
    const g = h('div', 'sr-group' + (cls ? ' ' + cls : ''));
    g.setAttribute('role', 'group');
    const head = h('div', 'sr-ghead');
    head.id = 'sr-g-' + list.childElementCount;
    if (iconName) head.appendChild(icon(iconName));
    head.appendChild(h('span', '', label));
    g.setAttribute('aria-labelledby', head.id);
    g.appendChild(head);
    const body = h('div', 'sr-gbody');
    g.appendChild(body);
    list.appendChild(g);
    return body;
  }

  function snippet(item, toks) {
    const lines = item.text ? item.text.split('\n') : [];
    if (!lines.length) {
      const kids = items.filter(x => x.parent === item.id).map(x => shortTitle(x.title));
      return { text: kids.join(' · '), toks: [] };
    }
    let best = 0, bestScore = -1;
    lines.forEach((l, i) => { const s = scoreText(l, toks); if (s > bestScore) { bestScore = s; best = i; } });
    const k = item.k || '';
    const show = i => (k[i] === 't' ? lines[i].split(' | ').join(' · ')
      : item.type === 'kpi' ? lines[i].replace(/^KPI \d+ \([^)]*\):\s*/, '') : lines[i]);
    const LIM = 150;
    let line = show(best);
    // A short line ("مصادر التمويل:") reads better with what follows it.
    for (let i = best + 1; line.length < 90 && i < lines.length; i++) line += ' ' + show(i);
    if (line.length <= LIM) return { text: line, toks };
    const first = marks(line, toks)[0];
    let start = first ? Math.max(0, first[0] - 45) : 0;
    if (start > 0) { const sp = line.indexOf(' ', start); start = sp > 0 && sp < (first ? first[0] : line.length) ? sp + 1 : start; }
    let end = Math.min(line.length, start + LIM);
    if (end < line.length) { const sp = line.lastIndexOf(' ', end); if (sp > start + 40) end = sp; }
    return { text: (start > 0 ? '… ' : '') + line.slice(start, end) + (end < line.length ? ' …' : ''), toks };
  }

  function renderQuick() {
    const pages = group('صفحات الموقع', 'home', 'sr-quick');
    pages.classList.add('sr-tiles');
    (KB.pages || []).forEach((pg, i) => {
      const a = option(pg.url, 'p' + i);
      a.classList.add('sr-tile');
      a.style.setProperty('--tone', tone(pg.tone));
      const ic = h('span', 'sr-ic');
      ic.appendChild(icon(pg.icon));
      a.append(ic, h('span', 'sr-t', pg.title));
      pages.appendChild(a);
    });
    const teams = group('الفرق السبع', 'users', 'sr-quick');
    teams.classList.add('sr-teams');
    items.filter(it => it.type === 'team').forEach(it => {
      const a = option(it.url, it.id);
      a.classList.add('sr-team');
      a.style.setProperty('--tone', tone(it.tone));
      const ic = h('span', 'sr-ic');
      ic.appendChild(icon(it.icon));
      a.append(ic, h('span', 'sr-t', shortTitle(it.title)));
      teams.appendChild(a);
    });
  }

  function renderResults(ranked, toks) {
    // Drop a parent whose only reason to be here is a child already listed above it
    // (e.g. «مؤشرات الأداء الرئيسية» under «KPI 7»), unless its own title matches.
    const shown = new Set();
    const top = [];
    for (const r of ranked) {
      const it = r.item;
      const childAbove = items.some(c => c.parent === it.id && shown.has(c.id));
      if (childAbove && scoreText((it.kicker ? it.kicker + ' ' : '') + it.title, toks) === 0) continue;
      shown.add(it.id);
      top.push(r);
      if (top.length === MAX) break;
    }
    const pageOrder = [];
    const groups = {};
    top.forEach(r => {
      const pg = r.item.page;
      if (!groups[pg]) { groups[pg] = []; pageOrder.push(pg); }
      groups[pg].push(r);
    });
    const pageInfo = {};
    (KB.pages || []).forEach(p => { pageInfo[p.url] = p; });
    pageOrder.forEach(pg => {
      const info = pageInfo[pg] || { title: pg, icon: 'file-text' };
      const body = group(info.title, info.icon);
      groups[pg].forEach(({ item }) => {
        const a = option(item.url, item.id);
        a.style.setProperty('--tone', tone(item.tone));
        const ic = h('span', 'sr-ic');
        ic.appendChild(icon(item.icon));
        const txt = h('span', 'sr-txt');
        const parent = item.parent && byId[item.parent];
        const crumb = item.kicker || (parent ? (parent.kicker ? parent.kicker + ' · ' : '') + shortTitle(parent.title) : '');
        if (crumb) txt.appendChild(h('span', 'sr-k', crumb));
        txt.appendChild(withMarks(h('span', 'sr-t'), item.title, toks));
        const sn = snippet(item, toks);
        if (sn.text) txt.appendChild(withMarks(h('span', 'sr-s'), sn.text, sn.toks));
        const go = h('span', 'sr-go');
        go.appendChild(icon('arrow-left'));
        a.append(ic, txt, go);
        body.appendChild(a);
      });
    });
  }

  function renderEmpty(q) {
    empty.textContent = '';
    const art = h('div', 'se-art');
    art.appendChild(icon('search'));
    const title = h('p', 'se-title');
    title.append('لا توجد نتائج مطابقة لـ ', h('bdi', '', '«' + q + '»'));
    const text = h('p', 'se-text', 'جرّب كلمة أخرى أو صيغة أقصر، أو اسأل «مساعد ينابيع» ليبحث لك في نصوص وثائق المشروع.');
    const ask = h('button', 'btn btn-primary se-ask');
    ask.type = 'button';
    ask.append(icon('sparkles'), h('span', '', 'اسأل مساعد ينابيع'));
    ask.addEventListener('click', () => {
      close(true);
      if (window.YanabeeChat && window.YanabeeChat.ask) window.YanabeeChat.ask(q);
    });
    empty.append(art, title, text, ask);
  }

  function setActive(i, scroll = true) {
    if (active >= 0 && opts[active]) opts[active].setAttribute('aria-selected', 'false');
    active = i;
    if (i >= 0 && opts[i]) {
      opts[i].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', opts[i].id);
      if (scroll) opts[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function render() {
    const q = input.value.trim();
    list.textContent = '';
    opts = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.scrollTop = 0;
    if (!q) {
      hints.hidden = false;
      empty.hidden = true;
      list.hidden = false;
      renderQuick();
      input.setAttribute('aria-expanded', 'true');
      box.classList.remove('has-query');
      announce('');
      return;
    }
    box.classList.add('has-query');
    hints.hidden = true;
    const toks = prepare(q);
    const ranked = rank(toks);
    if (!ranked.length) {
      list.hidden = true;
      empty.hidden = false;
      renderEmpty(q);
      input.setAttribute('aria-expanded', 'false');
      announce('لا توجد نتائج');
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    renderResults(ranked, toks);
    input.setAttribute('aria-expanded', 'true');
    announce(plural(opts.length));
  }

  /* ---------- navigation (same-page anchors close the overlay and scroll) ---------- */
  function follow(a, e) {
    const url = new URL(a.href, location.href);
    const same = url.pathname === location.pathname && url.search === location.search;
    if (!same || !url.hash) return; // let the browser navigate
    if (e) e.preventDefault();
    close(false);
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (location.hash === url.hash) {
      if (target) target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      if (target) { target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1800); }
    } else {
      location.hash = url.hash;
    }
    if (target) {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.classList.add('sr-target');
      target.focus({ preventScroll: true });
    }
  }
  list.addEventListener('click', e => {
    const a = e.target.closest('a.sr-opt');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    follow(a, e);
  });
  list.addEventListener('mousemove', e => {
    const a = e.target.closest('a.sr-opt');
    const i = a ? opts.indexOf(a) : -1;
    if (i >= 0 && i !== active) setActive(i, false);
  });

  /* ---------- open / close ---------- */
  const root = document.documentElement;
  const behindSel = ['.skip', '.progress', '.nav', 'main', '.footer', '.tabbar', '.chat-fab', '.totop', '.chat'];
  let isOpen = false, lastFocus = null, saved = [];
  const fit = () => {
    const vv = window.visualViewport;
    panel.style.maxHeight = isOpen && vv && innerWidth <= 860 ? Math.max(260, vv.height - 24) + 'px' : '';
  };
  function open(query) {
    if (!isOpen) {
      isOpen = true;
      lastFocus = document.activeElement;
      saved = behindSel.map(s => document.querySelector(s)).filter(Boolean)
        .map(el => [el, el.inert, el.getAttribute('aria-hidden')]);
      saved.forEach(([el]) => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });
      if (innerWidth > root.clientWidth) root.style.scrollbarGutter = 'stable';
      root.style.overflow = 'hidden';
      document.body.classList.add('search-open');
      box.hidden = false;
      fit();
    }
    if (typeof query === 'string') input.value = query;
    render();
    requestAnimationFrame(() => { input.focus({ preventScroll: true }); if (input.value) input.select(); });
  }
  function close(restore = true) {
    if (!isOpen) return;
    isOpen = false;
    box.hidden = true;
    saved.forEach(([el, inert, aria]) => {
      el.inert = inert;
      if (aria === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', aria);
    });
    saved = [];
    root.style.overflow = '';
    root.style.scrollbarGutter = '';
    document.body.classList.remove('search-open');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    panel.style.maxHeight = '';
    if (restore && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  window.YanabeeSearch.open = open;
  window.YanabeeSearch.close = close;

  document.querySelectorAll('[data-open-search]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
  box.querySelectorAll('[data-close-search]').forEach(b => b.addEventListener('click', () => close()));
  addEventListener('pageshow', e => { if (e.persisted && isOpen) close(false); });
  if (window.visualViewport) visualViewport.addEventListener('resize', fit);

  /* ---------- keyboard ---------- */
  const typing = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  addEventListener('keydown', e => {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === 'k' || k === 'K' || e.code === 'KeyK')) {
      e.preventDefault();
      if (isOpen) { input.focus(); input.select(); } else open();
      return;
    }
    if (!isOpen && k === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
      e.preventDefault();
      open();
      return;
    }
    if (isOpen && k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }, true);

  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.isComposing) return;
    const n = opts.length;
    switch (e.key) {
      case 'ArrowDown': if (n) { e.preventDefault(); setActive(active < n - 1 ? active + 1 : 0); } break;
      case 'ArrowUp': if (n) { e.preventDefault(); setActive(active > 0 ? active - 1 : n - 1); } break;
      case 'Home': if (n && active >= 0) { e.preventDefault(); setActive(0); } break;
      case 'End': if (n && active >= 0) { e.preventDefault(); setActive(n - 1); } break;
      case 'Enter': {
        e.preventDefault();
        const a = opts[active >= 0 ? active : 0];
        if (a && (active >= 0 || input.value.trim())) a.click();
        else if (!n && input.value.trim()) { const b = $('.se-ask', empty); b && b.click(); }
        break;
      }
      default:
    }
  });

  // Focus trap: Tab cycles inside the dialog.
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('input, button, a[href]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null && !el.closest('[hidden]'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();
