// yb-checklist: the team checklist of «مشروع ينابيع» (window.YBChecklist). One renderer for the request tracker on
// register.html and the team card on account.html. Input = the object returned by yb_track_request().team or
// yb_team_checklist() (supabase/migrations/0005_yb_register_fee.sql): statuses and counts only, never a child's name.
// Classic script (IIFE), no dependencies, no network.
(function () {
  'use strict';
  var GROUPS = ['أ', 'ب', 'ج'];
  var COMP = { football: 'كرة القدم', chess: 'الشطرنج', hifz: 'الحفظ', fahm: 'الفهم', projects: 'المشاريع', workshops: 'الورش واللقاءات', registration: 'التسجيل' };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function when(iso, withTime) {
    try {
      var d = new Date(iso);
      if (isNaN(d)) return '';
      var o = { weekday: 'long', day: 'numeric', month: 'long' };
      if (withTime) { o.hour = 'numeric'; o.minute = '2-digit'; }
      return d.toLocaleString('ar-u-nu-latn', o);
    } catch (e) { return ''; }
  }
  function fmtRef(ref) { return ref ? 'YN-' + String(ref).slice(0, 4) + '-' + String(ref).slice(4) : ''; }
  function hasGroup(c) { return c.group !== null && c.group !== undefined && !!GROUPS[c.group]; }

  // the steps: [key, title, state ('done' | 'wait' | 'bad' | 'info'), detail]
  function steps(c, o) {
    o = o || {};
    var out = [];
    out.push(['sent', 'أُرسل الطلب', c.status === 'draft' ? 'wait' : 'done', c.status === 'draft' ? 'الطلب مسودة لم تُرسل بعد.' : (c.created_at ? 'في ' + when(c.created_at) : '')]);
    // the place among the 12 teams (migration 0006): only when the server reports it
    if (c.waitlist === true || c.waitlist === false || (c.waitlist === null && 'wait_pos' in c)) {
      out.push(['place', 'مكان الفريق بين الفرق الـ12', c.waitlist === false ? 'done' : 'wait',
        c.waitlist === false ? 'للفريق مكان بين الفرق المشاركة.'
          : c.waitlist === true ? 'اكتمل العدد، ففريقكم في قائمة الاحتياط' + (c.wait_pos ? ' (رقم ' + c.wait_pos + ')' : '') + '. ينتقل تلقائيًا إلى المسابقة إذا خلا مكان، وتصلكم رسالة.'
          : 'يُحجز المكان عند إرسال الطلب للمراجعة.']);
    }
    var fee = c.fee === 'paid' ? ['done', 'سُجّل سداد رسوم الفريق.']
      : c.fee === 'waived' ? ['done', 'أعفت الإدارة الفريق من الرسوم.']
      : ['wait', 'لم يُسجَّل السداد بعد. تُسلَّم الرسوم لمسؤول التسجيل مقابل إيصال.'];
    out.push(['fee', 'رسوم الاشتراك', fee[0], fee[1]]);
    var minors = +c.minors || 0, cons = +c.consents || 0;
    out.push(['consent', 'موافقات أولياء الأمور', minors === 0 || cons >= minors ? 'done' : 'wait',
      minors === 0 ? 'لا يوجد في الفريق من يحتاج إلى موافقة.' : 'استُلمت ' + cons + ' من ' + minors + (cons >= minors ? '.' : '. نموذج موقّع لكل عضو قاصر.')]);
    // who represents the team (c-form f-nom, migration 0006): which roles are filled, never who
    if (c.roles && typeof c.roles === 'object') {
      var need = ['reciter', 'reserve', 'chess'].filter(function (k) { return !c.roles[k]; });
      var W = { reciter: 'المرشح الأساسي للتسميع', reserve: 'المرشح الاحتياطي للتسميع', chess: 'لاعب الشطرنج' };
      out.push(['roles', 'المرشحون للتسميع والشطرنج', need.length ? 'wait' : 'done',
        need.length ? 'لم يُحدَّد بعد: ' + need.map(function (k) { return W[k]; }).join('، ') + '.' : 'حُدّد المرشحان للتسميع ولاعب الشطرنج.']);
    }
    var st = c.status;
    var rev = st === 'approved' ? ['done', 'فريقكم معتمد في المسابقة.']
      : st === 'returned' ? ['bad', 'طلبت الإدارة تعديلًا على الطلب.']
      : st === 'rejected' ? ['bad', 'لم يُقبل طلب التسجيل.']
      : st === 'draft' ? ['wait', 'يُعتمد الفريق بعد إرساله ومراجعة البيانات والرسوم والموافقات.']
      : ['wait', 'قيد المراجعة. يُعتمد الفريق بعد مراجعة البيانات والرسوم والموافقات.'];
    out.push(['review', 'اعتماد التسجيل', rev[0], rev[1]]);
    out.push(['draw', 'قرعة كرة القدم', hasGroup(c) ? 'done' : 'wait',
      hasGroup(c) ? 'فريقكم في المجموعة ' + GROUPS[c.group] + '.' : 'تُعلن المجموعات بعد اعتماد الفرق.']);
    if (c.next && c.next.title) {
      out.push(['next', 'الموعد القادم', 'info', [c.next.title, when(c.next.starts_at, true), c.next.place, COMP[c.next.competition]].filter(Boolean).join(' · ')]);
    }
    if (o.claim && !c.claimed && st !== 'rejected') {
      out.push(['claim', 'حساب قائد الفريق', 'wait', 'اربط الفريق بحساب قائد لتدير الأعضاء وتصلك التنبيهات.']);
    }
    return out;
  }

  // render(c, {claim: bool, claimHref: string}) -> <section class="ybc">
  function render(c, o) {
    o = o || {};
    var list = steps(c, o);
    var core = list.filter(function (s) { return ['sent', 'place', 'fee', 'consent', 'roles', 'review', 'draw'].indexOf(s[0]) >= 0; });
    var done = core.filter(function (s) { return s[2] === 'done'; }).length;
    var box = el('section', 'ybc');
    box.setAttribute('aria-label', 'قائمة متابعة الطلب');
    var head = el('div', 'ybc-h');
    var ring = el('span', 'ybc-ring');
    ring.style.setProperty('--p', String(Math.round(done / core.length * 100)));
    ring.setAttribute('aria-hidden', 'true');
    ring.append(el('b', '', String(done)), el('small', '', 'من ' + core.length));
    var t = el('div', 'ybc-t');
    t.append(el('b', '', c.name || ''), el('small', '', [c.area, c.ref ? 'رقم الطلب ' + fmtRef(c.ref) : ''].filter(Boolean).join(' · ')));
    head.append(ring, t);
    var p = el('p', 'sr-only', 'اكتمل ' + done + ' من ' + core.length + ' خطوات.');
    var ol = el('ol', 'ybc-l');
    list.forEach(function (s) {
      var li = el('li', 'ybc-s is-' + s[2]);
      li.setAttribute('data-step', s[0]);
      var mark = el('span', 'ybc-m');
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = s[2] === 'done' ? '✓' : s[2] === 'bad' ? '!' : s[2] === 'info' ? '•' : '…';
      var tx = el('div', 'ybc-x');
      tx.append(el('b', '', s[1]));
      var state = s[2] === 'done' ? 'مكتمل' : s[2] === 'bad' ? 'يحتاج إلى إجراء' : s[2] === 'info' ? '' : 'بانتظار';
      if (state) tx.append(el('span', 'sr-only', ' (' + state + ') '));
      if (s[3]) tx.append(el('small', '', s[3]));
      if (s[0] === 'review' && c.note) tx.append(el('q', 'ybc-note', c.note));
      if (s[0] === 'claim' && o.claimHref) {
        var a = el('a', 'ybc-a', 'أنشئ حساب قائد واربط الفريق');
        a.href = o.claimHref;
        tx.append(a);
      }
      li.append(mark, tx);
      ol.append(li);
    });
    box.append(head, p, ol);
    return box;
  }

  window.YBChecklist = { render: render, steps: steps, fmtRef: fmtRef, GROUPS: GROUPS };
})();
