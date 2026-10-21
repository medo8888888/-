// learn.html — «تعلّم والعب»: daily card, explorer passport, memory match, quiz, flashcards, "which team".
// Classic script (no modules, no fetch) so it works from file://. Data: window.YANABEE_QUIZ / YANABEE_LEARN
// (generated from the content files by tools/yanabee/quizdata.py). All state is optional (localStorage in try/catch).
(() => {
  'use strict';
  const Q = window.YANABEE_QUIZ, L = window.YANABEE_LEARN;
  if (!Q || !L || !document.querySelector('.ln-main')) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fun = () => window.YanabeeFun || null;
  const TEAMS = L.teams, TEAM = Object.fromEntries(TEAMS.map(x => [x.id, x]));

  /* ---------------- helpers ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  const mulberry = a => () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let rnd = Math.random;                       // YanabeeLearn.seed(n) swaps in a deterministic generator
  const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LATIN = /[A-Za-z][A-Za-z0-9&+\-/.]*(?:\s+[A-Za-z0-9&+\-/.]+)*/g;
  // content text -> safe HTML (same rules as core.t(): curly «…» quotes, Latin runs isolated)
  const rich = s => {
    s = String(s).replace(/"([^"\n]+)"/g, '«$1»');
    let out = '', pos = 0, m;
    LATIN.lastIndex = 0;
    while ((m = LATIN.exec(s))) { out += esc(s.slice(pos, m.index)) + '<bdi lang="en">' + esc(m[0]) + '</bdi>'; pos = m.index + m[0].length; }
    return out + esc(s.slice(pos));
  };
  const plain = s => String(s).replace(/"([^"\n]+)"/g, '«$1»');
  const IC = {
    check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    drop: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    flip: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  };
  const ico = (name, cls = 'i', fill = false) => `<svg class="${cls}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name]}</svg>`;
  const svgPaths = (paths, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  const confetti = (el, big) => {
    const f = fun();
    if (!f || !f.confetti) return;
    if (el) { const r = el.getBoundingClientRect(); f.confetti(r.left + r.width / 2, r.top + Math.min(r.height / 2, 220), big); } else f.confetti();
  };
  const snd = type => window.dispatchEvent(new CustomEvent('yanabee:sound', { detail: { type } }));
  const bump = (el, cls = 'pop') => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* ---------------- daily card ---------------- */
  (() => {
    const root = $('#daily');
    if (!root) return;
    const pool = L.daily, d = new Date();
    const dayNo = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
    let idx = ((dayNo * 7 + 3) % pool.length + pool.length) % pool.length;
    const k = $('[data-daily-k]', root), who = $('[data-daily-who]', root), x = $('[data-daily-x]', root), a = $('[data-daily-link]', root);
    const body = $('.ln-daily-body', root);
    try { $('[data-daily-date]', root).textContent = d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { /* ignore */ }
    const show = (animate) => {
      const c = pool[idx];
      k.innerHTML = rich(c.k);
      who.innerHTML = c.who ? rich(c.who) : '';
      who.hidden = !c.who;
      x.innerHTML = rich(c.x);
      a.href = c.h;
      root.style.setProperty('--tc', c.c ? `var(--${c.c})` : 'var(--brand)');
      if (animate) bump(body, 'swap');
    };
    show(false);
    $('[data-daily-next]', root).addEventListener('click', () => { idx = (idx + 1) % pool.length; show(true); });
  })();

  /* ---------------- passport ---------------- */
  (() => {
    const stamps = $$('.ln-stamp');
    if (!stamps.length) return;
    const ring = $('[data-pp-ring]'), n = $('[data-pp-n]'), done = $('[data-pp-done]');
    const get = () => { const f = fun(); if (f && f.passport) return f.passport.get(); const v = store.get('yanabee-passport', []); return Array.isArray(v) ? v : []; };
    let prev = null;
    const render = () => {
      const have = get().filter(id => TEAM[id]);
      stamps.forEach(s => {
        const on = have.includes(s.dataset.team);
        const was = s.classList.contains('on');
        s.classList.toggle('on', on);
        $('[data-state]', s).textContent = on ? 'جُمع الينبوع' : 'لم يُجمع بعد';
        s.setAttribute('aria-label', `${TEAM[s.dataset.team].short}: ${on ? 'جُمع الينبوع' : 'لم يُجمع بعد'}`);
        if (on && !was && prev !== null) bump(s, 'stamp-pop');
      });
      ring.style.setProperty('--v', (have.length / 7) * 100);
      ring.setAttribute('aria-label', `جمعت ${have.length} من 7 ينابيع`);
      n.textContent = have.length;
      done.hidden = have.length < 7;
      prev = have.length;
    };
    render();
    window.addEventListener('yanabee:passport', render);
    window.addEventListener('storage', e => { if (e.key === 'yanabee-passport') render(); });
    $('[data-pp-reset]').addEventListener('click', () => {
      const f = fun();
      if (f && f.passport) f.passport.reset(); else store.set('yanabee-passport', []);
      render();
    });
  })();

  /* ---------------- memory match ---------------- */
  const match = (() => {
    const root = $('#match');
    if (!root) return null;
    const board = $('[data-m-board]', root), live = $('[data-m-live]', root), win = $('[data-m-win]', root);
    const movesEl = $('[data-m-moves]', root), timeEl = $('[data-m-time]', root), bestEl = $('[data-m-best]', root);
    const levelBtns = $$('[data-m-level] button', root);
    let n = +store.get('yanabee-match-level', 5) || 5;
    let open = [], matched = 0, moves = 0, t0 = 0, tick = 0, locked = false, elapsed = 0;
    const bests = () => store.get('yanabee-match-best', {}) || {};
    const showBest = () => { const b = bests()[n]; bestEl.textContent = b ? `${b.moves} حركة · ${mmss(b.time)}` : '—'; };
    const announce = s => { live.textContent = ''; setTimeout(() => { live.textContent = s; }, 30); };
    const label = (c, faceUp) => {
      const nm = TEAM[c.dataset.pair].short;
      if (!faceUp) return `بطاقة مقلوبة رقم ${c.dataset.i}`;
      return c.dataset.kind === 'icon' ? `أيقونة ${nm}` : nm;
    };
    function start(count) {
      if (count) n = count;
      store.set('yanabee-match-level', n);
      levelBtns.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.n === n)));
      clearInterval(tick); tick = 0; t0 = 0; elapsed = 0; open = []; matched = 0; moves = 0; locked = false;
      movesEl.textContent = '0'; timeEl.textContent = '0:00'; win.hidden = true; showBest();
      const chosen = shuffle(TEAMS).slice(0, n);
      const cards = shuffle(chosen.flatMap(c => [{ c, kind: 'icon' }, { c, kind: 'title' }]));
      board.dataset.n = n;
      board.innerHTML = cards.map((x, i) => {
        const face = x.kind === 'icon'
          ? `<span class="mc-ico" style="--tc:var(--${x.c.id})">${svgPaths(x.c.icon, 'i')}</span>`
          : `<span class="mc-txt">${rich(x.c.short)}</span>`;
        return `<button type="button" class="mc" data-pair="${x.c.id}" data-kind="${x.kind}" data-i="${i + 1}" style="--tc:var(--${x.c.id})" tabindex="${i ? -1 : 0}" aria-label="بطاقة مقلوبة رقم ${i + 1}">`
          + `<span class="mc-in"><span class="mc-back" aria-hidden="true">${ico('drop', 'i', true)}</span><span class="mc-face" aria-hidden="true">${face}</span></span></button>`;
      }).join('');
      announce(`لعبة جديدة: ${n} أزواج`);
    }
    function flip(c, up) {
      c.classList.toggle('up', up);
      c.setAttribute('aria-label', label(c, up || c.classList.contains('done')));
    }
    function pick(c) {
      if (locked || c.classList.contains('up') || c.classList.contains('done')) return;
      if (!t0) { t0 = Date.now(); tick = setInterval(() => { elapsed = (Date.now() - t0) / 1000; timeEl.textContent = mmss(elapsed); }, 250); }
      flip(c, true); open.push(c);
      if (open.length < 2) return;
      moves++; movesEl.textContent = moves;
      const [a, b] = open; open = [];
      if (a.dataset.pair === b.dataset.pair) {
        locked = true;
        setTimeout(() => {
          [a, b].forEach(x => { x.classList.add('done'); x.setAttribute('aria-disabled', 'true'); x.setAttribute('aria-label', label(x, true)); bump(x, 'cheer'); });
          matched++; locked = false; snd('good');
          announce(`تطابق! ${TEAM[a.dataset.pair].short}`);
          if (matched === n) finish();
        }, reduced() ? 60 : 420);
      } else {
        locked = true;
        announce('ليس زوجاً، حاول مرة أخرى');
        [a, b].forEach(x => bump(x, 'shake'));
        setTimeout(() => { flip(a, false); flip(b, false); locked = false; }, reduced() ? 350 : 950);
      }
    }
    function finish() {
      clearInterval(tick); tick = 0;
      elapsed = t0 ? (Date.now() - t0) / 1000 : 0;
      const time = Math.round(elapsed);
      timeEl.textContent = mmss(time);
      const all = bests(), old = all[n];
      const better = !old || moves < old.moves || (moves === old.moves && time < old.time);
      if (better) { all[n] = { moves, time }; store.set('yanabee-match-best', all); }
      showBest();
      $('[data-m-win-text]', root).textContent = `أنهيت اللعبة في ${moves} حركة وخلال ${mmss(time)}.` + (better ? ' رقم قياسي جديد!' : '');
      win.hidden = false;
      bump(win, 'win-in');
      announce(`أحسنت! أنهيت اللعبة في ${moves} حركة`);
      confetti(board, true);
      setTimeout(() => { const b = $('[data-m-again]', root); b && b.focus({ preventScroll: true }); }, 300);
    }
    board.addEventListener('click', e => { const c = e.target.closest('.mc'); if (c) { rove(c); pick(c); } });
    const rove = c => { $$('.mc', board).forEach(x => { x.tabIndex = x === c ? 0 : -1; }); };
    board.addEventListener('keydown', e => {
      const c = e.target.closest('.mc');
      if (!c) return;
      const all = $$('.mc', board), i = all.indexOf(c);
      const top0 = all[0].offsetTop;
      const cols = Math.max(1, all.filter(x => x.offsetTop === top0).length);
      let j = null;
      if (e.key === 'ArrowLeft') j = i + 1;           // RTL: forward is left
      else if (e.key === 'ArrowRight') j = i - 1;
      else if (e.key === 'ArrowDown') j = i + cols;
      else if (e.key === 'ArrowUp') j = i - cols;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = all.length - 1;
      if (j === null || j < 0 || j >= all.length) return;
      e.preventDefault(); rove(all[j]); all[j].focus();
    });
    levelBtns.forEach(b => b.addEventListener('click', () => start(+b.dataset.n)));
    $('[data-m-new]', root).addEventListener('click', () => start());
    $('[data-m-again]', root).addEventListener('click', () => { start(); const f = $('.mc', board); f && f.focus({ preventScroll: true }); });
    start();
    return { restart: start };
  })();

  /* ---------------- quiz ---------------- */
  const quiz = (() => {
    const root = $('[data-quiz]');
    if (!root) return null;
    const startEl = $('[data-q-start]', root), playEl = $('[data-q-play]', root), endEl = $('[data-q-end]', root);
    const timerBox = $('[data-q-timer]', root), bestEl = $('[data-q-best]', root);
    const ROUND = Q.rounds || 8, SECS = 20;
    const PRAISE = ['أحسنت!', 'ممتاز!', 'رائع!', 'إجابة صحيحة!', 'موفّق!'];
    const wasTimer = store.get('yanabee-quiz-timer', null);
    timerBox.checked = wasTimer === null ? !reduced() : !!wasTimer;
    timerBox.addEventListener('change', () => store.set('yanabee-quiz-timer', timerBox.checked));
    let S = null;

    const showBest = () => {
      const b = store.get('yanabee-quiz-best', null);
      bestEl.hidden = !b;
      if (b) bestEl.textContent = `أفضل جولة: ${b.points} نقطة (${b.correct} من ${ROUND})`;
    };
    showBest();

    function pickRound() {
      const pool = shuffle(Q.questions), cnt = {}, out = [];
      pool.forEach(q => { if (out.length < ROUND && (cnt[q.t] || 0) < 2) { out.push(q); cnt[q.t] = (cnt[q.t] || 0) + 1; } });
      pool.forEach(q => { if (out.length < ROUND && !out.includes(q)) out.push(q); });
      return shuffle(out);
    }
    function start() {
      S = { qs: pickRound(), i: 0, points: 0, correct: 0, streak: 0, best: 0, log: [], timer: timerBox.checked, left: SECS, tid: 0, locked: false, cur: null };
      startEl.hidden = true; endEl.hidden = true; playEl.hidden = false;
      playEl.innerHTML = `
        <div class="ln-q-top">
          <div class="ln-q-prog" role="progressbar" aria-label="تقدّم الجولة" aria-valuemin="0" aria-valuemax="${ROUND}" aria-valuenow="0"><i></i></div>
          <div class="ln-q-meta">
            <span class="ln-q-num">السؤال <b data-n>1</b> من ${ROUND}</span>
            <span class="ln-q-streak" data-streak aria-label="الإجابات المتتالية">${ico('flame', 'i', true)}<b>0</b></span>
            <span class="ln-q-pts">${ico('star', 'i', true)}<b data-pts>0</b><span> نقطة</span></span>
            <span class="ln-q-clock" data-clock ${S.timer ? '' : 'hidden'}><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.9155"/><circle class="fg" cx="18" cy="18" r="15.9155" pathLength="100" stroke-dasharray="100 100"/></svg><b data-sec>${SECS}</b></span>
          </div>
        </div>
        <div class="ln-q-body" data-body></div>`;
      render();
    }
    function build(q) {
      const wrong = shuffle(q.d).slice(0, 3);
      return shuffle([{ o: q.a, ok: true }, ...wrong.map(o => ({ o, ok: false }))]);
    }
    function optHtml(x, i) {
      const k = x.o.k;
      const mark = k && TEAM[k] ? ` style="--tc:var(--${k})" data-k="${k}"` : '';
      const ic = k && TEAM[k] ? `<span class="ln-opt-ic" aria-hidden="true">${svgPaths(TEAM[k].icon)}</span>` : '';
      return `<li><button type="button" class="ln-opt" data-i="${i}"${mark}><span class="ln-opt-n" aria-hidden="true">${i + 1}</span>${ic}<span class="ln-opt-t">${rich(x.o.t)}</span><span class="ln-opt-m" aria-hidden="true"></span></button></li>`;
    }
    function render() {
      const q = S.qs[S.i];
      S.cur = { q, opts: build(q) };
      S.locked = false;
      const body = $('[data-body]', playEl);
      body.innerHTML = `
        <div class="ln-q-card" data-qid="${q.id}" data-type="${q.t}">
          <p class="ln-q-lead" id="q-lead" tabindex="-1">${rich(q.lead)}</p>
          <blockquote class="ln-q-quote${q.t === 'c' && q.quote.length < 6 ? ' big' : ''}">${rich(q.quote)}</blockquote>
          <ul class="ln-q-opts${S.cur.opts.some(x => x.o.t.length > 46) ? ' long' : ''}" role="group" aria-labelledby="q-lead">${S.cur.opts.map(optHtml).join('')}</ul>
          <div class="ln-q-fb" data-fb hidden aria-live="polite"></div>
        </div>`;
      bump(body, 'q-in');
      $('[data-n]', playEl).textContent = S.i + 1;
      $('.ln-q-prog', playEl).setAttribute('aria-valuenow', S.i);
      $('.ln-q-prog i', playEl).style.width = (S.i / ROUND * 100) + '%';
      $$('.ln-opt', body).forEach(b => b.addEventListener('click', () => answer(+b.dataset.i)));
      const lead = $('#q-lead', body);
      lead && lead.focus({ preventScroll: true });
      if (S.timer) runTimer();
    }
    function runTimer() {
      clearInterval(S.tid);
      const t0 = Date.now(), fg = $('.fg', playEl), sec = $('[data-sec]', playEl), box = $('[data-clock]', playEl);
      S.left = SECS; box.classList.remove('low');
      S.tid = setInterval(() => {
        const left = Math.max(0, SECS - (Date.now() - t0) / 1000);
        S.left = left;
        fg.setAttribute('stroke-dasharray', (left / SECS * 100).toFixed(1) + ' 100');
        sec.textContent = Math.ceil(left);
        box.classList.toggle('low', left <= 5);
        if (left <= 0) { clearInterval(S.tid); answer(-1); }
      }, 100);
    }
    function answer(i) {
      if (S.locked) return;
      S.locked = true; clearInterval(S.tid);
      const { q, opts } = S.cur;
      const ok = i >= 0 && opts[i].ok;
      snd(ok ? 'good' : 'bad');
      let gain = 0;
      if (ok) {
        S.streak++; S.best = Math.max(S.best, S.streak); S.correct++;
        gain = 100 + (S.timer ? Math.round(S.left / SECS * 50) : 0) + Math.min(S.streak - 1, 5) * 10;
        S.points += gain;
      } else S.streak = 0;
      S.log.push({ q, ok, chosen: i >= 0 ? opts[i].o.t : null });
      const btns = $$('.ln-opt', playEl);
      btns.forEach((b, j) => {
        b.setAttribute('aria-disabled', 'true'); b.tabIndex = -1;
        const m = $('.ln-opt-m', b);
        if (opts[j].ok) { b.classList.add('ok'); m.innerHTML = ico('check'); } else if (j === i) { b.classList.add('bad'); m.innerHTML = ico('x'); bump(b, 'shake'); }
        else b.classList.add('dim');
      });
      const streakEl = $('[data-streak]', playEl);
      $('b', streakEl).textContent = S.streak;
      streakEl.classList.toggle('on', S.streak >= 2);
      if (ok) bump(streakEl, 'pop');
      $('[data-pts]', playEl).textContent = S.points;
      bump($('.ln-q-pts', playEl), 'pop');
      $('.ln-q-prog i', playEl).style.width = ((S.i + 1) / ROUND * 100) + '%';
      const last = S.i === ROUND - 1;
      const title = ok ? PRAISE[S.i % PRAISE.length] : (i < 0 ? 'انتهى الوقت' : 'ليست الإجابة الصحيحة');
      const fb = $('[data-fb]', playEl);
      fb.className = 'ln-q-fb ' + (ok ? 'ok' : 'bad');
      fb.innerHTML = `
        <p class="ln-fb-t"><span class="ln-fb-ic" aria-hidden="true">${ico(ok ? 'check' : 'x')}</span><b>${title}</b>${ok ? `<span class="ln-fb-pts">+${gain} نقطة</span>` : ''}</p>
        ${ok ? '' : `<p class="ln-fb-a"><span>الإجابة الصحيحة:</span> ${rich(q.a.t)}</p>`}
        <figure class="ln-src"><figcaption>المصدر</figcaption><blockquote>${rich(q.s)}</blockquote>
          <a class="ln-src-a" data-src href="${esc(q.h)}">${ico('book')}<span>اقرأ المصدر</span></a></figure>
        <button type="button" class="btn btn-primary" data-next>${last ? 'اعرض النتيجة' : 'السؤال التالي'}</button>`;
      fb.hidden = false;
      bump(fb, 'fb-in');
      const nx = $('[data-next]', fb);
      nx.addEventListener('click', () => { if (last) end(); else { S.i++; render(); } });
      setTimeout(() => nx.focus({ preventScroll: false }), 60);
    }
    function end() {
      clearInterval(S.tid);
      playEl.hidden = true; endEl.hidden = false;
      const stars = S.correct >= 7 ? 3 : S.correct >= 5 ? 2 : 1;
      const wrong = S.log.filter(x => !x.ok);
      const msg = S.correct >= 7 ? 'أداء رائع!' : S.correct >= 5 ? 'أحسنت، أنت في الطريق' : 'بداية جيدة، جرّب مرة أخرى';
      const prev = store.get('yanabee-quiz-best', null);
      if (!prev || S.points > prev.points) store.set('yanabee-quiz-best', { points: S.points, correct: S.correct });
      endEl.innerHTML = `
        <div class="ln-end-top">
          <div class="ln-stars" role="img" aria-label="${stars} من 3 نجوم">${[1, 2, 3].map(n => `<span class="${n <= stars ? 'on' : ''}" style="--d:${n * 0.18}s">${ico('star', 'i', true)}</span>`).join('')}</div>
          <h3>${msg}</h3>
          <p class="ln-end-score"><b data-score>${S.correct}</b> من ${ROUND}</p>
          <ul class="ln-stats">
            <li>${ico('star')}<span>النقاط</span><b>${S.points}</b></li>
            <li>${ico('flame')}<span>أطول سلسلة</span><b>${S.best}</b></li>
          </ul>
          <div class="btns center"><button type="button" class="btn btn-primary" data-again>${ico('rotate')}<span>جولة جديدة</span></button></div>
        </div>
        <div class="ln-review">
          <h4>${wrong.length ? 'راجع إجاباتك الخاطئة' : 'لا أخطاء في هذه الجولة!'}</h4>
          ${wrong.map(w => `
            <article class="ln-rev">
              <p class="ln-rev-q">${rich(w.q.lead)}</p>
              <blockquote class="ln-q-quote">${rich(w.q.quote)}</blockquote>
              <p class="ln-rev-a"><span>الصحيحة:</span> ${rich(w.q.a.t)}</p>
              <p class="ln-rev-w"><span>${w.chosen ? 'إجابتك:' : 'لم تُجب'}</span> ${w.chosen ? rich(w.chosen) : ''}</p>
              <p class="ln-rev-s">${rich(w.q.s)}</p>
              <a class="ln-src-a" href="${esc(w.q.h)}">${ico('book')}<span>اقرأ المصدر</span></a>
            </article>`).join('')}
        </div>`;
      $('[data-again]', endEl).addEventListener('click', start);
      $('.ln-stars', endEl).classList.add('go');
      if (S.correct >= 6) confetti($('.ln-stars', endEl), true);
      showBest();
      const h = $('h3', endEl); h.tabIndex = -1; h.focus({ preventScroll: false });
    }
    $('[data-q-go]', root).addEventListener('click', start);
    document.addEventListener('keydown', e => {
      if (!S || playEl.hidden || e.ctrlKey || e.metaKey || e.altKey || S.locked) return;
      if (/^[1-4]$/.test(e.key) && !/INPUT|TEXTAREA/.test((e.target.tagName || ''))) {
        const b = $$('.ln-opt', playEl)[+e.key - 1];
        if (b) b.click();
      }
    });
    return { start, state: () => S };
  })();

  /* ---------------- flashcards ---------------- */
  (() => {
    const root = $('[data-fc]');
    if (!root) return;
    const stage = $('[data-fc-stage]', root), actions = $('[data-fc-actions]', root), bar = $('[data-fc-bar]', root);
    const count = $('[data-fc-count]', root), deckBtns = $$('[data-fc-decks] button', root), prog = $('.ln-fc-prog', root);
    let deck = 'kpi', queue = [], known = 0, total = 0, flipped = false, swallow = false;
    const live = document.createElement('p');
    live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); root.appendChild(live);

    function load(key, keepOrder) {
      deck = key;
      deckBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.deck === key)));
      const cards = L.decks[key];
      queue = keepOrder ? cards.slice() : shuffle(cards);
      known = 0; total = cards.length; draw(0);
    }
    function faceBack(c) {
      if (deck === 'axes') {
        return '<ul class="fc-list">' + c.back.map(u => `<li>${u.map((l, i) => i ? `<span class="fc-sub">${rich(l)}</span>` : `<span>${rich(l)}</span>`).join('')}</li>`).join('') + '</ul>'
          + (c.more ? '<p class="fc-more">… وبقية بنود المحور في المصدر</p>' : '');
      }
      return `<p class="fc-txt">${rich(c.back[0])}</p>`;
    }
    function draw(dir) {
      flipped = false;
      const done = !queue.length;
      prog.setAttribute('aria-valuenow', Math.round(known / total * 100));
      bar.style.width = (known / total * 100) + '%';
      count.textContent = done ? '' : `عرفت ${known} من ${total} · المتبقي ${queue.length}`;
      actions.hidden = done;
      if (done) {
        stage.innerHTML = `<div class="fc-done"><span class="fc-done-ic" aria-hidden="true">${ico('star', 'i', true)}</span><h3>أتممت المجموعة!</h3><p>عرفت ${known} من ${total}.</p><button type="button" class="btn btn-primary" data-fc-restart>${ico('rotate')}<span>أعد المجموعة</span></button></div>`;
        $('[data-fc-restart]', stage).addEventListener('click', () => load(deck));
        confetti(stage, true);
        live.textContent = 'أتممت المجموعة!';
        return;
      }
      const c = queue[0];
      const tc = c.c ? `--tc:var(--${c.c})` : '';
      stage.innerHTML = `
        <div class="fc-wrap${dir ? ' enter' + (dir > 0 ? '-next' : '-prev') : ''}">
          <div class="fc-card" role="button" tabindex="0" aria-pressed="false" aria-label="بطاقة: ${esc(plain(c.front))}. اضغط لقلبها" style="${tc}">
            <div class="fc-in">
              <div class="fc-front"><span class="fc-ic" aria-hidden="true">${svgPaths(c.ic)}</span>
                ${c.tag ? `<span class="fc-tag">${rich(c.tag)}</span>` : ''}
                <h3 class="fc-t">${rich(c.front)}</h3>
                <span class="fc-hint" aria-hidden="true">${ico('flip')}اضغط للقلب</span></div>
              <div class="fc-back" aria-hidden="true">${faceBack(c)}</div>
            </div>
          </div>
        </div>
        <a class="ln-src-a fc-src" href="${esc(c.h)}">${ico('book')}<span>اقرأ المصدر</span></a>`;
      const card = $('.fc-card', stage);
      card.addEventListener('click', () => { if (swallow) { swallow = false; return; } flip(); });
    }
    function flip() {
      const card = $('.fc-card', stage);
      if (!card) return;
      flipped = !flipped;
      card.classList.toggle('flipped', flipped);
      card.setAttribute('aria-pressed', String(flipped));
      $('.fc-back', card).setAttribute('aria-hidden', String(!flipped));
      $('.fc-front', card).setAttribute('aria-hidden', String(flipped));
      const c = queue[0];
      live.textContent = flipped ? (c.back.flat().join('. ')) : c.front;
    }
    const know = () => { if (!queue.length) return; queue.shift(); known++; draw(1); };
    const later = () => { if (!queue.length) return; const c = queue.shift(); queue.splice(Math.min(3, queue.length), 0, c); draw(1); };
    const step = dir => { if (queue.length < 2) return; if (dir > 0) queue.push(queue.shift()); else queue.unshift(queue.pop()); draw(dir); };
    $('[data-fc-know]', root).addEventListener('click', know);
    $('[data-fc-later]', root).addEventListener('click', later);
    $('[data-fc-shuffle]', root).addEventListener('click', () => { queue = shuffle(queue); draw(1); });
    deckBtns.forEach(b => b.addEventListener('click', () => load(b.dataset.deck)));
    stage.addEventListener('keydown', e => {
      if (!e.target.classList.contains('fc-card')) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); focusCard(); }   // RTL: forward is left
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(-1); focusCard(); }
    });
    const focusCard = () => { const c = $('.fc-card', stage); c && c.focus({ preventScroll: true }); };
    // swipe (touch / pen / mouse drag): left = next, right = previous
    let sx = null, sy = 0, dx = 0, drag = false;
    stage.addEventListener('pointerdown', e => {
      if (!e.target.closest('.fc-wrap') || e.button > 0) return;
      sx = e.clientX; sy = e.clientY; dx = 0; drag = false;
    });
    stage.addEventListener('pointermove', e => {
      if (sx === null) return;
      dx = e.clientX - sx;
      if (!drag && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(e.clientY - sy)) { drag = true; try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      const w = $('.fc-wrap', stage);
      if (drag && w) { w.style.transition = 'none'; w.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`; }
    });
    const endDrag = () => {
      if (sx === null) return;
      const w = $('.fc-wrap', stage);
      if (drag) {
        swallow = true; setTimeout(() => { swallow = false; }, 60);
        if (Math.abs(dx) > 70 && queue.length > 1) step(dx < 0 ? 1 : -1);
        else if (w) { w.style.transition = ''; w.style.transform = ''; }
      }
      sx = null; drag = false;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    load('kpi');
  })();

  /* ---------------- which team grabs you ---------------- */
  (() => {
    const root = $('[data-pick]');
    if (!root) return;
    const btns = $$('.ln-pk', root), count = $('[data-pk-count]', root), show = $('[data-pk-show]', root), res = $('[data-pk-res]', root);
    let sel = [];
    const MAX = 3;
    function paint() {
      btns.forEach(b => {
        const i = sel.indexOf(b.dataset.team);
        b.setAttribute('aria-pressed', String(i >= 0));
        b.classList.toggle('on', i >= 0);
        $('.ln-pk-n', b).textContent = i >= 0 ? i + 1 : '';
      });
      count.textContent = sel.length ? `اخترت ${sel.length} من ${MAX}` : `اختر حتى ${MAX} عبارات تشدّك`;
      show.disabled = !sel.length;
      if (!res.hidden) result(false);
    }
    function result(scroll) {
      if (!sel.length) { res.hidden = true; return; }
      res.innerHTML = '<h3 class="ln-pk-h">فرقك الأقرب إليك</h3><div class="ln-pk-cards">' + sel.map(id => {
        const x = TEAM[id];
        return `<article class="ln-pk-card card" style="--tc:var(--${id})" data-team="${id}">
          <header><span class="ln-pk-ic" aria-hidden="true">${svgPaths(x.icon)}</span><h4>${rich(x.short)}</h4></header>
          <ul>${x.imp.map(m => `<li><b>${rich(m.l)}</b><span>${rich(m.b)}</span></li>`).join('')}</ul>
          <a class="btn btn-soft" href="${esc(x.href)}">${svgPaths('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>')}<span>تعرّف على الفريق</span></a>
        </article>`;
      }).join('') + '</div>';
      res.hidden = false;
      if (scroll) {
        bump(res, 'fb-in');
        res.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
        confetti($('.ln-pk-h', res));
      }
    }
    btns.forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.team, i = sel.indexOf(id);
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < MAX) { sel.push(id); bump(b, 'pop'); }
      else { bump(b, 'shake'); count.textContent = `اخترت ${MAX} بالفعل؛ ألغِ واحدة لتختار غيرها`; return; }
      paint();
    }));
    show.addEventListener('click', () => result(true));
    $('[data-pk-reset]', root).addEventListener('click', () => { sel = []; res.hidden = true; paint(); });
    paint();
  })();

  /* ---------------- section strip: keep the current chip in view (phones) ---------------- */
  (() => {
    const nav = $('.ln-nav'), inner = nav && $('.ln-nav-in', nav);
    if (!inner || !('MutationObserver' in window)) return;
    new MutationObserver(() => {
      const cur = $('a.current', inner);
      if (!cur || inner.scrollWidth <= inner.clientWidth) return;
      const target = cur.offsetLeft - (inner.clientWidth - cur.offsetWidth) / 2;
      inner.scrollTo({ left: target, behavior: reduced() ? 'auto' : 'smooth' });
    }).observe(inner, { attributes: true, subtree: true, attributeFilter: ['class'] });
  })();

  /* ---------------- public hook (also used by the tests) ---------------- */
  window.YanabeeLearn = {
    seed(n) { rnd = mulberry(n >>> 0); },
    quiz, match,
  };
})();
