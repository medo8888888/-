// Custom "leaf" cursor: a leaf (from the logo) that sways with movement, a trailing
// ring that reacts to what is under the pointer, magnetic buttons and a leaf burst
// on click. Only for mouse/trackpad users who haven't asked for reduced motion.
(() => {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches || calm.matches) return;

  const root = document.documentElement;
  const LEAF = '<svg viewBox="0 0 24 32" aria-hidden="true"><defs><linearGradient id="cur-g" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="#5bb04f"/><stop offset=".55" stop-color="#2f8a3c"/><stop offset="1" stop-color="#d6a12e"/></linearGradient></defs>'
    + '<path d="M12 1C20 8 21 21 12 31 3 21 4 8 12 1Z" fill="url(#cur-g)" stroke="rgba(255,255,255,.85)" stroke-width="1.3"/>'
    + '<path d="M12 4v25M12 13l4-3M12 18l-4-3M12 23l4-3" stroke="rgba(255,255,255,.75)" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>';

  const wrap = document.createElement('div');
  wrap.className = 'cursor';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `<div class="cursor-ring"><span class="cursor-label"></span></div><div class="cursor-leaf">${LEAF}</div>`;
  document.body.appendChild(wrap);
  const ring = wrap.firstElementChild, label = ring.firstElementChild, leaf = wrap.lastElementChild;
  const ac = new AbortController();
  const opt = { passive: true, signal: ac.signal };

  // what the pointer is over -> cursor state
  const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]';
  const DRAG = 'canvas[data-globe]';
  const LINK = 'a, button, summary, label, [role="button"], .toc-item, .chip-link';
  const DARK = '.init-card, .cta, .footer, .chat-head, .btn-ai, .tab-ai, .sheet-wide.ai, .chat-send';
  const DARK_IN_LIGHT = '.btn-primary, .flag, .msg.user, .sec-num, .toc-num, .pill-active, .links a.active';
  const LABELS = [
    [DRAG, 'Drag'],
    ['.init-card', 'Explore'],
    ['.toc-item', 'Open'],
    ['[data-open-chat]', 'Ask'],
  ];
  const MAGNETIC = '.btn, .btn-ai, .chat-fab, .icon-btn, .chat-send, .totop';

  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, px = x, sway = 0, shown = false, magnet = null;

  const setState = target => {
    const el = target instanceof Element ? target : null;
    const text = el && el.closest(TEXT);
    wrap.classList.toggle('is-text', !!text);
    wrap.classList.toggle('is-drag', !!(el && el.closest(DRAG)));
    wrap.classList.toggle('is-link', !text && !!(el && el.closest(LINK)));
    const dark = !!el && (!!el.closest(DARK) || (root.dataset.theme !== 'dark' && !!el.closest(DARK_IN_LIGHT)));
    wrap.classList.toggle('is-dark', dark);
    let txt = '';
    if (el) for (const [sel, t] of LABELS) { if (el.closest(sel)) { txt = t; break; } }
    label.textContent = txt;
    wrap.classList.toggle('has-label', !!txt);

    const m = el && el.closest(MAGNETIC);
    if (m !== magnet) { releaseMagnet(); magnet = m; }
  };
  const releaseMagnet = () => { if (magnet) { magnet.style.translate = ''; magnet = null; } };
  const hide = () => {
    shown = false;
    wrap.classList.remove('on');
    root.classList.remove('has-cursor'); // give the system cursor back while ours is hidden
    releaseMagnet();
  };

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    x = e.clientX; y = e.clientY;
    if (!shown) { shown = true; rx = x; ry = y; wrap.classList.add('on'); root.classList.add('has-cursor'); setState(e.target); }
    wake();
    if (magnet) {
      const r = magnet.getBoundingClientRect();
      const dx = (x - (r.left + r.width / 2)) / r.width, dy = (y - (r.top + r.height / 2)) / r.height;
      magnet.style.translate = `${(dx * 10).toFixed(1)}px ${(dy * 8).toFixed(1)}px`;
    }
  }, opt);
  addEventListener('pointerover', e => setState(e.target), opt);
  document.documentElement.addEventListener('pointerleave', hide, opt);
  addEventListener('blur', hide, opt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); }, opt);
  addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    wrap.classList.add('is-down');
    if (!wrap.classList.contains('is-text')) burst(e.clientX, e.clientY);
  }, opt);
  addEventListener('pointerup', () => wrap.classList.remove('is-down'), opt);
  // keep the state right after the DOM changes under a still pointer (menus, chat)
  addEventListener('scroll', () => {
    if (!shown) return;
    const el = document.elementFromPoint(x, y);
    if (el) setState(el);
    spotlight();
  }, opt);

  const heroes = [...document.querySelectorAll('.hero')];
  const spots = heroes.map(h => {
    const sp = document.createElement('div');
    sp.className = 'hero-spot';
    sp.setAttribute('aria-hidden', 'true');
    const bg = h.querySelector('.hero-bg');
    bg ? bg.after(sp) : h.prepend(sp);
    return sp;
  });
  const spotlight = () => {
    heroes.forEach((h, i) => {
      const r = h.getBoundingClientRect();
      const inside = shown && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      spots[i].classList.toggle('on', inside);
      if (inside) spots[i].style.transform = `translate3d(${(x - r.left).toFixed(1)}px, ${(y - r.top).toFixed(1)}px, 0)`;
    });
  };

  let running = false, lastX = x, lastY = y;
  const wake = () => { if (!running && wrap.isConnected) { running = true; requestAnimationFrame(tick); } };
  const tick = () => {
    if (!wrap.isConnected) { running = false; return; }
    rx += (x - rx) * 0.2;
    ry += (y - ry) * 0.2;
    const vx = x - px; px = x;
    sway += (Math.max(-28, Math.min(28, vx * 2.2)) - sway) * 0.12;
    leaf.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${-32 + sway}deg)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    if (x !== lastX || y !== lastY) { spotlight(); lastX = x; lastY = y; }
    const settled = Math.abs(x - rx) < 0.1 && Math.abs(y - ry) < 0.1 && Math.abs(sway) < 0.05;
    if (settled) { running = false; return; } // sleep until the next pointermove
    requestAnimationFrame(tick);
  };

  // little leaves fly out on click
  const COLORS = ['#5bb04f', '#2f8a3c', '#d6a12e', '#c9772a', '#8cc46a'];
  function burst(cx, cy) {
    for (let i = 0; i < 7; i++) {
      const p = document.createElement('span');
      p.className = 'cursor-bit';
      p.style.background = COLORS[i % COLORS.length];
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      wrap.appendChild(p);
      const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.6;
      const d = 26 + Math.random() * 26;
      const rot = (Math.random() * 360) | 0;
      p.animate([
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 14}px)) rotate(${rot + 160}deg) scale(.4)`, opacity: 0 },
      ], { duration: 650 + Math.random() * 250, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
    }
  }

  // user turns on reduced motion or switches to touch: give the system cursor back
  const off = () => {
    if (calm.matches || !fine.matches) {
      ac.abort();
      hide();
      spots.forEach(sp => sp.remove());
      wrap.remove();
    }
  };
  [calm, fine].forEach(mq => (mq.addEventListener ? mq.addEventListener('change', off) : mq.addListener(off)));
})();
