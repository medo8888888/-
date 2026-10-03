// "مساعد تكامل الذكي" — chat widget talking to the Worker at /api/chat (Gemini, streamed).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const box = $('.chat');
  if (!box) return;
  const log = $('.chat-log', box), form = $('.chat-form', box), input = $('textarea', form),
    send = $('.chat-send', form), sug = $('.chat-suggest', box);
  const KEY = 'takamul-chat';
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
    upstream: 'تعذّر الحصول على إجابة الآن. يُرجى المحاولة بعد قليل.',
    bad_request: 'لم أتمكن من فهم الطلب، حاول إعادة صياغة سؤالك.',
    forbidden: 'لا يمكن الاتصال بالمساعد من هذه الصفحة.',
    network: 'تعذّر الاتصال بالمساعد. تحقّق من اتصالك بالإنترنت وحاول مجدداً.',
  };

  let messages = [];
  try { messages = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { messages = []; }
  if (!Array.isArray(messages)) messages = [];
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-20))); } catch (e) { /* ignore */ } };

  let busy = false, status = null; // null | 'ready' | 'offline'

  /* ---------- tiny, safe markdown ---------- */
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
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
    el.className = `msg ${role === 'user' ? 'user' : 'bot'} ${cls}`;
    if (role === 'user') el.textContent = text; else el.innerHTML = md(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };
  const renderAll = () => {
    log.innerHTML = '';
    bubble('model', WELCOME);
    messages.forEach(m => bubble(m.role, m.text));
    if (status === 'offline') bubble('model', OFFLINE, 'err');
    renderSuggestions();
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
  const setBusy = v => { busy = v; send.disabled = v || status === 'offline'; input.disabled = status === 'offline'; };

  /* ---------- health ---------- */
  async function checkHealth() {
    try {
      const r = await fetch('/api/health', { headers: { accept: 'application/json' } });
      const j = r.ok ? await r.json() : null;
      status = j && j.configured ? 'ready' : 'offline';
    } catch (e) { status = 'offline'; }
    box.classList.toggle('offline', status === 'offline');
    setBusy(false);
    renderAll();
  }

  /* ---------- streaming request ---------- */
  async function ask(text) {
    text = text.trim();
    if (!text || busy || status === 'offline') return;
    messages.push({ role: 'user', text });
    save();
    sug.innerHTML = '';
    bubble('user', text);
    input.value = ''; autosize();
    setBusy(true);
    const el = bubble('model', '');
    el.innerHTML = '<span class="typing" aria-label="يكتب الآن"><i></i><i></i><i></i></span>';

    let answer = '', errKey = null, frame = 0;
    const paint = () => { frame = 0; el.innerHTML = md(answer); log.scrollTop = log.scrollHeight; };
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ messages: messages.slice(-12) }),
      });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('text/event-stream')) {
        let j = null;
        try { j = await res.json(); } catch (e) { /* not json */ }
        errKey = (j && j.error) || 'network';
        if (errKey === 'not_configured') { status = 'offline'; box.classList.add('offline'); }
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split(/\r?\n\r?\n/);
          buf = events.pop();
          for (const ev of events) {
            const data = ev.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
            if (!data || data === '[DONE]') continue;
            let obj;
            try { obj = JSON.parse(data); } catch (e) { continue; }
            if (obj.error) { errKey = 'upstream'; continue; }
            const parts = obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts || [];
            for (const p of parts) if (p.text && !p.thought) answer += p.text;
            if (answer && !frame) frame = requestAnimationFrame(paint);
          }
        }
      }
    } catch (e) {
      errKey = errKey || 'network';
    }
    cancelAnimationFrame(frame);
    if (answer) {
      paint();
      messages.push({ role: 'model', text: answer });
      save();
    } else {
      messages.pop(); // drop unanswered question so history stays user/model alternating
      save();
      el.classList.add('err');
      el.innerHTML = md(ERRORS[errKey] || ERRORS.upstream);
    }
    setBusy(false);
    if (status !== 'offline') input.focus({ preventScroll: true });
  }

  /* ---------- open / close ---------- */
  let opened = false;
  const open = () => {
    box.hidden = false;
    document.body.classList.add('chat-open');
    if (!opened) { opened = true; renderAll(); checkHealth(); }
    setTimeout(() => { if (!input.disabled && matchMedia('(min-width: 761px)').matches) input.focus({ preventScroll: true }); }, 120);
  };
  const close = () => { box.hidden = true; document.body.classList.remove('chat-open'); };
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
  $('.chat-close', box).addEventListener('click', close);
  $('.chat-clear', box).addEventListener('click', () => { messages = []; save(); renderAll(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) close(); });

  /* ---------- input ---------- */
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
})();
