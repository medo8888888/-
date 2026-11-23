// «لعبة موسم القائد» (lab.html, #panel-season) — classic script, no dependencies, works from file://.
// Data (scenarios, verbatim document quotes, targets) comes from <script type="application/json" id="season-data">
// written by tools/yanabee/lab_season.py. Progress is kept in localStorage (try/catch). Test hook: window.YanabeeSeason.
(() => {
  'use strict';
  const root = document.getElementById('season');
  const dataEl = document.getElementById('season-data');
  if (!root || !dataEl) return;
  let D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }

  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'yanabee-season-v1';
  const K = D.keys, WEEKS = D.weeks;
  const M = {}; D.meters.forEach(m => { M[m.k] = m; });
  const SC = {}; D.scn.forEach(s => { SC[s.id] = s; });
  const I = n => D.icons[n] || '';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } },
    del() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } },
  };
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
  const pts = n => (n === 1 ? 'نقطة واحدة' : n === 2 ? 'نقطتان' : n >= 3 && n <= 10 ? n + ' نقاط' : n + ' نقطة');
  const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

  // ---------------------------------------------------------------- random order
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, r) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  // 12 of the base scenarios: an easy one first; the ones whose bad outcome chains into a follow-up are placed early enough to unfold.
  function makeSlots(seed) {
    const r = rng(seed), pool = shuffle(D.scn.filter(s => !s.follow), r), sel = pool.slice(0, WEEKS);
    const e = sel.findIndex(s => s.early);
    if (e < 0) { const j = pool.findIndex((s, i) => i >= WEEKS && s.early); if (j >= 0) [sel[0], pool[j]] = [pool[j], sel[0]]; }
    else [sel[0], sel[e]] = [sel[e], sel[0]];
    for (let i = 9; i < WEEKS; i++) {
      if (sel[i].trig) { const k = sel.findIndex((s, j) => j >= 1 && j < 9 && !s.trig); if (k >= 0) [sel[i], sel[k]] = [sel[k], sel[i]]; }
    }
    return sel.map(s => s.id);
  }
  const permFor = (seed, w) => shuffle([0, 1, 2], rng((seed * 31 + w * 7 + 5) >>> 0));

  // ---------------------------------------------------------------- state
  let st = null;
  const fresh = seed => ({
    v: 1, seed, slots: makeSlots(seed), w: 0, phase: 'choose', m: Object.fromEntries(D.meters.map(m => [m.k, m.s])),
    log: [], hints: 0, hinted: {}, unlocked: [], lit: { council: 1, guide: 1 }, pend: '', done: false,
  });
  function valid(s) {
    return s && s.v === 1 && Array.isArray(s.slots) && s.slots.length === WEEKS && s.slots.every(id => SC[id]) &&
      K.every(k => typeof s.m[k] === 'number') && Array.isArray(s.log) && s.w >= 0 && s.w < WEEKS && ['choose', 'feedback', 'unlock', 'report'].includes(s.phase);
  }
  function load() {
    const raw = store.get();
    if (!raw) return null;
    try { const s = JSON.parse(raw); return valid(s) ? s : null; } catch (e) { return null; }
  }
  const save = () => { if (st) store.set(JSON.stringify(st)); };

  // ---------------------------------------------------------------- scoring
  function score(m) {
    const att = D.meters.map(x => Math.min(1, m[x.k] / x.tg));
    const met = D.meters.filter(x => m[x.k] >= x.tg).length;
    const sc = Math.round(100 * att.reduce((a, b) => a + b, 0) / att.length);
    const tier = D.titles.reduce((acc, t, i) => (sc >= t.min ? i : acc), 0);
    let ti = tier;
    if (ti === D.titles.length - 1 && met < 4) ti = D.titles.length - 2;
    const stars = sc >= 88 ? 3 : sc >= 70 ? 2 : sc >= 50 ? 1 : 0;
    return { score: sc, met, title: D.titles[ti], stars };
  }
  const bestCount = () => st.log.filter(l => l.q === 2).length;

  // ---------------------------------------------------------------- meters UI
  const live = msg => { const el = $('#ss-live'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); } };
  const barTargets = k => $$(`[data-m="${k}"]`);
  function countTo(out, to) {
    const from = +out.textContent || 0;
    if (reduced() || from === to) { out.textContent = to; return; }
    const t0 = performance.now(), dur = 800;
    const tick = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); out.textContent = Math.round(from + (to - from) * e); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  function paintMeters(animate, prev) {
    D.meters.forEach(m => {
      const v = st.m[m.k];
      barTargets(m.k).forEach(el => {
        const fill = $('.ss-fill', el), out = $('[data-v]', el), bar = $('.ss-bar', el);
        if (fill) fill.style.width = v + '%';
        if (bar) bar.setAttribute('aria-valuenow', v);
        if (out) { if (animate) countTo(out, v); else out.textContent = v; }
        el.classList.toggle('met', v >= m.tg);
        if (animate && prev && prev[m.k] !== v && bar) {
          const g = document.createElement('i'), a = Math.min(prev[m.k], v), b = Math.max(prev[m.k], v);
          g.className = 'ss-ghost ' + (v > prev[m.k] ? 'gain' : 'loss');
          g.style.insetInlineStart = a + '%'; g.style.width = (b - a) + '%';
          bar.appendChild(g); setTimeout(() => g.remove(), 1600);
        }
      });
    });
    paintFlow();
  }
  function paintFlow() {
    const f = st.m.fin, set = (sel, p) => { const i = $(sel + ' i'); if (i) i.style.width = Math.max(0, Math.min(100, p)) + '%'; };
    set('.ss-flow-bar .s60', f / 60 * 100); set('.ss-flow-bar .s30', (f - 60) / 30 * 100); set('.ss-flow-bar .s10', (f - 90) / 10 * 100);
    const c = $('[data-cov]'); if (c) c.textContent = f;
    const bar = $('.ss-flow-bar'); if (bar) bar.setAttribute('aria-label', `شريط تمويل الموسم بنسب الوثيقة 60% و30% و10%؛ المغطّى ${f}% والهدف 90%`);
  }
  // applies an effect vector; returns the real deltas; shows pops
  function applyFx(fx, quiet) {
    const prev = Object.assign({}, st.m), parts = [];
    K.forEach((k, i) => { st.m[k] = clamp(st.m[k] + (fx[i] || 0)); });
    paintMeters(true, prev);
    K.forEach((k, i) => {
      const d = st.m[k] - prev[k];
      if (!d) return;
      parts.push(`${M[k].l} ${fmt(d)}`);
      barTargets(k).forEach(el => {
        const pop = $('.ss-pop', el); if (!pop) return;
        const p = document.createElement('i'); p.className = d > 0 ? 'up' : 'down'; p.textContent = fmt(d);
        pop.appendChild(p); setTimeout(() => p.remove(), 1600);
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      });
    });
    if (!quiet && parts.length) live(parts.join('، '));
    return prev;
  }

  // ---------------------------------------------------------------- map + tools
  function paintMap(pulse) {
    $$('.ss-map [data-n]').forEach(el => {
      const on = !!st.lit[el.dataset.n];
      const was = el.classList.contains('on');
      el.classList.toggle('on', on);
      if (on && !was && pulse && !reduced()) { el.classList.remove('pulse'); void el.getBoundingClientRect(); el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 2400); }
    });
    $$('.ss-map .me').forEach(e => e.classList.toggle('on', !!(st.lit[e.dataset.a] && st.lit[e.dataset.b])));
    $$('.ss-tool').forEach(t => {
      const on = st.unlocked.includes(t.dataset.tool);
      t.classList.toggle('on', on);
      const u = D.unlocks.find(x => x.id === t.dataset.tool), sm = $('small', t);
      if (sm && u) sm.textContent = on ? 'مفتوحة' : `تُفتح في نهاية الأسبوع ${u.week}`;
    });
  }
  function light(name) {
    if (!name || st.lit[name]) return false;
    st.lit[name] = 1; paintMap(true); return true;
  }

  // ---------------------------------------------------------------- screens
  function show(name) {
    $$('.ss-screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    const nb = $('[data-ss-new]'); if (nb) nb.hidden = name === 'start';
    root.dataset.phase = name;
  }
  function paintWeeks() {
    const ol = $('[data-weeks]');
    if (!ol.children.length) for (let i = 0; i < WEEKS; i++) { const li = document.createElement('li'); li.setAttribute('aria-hidden', 'true'); ol.appendChild(li); }
    [...ol.children].forEach((li, i) => {
      const l = st.log[i];
      li.className = (l ? 'q' + l.q : '') + (i === st.w && st.phase !== 'report' ? ' cur' : '') + (D.unlocks.some(u => u.week === i + 1) ? ' u' : '');
    });
    const wk = $('[data-wk]'); if (wk) wk.textContent = `الأسبوع ${Math.min(st.w + 1, WEEKS)} من ${WEEKS}`;
  }

  // ---------------------------------------------------------------- scenario card
  const cur = () => SC[st.slots[st.w]];
  function renderCard(enter) {
    show('play'); paintWeeks();
    const s = cur(), perm = permFor(st.seed, st.w), card = $('#ss-card'), fb = $('#ss-fb');
    const answered = st.log.length > st.w ? st.log[st.w] : null;
    card.dataset.scn = s.id; card.dataset.week = st.w + 1;
    card.setAttribute('aria-label', `الأسبوع ${st.w + 1}: ${s.title}`);
    const choices = perm.map((ci, pos) => {
      const c = s.ch[ci];
      return `<li style="--i:${pos}"><button type="button" class="ss-choice" data-ci="${ci}" data-pos="${pos + 1}" aria-keyshortcuts="${pos + 1}"><span class="ss-k" aria-hidden="true">${pos + 1}</span><span class="ss-ct">${c.l}</span></button></li>`;
    }).join('');
    card.innerHTML = `
      <div class="ss-scene" data-mood="${s.mood}">${s.svg}
        <div class="ss-sc-top"><span class="ss-wk-tag">الأسبوع ${st.w + 1} من ${WEEKS}</span><span class="ss-tag" style="--tc:var(--${s.c})">${s.tag}</span>${s.follow ? '<span class="ss-follow">أثر قرار سابق</span>' : ''}</div>
        <div class="ss-who"><b>${s.who.n}</b><small>${s.who.r} · شخصية تجريبية</small></div>
      </div>
      <div class="ss-body">
        <h3 id="ss-title" tabindex="-1">${s.title}</h3>
        <div class="ss-bubble"><p>${s.text}</p></div>
        <ul class="ss-ch" role="list" aria-label="القرارات الممكنة">${choices}</ul>
        <div class="ss-row">
          <button type="button" class="ss-hint" data-hint>${I('lightbulb')}<span>تلميح</span><small>(يكلّف ${D.hintCost} من ثقة الأسر)</small></button>
          <span class="ss-keys">اختر بالضغط على <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span>
          <div class="ss-hint-out" data-hint-out hidden></div>
        </div>
        <p class="ss-exp-note"><span class="ss-exp">سيناريو تجريبي</span> الشخصيات والمواقف والآثار من تصميمنا، أما القاعدة والاقتباس فمن الوثيقة.</p>
      </div>`;
    if (enter && !reduced()) { card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter'); }
    fb.hidden = true; fb.innerHTML = '';
    if (st.hinted[s.id]) showHint(s, true);
    if (answered) { markPicked(answered); renderFeedback(answered, true); }
  }
  function showHint(s, silent) {
    const out = $('[data-hint-out]'), b = $('[data-hint]');
    if (!out) return;
    out.hidden = false;
    out.innerHTML = `${I('lightbulb')} ${s.hint.h}. <a href="${s.hint.u}" target="_blank" rel="noopener">افتح القسم في الوثيقة</a>`;
    if (b) b.disabled = true;
  }
  function useHint() {
    if (st.phase !== 'choose') return;
    const s = cur();
    if (st.hinted[s.id]) return;
    st.hinted[s.id] = 1; st.hints++;
    const fx = [0, 0, -D.hintCost, 0, 0];
    applyFx(fx, true);
    showHint(s);
    live(`تلميح: ${s.hint.h.replace(/<[^>]+>/g, '')}. ثقة الأسر ${fmt(-D.hintCost)}`);
    save();
  }
  function markPicked(l) {
    const list = $('.ss-ch'); if (!list) return;
    list.classList.add('done');
    const s = SC[l.id], bestIdx = s.ch.findIndex(c => c.q === 2);
    $$('.ss-choice', list).forEach(b => {
      b.disabled = true;
      const ci = +b.dataset.ci;
      if (ci === l.ci) {
        b.classList.add('picked', 'q' + l.q);
        b.insertAdjacentHTML('beforeend', `<span class="ss-badge2">${l.q === 2 ? I('check') + 'قرارك · يوافق الوثيقة' : l.q === 1 ? 'قرارك · مقبول بكلفة' : I('x') + 'قرارك · مكلف'}</span>`);
      } else if (ci === bestIdx && l.q !== 2) {
        b.classList.add('best');
        b.insertAdjacentHTML('beforeend', `<span class="ss-badge2">${I('check')}الأقرب للوثيقة</span>`);
      }
    });
    const hb = $('[data-hint]'); if (hb) hb.disabled = true;
  }
  function choose(ci) {
    if (st.phase !== 'choose') return false;
    const s = cur(), c = s.ch[ci];
    if (!c) return false;
    const l = { id: s.id, ci, q: c.q, fx: c.fx.slice(), wk: st.w + 1, hint: !!st.hinted[s.id] };
    st.log[st.w] = l; st.phase = 'feedback';
    const before = Object.assign({}, st.m);
    applyFx(c.fx, true);
    l.real = K.map(k => st.m[k] - before[k]);
    if (c.lights) light(c.lights);
    if (c.follow) {                       // a bad decision comes back two weeks later
      let slot = st.w + 2;
      while (slot < WEEKS && SC[st.slots[slot]].follow) slot++;
      if (slot < WEEKS) st.slots[slot] = c.follow;
    }
    save();
    markPicked(l);
    renderFeedback(l, false);
    paintWeeks();
    return true;
  }
  const verdict = q => q === 2 ? ['v2', 'check', 'قرار موفّق', 'يطابق ما تقوله الوثيقة']
    : q === 1 ? ['v1', 'alert', 'قرار مقبول بكلفة', 'يحلّ جزءاً من المشكلة ويترك جزءاً'] : ['v0', 'x', 'قرار مكلف', 'يخالف ما تقوله الوثيقة'];
  function renderFeedback(l, restored) {
    const s = SC[l.id], c = s.ch[l.ci], v = verdict(l.q), fb = $('#ss-fb');
    const real = l.real || l.fx;
    const chips = K.map((k, i) => ({ k, d: real[i] })).filter(x => x.d).map((x, i) =>
      `<li class="${x.d > 0 ? 'up' : 'down'}" style="--mc:var(--${M[x.k].col});--i:${i}">${M[x.k].l} <b>${fmt(x.d)}</b></li>`).join('');
    const best = s.ch.find(x => x.q === 2);
    const docs = s.docs.map(d => `<blockquote class="ss-doc"><span class="ss-doc-k">${I('quote')}الوثيقة تقول <em>· من الوثيقة</em></span><p>${d.h}</p><footer><span>${d.s}</span><a href="${d.u}" target="_blank" rel="noopener">اقرأ في الوثيقة ←</a></footer></blockquote>`).join('');
    const lastWeek = st.w >= WEEKS - 1, due = D.unlocks.find(u => u.week === st.w + 1 && !st.unlocked.includes(u.id));
    const nextLabel = lastWeek ? 'اعرض تقرير الموسم' : due ? 'تابع · أداة جديدة تنتظرك' : `الأسبوع ${st.w + 2}`;
    fb.hidden = false;
    fb.innerHTML = `<div class="ss-fb-in ${v[0]}">
      <div class="ss-verdict"><span class="ss-vi">${I(v[1])}</span><b>${v[2]}</b><span>${v[3]}</span></div>
      <div class="ss-say"><span class="ss-av" aria-hidden="true">${s.who.n.replace(/^(أ\.|م\.)\s*/, '').charAt(0)}</span><p><b>${s.who.n}:</b> ${c.say}</p></div>
      ${chips ? `<ul class="ss-fx" aria-label="أثر القرار على المؤشرات">${chips}</ul>` : ''}
      ${l.q !== 2 ? `<p class="ss-best"><b>الخيار الأقرب للوثيقة:</b> ${best.l}</p>` : ''}
      ${c.follow ? '<p class="ss-warn"><b>تنبيه:</b> قرارات كهذه قد يعود أثرها عليك بعد أسبوعين.</p>' : ''}
      <div class="ss-docs">${docs}</div>
      <div class="ss-fb-act"><button type="button" class="btn btn-primary ss-next" data-next>${I('arrow-left')}<span>${nextLabel}</span><kbd>Enter</kbd></button></div>
    </div>`;
    if (!restored) {
      live(`${v[2]}. ${K.map((k, i) => real[i] ? `${M[k].l} ${fmt(real[i])}` : '').filter(Boolean).join('، ')}`);
      const nb = $('[data-next]', fb);
      if (nb) { nb.focus({ preventScroll: true }); setTimeout(() => nb.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }), 80); }
    }
  }

  // ---------------------------------------------------------------- flow
  function next() {
    if (st.phase !== 'feedback') return;
    const u = D.unlocks.find(x => x.week === st.w + 1 && !st.unlocked.includes(x.id));
    if (u) openUnlock(u); else step();
  }
  function step() {
    if (st.w >= WEEKS - 1) { st.phase = 'report'; st.done = true; save(); renderReport(true); return; }
    st.w++; st.phase = 'choose'; save();
    renderCard(true);
    const h = $('#ss-title');
    if (h) { h.focus({ preventScroll: true }); $('#ss-card').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); }
  }
  function openUnlock(u, restored) {
    const ov = $('.ss-unlock');
    if (!restored) {
      st.unlocked.push(u.id); st.phase = 'unlock'; st.pend = u.id;
      applyFx(u.fx, true); light(u.lights);
      save();
    }
    const chips = K.map((k, i) => ({ k, d: u.fx[i] })).filter(x => x.d).map((x, i) => `<li class="up" style="--mc:var(--${M[x.k].col});--i:${i}">${M[x.k].l} <b>${fmt(x.d)}</b></li>`).join('');
    ov.hidden = false;
    ov.innerHTML = `<div class="ss-ul-card" role="dialog" aria-modal="true" aria-labelledby="ss-ul-h"><div class="ss-ul-rays" aria-hidden="true"></div>
      <div class="ss-ul-in"><span class="ss-ul-k">${u.id === 'impact' ? 'بطاقة التقييم جاهزة' : 'أداة جديدة في المنظومة'}</span>
        <div class="ss-ul-ic" aria-hidden="true"><span class="ss-ul-ring"></span><span class="ss-ul-ring"></span>${u.icon}</div>
        <h3 id="ss-ul-h">${u.name}</h3><p class="sub">${u.sub}</p>
        ${chips ? `<ul class="ss-fx" aria-label="ما تضيفه الأداة">${chips}</ul>` : ''}
        <blockquote class="ss-doc"><span class="ss-doc-k">${I('quote')}الوثيقة تقول <em>· من الوثيقة</em></span><p>${u.doc.h}</p><footer><span>${u.doc.s}</span><a href="${u.doc.u}" target="_blank" rel="noopener">اقرأ في الوثيقة ←</a></footer></blockquote>
        <button type="button" class="btn btn-primary" data-unlock-go><span>${u.id === 'impact' ? 'اعرض تقرير الموسم' : 'متابعة الموسم'}</span><kbd class="sr-only">Enter</kbd></button>
      </div></div>`;
    live(`فُتحت أداة جديدة: ${u.name.replace(/<[^>]+>/g, '')}`);
    const go = $('[data-unlock-go]', ov); if (go) go.focus({ preventScroll: true });
    const fun = window.YanabeeFun;
    if (fun && fun.confetti && !restored) { const b = ov.getBoundingClientRect(); fun.confetti(b.width / 2, b.height * 0.35, false); }
  }
  function closeUnlock() {
    if (st.phase !== 'unlock') return;
    const ov = $('.ss-unlock'); ov.hidden = true; ov.innerHTML = '';
    st.pend = '';
    step();
  }

  // ---------------------------------------------------------------- report
  function renderReport(first) {
    show('report'); paintWeeks();
    const r = score(st.m), rep = $('.ss-report'), best = bestCount();
    const stars = [0, 1, 2].map(i => `<svg class="ss-star ${i < r.stars ? 'on' : ''}" style="--i:${i}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.2l-5.8 3.1 1.1-6.5L2.6 9.2l6.5-.9z"/></svg>`).join('');
    const rows = D.meters.map(m => {
      const v = st.m[m.k], ok = v >= m.tg;
      return `<li class="ss-cmp-r" data-m="${m.k}" style="--mc:var(--${m.col})"><div class="ss-cmp-h"><span class="ss-m-ic" aria-hidden="true">${I(m.i)}</span><b>${m.l}</b>
        <span class="res ${ok ? 'ok' : 'no'}">${ok ? I('check').replace('class="i"', 'class="i" width="18" height="18"') + 'بلغتَ الهدف' : `ينقصك ${pts(m.tg - v)}`} · <bdi dir="ltr">${v}%</bdi> من <bdi dir="ltr">${m.tg}%</bdi></span></div>
        <div class="ss-bar" role="img" aria-label="${m.l}: ${v}% والهدف ${m.tg}%"><i class="ss-fill" style="width:${v}%"></i><span class="ss-tick" style="inset-inline-start:${m.tg}%"><em>${m.tg}%</em></span></div>
        <p class="ss-kline">${m.kh} <a class="ss-kpi" href="${m.ku}" target="_blank" rel="noopener">KPI ${m.n}</a></p></li>`;
    }).join('');
    const missed = st.log.filter(l => l.q < 2).map(l => SC[l.id]);
    const tl = st.log.map((l, i) => {
      const s = SC[l.id], c = s.ch[l.ci];
      const docs = s.docs.map(d => `<blockquote class="ss-doc"><span class="ss-doc-k">${I('quote')}الوثيقة تقول</span><p>${d.h}</p><footer><span>${d.s}</span><a href="${d.u}" target="_blank" rel="noopener">اقرأ في الوثيقة ←</a></footer></blockquote>`).join('');
      return `<li class="q${l.q}"><span class="ss-tl-d">${l.wk}</span><div class="ss-tl-b"><b>${s.title}</b>
        <p class="pick">قرارك: ${c.l}</p>${l.q !== 2 ? `<p>الأقرب للوثيقة: ${s.ch.find(x => x.q === 2).l}</p>` : ''}
        <details><summary>ما تقوله الوثيقة</summary>${docs}</details></div></li>`;
    }).join('');
    rep.innerHTML = `<div class="ss-rep">
      <div class="ss-rep-hero">
        <div class="ss-stars" role="img" aria-label="${r.stars} من 3 نجوم">${stars}</div>
        <p class="ss-rep-k">لقبك في هذا الموسم · تجريبي</p>
        <h3 class="ss-rep-title" data-title>${r.title.t}</h3>
        <p class="ss-rep-d">${r.title.d}</p>
        <div class="ss-rep-stats">
          <div class="ss-stat"><b>${r.score}%</b><span>اقتراب من الأهداف</span></div>
          <div class="ss-stat"><b>${best} / ${WEEKS}</b><span>قرارات تتبع الوثيقة</span></div>
          <div class="ss-stat"><b>${r.met} / 5</b><span>أهداف بلغتها</span></div>
          <div class="ss-stat"><b>${st.hints}</b><span>تلميحات</span></div>
        </div>
      </div>
      <section class="ss-sect" aria-labelledby="ss-cmp-h"><h4 id="ss-cmp-h">مؤشراتك مقابل أهداف الوثيقة</h4>
        <p class="lead">الأهداف أرقام الوثيقة نفسها (من مبادرة «حفظ، فهم، تطبيق»)، ومؤشراتك داخل اللعبة تجريبية.</p>
        <ul class="ss-cmp">${rows}</ul></section>
      <section class="ss-sect ss-share" aria-labelledby="ss-share-h">
        <canvas id="ss-canvas" width="1080" height="1350" role="img" aria-label="بطاقة نتيجتك: ${r.title.t}"></canvas>
        <div class="ss-share-t"><h4 id="ss-share-h">بطاقة نتيجتك</h4><p>تحمل لقبك وإحصاءات موسمك فقط، بلا أي بيانات شخصية. نزّلها وشاركها.</p>
          <div class="btns"><button type="button" class="btn btn-primary" data-dl>${I('image')}<span>تنزيل البطاقة (PNG)</span></button></div></div>
      </section>
      <section class="ss-sect" aria-labelledby="ss-miss-h"><h4 id="ss-miss-h">قواعد تستحق المراجعة</h4>
        ${missed.length ? `<p class="lead">قرارات هذا الموسم التي ابتعدت فيها عن نصّ الوثيقة، وفي كل بطاقة رابط إلى مكانها.</p><ul class="chips">${missed.map(m => `<li><a class="chip" href="${m.docs[0].u}" target="_blank" rel="noopener">${m.title}</a></li>`).join('')}</ul>` : '<p class="lead">لم تبتعد عن أي قاعدة ظهرت لك هذا الموسم. أحسنت.</p>'}</section>
      <section class="ss-sect" aria-labelledby="ss-tl-h"><h4 id="ss-tl-h">رحلة قراراتك</h4><p class="lead">كل أسبوع وما تقوله الوثيقة عنه.</p><ol class="ss-tl">${tl}</ol></section>
      <div class="btns ss-rep-b"><button type="button" class="btn btn-primary" data-replay>${I('repeat')}<span>العب موسماً جديداً بترتيب مختلف</span></button>
        <a class="btn btn-ghost" href="operations.html#s5">${I('file-text')}<span>اقرأ الحوكمة في الوثيقة</span></a></div>
    </div>`;
    drawCard();
    if (first) {
      live(`انتهى الموسم. لقبك: ${r.title.t}. ${r.stars} من 3 نجوم`);
      const fun = window.YanabeeFun;
      if (r.stars >= 2 && fun && fun.confetti) { const b = rep.getBoundingClientRect(); setTimeout(() => fun.confetti(innerWidth / 2, Math.max(120, Math.min(innerHeight * 0.4, b.top + 160)), r.stars === 3), 350); }
      rep.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    }
  }

  // ---------------------------------------------------------------- share card (canvas → PNG, no personal data)
  function drawCard() {
    const cv = $('#ss-canvas'); if (!cv || !cv.getContext) return null;
    const c = cv.getContext('2d'), W = 1080, H = 1350, r = score(st.m);
    const FH = '"Readex Pro","IBM Plex Sans Arabic",Tahoma,system-ui,sans-serif';
    c.direction = 'rtl'; c.textBaseline = 'alphabetic';
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#06302f'); g.addColorStop(0.55, '#0b2e4d'); g.addColorStop(1, '#14305f');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // soft shapes
    [[160, 120, 260, 'rgba(62,224,209,.13)'], [940, 330, 300, 'rgba(126,167,255,.11)'], [200, 1230, 320, 'rgba(244,162,92,.1)']].forEach(([x, y, rad, col]) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); });
    const txt = (s, x, y, size, col, weight, align) => { c.font = `${weight || 600} ${size}px ${FH}`; c.fillStyle = col; c.textAlign = align || 'right'; c.fillText(s, x, y); };
    // drop logo
    c.save(); c.translate(972, 112); c.scale(1.9, 1.9); c.beginPath(); c.moveTo(0, -30); c.bezierCurveTo(0, -30, -30, 0, -30, 18); c.arc(0, 18, 30, Math.PI, 0, true); c.bezierCurveTo(30, 0, 0, -30, 0, -30); c.closePath();
    const lg = c.createLinearGradient(-30, -30, 30, 48); lg.addColorStop(0, '#2fd3c6'); lg.addColorStop(1, '#2c63d6'); c.fillStyle = lg; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-18, 18); c.quadraticCurveTo(-9, 8, 0, 18); c.quadraticCurveTo(9, 28, 18, 18); c.stroke(); c.restore();
    txt('مشروع «ينابيع» · مختبر ينابيع', 890, 108, 34, '#bfe7e4', 600);
    txt('لعبة تجريبية', 890, 152, 28, '#f4a25c', 600);
    txt('موسم القائد', 1000, 300, 112, '#ffffff', 700);
    // stars
    for (let i = 0; i < 3; i++) {
      const cx = 540 + (1 - i) * 130, cy = 420, on = i < r.stars; c.save(); c.translate(cx, cy); c.scale(5, 5); c.beginPath();
      for (let k = 0; k < 10; k++) { const ang = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? 4.6 : 11; c.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); }
      c.closePath(); c.fillStyle = on ? '#f4b527' : 'rgba(255,255,255,.14)'; c.fill(); c.lineWidth = 0.5; c.strokeStyle = on ? '#ffe08a' : 'rgba(255,255,255,.25)'; c.stroke(); c.restore();
    }
    c.textAlign = 'center'; txt(r.title.t, 540, 560, 88, '#7ff0e2', 700, 'center');
    txt(`اقتراب من أهداف الوثيقة \u200E${r.score}%\u200E`, 540, 626, 38, '#e2f1f0', 500, 'center');
    // meters vs targets
    const top = 700, rowH = 108;
    D.meters.forEach((m, i) => {
      const y = top + i * rowH, v = st.m[m.k], bx = 90, bw = 900, by = y + 34;
      txt(m.l, 990, y + 10, 36, '#ffffff', 600);
      txt(`\u200E${v}%\u200E  ·  الهدف \u200E${m.tg}%\u200E`, 90, y + 10, 30, v >= m.tg ? '#8be8a6' : '#ffd29a', 600, 'left');
      c.fillStyle = 'rgba(255,255,255,.14)'; roundRect(c, bx, by, bw, 26, 13); c.fill();
      const col = { sky: '#6fa2ff', leaf: '#6fd08f', t7: '#f388b2', sun: '#f4a25c', t6: '#cb9cf3' }[m.col] || '#7ff0e2';
      c.fillStyle = col; const w = Math.max(10, bw * v / 100); roundRect(c, bx + bw - w, by, w, 26, 13); c.fill();   // RTL: grows from the right
      const tx = bx + bw - bw * m.tg / 100; c.fillStyle = '#ffffff'; c.fillRect(tx - 2, by - 8, 4, 42);
    });
    const fy = top + 5 * rowH + 20;
    txt(`قرارات تتبع الوثيقة: \u200E${bestCount()}\u200E من \u200E${WEEKS}\u200E   ·   أدوات مفتوحة: \u200E${st.unlocked.length}\u200E من \u200E4\u200E   ·   تلميحات: \u200E${st.hints}\u200E`, 540, fy, 31, '#e2f1f0', 500, 'center');
    txt('نتيجة تجريبية من لعبة محاكاة · الأهداف من وثيقة المشروع · لا بيانات شخصية', 540, 1306, 25, '#9fbcc0', 500, 'center');
    return cv;
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function cardURL() { const cv = drawCard(); try { return cv ? cv.toDataURL('image/png') : ''; } catch (e) { return ''; } }
  function download() {
    const url = cardURL(); if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = 'yanabee-season-card.png'; document.body.appendChild(a); a.click(); a.remove();
    live('تم تجهيز بطاقة النتيجة للتنزيل');
  }

  // ---------------------------------------------------------------- start / restart
  function begin(seed) {
    st = fresh(seed);
    save(); paintMeters(false); paintMap(false); renderCard(true);
    const h = $('#ss-title'); if (h) h.focus({ preventScroll: true });
    root.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
  }
  const newSeed = () => (Math.floor(Math.random() * 1e9) + 1) >>> 0;
  function resume() {
    paintMeters(false); paintMap(false);
    if (st.phase === 'report') { renderReport(false); return; }
    renderCard(false);
    if (st.phase === 'unlock') { const u = D.unlocks.find(x => x.id === st.pend); if (u) openUnlock(u, true); else { st.phase = 'feedback'; } }
  }
  function toStart() {
    st = null; store.del();
    st = { v: 1, seed: 1, slots: [], w: 0, phase: 'start', m: Object.fromEntries(D.meters.map(m => [m.k, m.s])), log: [], hints: 0, hinted: {}, unlocked: [], lit: { council: 1, guide: 1 }, pend: '', done: false };
    paintMeters(false); paintMap(false); show('start');
  }

  // ---------------------------------------------------------------- events
  let confirmT = 0;
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !root.contains(b)) return;
    if (b.matches('.ss-choice')) { choose(+b.dataset.ci); return; }
    if (b.matches('[data-hint]')) { useHint(); return; }
    if (b.matches('[data-next]')) { next(); return; }
    if (b.matches('[data-unlock-go]')) { closeUnlock(); return; }
    if (b.matches('[data-ss-start]')) { begin(newSeed()); return; }
    if (b.matches('[data-replay]')) { begin(((st ? st.seed : 1) * 7919 + 1013) % 1000000007 + 1 || newSeed()); return; }
    if (b.matches('[data-dl]')) { download(); return; }
    if (b.matches('[data-ss-new]')) {
      if (st && st.phase !== 'report' && !b.classList.contains('confirm')) {
        b.classList.add('confirm'); const sp = $('span', b); sp.textContent = 'اضغط مرة أخرى لتأكيد البدء من جديد';
        clearTimeout(confirmT); confirmT = setTimeout(() => { b.classList.remove('confirm'); sp.textContent = 'ابدأ موسماً جديداً'; }, 4000);
        return;
      }
      clearTimeout(confirmT); b.classList.remove('confirm'); $('span', b).textContent = 'ابدأ موسماً جديداً';
      begin(newSeed());
    }
  });
  const panel = root.closest('[role="tabpanel"]');
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (panel && panel.hidden) return;
    if (!st) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const digits = { '1': 0, '2': 1, '3': 2, '١': 0, '٢': 1, '٣': 2 };
    if (st.phase === 'choose' && e.key in digits && !$('.ss-unlock:not([hidden])')) {
      const pos = digits[e.key], btn = $(`.ss-choice[data-pos="${pos + 1}"]`);
      if (btn) { e.preventDefault(); choose(+btn.dataset.ci); }
      return;
    }
    if (e.key === 'Enter') {
      if (e.target.closest && e.target.closest('a,button,summary')) return;   // let the focused control act
      if (st.phase === 'feedback') { e.preventDefault(); next(); }
      else if (st.phase === 'unlock') { e.preventDefault(); closeUnlock(); }
    }
  });

  // ---------------------------------------------------------------- boot
  const ph = $('[data-stage]'); if (ph && D.phase) ph.innerHTML = D.phase.h;
  const pa = $('[data-stage-a]'); if (pa && D.phase) { pa.href = D.phase.u; pa.target = '_blank'; pa.rel = 'noopener'; }
  const saved = load();
  if (saved) { st = saved; resume(); } else toStart();
  const nb = $('[data-ss-new]'); if (nb) nb.hidden = !saved;

  window.YanabeeSeason = {
    version: 1,
    seed(n) { begin((n >>> 0) || 1); return st.slots.slice(); },
    state: () => JSON.parse(JSON.stringify(st)),
    reset: toStart,
    card: cardURL,
    score: () => score(st.m),
    data: () => D,
  };
})();
