// "مساعد تكامل الذكي" — chat widget talking to the Worker at /api/chat (Gemini, streamed).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const box = $('.chat');
  if (!box) return;
  const panel = $('.chat-panel', box), log = $('.chat-log', box), form = $('.chat-form', box),
    input = $('textarea', form), send = $('.chat-send', form), sug = $('.chat-suggest', box);
  const mobileMQ = matchMedia('(max-width: 760px)');
  const KEY = 'takamul-chat';
  const MAX_CHARS = 2000;        // per message (the Worker truncates to the same)
  const MAX_PAYLOAD = 24 * 1024; // bytes; the Worker rejects bodies above 32 KB
  const SUGGESTIONS = [
    'ما هي مبادرة «ينابيع»؟',
    'ما هي مبادرة «منافع»؟',
    'كيف أنضم إلى الجمعية؟',
    'ما هي مراحل التوسع الجغرافي؟',
    'ما مصادر تمويل الجمعية؟',
    'ما حقوق العضو وواجباته؟',
  ];
  const WELCOME = 'أهلاً وسهلاً بك في أسرة «تكامل» 🌿\nأنا **مساعد تكامل الذكي**، يسعدني أن أجيبك عن رؤية الجمعية ومبادراتها «ينابيع» و«منافع» وخطة التوسع والعضوية والحوكمة. بماذا أبدأ؟';
  const OFFLINE = 'المساعد الذكي قيد التفعيل حالياً، وسيكون متاحاً قريباً بإذن الله. يمكنك في الأثناء تصفّح **دليل الإجابات** في الموقع.';
  const ERRORS = {
    not_configured: OFFLINE,
    rate_limited: 'وصلتَ إلى الحد المسموح من الأسئلة مؤقتاً. يُرجى الانتظار دقيقة ثم المحاولة مجدداً.',
    upstream: 'تعذّر الحصول على إجابة الآن. يُرجى المحاولة بعد قليل.',
    bad_request: 'لم أتمكن من معالجة الطلب. جرّب «محادثة جديدة» ثم أعد طرح سؤالك.',
    forbidden: 'لا يمكن الاتصال بالمساعد من هذه الصفحة.',
    network: 'تعذّر الاتصال بالمساعد. تحقّق من اتصالك بالإنترنت وحاول مجدداً.',
  };
  const CUT_NOTE = '\n\n_(انقطعت الإجابة قبل اكتمالها، يمكنك إعادة السؤال.)_';

  let messages = [];
  try { messages = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { messages = []; }
  if (!Array.isArray(messages)) messages = [];
  messages = messages.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string');
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-20))); } catch (e) { /* ignore */ } };

  let busy = false;
  let status = null; // null = checking, 'ready', 'offline'
  let health = null;

  /* ---------- tiny, safe markdown (input is escaped first) ---------- */
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = s => esc(s)
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

  /* ---------- rendering ---------- */
  const bubble = (role, text, cls = '') => {
    const el = document.createElement('div');
    el.className = `msg ${role === 'user' ? 'user' : 'bot'} ${cls}`.trim();
    if (role === 'user') el.textContent = text; else el.innerHTML = md(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };
  const renderSuggestions = () => {
    sug.innerHTML = '';
    if (messages.length || status === 'offline') return;
    SUGGESTIONS.forEach(q => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = q;
      b.addEventListener('click', () => ask(q));
      sug.appendChild(b);
    });
  };
  const renderAll = () => {
    log.innerHTML = '';
    bubble('model', WELCOME);
    messages.forEach(m => bubble(m.role, m.text));
    if (status === 'offline') bubble('model', OFFLINE, 'err');
    renderSuggestions();
  };
  const syncControls = () => {
    send.disabled = busy || status === 'offline';
    input.disabled = status === 'offline';
    log.setAttribute('aria-busy', busy ? 'true' : 'false');
  };
  const goOffline = () => {
    if (status === 'offline') return;
    status = 'offline';
    box.classList.add('offline');
    sug.innerHTML = '';
    if (!busy) bubble('model', OFFLINE, 'err');
    syncControls();
  };

  /* ---------- health ---------- */
  function checkHealth() {
    if (!health) {
      health = fetch('/api/health', { headers: { accept: 'application/json' } })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
        .then(j => {
          if (j && j.configured) { status = 'ready'; syncControls(); }
          else goOffline();
        });
    }
    return health;
  }

  /* ---------- request payload (fits the Worker limits) ---------- */
  const clip = t => (t.length > MAX_CHARS ? Array.from(t).slice(0, MAX_CHARS).join('') : t);
  function payload() {
    let list = messages.slice(-12).map(m => ({ role: m.role, text: clip(m.text) }));
    const size = () => new TextEncoder().encode(JSON.stringify({ messages: list })).length;
    while (list.length > 1 && (size() > MAX_PAYLOAD || list[0].role !== 'user')) list.shift();
    return JSON.stringify({ messages: list });
  }

  /* ---------- streaming request ---------- */
  async function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    syncControls();
    if (status === null) await checkHealth();
    if (status === 'offline') { busy = false; syncControls(); return; }

    messages.push({ role: 'user', text: clip(text) });
    save();
    sug.innerHTML = '';
    bubble('user', text);
    input.value = ''; autosize();
    const el = bubble('model', '');
    el.innerHTML = '<span class="typing" role="status" aria-label="يكتب الآن"><i></i><i></i><i></i></span>';

    let answer = '', errKey = null, frame = 0;
    const paint = () => { frame = 0; el.innerHTML = md(answer); log.scrollTop = log.scrollHeight; };
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
          const { value, done } = await reader.read();
          if (done) break;
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
      messages.push({ role: 'model', text: answer });
    } else {
      messages.pop(); // keep history alternating user/model
      el.classList.add('err');
      el.innerHTML = md(ERRORS[errKey] || ERRORS.upstream);
      if (errKey === 'not_configured') { el.remove(); goOffline(); }
    }
    save();
    busy = false;
    syncControls();
    if (status !== 'offline' && !mobileMQ.matches) input.focus({ preventScroll: true });
  }

  /* ---------- open / close (modal + focus handling) ---------- */
  const outside = () => ['.nav', 'main', '.footer', '.tabbar', '.chat-fab', '.totop', '.progress']
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
    log.scrollTop = log.scrollHeight;
  };
  const open = () => {
    if (!box.hidden) return;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add('chat-open');
    setModal(true);
    fitViewport();
    if (!opened) { opened = true; renderAll(); checkHealth(); }
    setTimeout(() => {
      if (mobileMQ.matches) { panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
      else if (!input.disabled) input.focus({ preventScroll: true });
      else $('.chat-close', box).focus({ preventScroll: true });
    }, 60);
  };
  const close = () => {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('chat-open');
    setModal(false);
    fitViewport();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
  $('.chat-close', box).addEventListener('click', close);
  $('.chat-clear', box).addEventListener('click', () => { if (busy) return; messages = []; save(); renderAll(); syncControls(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });
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
})();
