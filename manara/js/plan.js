/* MANARA («منارة») — Rollout plan (plan.html).
   Classic script. Builds the approvals checklist (DOM nodes + textContent only, saved in localStorage when allowed),
   starts the roadmap animation when it scrolls into view (CSS transform/opacity only; reduced motion = static). */
(function () {
  'use strict';
  var M = window.Manara, L = M.L;
  function T(ar, en) { return { ar: ar, en: en }; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function $(s) { return document.getElementById(s); }
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

  var AP = [
    { t: T('إذن الطيران (هيئة الطيران المدني القطرية، QCAA)', 'Aviation permission (Qatar Civil Aviation Authority, QCAA)'),
      d: T('ترخيص المشغّل وتسجيل الطائرة وإذن لكل موقع وتحليق بموجب القانون 10 لسنة 2026. اللوائح التنفيذية لم تصدر وقت الكتابة: يُؤكَّد مع الهيئة.', 'Operator licence, aircraft registration and a permit for each site and flight under Law No. 10 of 2026. Executive regulations were still to come when written: to be confirmed with the authority.') },
    { t: T('الخصوصية وحماية البيانات', 'Privacy and data protection'),
      d: T('تقييم أثر على الخصوصية، وموافقة السكان، ومدة حفظ وضوابط وصول. القانون 13 لسنة 2016 وإرشادات الجهة المختصة: يُؤكَّد مع الجهة.', 'A privacy impact assessment, resident consent, a retention period and access controls. Law No. 13 of 2016 and the competent body\'s guidance: to be confirmed with the authority.') },
    { t: T('الدفاع المدني', 'Civil Defence'),
      d: T('الاتفاق على دور منارة (تنبيه وبطاقة تسليم فقط)، وبروتوكول التشغيل، وأن القرار للدفاع المدني.', 'Agree MANARA\'s role (alert and hand-off card only), the operating protocol, and that Civil Defence decides.') },
    { t: T('وزارة الداخلية و999', 'Ministry of Interior and 999'),
      d: T('أي ربط بغرفة العمليات يحتاج اتفاقًا وموافقة. 999 يبقى المُرسِل ولا نتصل به آليًا.', 'Any link to the operations room needs an agreement and approval. 999 stays the dispatcher and we never call it automatically.') },
    { t: T('الأخلاقيات والمدرسة والوزارة', 'Ethics, school and ministry'),
      d: T('مراجعة أخلاقية لمشروع طلابي، وموافقة المدرسة ووزارة التربية والتعليم، وموافقة أولياء الأمور عند إشراك قاصرين.', 'An ethics review for a student project, approval from the school and the Ministry of Education, and parents\' consent where minors take part.') },
    { t: T('أصحاب المباني والسكان', 'Building owners and residents'),
      d: T('موافقة مكتوبة على تركيب الحساسات، بلغات السكان، مع حق الانسحاب.', 'Written consent to install sensors, in residents\' languages, with the right to opt out.') },
    { t: T('التأمين والمسؤولية', 'Insurance and liability'),
      d: T('تغطية تأمينية واتفاق يحدّد المسؤوليات؛ الصياغة القانونية تُؤكَّد مع مستشار قانوني.', 'Insurance cover and an agreement that sets responsibilities; the legal wording to be confirmed with a lawyer.') }
  ];

  function renderAp() {
    var box = $('ap'), saved = {};
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { saved[i.getAttribute('data-k')] = i.checked; });
    box.textContent = '';
    AP.forEach(function (a, i) {
      var lab = el('label'), inp = el('input'); inp.type = 'checkbox'; inp.setAttribute('data-k', 'a' + i);
      inp.checked = saved['a' + i] != null ? saved['a' + i] : sget('manara-plan-a' + i) === '1';
      inp.addEventListener('change', function () { sset('manara-plan-a' + i, inp.checked ? '1' : '0'); count(); });
      var s = el('span'); s.appendChild(el('b', null, L(a.t))); s.appendChild(el('span', null, L(a.d)));
      lab.appendChild(inp); lab.appendChild(s); box.appendChild(lab);
    });
    count();
  }
  function count() {
    var ins = $('ap').querySelectorAll('input'), n = 0;
    Array.prototype.forEach.call(ins, function (i) { if (i.checked) n++; });
    $('ap-count').textContent = n + ' / ' + ins.length + ' ' + L(T('مؤكَّد', 'confirmed'));
    $('ap-meter').style.transform = 'scaleX(' + (ins.length ? n / ins.length : 0) + ')';
  }

  function startRoadmap() {
    var rm = $('rm'); if (!rm) return;
    if (M.reduce || !('IntersectionObserver' in window)) { rm.classList.add('go'); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { rm.classList.add('go'); io.disconnect(); } }); }, { threshold: 0.25 });
    io.observe(rm);
  }

  function init() {
    renderAp(); startRoadmap();
    window.addEventListener('langchange', renderAp);
    window.__planReady = true;
  }
  if (window.__manaraReady) init(); else window.addEventListener('DOMContentLoaded', init);
})();
