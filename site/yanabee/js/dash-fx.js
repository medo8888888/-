/* ينابيع: motion for the signed-in dashboard (account.html). Small, dependency-free helpers used by js/account.js.
   Everything here is decoration: with «تقليل الحركة» set on the device (prefers-reduced-motion) nothing moves, numbers
   and rings show their final value at once, and no confetti is made. Nothing is ever left hidden: a card that waits
   for its entrance is shown as soon as it reaches the screen, and always when printing.
   window.YBFx = { reduce(), reveal(els), countUp(el, text), ring(pct, label), confetti(opts), pulse(el, cls),
                   dockPill(bar), countdown(el, date, onEnd) } */
(function () {
  'use strict';
  var D = document, W = window;
  var mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduce() { return !!(mq && mq.matches); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  var SVG = 'http://www.w3.org/2000/svg';

  /* ---- numbers that count up: the first number in the text runs from 0 ("5 من 7", "85.5 من 100", "12") */
  function countUp(el, text, ms) {
    text = String(text);
    if (el._fx) { W.cancelAnimationFrame(el._fx); el._fx = 0; }
    var m = /^(\D*?)(\d+(?:\.\d+)?)([\s\S]*)$/.exec(text);
    var to = m ? parseFloat(m[2]) : 0;
    if (!m || !to || reduce() || D.hidden || !W.requestAnimationFrame) { el.textContent = text; return; }
    if (!el.isConnected) { el.textContent = text; el.setAttribute('data-fxn', text); return; }   // runs when it is revealed
    el.removeAttribute('data-fxn');
    var dec = (m[2].split('.')[1] || '').length, t0 = 0, dur = ms || 700;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      el.textContent = p >= 1 ? text : m[1] + (to * ease(p)).toFixed(dec) + m[3];
      el._fx = p < 1 ? W.requestAnimationFrame(step) : 0;
    }
    el.textContent = m[1] + (0).toFixed(dec) + m[3];
    el._fx = W.requestAnimationFrame(step);
  }

  /* ---- entrance: cards rise in as they reach the screen (once per call) */
  function show(el, i) {
    el.style.setProperty('--fx-d', Math.min(i, 6) * 70 + 'ms');
    el.classList.add('fx-in');
    Array.prototype.forEach.call(el.querySelectorAll('[data-fxn]'), function (n) { countUp(n, n.getAttribute('data-fxn')); });
    if (el.hasAttribute('data-fxn')) countUp(el, el.getAttribute('data-fxn'));
    W.setTimeout(function () { el.classList.remove('fx-rise', 'fx-in'); el.style.removeProperty('--fx-d'); }, 1200);
  }
  function reveal(els) {
    els = Array.prototype.filter.call(els || [], function (e) { return e && e.classList && !e.classList.contains('fx-rise'); });
    if (!els.length) return;
    if (reduce() || !W.IntersectionObserver) return;
    var io = new W.IntersectionObserver(function (es) {
      var i = 0;
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); show(e.target, i++); } });
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.01 });
    els.forEach(function (el) { el.classList.add('fx-rise'); io.observe(el); });
  }

  /* ---- a progress ring: ring(62, 'label') -> <svg>; .set(pct) moves it */
  function ring(pct, label) {
    var s = D.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 36 36'); s.setAttribute('class', 'fx-ring');
    if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); } else s.setAttribute('aria-hidden', 'true');
    var a = D.createElementNS(SVG, 'circle'), b = D.createElementNS(SVG, 'circle');
    [a, b].forEach(function (c) { c.setAttribute('cx', '18'); c.setAttribute('cy', '18'); c.setAttribute('r', '15.5'); c.setAttribute('fill', 'none'); c.setAttribute('pathLength', '100'); });
    a.setAttribute('class', 'fx-ring-t'); b.setAttribute('class', 'fx-ring-v');
    b.setAttribute('stroke-dasharray', '0 100');
    s.appendChild(a); s.appendChild(b);
    s.set = function (p) {
      p = Math.max(0, Math.min(100, Number(p) || 0));
      var go = function () { b.setAttribute('stroke-dasharray', p + ' 100'); };
      if (reduce() || !W.requestAnimationFrame) go(); else W.requestAnimationFrame(function () { W.requestAnimationFrame(go); });
      s.classList.toggle('full', p >= 100);
    };
    s.set(pct);
    return s;
  }

  /* ---- confetti: a short burst, then it removes itself */
  function confetti(o) {
    if (reduce()) return false;
    o = o || {};
    var box = D.createElement('div'), n = o.count || 48, i, p;
    var colors = o.colors || ['#13b5ad', '#2c63d6', '#d9762a', '#2f9157', '#f2c14e', '#c03668'];
    box.className = 'fx-confetti'; box.setAttribute('aria-hidden', 'true');
    for (i = 0; i < n; i++) {
      p = D.createElement('i');
      p.style.cssText = '--x:' + (Math.random() * 100).toFixed(1) + '%;--dx:' + (Math.random() * 30 - 15).toFixed(1) + 'vw;--r:' + Math.round(Math.random() * 900 - 450) +
        'deg;--t:' + (1.5 + Math.random() * 1.3).toFixed(2) + 's;--dl:' + (Math.random() * 0.4).toFixed(2) + 's;background:' + colors[i % colors.length] +
        (i % 3 === 0 ? ';border-radius:50%' : i % 3 === 1 ? ';width:6px;height:13px' : '');
      box.appendChild(p);
    }
    D.body.appendChild(box);
    W.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3400);
    return true;
  }

  /* ---- play a one-shot CSS animation class again */
  function pulse(el, cls) {
    if (!el || reduce()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    W.setTimeout(function () { el.classList.remove(cls); }, 1200);
  }

  /* ---- the phone bar: a line that slides to the open section */
  function dockPill(bar) {
    if (!bar || !W.MutationObserver) return;
    var pill = D.createElement('i');
    pill.className = 'a-dock-pill'; pill.setAttribute('aria-hidden', 'true');
    function place() {
      if (pill.parentNode !== bar) bar.appendChild(pill);
      var on = bar.querySelector('.a-dock-b.on');
      if (!on || !on.offsetWidth) { pill.style.opacity = '0'; return; }
      pill.style.opacity = '1';
      pill.style.transform = 'translateX(' + Math.round(on.offsetLeft + (on.offsetWidth - 36) / 2) + 'px)';
    }
    new W.MutationObserver(place).observe(bar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    W.addEventListener('resize', place);
    W.setTimeout(place, 0);
  }

  /* ---- a ticking countdown: days, hours, minutes, seconds. Returns stop(). */
  function countdown(el, date, onEnd) {
    var parts = [['d', 'يوم'], ['h', 'ساعة'], ['m', 'دقيقة'], ['s', 'ثانية']], cells = {}, timer = 0, quiet = reduce();
    el.textContent = '';
    parts.forEach(function (p) {
      if (quiet && p[0] === 's') return;
      var c = D.createElement('span'), b = D.createElement('b'), l = D.createElement('small');
      c.className = 'fx-cd-c'; l.textContent = p[1]; c.appendChild(b); c.appendChild(l); el.appendChild(c); cells[p[0]] = b;
    });
    function tick() {
      var left = Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
      var v = { d: Math.floor(left / 86400), h: Math.floor(left % 86400 / 3600), m: Math.floor(left % 3600 / 60), s: left % 60 };
      Object.keys(cells).forEach(function (k) {
        var t = String(v[k]).padStart(2, '0');
        if (cells[k].textContent !== t) { cells[k].textContent = t; if (cells[k].dataset.on) pulse(cells[k], 'fx-tick'); cells[k].dataset.on = '1'; }
      });
      if (left <= 0) { stop(); if (onEnd) onEnd(); }
    }
    function stop() { if (timer) { W.clearInterval(timer); timer = 0; } }
    tick();
    if (date.getTime() > Date.now()) timer = W.setInterval(tick, quiet ? 30000 : 1000);
    return stop;
  }

  W.YBFx = { reduce: reduce, reveal: reveal, countUp: countUp, ring: ring, confetti: confetti, pulse: pulse, dockPill: dockPill, countdown: countdown };
})();
