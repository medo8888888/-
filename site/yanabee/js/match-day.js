// match-day: «أدوات يوم المباراة» on competition.html (#match-day): match clock, offences and cards with sanction
// timers, knockout shootout, printable match sheet. Rules and numbers come from #md-data (built from
// content/yanabee/competition.txt by tools/yanabee/feat_match_day.py). The tool never turns an «إنذار» or a «طرد»
// into a card, never changes a score by itself and never decides for the referee or the committee.
// Data stays in this browser: localStorage 'yanabee-match-day-v1' (this match) and 'yanabee-match-day-results-v1'
// (saved results). Timers use wall-clock timestamps (Date.now()). Classic script (IIFE), works from file://.
(() => {
  const box = document.getElementById('match-day');
  if (!box) return;
  let D;
  try { D = JSON.parse(document.getElementById('md-data').textContent); } catch (e) { return; }
  box.hidden = false;

  const N = D.n, L = D.line, MIN = 60000;
  const KEY = 'yanabee-match-day-v1', RES = 'yanabee-match-day-results-v1';
  const $ = s => box.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = (cls, text, label) => {
    const b = el('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');
  // Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits -> 0-9
  const digits = s => String(s).replace(/[٠-٩]/g, c => c.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 0x6F0);
  const hhmm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
  const todayAt = (hm, base) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
    if (!m) return null;
    const d = base ? new Date(base) : new Date(Date.now());
    d.setHours(+m[1], +m[2], 0, 0);
    return d.getTime();
  };
  const isoDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dayLabel = ms => {
    try { return new Date(ms).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return isoDay(ms); }
  };

  /* ---------------- state + storage ---------------- */
  const blank = () => ({
    v: 1, kick: '', format: 'groups', tone: false,
    clock: { mode: null, delay: 0, phase: null, pStart: 0, acc: 0, paused: null, pauseAll: 0, endAt: 0, started: 0, ended: 0, warn: false },
    teams: [{ name: 'الفريق أ', players: [], goals: [0, 0] }, { name: 'الفريق ب', players: [], goals: [0, 0] }],
    log: [], chips: [],
    pens: { k: [[0, 0, 0], [0, 0, 0]], sd: [] },
    sheet: { date: '', ref: '', safe: '', end: '', checks: [false, false, false, false], ticks: {} },
  });
  // a stored match, field by field: anything malformed falls back to the blank value (a bad entry must never stop the kit)
  const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const str = (x, d) => (typeof x === 'string' ? x : d);
  const nat = x => (Number.isInteger(x) && x >= 0 ? x : 0);
  const finite = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
  function sane(d) {
    const B = blank();
    if (!d || d.v !== 1 || !Array.isArray(d.teams) || d.teams.length !== 2) return B;
    const c = obj(d.clock), BC = B.clock;
    Object.keys(BC).forEach(k => {
      if (k === 'mode') BC.mode = c.mode === 'late' || c.mode === 'ontime' ? c.mode : null;
      else if (k === 'phase') BC.phase = ['h1', 'brk', 'h2', 'p1', 'p2', 'end'].includes(c.phase) ? c.phase : null;
      else if (k === 'paused') BC.paused = finite(c.paused, null) || null;
      else if (k === 'warn') BC.warn = c.warn === true;
      else BC[k] = finite(c[k], 0);
    });
    if (BC.phase && !BC.mode) BC.phase = null;
    BC.beeped = str(c.beeped, '');
    B.kick = /^\d{2}:\d{2}$/.test(d.kick) ? d.kick : '';
    B.format = d.format === 'ko' ? 'ko' : 'groups';
    B.tone = d.tone === true;
    B.teams = d.teams.map((t, i) => {
      t = obj(t);
      const g = Array.isArray(t.goals) ? t.goals : [];
      return {
        name: str(t.name, '').trim().slice(0, 40) || B.teams[i].name,
        players: (Array.isArray(t.players) ? t.players : []).map(obj).filter(p => typeof p.id === 'string' && /^[0-9]{1,3}$/.test(p.num))
          .slice(0, N.max).map(p => ({ id: p.id, num: p.num, name: str(p.name, '').slice(0, 40) })),
        goals: [nat(g[0]), nat(g[1])],
      };
    });
    B.log = (Array.isArray(d.log) ? d.log : []).map(obj).filter(e => (e.team === 0 || e.team === 1) && typeof e.a === 'string')
      .map(e => Object.assign({}, e, { at: finite(e.at, 0), b: str(e.b, ''), clk: str(e.clk, ''), h: Array.isArray(e.h) ? e.h : null, choice: str(e.choice, '') }));
    B.chips = (Array.isArray(d.chips) ? d.chips : []).map(obj).filter(ch => typeof ch.id === 'string' && (ch.team === 0 || ch.team === 1) && finite(ch.dur, 0) > 0 && finite(ch.start, 0) > 0)
      .map(ch => ({ id: ch.id, label: str(ch.label, ''), dur: ch.dur, start: ch.start, acc: finite(ch.acc, 0), paused: finite(ch.paused, null) || null, team: ch.team, pid: str(ch.pid, null), done: ch.done === true }));
    const P = obj(d.pens), kick = v => (v === 1 || v === 2 ? v : 0);
    if (Array.isArray(P.k) && P.k.length === 2) B.pens.k = [0, 1].map(i => [0, 1, 2].map(j => kick(Array.isArray(P.k[i]) ? P.k[i][j] : 0)));
    if (Array.isArray(P.sd)) B.pens.sd = P.sd.filter(Array.isArray).map(r => [kick(r[0]), kick(r[1])]);
    const sh = obj(d.sheet);
    ['date', 'ref', 'safe', 'end'].forEach(k => { B.sheet[k] = str(sh[k], '').slice(0, 60); });
    if (Array.isArray(sh.checks)) B.sheet.checks = [0, 1, 2, 3].map(k => sh.checks[k] === true);
    Object.keys(obj(sh.ticks)).forEach(k => { if (/^[01]-\d{1,2}-[abc]$/.test(k)) B.sheet.ticks[k] = sh.ticks[k] === true; });
    return B;
  }
  let S = blank();
  let canStore = true;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { canStore = false; }
  if (raw) { try { S = sane(JSON.parse(raw)); } catch (e) { S = blank(); } }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { canStore = false; } };
  const okRes = r => r && typeof r === 'object' && typeof r.a === 'string' && typeof r.b === 'string';
  const readResults = () => { try { const a = JSON.parse(localStorage.getItem(RES) || '[]'); return Array.isArray(a) ? a.filter(okRes) : []; } catch (e) { return []; } };
  const writeResults = a => { try { localStorage.setItem(RES, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const ask = q => { try { return window.confirm(q); } catch (e) { return true; } };

  /* ---------------- tone (off by default) + wake lock ---------------- */
  let ac = null;
  const beep = () => {
    if (!S.tone) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime;
      o.type = 'sine'; o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + 0.65);
    } catch (e) { /* no audio */ }
  };
  let lock = null;
  const running = () => S.clock.phase && S.clock.phase !== 'end';
  const wake = async () => {
    try {
      if (running() && !lock && navigator.wakeLock && document.visibilityState === 'visible') {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } else if (!running() && lock) { await lock.release(); lock = null; }
    } catch (e) { lock = null; }
  };
  document.addEventListener('visibilitychange', wake);

  /* ---------------- clock ---------------- */
  const PH = {
    h1: { t: 'الشوط الأول', dur: N.half, next: 'نهاية الشوط الأول' },
    brk: { t: 'الاستراحة', dur: N.brk, next: 'ابدأ الشوط الثاني' },
    h2: { t: 'الشوط الثاني', dur: N.half, next: 'نهاية المباراة' },
    p1: { t: 'الشوط الأول', dur: 0, next: 'نهاية الشوط الأول' },
    p2: { t: 'الشوط الثاني', dur: 0, next: 'نهاية المباراة' },
    end: { t: 'انتهت المباراة', dur: 0, next: '' },
  };
  const C = () => S.clock;
  const now = () => Date.now();
  const pausedNow = () => (C().paused ? now() - C().paused : 0);
  const elapsed = () => (C().paused || now()) - C().pStart - C().acc;
  // remaining ms of what the big digits show, and the fraction left (for the ring)
  function face() {
    const c = C();
    if (!c.phase) return { rem: N.half * MIN, frac: 1 };
    if (c.phase === 'end') return { rem: 0, frac: 0 };
    if (c.mode === 'late' && c.phase !== 'brk') {
      const rem = c.endAt + c.pauseAll + pausedNow() - now();
      const full = (N.total + N.brk) * MIN;
      return { rem: Math.max(0, rem), frac: Math.max(0, Math.min(1, rem / full)) };
    }
    const dur = PH[c.phase].dur * MIN;
    const rem = dur - elapsed();
    return { rem: Math.max(0, rem), frac: Math.max(0, Math.min(1, rem / dur)) };
  }
  const toEnd = () => C().endAt + C().pauseAll + pausedNow() - now();
  const clockLabel = () => {
    const c = C();
    if (!c.phase || c.phase === 'end') return '';
    if (c.mode === 'late' && c.phase !== 'brk') return PH[c.phase].t;
    return PH[c.phase].t + ' ' + mmss(Math.max(0, elapsed()));
  };

  function setPhase(p) {
    const c = C();
    if (c.paused) { c.pauseAll += now() - c.paused; c.paused = null; }
    c.phase = p; c.pStart = now(); c.acc = 0;
    c.beeped = '';
    if (p === 'end') {
      c.ended = now();
      S.sheet.end = hhmm(c.ended);
      if (!S.sheet.date) S.sheet.date = isoDay(c.ended);
    }
    save(); renderClock(); wake(); ensureTick(); renderDoc(); syncSheetForm();
  }
  function startPlay(force) {
    const t = now(), c = C();
    if (!S.kick) { S.kick = hhmm(t); $('#md-kick').value = S.kick; }
    c.started = t;
    let k = todayAt(S.kick, t);
    // the kickoff nearest to now: 23:55 seen at 00:03 is 8 minutes ago, not 24 hours ahead
    if (t - k > 12 * 60 * MIN) k = todayAt(S.kick, t + 24 * 60 * MIN);
    else if (k - t > 12 * 60 * MIN) k = todayAt(S.kick, t - 24 * 60 * MIN);
    const delay = Math.floor((t - k) / MIN);
    c.delay = delay;
    c.warn = false;
    if (!S.sheet.date) S.sheet.date = isoDay(k);
    if (delay > N.grace && !force) { c.warn = true; save(); renderClock(); return; }
    if (delay > 0 && delay <= N.grace) {
      c.mode = 'late';
      c.endAt = k + (N.total + N.brk) * MIN;
      c.pauseAll = 0;
      setPhase('p1');
    } else {
      c.mode = 'ontime';
      c.pauseAll = 0;
      setPhase('h1');
    }
  }
  function nextPhase() {
    const c = C();
    const order = c.mode === 'late' ? ['p1', 'brk', 'p2', 'end'] : ['h1', 'brk', 'h2', 'end'];
    const i = order.indexOf(c.phase);
    if (i >= 0 && i < order.length - 1) setPhase(order[i + 1]);
  }
  function togglePause() {
    const c = C();
    if (!running()) return;
    if (c.paused) { const d = now() - c.paused; c.acc += d; c.pauseAll += d; c.paused = null; }
    else c.paused = now();
    save(); renderClock(); ensureTick();
  }

  function lateBox() {
    const c = C(), host = $('#md-late');
    host.textContent = '';
    const show = c.warn || (c.mode === 'late' && c.phase);
    host.hidden = !show;
    if (!show) return;
    const row = c.warn ? D.late[1] : D.late[0];
    host.appendChild(el('p', 'md-late-h', `بدأ اللعب بعد موعد المباراة بـ ${c.delay} ${c.delay === 1 ? 'دقيقة' : c.delay === 2 ? 'دقيقتين' : c.delay <= 10 ? 'دقائق' : 'دقيقة'}.`));
    const dl = el('dl', 'md-rowref');
    [[D.heads.lg2[0], row[0]], [D.heads.lg2[1], row[1]]].forEach(([h, v]) => { const d = el('div'); d.append(el('dt', '', h), el('dd', '', v)); dl.appendChild(d); });
    host.appendChild(dl);
    if (c.warn) {
      host.appendChild(el('p', 'md-late-note', 'إن كان التأخر من أحد الفريقين — القرار للحكم واللجنة'));
      const go = btn('md-small', 'شغّل الساعة على أي حال');
      go.id = 'md-force';
      go.addEventListener('click', () => startPlay(true));
      const no = btn('md-small', 'أغلق');
      no.addEventListener('click', () => { c.warn = false; save(); renderClock(); });
      const r = el('div', 'md-row'); r.append(go, no); host.appendChild(r);
    }
  }

  function renderTimes() {
    const k = todayAt(S.kick);
    $('#md-arrive').textContent = k ? hhmm(k - N.arrive * MIN) : '--:--';
    $('#md-end').textContent = k ? hhmm(k + (N.half + N.brk + N.half) * MIN) : '--:--';
  }
  function renderClock() {
    const c = C();
    const p = c.phase;
    $('#md-start').hidden = !!p;
    const next = $('#md-next');
    next.hidden = !p || p === 'end';
    if (p && p !== 'end') next.querySelector('span').textContent = PH[p].next;
    const pause = $('#md-pause');
    pause.hidden = !running();
    pause.setAttribute('aria-pressed', c.paused ? 'true' : 'false');
    pause.querySelector('span').textContent = c.paused ? 'استأنف' : 'أوقف مؤقتًا';
    box.classList.toggle('md-paused', !!c.paused);
    lateBox();
    tickClock();
  }
  function tickClock() {
    const c = C(), f = face();
    $('#md-digits').textContent = mmss(f.rem);
    $('#md-ring').style.strokeDashoffset = String(100 - f.frac * 100);
    let phase = 'لم يبدأ اللعب', sub = '';
    if (c.phase === 'end') { phase = PH.end.t; sub = 'الساعة ' + hhmm(c.ended); }
    else if (c.phase) {
      phase = c.mode === 'late' && c.phase !== 'brk' ? PH[c.phase].t + ' — حتى موعد الانتهاء' : PH[c.phase].t;
      if (c.mode === 'late' && c.phase === 'brk') sub = 'حتى موعد الانتهاء: ' + mmss(toEnd());
      const pa = c.pauseAll + pausedNow();
      if (pa >= 1000) sub = (sub ? sub + ' · ' : '') + 'وقت الإيقاف: ' + mmss(pa);
      if (c.paused) phase += ' — متوقف مؤقتًا';
      else if (f.rem <= 0) {
        phase += ' — انتهى الوقت';
        if (c.beeped !== c.phase) { c.beeped = c.phase; beep(); save(); }
      }
    }
    $('#md-phase').textContent = phase;
    $('#md-sub').textContent = sub;
  }

  /* ---------------- sanction chips ---------------- */
  const chipRem = ch => ch.dur - ((ch.paused || now()) - ch.start - ch.acc);
  function addChip(label, mins, team, pid) {
    S.chips.push({ id: uid(), label, dur: mins * MIN, start: now(), acc: 0, paused: null, team, pid, done: false });
    save(); renderChips(); ensureTick();
  }
  function renderChips() {
    const host = $('#md-chips');
    host.textContent = '';
    host.hidden = !S.chips.length;
    if (!S.chips.length) return;
    host.appendChild(el('h4', 'md-chips-h', 'مؤقتات العقوبات'));
    const ul = el('ul', 'md-chip-list');
    S.chips.forEach(ch => {
      const li = el('li', 'md-chip');
      li.dataset.id = ch.id;
      const who = playerLabel(ch.team, ch.pid);
      const t = el('div', 'md-chip-t');
      t.append(el('b', '', ch.label), el('small', '', who));
      const time = el('span', 'md-chip-n', mmss(chipRem(ch)));
      const pb = btn('md-chip-b', ch.paused ? 'استأنف' : 'أوقف', (ch.paused ? 'استأنف مؤقت ' : 'أوقف مؤقت ') + ch.label + ' — ' + who);
      pb.setAttribute('aria-pressed', ch.paused ? 'true' : 'false');
      pb.addEventListener('click', () => {
        if (ch.paused) { ch.acc += now() - ch.paused; ch.paused = null; } else if (chipRem(ch) > 0) ch.paused = now();
        save(); renderChips(); ensureTick();
        const again = box.querySelector(`.md-chip[data-id="${ch.id}"] .md-chip-b`);
        if (again) again.focus();
      });
      const xb = btn('md-chip-x', '×', 'أزل مؤقت ' + ch.label + ' — ' + who);
      xb.addEventListener('click', () => { S.chips = S.chips.filter(o => o !== ch); save(); renderChips(); });
      li.append(t, time, pb, xb);
      ul.appendChild(li);
    });
    host.appendChild(ul);
    tickChips();
  }
  function tickChips() {
    S.chips.forEach(ch => {
      const li = box.querySelector(`.md-chip[data-id="${ch.id}"]`);
      if (!li) return;
      const r = chipRem(ch);
      li.querySelector('.md-chip-n').textContent = r > 0 ? mmss(r) : 'انتهى';
      li.classList.toggle('done', r <= 0);
      li.classList.toggle('paused', !!ch.paused);
      li.querySelector('.md-chip-b').hidden = r <= 0;
      if (r <= 0 && !ch.done) { ch.done = true; beep(); save(); }
    });
  }

  let tickId = 0;
  function tick() {
    tickClock();
    tickChips();
    const live = (running() && !C().paused) || S.chips.some(ch => !ch.paused && chipRem(ch) > 0);
    if (!live) { clearInterval(tickId); tickId = 0; }
  }
  function ensureTick() { if (!tickId) tickId = setInterval(tick, 250); tick(); }

  /* ---------------- teams, players, log ---------------- */
  const team = i => S.teams[i];
  const player = (i, pid) => team(i).players.find(p => p.id === pid);
  const playerLabel = (i, pid) => {
    const p = pid && player(i, pid);
    return team(i).name + (p ? ' · رقم ' + p.num + (p.name ? ' ' + p.name : '') : '');
  };
  const cardsOf = (i, pid) => S.log.filter(e => e.kind === 'card' && e.team === i && (pid == null || e.pid === pid));
  const count = (i, c, pid) => cardsOf(i, pid).filter(e => e.card === c).length;
  function log(entry) {
    const e = Object.assign({ id: uid(), at: now(), clk: clockLabel() }, entry);
    S.log.push(e);
    return e;
  }

  function renderTeams() {
    const host = $('#md-teams');
    const focusKey = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    host.textContent = '';
    S.teams.forEach((T, i) => {
      const sec = el('section', 'md-team md-t' + i);
      sec.setAttribute('aria-label', T.name);
      const nl = el('label', 'md-f');
      nl.appendChild(el('span', '', 'اسم الفريق'));
      const ni = el('input');
      ni.type = 'text'; ni.value = T.name; ni.maxLength = 40; ni.dataset.k = 'name' + i;
      ni.addEventListener('change', () => { T.name = ni.value.trim() || (i ? 'الفريق ب' : 'الفريق أ'); ni.value = T.name; save(); renderTeams(); renderChips(); renderPens(); renderDoc(); renderLog(); });
      nl.appendChild(ni);
      sec.appendChild(nl);

      // goals per half
      const g = el('div', 'md-goals');
      g.appendChild(el('span', 'md-goals-h', 'الأهداف'));
      ['الشوط الأول', 'الشوط الثاني'].forEach((h, k) => {
        const row = el('div', 'md-step');
        row.appendChild(el('span', 'md-step-l', h));
        const minus = btn('md-step-b', '−', `أنقص هدفًا: ${T.name}، ${h}`);
        minus.dataset.k = `gm${i}${k}`;
        const v = el('output', 'md-step-v', String(T.goals[k]));
        v.setAttribute('aria-label', `أهداف ${T.name} في ${h}`);
        const plus = btn('md-step-b', '+', `أضف هدفًا: ${T.name}، ${h}`);
        plus.dataset.k = `gp${i}${k}`;
        minus.addEventListener('click', () => { if (T.goals[k] > 0) { T.goals[k]--; save(); renderTeams(); renderDoc(); } });
        plus.addEventListener('click', () => { T.goals[k]++; save(); renderTeams(); renderDoc(); });
        row.append(minus, v, plus);
        g.appendChild(row);
      });
      const tot = el('p', 'md-total');
      tot.append(document.createTextNode('المجموع: '), el('b', '', String(T.goals[0] + T.goals[1])));
      g.appendChild(tot);
      sec.appendChild(g);

      // card counters (explicit cards only)
      const cc = el('p', 'md-counts');
      cc.append(el('span', 'md-cnt md-red', 'بطاقات حمراء: ' + count(i, 'r')), el('span', 'md-cnt md-yel', 'بطاقات صفراء: ' + count(i, 'y')));
      sec.appendChild(cc);

      // add player
      const f = el('form', 'md-add');
      f.noValidate = true;
      const l1 = el('label', 'md-f md-f-n');
      l1.appendChild(el('span', '', 'رقم القميص'));
      const num = el('input');
      // text + numeric keypad: a number input drops Arabic-Indic digits (value ''), so they are converted here
      num.type = 'text'; num.inputMode = 'numeric'; num.maxLength = 3; num.autocomplete = 'off'; num.dataset.k = 'num' + i;
      l1.appendChild(num);
      const l2 = el('label', 'md-f');
      l2.appendChild(el('span', '', 'الاسم (اختياري)'));
      const nm = el('input');
      nm.type = 'text'; nm.placeholder = 'يكفي الرقم'; nm.maxLength = 40; nm.autocomplete = 'off'; nm.dataset.k = 'pname' + i;
      l2.appendChild(nm);
      const ab = el('button', 'md-small md-primary', 'أضف لاعبًا');
      ab.type = 'submit'; ab.dataset.k = 'add' + i;
      const m = el('p', 'md-status');
      m.setAttribute('role', 'status');
      f.append(l1, l2, ab);
      f.addEventListener('submit', e => {
        e.preventDefault();
        let v = digits(num.value.trim());
        if (!/^[0-9]{1,3}$/.test(v)) { m.textContent = 'اكتب رقم القميص.'; num.focus(); return; }
        v = String(parseInt(v, 10)); // '07' and '7' are the same shirt
        if (T.players.some(p => p.num === v)) { m.textContent = 'هذا الرقم مسجل في الفريق.'; num.focus(); return; }
        if (T.players.length >= N.max) { m.textContent = D.terms[1][0] + ': ' + D.terms[1][1]; return; }
        T.players.push({ id: uid(), num: v, name: nm.value.trim().slice(0, 40) });
        save(); renderTeams(); renderDoc();
        const again = box.querySelector(`[data-k="num${i}"]`);
        if (again) again.focus();
      });
      sec.append(f, m);

      // players
      const ul = el('ul', 'md-players');
      ul.setAttribute('aria-label', 'لاعبو ' + T.name);
      T.players.forEach(p => {
        const li = el('li', 'md-pl');
        const y = count(i, 'y', p.id), r = count(i, 'r', p.id);
        const pb = btn('md-pl-b' + (r ? ' is-red' : '') + (y >= 2 ? ' is-2y' : ''), null);
        pb.dataset.k = 'pl' + p.id;
        pb.appendChild(el('b', 'md-pl-n', p.num));
        if (p.name) pb.appendChild(el('span', 'md-pl-name', p.name));
        if (y) pb.appendChild(el('span', 'md-badge md-badge-y', y === 1 ? 'صفراء' : y + ' صفراء'));
        if (r) { const rb = el('span', 'md-badge md-badge-r', 'حمراء'); rb.title = D.red[0] + ': ' + D.red[1]; pb.appendChild(rb); }
        pb.setAttribute('aria-label', `اللاعب رقم ${p.num}${p.name ? ' ' + p.name : ''}${y ? '، بطاقات صفراء ' + y : ''}${r ? '، ' + D.red[0] + ' — ' + D.red[1] : ''} — افتح المخالفة والبطاقة`);
        pb.addEventListener('click', () => openPlayer(i, p.id));
        const del = btn('md-pl-x', '×', `أزل اللاعب رقم ${p.num}`);
        del.dataset.k = 'px' + p.id;
        del.addEventListener('click', () => {
          if (S.log.some(e => e.pid === p.id) && !ask('لهذا اللاعب أسطر في سجل المباراة. هل تزيله من القائمة؟ تبقى الأسطر.')) return;
          T.players = T.players.filter(o => o !== p);
          save(); renderTeams(); renderDoc();
        });
        li.append(pb, del);
        ul.appendChild(li);
      });
      sec.appendChild(ul);

      // team incidents
      const inc = el('div', 'md-inc');
      const il = el('label', 'md-f');
      il.appendChild(el('span', '', 'وقائع الفريق'));
      const sel = el('select');
      sel.dataset.k = 'inc' + i;
      D.team.forEach((r, k) => { const o = el('option', '', r.r[0]); o.value = String(k); sel.appendChild(o); });
      il.appendChild(sel);
      const ib = btn('md-small', 'سجّل الواقعة', 'سجّل الواقعة: ' + T.name);
      ib.dataset.k = 'incb' + i;
      ib.addEventListener('click', () => {
        const r = D.team[+sel.value];
        log({ kind: 'team', team: i, pid: null, a: r.r[0], b: r.r[1], h: r.h });
        save(); renderLog(); renderDoc();
        m.textContent = 'سُجّلت الواقعة في سجل المباراة.';
      });
      inc.append(il, ib);
      sec.appendChild(inc);
      host.appendChild(sec);
    });
    if (focusKey) { const f = box.querySelector(`[data-k="${focusKey}"]`); if (f) f.focus(); }
  }

  /* player sheet: (a) offence (optional) and (b) card — independent */
  let sheetFor = null;
  function openPlayer(i, pid) {
    sheetFor = { i, pid };
    const p = player(i, pid);
    const host = $('#md-player');
    host.textContent = '';
    const h = el('h4', '', `اللاعب رقم ${p.num}${p.name ? ' ' + p.name : ''} — ${team(i).name}`);
    h.id = 'md-player-h';
    host.appendChild(h);
    const form = el('form', 'md-pform');
    form.noValidate = true;
    const fa = el('fieldset', 'md-opts-list');
    fa.appendChild(el('legend', '', 'المخالفة (اختياري)'));
    const radio = (name, value, main, small, checked) => {
      const l = el('label', 'md-opt');
      const r = el('input');
      r.type = 'radio'; r.name = name; r.value = value; r.checked = !!checked;
      const s = el('span', 'md-opt-t');
      s.appendChild(el('b', '', main));
      if (small) s.appendChild(el('small', '', small));
      l.append(r, s);
      return l;
    };
    fa.appendChild(radio('md-off', '', 'بلا مخالفة', '', true));
    D.player.forEach((r, k) => fa.appendChild(radio('md-off', String(k), r[0], D.heads.lg4[1] + ': ' + r[1])));
    form.appendChild(fa);
    const fv = el('fieldset', 'md-opts-list md-violent');
    fv.hidden = true;
    fv.appendChild(el('legend', '', 'الحكم يختار: إنذار / طرد'));
    fv.appendChild(radio('md-vch', 'إنذار', 'إنذار'));
    fv.appendChild(radio('md-vch', 'طرد', 'طرد'));
    form.appendChild(fv);
    const fb = el('fieldset', 'md-opts-list md-cardset');
    fb.appendChild(el('legend', '', 'البطاقة'));
    fb.appendChild(radio('md-card', '', 'لا بطاقة', '', true));
    fb.appendChild(radio('md-card', 'y', 'بطاقة صفراء'));
    fb.appendChild(radio('md-card', 'r', D.red[0]));
    form.appendChild(fb);
    const err = el('p', 'md-status md-err');
    err.setAttribute('role', 'alert');
    const acts = el('div', 'md-row');
    const ok = el('button', 'md-small md-primary', 'سجّل');
    ok.type = 'submit';
    const cancel = btn('md-small', 'إلغاء');
    cancel.addEventListener('click', closePlayer);
    acts.append(ok, cancel);
    form.append(err, acts);
    form.addEventListener('change', () => {
      const v = form.querySelector('input[name=md-off]:checked').value;
      fv.hidden = !(v !== '' && D.player[+v][0] === D.violent[0]);
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const ov = form.querySelector('input[name=md-off]:checked').value;
      const cv = form.querySelector('input[name=md-card]:checked').value;
      const vch = form.querySelector('input[name=md-vch]:checked');
      if (ov === '' && cv === '') { err.textContent = 'اختر مخالفة أو بطاقة.'; return; }
      const row = ov !== '' ? D.player[+ov] : null;
      if (row && row[0] === D.violent[0] && !vch) { err.textContent = 'اختر: إنذار أو طرد.'; return; }
      const done = [];
      const offers = [];
      if (row) {
        const e1 = log({ kind: 'off', team: i, pid, a: row[0], b: row[1], h: D.heads.lg4, choice: row[0] === D.violent[0] ? vch.value : '' });
        done.push(e1);
        if (row[0] === D.verbal[0]) offers.push([D.verbal[1], N.two]);
      }
      if (cv === 'y') {
        done.push(log({ kind: 'card', card: 'y', team: i, pid, a: 'بطاقة صفراء', b: '', h: null }));
        if (count(i, 'y', pid) === 2) {
          done.push(log({ kind: 'ref', team: i, pid, a: D.two_y[0], b: D.two_y[1], h: D.heads.lg4 }));
          offers.push([D.two_y[1].slice(D.two_y[1].indexOf('وبعد')), N.after]);
        }
      } else if (cv === 'r') {
        done.push(log({ kind: 'card', card: 'r', team: i, pid, a: D.red[0], b: D.red[1], h: D.heads.lg4 }));
      }
      save(); renderTeams(); renderLog(); renderDoc();
      showDone(done, offers, i, pid);
    });
    host.appendChild(form);
    if (!host.open) { try { host.showModal(); } catch (e) { host.setAttribute('open', ''); } }
    const first = form.querySelector('input:checked');
    if (first) first.focus();
  }
  function showDone(done, offers, i, pid) {
    const host = $('#md-player');
    host.textContent = '';
    const h = el('h4', '', 'سُجّل في سجل المباراة');
    h.id = 'md-player-h';
    host.appendChild(h);
    const ul = el('ul', 'md-done');
    done.forEach(e => ul.appendChild(logLine(e)));
    host.appendChild(ul);
    offers.forEach(([label, mins]) => {
      const b = btn('md-small md-primary md-offer', `ابدأ مؤقت «${label}» (${mmss(mins * MIN)})`);
      b.addEventListener('click', () => { addChip(label, mins, i, pid); b.disabled = true; b.textContent = 'بدأ المؤقت'; });
      host.appendChild(b);
    });
    const close = btn('md-small', 'تم');
    close.addEventListener('click', closePlayer);
    host.appendChild(close);
    (host.querySelector('.md-offer') || close).focus();
  }
  function closePlayer() {
    const host = $('#md-player');
    if (host.open) { try { host.close(); } catch (e) { host.removeAttribute('open'); } }
    afterClose();
  }
  function afterClose() {
    const host = $('#md-player');
    host.textContent = '';
    const f = sheetFor && box.querySelector(`[data-k="pl${sheetFor.pid}"]`);
    sheetFor = null;
    if (f) f.focus();
  }
  $('#md-player').addEventListener('close', () => { if (sheetFor) afterClose(); });

  // one log entry as a <li>: time · who · text (and the verbatim rule cell with its header word)
  function logLine(e) {
    const li = el('li', 'md-le md-le-' + e.kind + (e.card ? ' md-le-' + e.card : ''));
    const when = el('span', 'md-le-t', hhmm(e.at) + (e.clk ? ' · ' + e.clk : ''));
    const who = el('span', 'md-le-w', playerLabel(e.team, e.pid));
    const what = el('span', 'md-le-x');
    what.appendChild(el('b', '', e.a));
    if (e.b) what.appendChild(document.createTextNode(' — ' + (e.h ? e.h[1] + ': ' : '') + e.b));
    if (e.choice) what.appendChild(document.createTextNode(' — اختيار الحكم: ' + e.choice));
    li.append(when, who, what);
    return li;
  }
  function renderLog() {
    const ol = $('#md-log');
    ol.textContent = '';
    if (!S.log.length) { ol.appendChild(el('li', 'md-empty', 'لا شيء بعد.')); return; }
    S.log.forEach((e, k) => {
      const li = logLine(e);
      const x = btn('md-pl-x', '×', `احذف السطر ${k + 1} من السجل`);
      x.addEventListener('click', () => { S.log = S.log.filter(o => o !== e); save(); renderLog(); renderTeams(); renderDoc(); });
      li.appendChild(x);
      ol.appendChild(li);
    });
  }

  /* ---------------- saved results ---------------- */
  function resultObj() {
    const P = pensResult();
    const end = S.sheet.end || (C().ended ? hhmm(C().ended) : '');
    return {
      a: team(0).name, b: team(1).name,
      ga: team(0).goals[0] + team(0).goals[1], gb: team(1).goals[0] + team(1).goals[1],
      ra: count(0, 'r'), ya: count(0, 'y'), rb: count(1, 'r'), yb: count(1, 'y'),
      format: S.format === 'ko' ? 'خروج المغلوب' : 'مجموعات',
      pens: S.format === 'ko' && P.winner != null ? { a: P.sa, b: P.sb, winner: team(P.winner).name } : null,
      date: S.sheet.date || isoDay(now()), end,
    };
  }
  function renderSaved() {
    const ol = $('#md-saved');
    ol.textContent = '';
    const list = readResults();
    if (!list.length) { ol.appendChild(el('li', 'md-empty', 'لا نتائج محفوظة.')); return; }
    list.forEach((r, k) => {
      const li = el('li', 'md-sv');
      const sides = el('div', 'md-sv-s');
      [[r.a, r.ga], [r.b, r.gb]].forEach(([n, g]) => { const d = el('span', 'md-sv-t'); d.append(el('span', '', String(n)), el('b', '', String(g))); sides.appendChild(d); });
      li.appendChild(sides);
      const meta = [r.date, r.end, r.format].filter(Boolean).join(' · ');
      li.appendChild(el('small', 'md-sv-m', meta + (r.pens ? ` · الفائز بركلات الترجيح: ${r.pens.winner} (${r.pens.a}–${r.pens.b})` : '')));
      const x = btn('md-pl-x', '×', `احذف النتيجة المحفوظة ${k + 1}`);
      x.addEventListener('click', () => {
        if (!ask('هل تحذف هذه النتيجة المحفوظة؟')) return;
        const a = readResults(); a.splice(k, 1); writeResults(a); renderSaved();
      });
      li.appendChild(x);
      ol.appendChild(li);
    });
  }
  $('#md-save-res').addEventListener('click', () => {
    const a = readResults();
    a.push(resultObj());
    const ok = writeResults(a);
    $('#md-save-msg').textContent = ok ? 'حُفظت النتيجة على هذا الجهاز.' : 'لا يمكن الحفظ في هذا المتصفح الآن.';
    renderSaved();
  });
  $('#md-clear').addEventListener('click', () => {
    if (!ask('هل تمسح بيانات هذه المباراة (الساعة واللاعبين والسجل والمؤقتات وركلات الترجيح والورقة)؟')) return;
    const tone = S.tone;
    S = blank(); S.tone = tone;
    try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    save();
    renderAll();
    wake();
    $('#md-save-msg').textContent = 'مُسحت بيانات المباراة.';
  });

  /* ---------------- shootout ---------------- */
  function pensResult() {
    const P = S.pens;
    const sc = i => P.k[i].filter(v => v === 1).length + P.sd.filter(r => r[i] === 1).length;
    const left = i => P.k[i].filter(v => v === 0).length;
    const a1 = P.k[0].filter(v => v === 1).length, b1 = P.k[1].filter(v => v === 1).length;
    const out = { winner: null, sa: sc(0), sb: sc(1), early: false, need: false, sdUsed: 0 };
    if (a1 > b1 + left(1)) return Object.assign(out, { winner: 0, early: left(0) + left(1) > 0, sa: a1, sb: b1 });
    if (b1 > a1 + left(0)) return Object.assign(out, { winner: 1, early: left(0) + left(1) > 0, sa: a1, sb: b1 });
    if (left(0) || left(1)) return Object.assign(out, { sa: a1, sb: b1 });
    for (let r = 0; r < P.sd.length; r++) {
      const [x, y] = P.sd[r];
      out.sdUsed = r + 1;
      if (!x || !y) return out;
      if (x === 1 && y === 2) return Object.assign(out, { winner: 0 });
      if (x === 2 && y === 1) return Object.assign(out, { winner: 1 });
    }
    out.need = true;
    return out;
  }
  function normPens() {
    const P = S.pens;
    let R = pensResult();
    if (R.winner != null && R.sdUsed === 0) P.sd = [];
    else if (R.sdUsed) P.sd = P.sd.slice(0, R.sdUsed);
    else if (!R.need) P.sd = [];
    R = pensResult();
    if (R.need) P.sd.push([0, 0]);
  }
  const KICK = ['لم تُسدد', 'سجّل', 'أضاع'];
  function kickBtn(v, label, onTap, k) {
    const b = btn('md-kick md-kick-' + v, v === 1 ? 'سجّل' : v === 2 ? 'أضاع' : '', `${label}: ${KICK[v]}`);
    b.dataset.k = k;
    b.addEventListener('click', onTap);
    return b;
  }
  function renderPens() {
    const host = $('#md-pens');
    const focusKey = document.activeElement && host.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    host.textContent = '';
    if (S.format !== 'ko') {
      const t = el('table', 'md-mini');
      const tr0 = el('tr'); D.heads.lg6.forEach(h => { const th = el('th', '', h); th.scope = 'col'; tr0.appendChild(th); });
      const th0 = el('thead'); th0.appendChild(tr0);
      const tr = el('tr'); const rh = el('th', '', D.draw[0]); rh.scope = 'row'; tr.append(rh, el('td', '', D.draw[1]));
      const tb = el('tbody'); tb.appendChild(tr);
      t.append(th0, tb);
      host.appendChild(t);
      host.appendChild(el('p', 'md-note', 'ركلات الترجيح في خروج المغلوب فقط'));
      host.appendChild(el('p', 'md-q', L.pens));
      const sw = btn('md-small', 'اختر نظام «خروج المغلوب»');
      sw.addEventListener('click', () => { setFormat('ko'); const f = $('#md-pens .md-kick'); if (f) f.focus(); });
      host.appendChild(sw);
      return;
    }
    normPens();
    const R = pensResult();
    host.appendChild(el('p', 'md-q', L.pens));
    const grid = el('div', 'md-pk');
    [0, 1].forEach(i => {
      const row = el('div', 'md-pk-row');
      row.appendChild(el('span', 'md-pk-n', team(i).name));
      const ks = el('div', 'md-pk-k');
      S.pens.k[i].forEach((v, j) => ks.appendChild(kickBtn(v, `ركلة ${j + 1} — ${team(i).name}`, () => { S.pens.k[i][j] = (v + 1) % 3; save(); renderPens(); renderDoc(); }, `k${i}${j}`)));
      row.appendChild(ks);
      const sc = S.pens.k[i].filter(v => v === 1).length + S.pens.sd.filter(r => r[i] === 1).length;
      const out = el('b', 'md-pk-s', String(sc));
      out.setAttribute('aria-label', 'المسجل: ' + sc);
      row.appendChild(out);
      grid.appendChild(row);
    });
    host.appendChild(grid);
    if (S.pens.sd.length) {
      const sd = el('ol', 'md-sd');
      S.pens.sd.forEach((r, n) => {
        const li = el('li', 'md-sd-r');
        li.appendChild(el('span', 'md-sd-l', 'ركلة مقابل ركلة ' + (n + 1)));
        [0, 1].forEach(i => {
          const w = el('span', 'md-sd-k');
          w.appendChild(el('small', '', team(i).name));
          w.appendChild(kickBtn(r[i], `ركلة مقابل ركلة ${n + 1} — ${team(i).name}`, () => { r[i] = (r[i] + 1) % 3; save(); renderPens(); renderDoc(); }, `s${n}${i}`));
          li.appendChild(w);
        });
        sd.appendChild(li);
      });
      host.appendChild(sd);
    }
    const res = el('div', 'md-pk-res');
    res.setAttribute('aria-live', 'polite');
    res.id = 'md-pk-res';
    if (R.winner != null) {
      res.classList.add('won');
      res.appendChild(el('b', '', 'الفائز بركلات الترجيح: ' + team(R.winner).name));
      res.appendChild(el('span', '', ` (${R.sa} – ${R.sb})${R.early ? ' — حُسمت قبل اكتمال الركلات الثلاث' : ''}`));
      res.appendChild(el('p', 'md-q', L.pens));
    } else if (R.need || S.pens.sd.length) {
      res.appendChild(el('span', '', `متعادلان (${R.sa} – ${R.sb}): ركلة مقابل ركلة`));
    } else {
      res.appendChild(el('span', '', `${R.sa} – ${R.sb}`));
    }
    host.appendChild(res);
    const reset = btn('md-small', 'ابدأ الركلات من جديد');
    reset.addEventListener('click', () => { S.pens = { k: [[0, 0, 0], [0, 0, 0]], sd: [] }; save(); renderPens(); renderDoc(); });
    host.appendChild(reset);
    if (focusKey) { const f = host.querySelector(`[data-k="${focusKey}"]`); if (f) f.focus(); }
  }

  /* ---------------- match sheet ---------------- */
  let blankDoc = false;
  function renderDoc() {
    const doc = $('#md-doc');
    doc.textContent = '';
    const B = blankDoc;
    const v = s => (B ? '' : s || '');
    const head = el('header', 'md-doc-h');
    head.appendChild(el('h4', '', 'ورقة المباراة'));
    const meta = el('dl', 'md-doc-meta');
    const fmt = S.format === 'ko' ? 'خروج المغلوب' : 'مجموعات';
    [['الفريق الأول', v(team(0).name)], ['الفريق الثاني', v(team(1).name)], ['التاريخ', v(S.sheet.date)], ['الوقت', v(S.kick)],
      ['الحكم', v(S.sheet.ref)], ['الشخص البالغ المكلف بالسلامة', v(S.sheet.safe)], ['نظام البطولة', B ? 'مجموعات / خروج المغلوب' : fmt]]
      .forEach(([k, val]) => { const d = el('div'); d.append(el('dt', '', k), el('dd', val ? '' : 'md-fill', val || ' ')); meta.appendChild(d); });
    head.appendChild(meta);
    doc.appendChild(head);

    // squads: at most N.max rows (the team size in c-terms); no reserve count
    const sq = el('div', 'md-doc-teams');
    [0, 1].forEach(i => {
      const s = el('section', 'md-doc-team');
      s.appendChild(el('h5', '', B ? (i ? 'الفريق الثاني' : 'الفريق الأول') : team(i).name));
      s.appendChild(el('p', 'md-q', L.squad));
      const t = el('table', 'md-doc-tbl');
      const hr = el('tr');
      ['#', 'رقم', 'الاسم', 'أساسي / احتياطي', 'مسجل في كشف الفريق'].forEach(h => { const th = el('th', '', h); th.scope = 'col'; hr.appendChild(th); });
      const th = el('thead'); th.appendChild(hr); t.appendChild(th);
      const tb = el('tbody');
      for (let r = 0; r < N.max; r++) {
        const p = B ? null : team(i).players[r];
        const tr = el('tr');
        tr.append(el('td', 'md-rn', String(r + 1)), el('td', '', p ? p.num : ''), el('td', '', p && p.name ? p.name : ''));
        const tick = (col, lab) => {
          const k = `${i}-${r}-${col}`;
          const l = el('label', 'md-tick');
          const c = el('input');
          c.type = 'checkbox';
          c.checked = !B && !!S.sheet.ticks[k];
          c.setAttribute('aria-label', `${B ? '' : team(i).name + ' — '}سطر ${r + 1}: ${lab}`);
          c.addEventListener('change', () => { S.sheet.ticks[k] = c.checked; save(); });
          l.append(c, el('span', '', lab));
          return l;
        };
        const td1 = el('td', 'md-ticks');
        td1.append(tick('a', 'أساسي'), tick('b', 'احتياطي'));
        const td2 = el('td', 'md-ticks');
        td2.append(tick('c', 'مسجل'));
        tr.append(td1, td2);
        tb.appendChild(tr);
      }
      t.appendChild(tb);
      s.appendChild(t);
      sq.appendChild(s);
    });
    doc.appendChild(sq);

    // pre-match checklist (verbatim lines)
    const chk = el('section', 'md-doc-sec');
    chk.appendChild(el('h5', '', 'قبل المباراة'));
    const cl = el('ul', 'md-doc-check');
    [L.elig, L.arrive, L.safety, L.greet].forEach((line, k) => {
      const li = el('li');
      const l = el('label', 'md-tick md-tick-line');
      const c = el('input');
      c.type = 'checkbox';
      c.checked = !B && !!S.sheet.checks[k];
      c.addEventListener('change', () => { S.sheet.checks[k] = c.checked; save(); });
      l.append(c, el('span', '', line));
      li.appendChild(l);
      cl.appendChild(li);
    });
    chk.appendChild(cl);
    doc.appendChild(chk);

    // score per half
    const sc = el('section', 'md-doc-sec');
    sc.appendChild(el('h5', '', 'النتيجة'));
    const st = el('table', 'md-doc-tbl md-doc-score');
    const sh = el('tr');
    ['الفريق', 'الشوط الأول', 'الشوط الثاني', 'المجموع'].forEach(h => { const th = el('th', '', h); th.scope = 'col'; sh.appendChild(th); });
    const sth = el('thead'); sth.appendChild(sh); st.appendChild(sth);
    const stb = el('tbody');
    [0, 1].forEach(i => {
      const T = team(i), tr = el('tr');
      const nh = el('th', '', B ? (i ? 'الفريق الثاني' : 'الفريق الأول') : T.name); nh.scope = 'row';
      tr.append(nh, el('td', '', B ? '' : String(T.goals[0])), el('td', '', B ? '' : String(T.goals[1])), el('td', '', B ? '' : String(T.goals[0] + T.goals[1])));
      stb.appendChild(tr);
    });
    st.appendChild(stb);
    sc.appendChild(st);
    doc.appendChild(sc);

    // shootout (knockout only)
    const P = S.pens;
    const anyKick = P.k[0].concat(P.k[1]).some(Boolean);
    if (S.format === 'ko' && (B || anyKick)) {
      const ps = el('section', 'md-doc-sec');
      ps.appendChild(el('h5', '', 'ركلات الترجيح'));
      ps.appendChild(el('p', 'md-q', L.pens));
      const pt = el('table', 'md-doc-tbl');
      const sym = x => (x === 1 ? 'سجّل' : x === 2 ? 'أضاع' : '');
      const ph = el('tr');
      ['الفريق', 'الركلة 1', 'الركلة 2', 'الركلة 3', 'ركلة مقابل ركلة', 'المسجل'].forEach(h => { const th = el('th', '', h); th.scope = 'col'; ph.appendChild(th); });
      const pth = el('thead'); pth.appendChild(ph); pt.appendChild(pth);
      const R = pensResult();
      const ptb = el('tbody');
      [0, 1].forEach(i => {
        const tr = el('tr');
        const nh = el('th', '', B ? (i ? 'الفريق الثاني' : 'الفريق الأول') : team(i).name); nh.scope = 'row';
        tr.appendChild(nh);
        P.k[i].forEach(x => tr.appendChild(el('td', '', B ? '' : sym(x))));
        tr.appendChild(el('td', '', B ? '' : P.sd.map(r => sym(r[i]) || '—').join('، ')));
        tr.appendChild(el('td', '', B ? '' : String(i ? R.sb : R.sa)));
        ptb.appendChild(tr);
      });
      pt.appendChild(ptb);
      ps.appendChild(pt);
      ps.appendChild(el('p', 'md-doc-line', 'الفائز بركلات الترجيح: ' + (B || R.winner == null ? '' : team(R.winner).name)));
      doc.appendChild(ps);
    }

    // sanctions and incidents
    const lg = el('section', 'md-doc-sec');
    lg.appendChild(el('h5', '', 'المخالفات والبطاقات والوقائع'));
    const lt = el('table', 'md-doc-tbl md-doc-log');
    const lh = el('tr');
    ['الوقت', 'الفريق / اللاعب', 'الواقعة', 'القرار / العقوبة'].forEach(h => { const th = el('th', '', h); th.scope = 'col'; lh.appendChild(th); });
    const lth = el('thead'); lth.appendChild(lh); lt.appendChild(lth);
    const ltb = el('tbody');
    const rows = B ? [] : S.log;
    rows.forEach(e => {
      const tr = el('tr');
      tr.append(el('td', '', hhmm(e.at) + (e.clk ? ' · ' + e.clk : '')), el('td', '', playerLabel(e.team, e.pid)), el('td', '', e.a),
        el('td', '', (e.b || '') + (e.choice ? ' — اختيار الحكم: ' + e.choice : '')));
      ltb.appendChild(tr);
    });
    for (let k = rows.length; k < (B ? 6 : Math.max(rows.length, 2)); k++) {
      const tr = el('tr', 'md-blank-row');
      for (let c = 0; c < 4; c++) tr.appendChild(el('td', '', ''));
      ltb.appendChild(tr);
    }
    lt.appendChild(ltb);
    lg.appendChild(lt);
    doc.appendChild(lg);

    doc.appendChild(el('p', 'md-doc-safety', L.head));
    const inc = el('section', 'md-doc-sec md-doc-box');
    inc.appendChild(el('h5', '', L.incomplete));
    inc.appendChild(el('div', 'md-doc-space'));
    doc.appendChild(inc);

    // end and appeal deadline (lg7: within 24 hours of the end of the match)
    const fin = el('section', 'md-doc-sec');
    const endHm = B ? '' : S.sheet.end;
    fin.appendChild(el('p', 'md-doc-line', 'نهاية المباراة: ' + endHm));
    fin.appendChild(el('p', 'md-q', L.appeal));
    let dl = '';
    if (!B && endHm) {
      const base = S.sheet.date ? new Date(S.sheet.date + 'T12:00:00').getTime() : now();
      let e = todayAt(endHm, base);
      // the date is the kickoff's day: an end time earlier than the kickoff is after midnight, on the next day
      if (e && S.kick && endHm < S.kick) e = todayAt(endHm, base + 24 * 3600000);
      if (e) { const t = e + N.appeal * 3600000; dl = dayLabel(t) + '، الساعة ' + hhmm(t); }
    }
    const dlp = el('p', 'md-doc-line', 'آخر موعد للتظلم: ' + dl);
    dlp.id = 'md-deadline';
    fin.appendChild(dlp);
    doc.appendChild(fin);
    const sign = el('div', 'md-doc-sign');
    sign.append(el('span', '', 'توقيع الحكم'), el('span', 'md-doc-signline', ''));
    doc.appendChild(sign);
  }
  function syncSheetForm() {
    $('#md-s-date').value = S.sheet.date || '';
    $('#md-s-time').value = S.kick || '';
    $('#md-s-end').value = S.sheet.end || '';
    $('#md-s-ref').value = S.sheet.ref || '';
    $('#md-s-safe').value = S.sheet.safe || '';
  }
  [['#md-s-date', 'date'], ['#md-s-end', 'end'], ['#md-s-ref', 'ref'], ['#md-s-safe', 'safe']].forEach(([s, k]) => {
    $(s).addEventListener('input', () => { S.sheet[k] = $(s).value.trim(); save(); renderDoc(); });
  });
  $('#md-s-time').addEventListener('input', () => { S.kick = $('#md-s-time').value; $('#md-kick').value = S.kick; save(); renderTimes(); renderDoc(); });

  const printOnly = cls => {
    if (typeof window.__yanabeePrintOnly === 'function') { window.__yanabeePrintOnly(cls); return; }
    document.body.classList.add(cls);
    const off = () => { document.body.classList.remove(cls); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  };
  $('#md-print').addEventListener('click', () => { blankDoc = false; renderDoc(); printOnly('print-match-day'); });
  $('#md-print-blank').addEventListener('click', () => {
    blankDoc = true; renderDoc();
    const back = () => { blankDoc = false; renderDoc(); removeEventListener('afterprint', back); };
    addEventListener('afterprint', back);
    printOnly('print-match-day');
  });

  /* ---------------- setup controls ---------------- */
  function setFormat(f) {
    S.format = f === 'ko' ? 'ko' : 'groups';
    box.querySelectorAll('input[name=md-format]').forEach(r => { r.checked = r.value === S.format; });
    save(); renderPens(); renderDoc();
  }
  box.querySelectorAll('input[name=md-format]').forEach(r => r.addEventListener('change', () => { if (r.checked) setFormat(r.value); }));
  $('#md-kick').addEventListener('input', () => { S.kick = $('#md-kick').value; $('#md-s-time').value = S.kick; save(); renderTimes(); renderDoc(); });
  $('#md-start').addEventListener('click', () => startPlay(false));
  $('#md-next').addEventListener('click', nextPhase);
  $('#md-pause').addEventListener('click', togglePause);
  $('#md-tone').addEventListener('change', e => { S.tone = e.target.checked; save(); if (S.tone) beep(); });
  $('#md-reset-clock').addEventListener('click', () => {
    if (S.clock.phase && !ask('هل تعيد ضبط الساعة؟')) return;
    S.clock = blank().clock;
    save(); renderClock(); wake();
  });

  function renderAll() {
    $('#md-kick').value = S.kick || '';
    $('#md-tone').checked = !!S.tone;
    box.querySelectorAll('input[name=md-format]').forEach(r => { r.checked = r.value === S.format; });
    renderTimes(); renderClock(); renderChips(); renderTeams(); renderLog(); renderSaved(); renderPens(); syncSheetForm(); renderDoc();
    if ($('#md-player').open) closePlayer();
    ensureTick();
  }
  try { renderAll(); } catch (e) { S = blank(); renderAll(); } // a stored match the kit cannot draw is dropped, not fatal
  wake();
  if (!canStore) $('#md-save-msg').textContent = 'لا يمكن الحفظ في هذا المتصفح الآن؛ تعمل الأدوات، لكن البيانات تضيع عند إغلاق الصفحة.';

  // test hook (read-only)
  window.YanabeeMatch = { state: () => JSON.parse(JSON.stringify(S)), pens: () => pensResult() };
})();
