// «مساعد ينابيع» — the site assistant. Online it talks to the Worker at /api/chat
// (Gemini, streamed, payload {site: "yanabee", messages}). When the assistant is not
// reachable (opened from file://, static hosting without the Worker, no API key) it
// switches to "document search" mode and answers from window.YANABEE_KB: verbatim
// passages of the two documents with a link to where they are on the site — never
// generated text. Classic script (no modules).
//
//   window.YanabeeChat = { open(), close(), ask(question) }
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const box = $('.chat');
  if (!box) { window.YanabeeChat = { open() {}, close() {}, ask() {} }; return; }
  const panel = $('.chat-panel', box), log = $('.chat-log', box), form = $('.chat-form', box),
    input = $('textarea', form), send = $('.chat-send', form), sug = $('.chat-suggest', box),
    modeEl = $('.chat-mode', box);
  const mobileMQ = matchMedia('(max-width: 760px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'yanabee-chat';
  const MAX_CHARS = 2000;        // per message (the Worker truncates to the same)
  const MAX_PAYLOAD = 24 * 1024; // bytes; the Worker rejects bodies above 32 KB
  const SUGGESTIONS = [
    'ما هي الفرق السبع في مشروع ينابيع؟',
    'ما هي مبادرة «حفظ، فهم، تطبيق»؟',
    'كيف يُموَّل المشروع؟',
    'ما مراحل نمو المشروع؟',
    'ما مؤشرات الأداء الرئيسية للمبادرة؟',
    'ما دور قائد الفريق؟',
  ];
  const WELCOME = 'أهلاً بك! أنا **مساعد ينابيع**، أجيبك عن **مشروع «ينابيع»** ومبادرته **«حفظ، فهم، تطبيق»** من نصوص وثيقتي المشروع. اسألني عن الفرق السبع، أو الإدارة والتمويل، أو محاور المبادرة ومؤشراتها. بماذا أبدأ؟';
  const OFFLINE_NOTE = 'المساعد الذكي غير متصل الآن، فأعرض لك **من نصوص الوثائق مباشرة** الفقرات الأقرب إلى سؤالك كما وردت، مع رابط إلى موضعها.';
  const MODE_ONLINE = (modeEl && modeEl.textContent) || 'يجيب من وثائق المشروع';
  const MODE_OFFLINE = 'يجيب من نصوص الوثائق مباشرة';
  const LOCAL_INTRO = 'هذا ما ورد في وثائق المشروع:';
  const LOCAL_NONE = 'لم أجد في وثائق المشروع نصاً يجيب عن هذا السؤال مباشرة. جرّب صياغة أخرى بكلمات من الموضوع، أو ابحث في الموقع.';
  const ERRORS = {
    rate_limited: 'وصلتَ إلى الحد المسموح من الأسئلة مؤقتاً. يُرجى الانتظار دقيقة ثم المحاولة مجدداً.',
    upstream: 'تعذّر الحصول على إجابة من المساعد الذكي الآن.',
    bad_request: 'لم أتمكن من معالجة الطلب. جرّب «محادثة جديدة» ثم أعد طرح سؤالك.',
    forbidden: 'لا يمكن الاتصال بالمساعد الذكي من هذه الصفحة.',
    network: 'تعذّر الاتصال بالمساعد الذكي. تحقّق من اتصالك بالإنترنت.',
  };
  const FALLBACK = ' وإليك ما ورد في الوثائق:';
  const CUT_NOTE = '\n\n_(انقطعت الإجابة قبل اكتمالها، يمكنك إعادة السؤال.)_';

  const engine = () => (window.YanabeeSearch && window.YanabeeSearch.engine) || null;
  const itemById = id => { const e = engine(); return e && e.byId[id]; };

  /* ---------- history (sessionStorage, so it follows the visitor across pages) ---------- */
  let messages = [];
  try { messages = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { messages = []; }
  if (!Array.isArray(messages)) messages = [];
  messages = messages.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-20))); } catch (e) { /* ignore */ } };

  let busy = false;
  let status = null; // null = unknown, 'ready', 'offline'
  let health = null;

  /* ---------- tiny, safe markdown (input is escaped first) ---------- */
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Latin runs (KPI 1, CSR, Peer-to-Peer) are isolated in <bdi> like core.t() does on the pages.
  const LATIN = /[A-Za-z][A-Za-z0-9&+\-/.]*(?:\s+[A-Za-z0-9&+\-/.]+)*/g;
  const escIso = s => {
    let out = '', pos = 0;
    s.replace(LATIN, (m, i) => { out += esc(s.slice(pos, i)) + `<bdi lang="en">${esc(m)}</bdi>`; pos = i + m.length; return m; });
    return out + esc(s.slice(pos));
  };
  const inline = s => escIso(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=$|[^*\w])/g, '$1<em>$2</em>');
  function md(text) {
    const out = [];
    let list = null;
    const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.t}>`); list = null; } };
    text.split('\n').forEach(raw => {
      const line = raw.trim();
      let m;
      if ((m = line.match(/^[-*•]\s+(.*)$/))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(inline(m[1])); }
      else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(inline(m[1])); }
      else if (!line) flush();
      else { flush(); out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`); }
    });
    flush();
    return out.join('');
  }

  /* ---------- DOM helpers ---------- */
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
  const shortTitle = t => t.replace(/\s*\([^)]*\)\s*$/, '');
  const scrollEnd = () => { log.scrollTop = log.scrollHeight; };

  /* =====================================================================
     Offline answers from the knowledge base (verbatim passages only)
     ===================================================================== */
  const related = (a, b) => a.id === b.id || a.parent === b.id || b.parent === a.id || (a.parent && a.parent === b.parent && a.type === 'kpi' && b.type === 'kpi');

  // Best 1–2 items for a question: [{item, score}]
  function pick(question) {
    const e = engine();
    if (!e) return [];
    const toks = e.prepare(question);
    const ranked = e.rank(toks).map(r => ({ item: r.item, score: r.score * (r.item.text ? 1 : 0.8) }));
    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length || ranked[0].score < 5) return [];
    const out = [ranked[0]];
    for (const r of ranked.slice(1, 6)) {
      if (r.score < ranked[0].score * 0.55) break;
      if (!related(r.item, ranked[0].item)) { out.push(r); break; }
    }
    out.toks = toks;
    return out;
  }

  // Which text lines of an item to quote: everything when short, else the relevant lines
  // (with their parent bullet / children / table header) up to a budget. Lines stay whole.
  function pickLines(item, toks) {
    const e = engine();
    if (!item.text) return [];
    const lines = item.text.split('\n');
    const k = item.k || '';
    const all = lines.map((_, i) => i);
    if (item.text.length <= 760) return all;
    const titleHit = e.scoreText((item.kicker ? item.kicker + ' ' : '') + item.title, toks) >= 0.6;
    const sc = lines.map(l => e.scoreText(l, toks));
    const best = Math.max.apply(null, sc);
    const budget = titleHit ? 1200 : 760;
    const fill = order => {
      const keep = [];
      let used = 0;
      for (const i of order) {
        if (used + lines[i].length > budget && keep.length) continue;
        keep.push(i);
        used += lines[i].length;
      }
      return keep.sort((a, b) => a - b);
    };
    if (titleHit || best === 0) return fill(all);
    const chosen = new Set(all.filter(i => sc[i] > 0 && sc[i] >= best * 0.5));
    [...chosen].forEach(i => {
      if (k[i] === 'c') { let j = i; while (j > 0 && k[j] === 'c') j--; chosen.add(j); }
      if (k[i] === 'i') for (let j = i + 1; j < lines.length && k[j] === 'c'; j++) chosen.add(j);
      if (k[i] === 't') chosen.add(k.indexOf('t'));
    });
    const order = [...chosen].sort((a, b) => (sc[b] - sc[a]) || (a - b));
    return fill(order);
  }

  function localAnswer(question) {
    const picks = pick(question);
    if (!picks.length) return { role: 'model', text: LOCAL_NONE, search: question };
    const local = picks.map(({ item }) => {
      const kids = (!item.text || item.type === 'section') && engine().items.some(x => x.parent === item.id && x.type !== 'kpi');
      return { id: item.id, idx: pickLines(item, picks.toks), kids: kids || undefined };
    });
    // Plain-text version of the same passages (sent as context if the assistant comes back online).
    const parts = [LOCAL_INTRO];
    local.forEach(l => {
      const it = itemById(l.id);
      const lines = it.text ? it.text.split('\n') : [];
      parts.push('', `**${(it.kicker ? it.kicker + ': ' : '') + it.title}**`);
      l.idx.forEach(i => parts.push('- ' + lines[i].split(' | ').join(' — ')));
      if (l.kids) engine().items.filter(x => x.parent === it.id && x.type !== 'kpi').forEach(x => parts.push('- ' + x.title));
    });
    return { role: 'model', text: parts.join('\n'), local };
  }

  function renderLocal(m, el) {
    el.classList.add('local');
    el.appendChild(h('p', 'ans-lead', LOCAL_INTRO));
    const e = engine();
    m.local.forEach(l => {
      const it = itemById(l.id);
      if (!it) return;
      const card = h('div', 'ans');
      card.style.setProperty('--tone', `var(--${it.tone || 'brand'})`);
      const doc = e && e.kb.docs && e.kb.docs[it.doc];
      const parent = it.parent && itemById(it.parent);
      const crumb = [doc ? doc.title : '', it.kicker || (parent ? shortTitle(parent.title) : '')].filter(Boolean).join(' · ');
      if (crumb) card.appendChild(h('p', 'ans-k', crumb));
      card.appendChild(h('p', 'ans-t', it.title));
      const lines = it.text ? it.text.split('\n') : [];
      const k = it.k || '';
      const idx = (Array.isArray(l.idx) ? l.idx : []).filter(i => Number.isInteger(i) && i >= 0 && i < lines.length);
      let ul = null, lastLi = null;
      const endList = () => { ul = null; lastLi = null; };
      idx.forEach((i, n) => {
        const kind = k[i] || 'p', line = lines[i];
        if (n > 0 && idx[n - 1] !== i - 1 && (kind !== 'c' || !lastLi)) { endList(); card.appendChild(h('p', 'ans-gap', '…')); }
        if (kind === 'p') { endList(); card.appendChild(h('p', 'ans-p', line)); }
        else if (kind === 'q') { endList(); card.appendChild(h('blockquote', 'ans-q', line)); }
        else if (kind === 't') {
          if (!ul) { ul = h('ul', 'ans-l ans-rows'); card.appendChild(ul); }
          const cells = line.split(' | ');
          const li = h('li', i === k.indexOf('t') ? 'ans-th' : '');
          li.appendChild(h('b', '', cells[0]));
          cells.slice(1).forEach(c => { li.appendChild(h('span', 'ans-sep', ' — ')); put(li, c); });
          ul.appendChild(li);
        } else if (kind === 'c' && lastLi && idx[n - 1] !== undefined) {
          let sub = lastLi.querySelector('ul');
          if (!sub) { sub = h('ul', 'ans-sub'); lastLi.appendChild(sub); }
          sub.appendChild(h('li', '', line));
        } else {
          if (!ul) { ul = h('ul', 'ans-l'); card.appendChild(ul); }
          lastLi = h('li', '', line);
          ul.appendChild(lastLi);
        }
      });
      if (l.kids && e) {
        const kids = e.items.filter(x => x.parent === it.id && x.type !== 'kpi');
        const nav = h('ul', 'ans-kids');
        kids.forEach(x => {
          const li = h('li');
          const a = h('a', '', shortTitle(x.title));
          a.href = x.url;
          a.style.setProperty('--tone', `var(--${x.tone || 'brand'})`);
          li.appendChild(a);
          nav.appendChild(li);
        });
        card.appendChild(nav);
      }
      const go = h('a', 'src-chip', 'اقرأ في الموقع ←');
      go.href = it.url;
      go.setAttribute('aria-label', `اقرأ «${it.title}» في الموقع`);
      card.appendChild(go);
      el.appendChild(card);
    });
  }

  // Related places on the site for an online (generated) answer.
  function sourcesFor(question) {
    return pick(question).filter(r => r.score >= 8).map(r => r.item.id);
  }
  function renderSources(ids, el) {
    const list = ids.map(itemById).filter(Boolean);
    if (!list.length) return;
    const row = h('div', 'src');
    row.appendChild(h('span', 'src-label', 'اقرأ في الموقع:'));
    list.forEach(it => {
      const a = h('a', 'src-chip', shortTitle(it.title));
      a.href = it.url;
      row.appendChild(a);
    });
    el.appendChild(row);
  }
  function renderSearchHint(q, el) {
    const row = h('div', 'src');
    const b = h('button', 'src-chip', 'ابحث في الموقع');
    b.type = 'button';
    b.addEventListener('click', () => { if (window.YanabeeSearch) window.YanabeeSearch.open(q); });
    row.appendChild(b);
    el.appendChild(row);
  }

  /* ---------- rendering ---------- */
  const bubble = (role, text, cls = '') => {
    const el = document.createElement('div');
    el.className = `msg ${role === 'user' ? 'user' : 'bot'} ${cls}`.trim();
    if (role === 'user') el.textContent = text; else el.innerHTML = md(text);
    log.appendChild(el);
    scrollEnd();
    return el;
  };
  function renderMsg(m) {
    if (m.role === 'user') return bubble('user', m.text);
    if (Array.isArray(m.local) && engine() && m.local.some(l => l && itemById(l.id))) {
      const el = bubble('model', '');
      el.innerHTML = '';
      renderLocal(m, el);
      scrollEnd();
      return el;
    }
    const el = bubble('model', m.text);
    if (Array.isArray(m.src)) renderSources(m.src, el);
    if (typeof m.search === 'string') renderSearchHint(m.search, el);
    scrollEnd();
    return el;
  }
  let noteShown = false;
  const showNote = () => {
    if (noteShown) return;
    noteShown = true;
    const el = bubble('model', OFFLINE_NOTE, 'note');
    el.insertBefore(h('span', 'mode-badge', 'وضع البحث في الوثائق'), el.firstChild);
  };
  const renderSuggestions = () => {
    sug.innerHTML = '';
    if (messages.length) return;
    SUGGESTIONS.forEach(q => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = q;
      b.addEventListener('click', () => ask(q));
      sug.appendChild(b);
    });
  };
  const renderAll = () => {
    log.innerHTML = '';
    noteShown = false;
    bubble('model', WELCOME);
    if (status === 'offline') showNote();
    messages.forEach(renderMsg);
    renderSuggestions();
    if (messages.length) scrollEnd(); else log.scrollTop = 0;
  };
  const syncControls = () => {
    send.disabled = busy;
    log.setAttribute('aria-busy', busy ? 'true' : 'false');
  };
  const goOffline = () => {
    if (status === 'offline') return;
    status = 'offline';
    box.classList.add('offline');
    if (modeEl) modeEl.textContent = MODE_OFFLINE;
    if (opened) showNote();
  };

  /* ---------- health ---------- */
  function checkHealth() {
    if (!health) {
      if (location.protocol === 'file:' || !window.fetch) { goOffline(); health = Promise.resolve(); return health; }
      health = fetch('/api/health', { headers: { accept: 'application/json' } })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
        .then(j => {
          if (j && j.configured) { status = 'ready'; if (modeEl) modeEl.textContent = MODE_ONLINE; }
          else goOffline();
        });
    }
    return health;
  }

  /* ---------- request payload (fits the Worker limits) ---------- */
  const clip = t => (t.length > MAX_CHARS ? Array.from(t).slice(0, MAX_CHARS).join('') : t);
  function payload() {
    const list = messages.slice(-12).map(m => ({ role: m.role, text: clip(m.text) }));
    const size = () => new TextEncoder().encode(JSON.stringify({ site: 'yanabee', messages: list })).length;
    while (list.length > 1 && (size() > MAX_PAYLOAD || list[0].role !== 'user')) list.shift();
    return JSON.stringify({ site: 'yanabee', messages: list });
  }

  /* ---------- answering ---------- */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const typing = el => { el.innerHTML = '<span class="typing" role="status" aria-label="يكتب الآن"><i></i><i></i><i></i></span>'; };

  async function answerLocally(question, el) {
    if (!reduce) await wait(320);
    const m = localAnswer(question);
    messages.push(m);
    const out = renderMsg(m);
    if (el) el.remove();
    // Long quoted answers: show their beginning (the question just above), not their end.
    const q = out.previousElementSibling;
    if (out.offsetHeight > log.clientHeight * 0.6) {
      const anchor = q && q.classList.contains('user') ? q : out;
      log.scrollTop += anchor.getBoundingClientRect().top - log.getBoundingClientRect().top - 12;
    }
    return out;
  }

  async function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    syncControls();
    if (status === null) await checkHealth();

    messages.push({ role: 'user', text: clip(text) });
    save();
    sug.innerHTML = '';
    bubble('user', text);
    input.value = ''; autosize();
    const el = bubble('model', '');
    typing(el);

    if (status === 'offline') {
      await answerLocally(text, el);
      return done();
    }

    let answer = '', errKey = null, frame = 0;
    const paint = () => { frame = 0; el.innerHTML = md(answer); scrollEnd(); };
    const handleEvent = ev => {
      const data = ev.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') return;
      let obj;
      try { obj = JSON.parse(data); } catch (e) { return; }
      if (obj.error) { errKey = 'upstream'; return; }
      const parts = (obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts) || [];
      for (const p of parts) if (p.text && !p.thought) answer += p.text;
      if (answer && !frame) frame = requestAnimationFrame(paint);
    };
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: payload(),
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('text/event-stream')) {
        let j = null;
        try { j = await res.json(); } catch (e) { /* not json */ }
        errKey = (j && j.error) || ([404, 405].includes(res.status) ? 'not_configured' : 'network');
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split(/\r?\n\r?\n/);
          buf = events.pop();
          events.forEach(handleEvent);
        }
        buf += dec.decode();
        if (buf.trim()) handleEvent(buf);
      }
    } catch (e) {
      errKey = errKey || 'network';
    }
    cancelAnimationFrame(frame);
    if (answer) {
      if (errKey) answer += CUT_NOTE;
      paint();
      const m = { role: 'model', text: answer, src: sourcesFor(text) };
      renderSources(m.src, el);
      messages.push(m);
    } else if (errKey === 'not_configured') {
      // No key on the server: switch to document search for good and answer this question from the KB.
      goOffline();
      log.appendChild(el); // keep the typing bubble after the mode note
      await answerLocally(text, el);
    } else {
      // Temporary failure: say so, then still answer from the documents.
      el.classList.add('err');
      el.innerHTML = md((ERRORS[errKey] || ERRORS.upstream) + FALLBACK);
      await answerLocally(text, null);
    }
    done();
  }
  function done() {
    save();
    busy = false;
    syncControls();
    if (!mobileMQ.matches && !box.hidden) input.focus({ preventScroll: true });
  }

  /* ---------- links inside answers ---------- */
  log.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href, location.href);
    const same = url.pathname === location.pathname && url.search === location.search;
    if (!same || !url.hash) return; // another page: normal navigation (the chat history is kept)
    e.preventDefault();
    if (mobileMQ.matches) close(false); // full-screen chat: get out of the way
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (location.hash !== url.hash) location.hash = url.hash;
    else if (target) target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---------- open / close (modal + focus handling) ---------- */
  const outside = () => ['.skip', '.nav', 'main', '.footer', '.tabbar', '.chat-fab', '.totop', '.progress']
    .map(s => document.querySelector(s)).filter(Boolean);
  let opened = false, lastFocus = null;
  const setModal = on => {
    const modal = on && mobileMQ.matches;
    panel.setAttribute('aria-modal', modal ? 'true' : 'false');
    outside().forEach(el => { el.inert = modal; });
  };
  const fitViewport = () => {
    const vv = window.visualViewport;
    if (box.hidden || !vv || !mobileMQ.matches) { box.style.height = ''; box.style.top = ''; return; }
    box.style.top = vv.offsetTop + 'px';
    box.style.height = vv.height + 'px';
    scrollEnd();
  };
  const open = () => {
    if (!box.hidden) return;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add('chat-open');
    setModal(true);
    fitViewport();
    if (!opened) { opened = true; checkHealth(); renderAll(); }
    setTimeout(() => {
      if (mobileMQ.matches) { panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
      else input.focus({ preventScroll: true });
    }, 60);
  };
  const close = (restore = true) => {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('chat-open');
    setModal(false);
    fitViewport();
    if (restore && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
  $('.chat-close', box).addEventListener('click', () => close());
  $('.chat-clear', box).addEventListener('click', () => { if (busy) return; messages = []; save(); renderAll(); syncControls(); input.focus({ preventScroll: true }); });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || box.hidden || e.defaultPrevented) return;
    const search = document.querySelector('.search');
    if (search && !search.hidden) return; // the search overlay is on top and closes first
    close();
  });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitViewport);
    visualViewport.addEventListener('scroll', fitViewport);
  }
  const onMQ = () => { if (!box.hidden) { setModal(true); fitViewport(); } };
  mobileMQ.addEventListener ? mobileMQ.addEventListener('change', onMQ) : mobileMQ.addListener(onMQ);

  /* ---------- input ---------- */
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });

  window.YanabeeChat = {
    open,
    close,
    ask(q) { open(); return ask(q); },
  };
})();
