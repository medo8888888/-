// Interactive pieces: role quiz, donation splitter (live donut), pillar flip cards,
// expansion journey tabs, button ripple + magnetic hover, back-to-top progress ring.
// No hard-coded text: everything visible comes from the page (so it is translated with it).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const locale = document.documentElement.lang || 'ar';

  /* ---------------- role quiz ---------------- */
  $$('[data-quiz]').forEach(q => {
    const steps = $$('.q-step', q), dots = $$('.q-progress li', q);
    let a1 = '';
    const go = n => {
      steps.forEach(s => {
        const on = +s.dataset.step === n;
        s.classList.toggle('is-on', on);
        if (on && !reduce) s.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.22,.8,.24,1)' });
      });
      dots.forEach((d, i) => { d.classList.toggle('is-on', i < n); d.classList.toggle('is-cur', i === n - 1); });
    };
    $$('[data-step="1"] .q-opt', q).forEach(b => b.addEventListener('click', () => { a1 = b.dataset.a; go(2); }));
    $$('[data-step="2"] .q-opt', q).forEach(b => b.addEventListener('click', () => {
      const t = $(`template[data-r="${a1}-${b.dataset.a}"]`, q);
      $('.q-out', q).innerHTML = '';
      if (t) $('.q-out', q).appendChild(t.content.cloneNode(true));
      go(3);
      if (!reduce) burst($('.q-out', q));
    }));
    $('.q-restart', q).addEventListener('click', () => go(1));
  });

  // small celebratory burst of leaves/dots
  function burst(host) {
    if (!host) return;
    const r = host.getBoundingClientRect();
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('i');
      p.className = 'burst';
      p.style.left = (r.left + r.width / 2) + 'px';
      p.style.top = (r.top + 40) + 'px';
      p.style.setProperty('--h', ['#c9a227', '#0e7c7b', '#b03a2e', '#1f4e79'][i % 4]);
      document.body.appendChild(p);
      const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 110;
      p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist - 40}px)) scale(.3) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
        { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.22,.8,.24,1)' }).onfinish = () => p.remove();
    }
  }

  /* ---------------- donation splitter ---------------- */
  $$('[data-splitter]').forEach(sp => {
    const amt = $('[data-in=amount]', sp), split = $('[data-in=split]', sp);
    const out = k => $(`[data-out=${k}]`, sp);
    const dA = $('.d-a', sp), dB = $('.d-b', sp), go = $('[data-sp-go]', sp);
    const fmt = n => new Intl.NumberFormat(locale).format(n);
    const cur = () => ($('[name=sp_cur]:checked', sp) || {}).value || 'TRY';
    const upd = () => {
      const total = +amt.value, pa = +split.value, a = Math.round(total * pa / 100), b = total - a;
      out('amount').textContent = fmt(total) + ' ' + cur();
      out('total').textContent = fmt(total);
      out('cur').textContent = cur();
      out('a').textContent = fmt(a) + ' ' + cur();
      out('b').textContent = fmt(b) + ' ' + cur();
      dA.style.strokeDasharray = `${pa} ${100 - pa}`;
      dB.style.strokeDasharray = `${100 - pa} ${pa}`;
      dB.style.strokeDashoffset = `${-pa}`;
      amt.style.setProperty('--p', ((total - amt.min) / (amt.max - amt.min) * 100) + '%');
      split.style.setProperty('--p', pa + '%');
      const lines = [[sp.dataset.a, a], [sp.dataset.b, b]].filter(x => x[1] > 0).map(x => x[0] + '~' + x[1]).join(';');
      go.href = 'support.html?' + new URLSearchParams({ lines, currency: cur() }) + '#donate';
    };
    [amt, split].forEach(i => i.addEventListener('input', upd));
    $$('[name=sp_cur]', sp).forEach(r => r.addEventListener('change', upd));
    upd();
  });

  /* ---------------- pillar flip cards ---------------- */
  $$('.flip').forEach(f => {
    const t = () => { const on = !f.classList.contains('is-flipped'); f.classList.toggle('is-flipped', on); f.setAttribute('aria-pressed', on); };
    f.addEventListener('click', t);
    f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } });
    if (fine && !reduce) {
      f.addEventListener('pointermove', e => {
        if (f.classList.contains('is-flipped')) return;
        const r = f.getBoundingClientRect();
        f.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 10) + 'deg');
        f.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 12) + 'deg');
      });
      f.addEventListener('pointerleave', () => { f.style.setProperty('--rx', '0deg'); f.style.setProperty('--ry', '0deg'); });
    }
  });

  /* ---------------- expansion journey ---------------- */
  $$('[data-journey]').forEach(j => {
    const steps = $$('.jr-step', j), panels = $$('.jr-panel', j), fill = $('.jr-fill', j);
    let cur = 0, timer = 0, user = false;
    const show = i => {
      cur = i;
      steps.forEach((s, k) => { s.classList.toggle('is-on', k === i); s.classList.toggle('is-done', k < i); s.setAttribute('aria-selected', k === i); });
      panels.forEach((p, k) => p.classList.toggle('is-on', k === i));
      fill.style.width = ((i + 1) / steps.length * 100) + '%';
    };
    steps.forEach((s, i) => {
      s.addEventListener('click', () => { user = true; clearInterval(timer); show(i); });
      s.addEventListener('keydown', e => {
        const d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
        if (!d) return;
        const rtl = document.documentElement.dir !== 'ltr';
        const n = (i + (rtl ? d : -d) + steps.length) % steps.length;
        steps[n].focus(); steps[n].click();
      });
    });
    show(0);
    if (!reduce && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        clearInterval(timer);
        if (e.isIntersecting && !user) timer = setInterval(() => show((cur + 1) % steps.length), 3200);
      }), { threshold: 0.4 });
      io.observe(j);
    }
  });

  /* ---------------- button ripple + magnetic hover ---------------- */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest('.btn, .q-opt, .ft, .jr-step, .way');
    if (!b || reduce) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2;
    const w = document.createElement('span');
    w.className = 'ripple';
    w.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.style.overflow = 'hidden';
    b.appendChild(w);
    setTimeout(() => w.remove(), 650);
  });
  if (fine && !reduce) {
    $$('.btn-lg, .btn-donate, .q-opt').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.12}px ${(e.clientY - r.top - r.height / 2) * 0.18}px`;
      });
      b.addEventListener('pointerleave', () => { b.style.translate = ''; });
    });
  }

  /* ---------------- constellation over the hero (Takamul = things connecting) ---------------- */
  const cv = $('.constellation');
  if (cv && !reduce) {
    const host = cv.parentElement, ctx = cv.getContext('2d');
    const DPR = Math.min(devicePixelRatio || 1, 2);
    let W = 0, H = 0, pts = [], mouse = { x: -9999, y: -9999 }, raf = 0, vis = true;
    const size = () => {
      W = host.clientWidth; H = host.clientHeight;
      cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.round(Math.min(90, W * H / 14000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
        r: 1 + Math.random() * 1.8, c: Math.random() < .55 ? '201,162,39' : '79,214,207' }));
    };
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
        if (d < 180) { p.vx += dx / d * .02; p.vy += dy / d * .02; }
        p.vx *= .985; p.vy *= .985;
        p.vx += (Math.random() - .5) * .02; p.vy += (Math.random() - .5) * .02;
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 120) { ctx.strokeStyle = `rgba(${a.c},${(1 - d / 120) * .35})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 170) { ctx.strokeStyle = `rgba(255,255,255,${(1 - dm / 170) * .45})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke(); }
        ctx.fillStyle = `rgba(${a.c},.9)`; ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fill();
      }
      raf = vis ? requestAnimationFrame(tick) : 0;
    };
    const pos = (x, y) => { const r = host.getBoundingClientRect(); mouse = { x: x - r.left, y: y - r.top }; };
    host.addEventListener('pointermove', e => pos(e.clientX, e.clientY), { passive: true });
    host.addEventListener('pointerleave', () => { mouse = { x: -9999, y: -9999 }; });
    host.addEventListener('touchmove', e => pos(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    addEventListener('resize', size);
    new IntersectionObserver(es => { vis = es[0].isIntersecting && !document.hidden; if (vis && !raf) raf = requestAnimationFrame(tick); }).observe(host);
    size(); raf = requestAnimationFrame(tick);
  }

  /* ---------------- growth tree ---------------- */
  $$('[data-tree]').forEach(t => {
    const leaves = $$('.lf', t), infos = $$('.ti', t), planted = $('.planted', t), countEl = $('[data-count]', t);
    const pick = i => {
      leaves.forEach(l => l.classList.toggle('is-on', +l.dataset.i === i));
      infos.forEach(x => {
        const on = +x.dataset.i === i;
        x.classList.toggle('is-on', on);
        if (on && !reduce) x.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
      });
    };
    leaves.forEach(l => {
      l.addEventListener('click', () => pick(+l.dataset.i));
      l.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(+l.dataset.i); } });
      if (fine) l.addEventListener('pointerenter', () => pick(+l.dataset.i));
    });
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { t.classList.add('grown'); io.disconnect(); } }, { threshold: 0.35 });
      io.observe(t);
    } else t.classList.add('grown');
    // planting: small leaves along the branches; the count is kept for this visitor only
    const NS = 'http://www.w3.org/2000/svg';
    const branches = $$('.br', t);
    const cols = ['#0e7c7b', '#c9a227', '#196f3d', '#b03a2e', '#1f4e79', '#6c3483'];
    const plant = (animate) => {
      const br = branches[Math.floor(Math.random() * branches.length)];
      const len = br.getTotalLength(), pt = br.getPointAtLength(len * (.35 + Math.random() * .6));
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      const e = document.createElementNS(NS, 'ellipse');
      e.setAttribute('rx', 11); e.setAttribute('ry', 6);
      e.setAttribute('transform', `rotate(${Math.round(Math.random() * 180 - 90)}) translate(0 ${-8 + Math.random() * 16})`);
      e.setAttribute('fill', cols[Math.floor(Math.random() * cols.length)]);
      e.setAttribute('class', 'pl');
      g.appendChild(e); planted.appendChild(g);
      if (animate && !reduce) e.animate([{ transform: e.getAttribute('transform') + ' scale(0)', opacity: 0 }, { transform: e.getAttribute('transform') + ' scale(1.5)', opacity: 1, offset: .7 }, { transform: e.getAttribute('transform') + ' scale(1)', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    };
    let n = 0;
    try { n = Math.min(60, parseInt(localStorage.getItem('takamul-leaves') || '0', 10) || 0); } catch (e) { /* storage blocked */ }
    for (let i = 0; i < n; i++) plant(false);
    countEl.textContent = n;
    $('[data-plant]', t).addEventListener('click', e => {
      n += 1; plant(true); countEl.textContent = n;
      try { localStorage.setItem('takamul-leaves', String(n)); } catch (err) { /* storage blocked */ }
      if (!reduce) burst(e.currentTarget);
    });
  });

  /* ---------------- kinetic words: speed follows scrolling ---------------- */
  const rows = $$('.kin-row');
  if (rows.length && !reduce) {
    let last = scrollY, boost = 0, off = 0;
    const loop = () => {
      const v = scrollY - last; last = scrollY;
      boost = boost * .92 + Math.abs(v) * .08;
      off += .45 + boost * .6;
      rows.forEach(r => {
        const tr = r.firstElementChild, w = tr.scrollWidth / 2 || 1;
        // the track holds the words twice; shift within [0, w) so a copy always fills the row
        const x = +r.dataset.dir === 1 ? off % w : w - (off % w);
        tr.style.transform = `translateX(${document.documentElement.dir === 'ltr' ? -x : x}px)`;
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------------- reading highlight (word by word) ---------------- */
  $$('[data-words]').forEach(p => {
    if (reduce) return;
    const words = p.textContent.trim().split(/\s+/);
    p.innerHTML = words.map(w => `<span class="w">${w.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>`).join(' ');
    const spans = $$('.w', p);
    let t = false;
    const upd = () => {
      const r = p.getBoundingClientRect();
      const prog = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (r.height + innerHeight * .35)));
      const k = Math.round(prog * spans.length);
      spans.forEach((s, i) => s.classList.toggle('lit', i < k));
      t = false;
    };
    addEventListener('scroll', () => { if (!t) { t = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  });

  /* ---------------- back-to-top progress ring ---------------- */
  const top = $('.totop');
  if (top) {
    let t = false;
    const upd = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      top.style.setProperty('--p', (max > 0 ? scrollY / max * 100 : 0).toFixed(1) + '%');
      t = false;
    };
    addEventListener('scroll', () => { if (!t) { t = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }
})();
