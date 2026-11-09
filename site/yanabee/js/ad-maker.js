// ad-maker — «خصّص الإعلان لجهتك» (competition.html, #c-ad).
// Fills the two blanks of the announcement (competition.txt c-ad: 'جمعية / مدرسة ..................' and
// '[رقم الواتساب]') live on the poster, copies the whole announcement as plain text, and resets it.
// Classic script. textContent only; no links, no sharing, nothing sent anywhere. The values stay in this browser
// (localStorage 'yanabee-ad-maker-v1'); the panel works when storage is blocked.
(function () {
  'use strict';
  var panel = document.querySelector('[data-ad-maker]');
  var poster = document.querySelector('#c-ad .poster');
  if (!panel || !poster) return;
  var spKind = poster.querySelector('[data-ad-kind]');
  var spOrg = poster.querySelector('[data-ad-org]');
  var spWa = poster.querySelector('[data-ad-wa]');
  if (!spKind || !spOrg || !spWa) return;

  var KEY = 'yanabee-ad-maker-v1';
  var ORIG = { kind: spKind.textContent, org: spOrg.textContent, wa: spWa.textContent }; // the document's own blanks
  var inOrg = panel.querySelector('[data-ad-in-org]');
  var inWa = panel.querySelector('[data-ad-in-wa]');
  var radios = Array.prototype.slice.call(panel.querySelectorAll('input[name="adm-kind"]'));
  var status = panel.querySelector('[data-ad-status]');
  var manual = panel.querySelector('[data-ad-manual]');
  var LRI = '⁦', PDI = '⁩';

  function load() {
    try {
      var s = window.localStorage.getItem(KEY);
      var o = s ? JSON.parse(s) : null;
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify({ kind: kind(), org: inOrg.value, wa: inWa.value })); } catch (e) { /* blocked */ }
  }
  function forget() { try { window.localStorage.removeItem(KEY); } catch (e) { /* blocked */ } }

  function kind() { var r = radios.filter(function (x) { return x.checked; })[0]; return r ? r.value : ''; }
  function cleanWa(v) { // Arabic-Indic digits -> 0-9, then only digits, spaces, + - ( )
    return String(v || '')
      .replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); })
      .replace(/[^0-9+()\- ]/g, '').slice(0, 20);
  }
  function orgVal() { return inOrg.value.replace(/\s+/g, ' ').trim(); }
  function waVal() { return cleanWa(inWa.value).replace(/\s+/g, ' ').trim(); }

  function apply() {
    var k = kind();
    spKind.textContent = k || ORIG.kind;
    var o = orgVal();
    spOrg.textContent = o || ORIG.org;
    spOrg.classList.toggle('is-filled', !!o);
    var w = waVal();
    spWa.textContent = w || ORIG.wa;
    if (w) spWa.setAttribute('dir', 'ltr'); else spWa.removeAttribute('dir');
    spWa.classList.toggle('is-filled', !!w);
    spKind.classList.toggle('is-filled', !!k);
  }

  // ---------- plain text of the poster, in reading order ----------
  function textOf(el) { // text of a node; a filled WhatsApp number is isolated left-to-right (LRI … PDI)
    var out = '';
    Array.prototype.forEach.call(el.childNodes, function (n) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType === 1) out += (n === spWa && spWa.hasAttribute('dir')) ? LRI + n.textContent + PDI : textOf(n);
    });
    return out;
  }
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function direct(li, cls) { // a direct child only, never a nested list's text
    for (var i = 0; i < li.children.length; i++) if (li.children[i].classList.contains(cls)) return li.children[i];
    return null;
  }
  function itemLine(li, bullet) {
    var l = direct(li, 'lbl'), b = direct(li, 'body');
    var lt = l ? norm(textOf(l)) : '', bt = b ? norm(textOf(b)) : '';
    return (bullet + (lt ? lt + ':' + (bt ? ' ' : '') : '') + bt).replace(/\s+$/, '');
  }
  function text() {
    var q = function (s) { var e = poster.querySelector(s); return e ? norm(textOf(e)) : ''; };
    var lines = [q('.poster-k'), q('.dp-ayah'), q('.poster-q'), q('.poster-lead')];
    Array.prototype.forEach.call(poster.querySelectorAll('.ad-part'), function (part) {
      lines.push('');
      var h = part.querySelector('h3');
      if (h) lines.push(norm(textOf(h)));
      var ul = part.querySelector('ul');
      if (!ul) return;
      Array.prototype.forEach.call(ul.children, function (li) {
        lines.push(itemLine(li, '• '));
        var sub = direct(li, 'sublist');
        if (sub) Array.prototype.forEach.call(sub.children, function (c) { lines.push(itemLine(c, '   ◦ ')); });
      });
    });
    return lines.join('\n');
  }

  // ---------- copy ----------
  function report(ok, t) {
    var gap = !orgVal() || !waVal();
    if (ok) {
      manual.hidden = true;
      status.textContent = 'نُسخ النص. الصقه في مجموعة الواتساب.' + (gap ? ' تنبيه: ما زال في النص فراغ لم يُملأ.' : '');
    } else {
      manual.value = t;
      manual.hidden = false;
      manual.focus();
      manual.select();
      status.textContent = 'لم يُنسخ تلقائيًا؛ حدّد النص وانسخه.' + (gap ? ' تنبيه: ما زال في النص فراغ لم يُملأ.' : '');
    }
  }
  function legacyCopy(t) {
    var ok = false, ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.insetInlineStart = '-9999px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    try { ta.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  panel.querySelector('[data-ad-copy]').addEventListener('click', function () {
    var t = text();
    var fallback = function () { report(legacyCopy(t), t); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { report(true, t); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  });

  panel.querySelector('[data-ad-reset]').addEventListener('click', function () {
    inOrg.value = ''; inWa.value = '';
    radios.forEach(function (r) { r.checked = r.value === ''; });
    apply();
    forget();
    manual.hidden = true;
    status.textContent = 'أُعيد النص الأصلي.';
  });

  // ---------- input ----------
  inOrg.addEventListener('input', function () { apply(); save(); });
  inWa.addEventListener('input', function () {
    var c = cleanWa(inWa.value);
    if (c !== inWa.value) inWa.value = c;
    apply(); save();
  });
  radios.forEach(function (r) { r.addEventListener('change', function () { apply(); save(); }); });

  var st = load();
  if (st) {
    if (typeof st.org === 'string') inOrg.value = st.org.slice(0, 80);
    if (typeof st.wa === 'string') inWa.value = cleanWa(st.wa);
    if (typeof st.kind === 'string') radios.forEach(function (r) { r.checked = r.value === st.kind; });
    if (!radios.some(function (r) { return r.checked; })) radios.forEach(function (r) { r.checked = r.value === ''; });
  }
  apply();
  panel.hidden = false;
  window.YanabeeAdMaker = { text: text }; // read-only helper (tests, other features)
})();
