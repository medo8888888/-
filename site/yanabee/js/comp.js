// Competition pages: live status (dates of competition.txt c-timeline), timeline "now", fold-all, poster print.
// Classic script; reads the visitor's clock only. Nothing is sent anywhere.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const day = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const DAY = 864e5;
  const today = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  const days = (a, b) => Math.round((b - a) / DAY);
  const unit = n => (n === 1 ? 'يوم' : n === 2 ? 'يومان' : n >= 3 && n <= 10 ? 'أيام' : 'يومًا');

  // Phases from the plan: registration 1–14 Nov, competition 15 Nov – 25 Jan, results until the gala on 31 Jan.
  const P = [
    { k: 'before', to: '2026-10-31', t: 'قريبًا: المسابقة الأولى (سورة الصف)', s: 'يبدأ التسجيل 1 نوفمبر 2026', next: '2026-11-01', nt: 'على فتح التسجيل' },
    { k: 'open', to: '2026-11-14', t: 'التسجيل مفتوح الآن', s: 'سجّل فريقك من 5 إلى 7 أعضاء · الانطلاق 15 نوفمبر 2026', next: '2026-11-15', nt: 'على الانطلاق' },
    { k: 'run', to: '2027-01-25', t: 'المسابقة جارية', s: 'حفظ وفهم وتطبيق ودوري كرة القدم والشطرنج · الختام 25 يناير 2027', next: '2027-01-25', nt: 'على الختام' },
    { k: 'results', to: '2027-01-30', t: 'إعلان النتائج والتحكيم', s: 'حفل التكريم 31 يناير 2027', next: '2027-01-31', nt: 'على حفل التكريم' },
    { k: 'gala', to: '2027-01-31', t: 'اليوم حفل التكريم', s: 'تكريم الفرق الفائزة والمتميزين', next: '', nt: '' },
    { k: 'after', to: '9999-12-31', t: 'اختُتمت المسابقة الأولى', s: 'شكرًا لكل الفرق المشاركة', next: '', nt: '' },
  ];
  const phase = P.find(p => today <= day(p.to));

  $$('[data-comp-status]').forEach(box => {
    box.dataset.phase = phase.k;
    const q = s => box.querySelector(s);
    q('[data-cs-title]').textContent = phase.t;
    q('[data-cs-sub]').textContent = phase.s;
    const cnt = q('[data-cs-count]');
    if (cnt && phase.next) {
      const n = days(today, day(phase.next));
      if (n > 0) {
        q('[data-cs-n]').textContent = n;
        q('[data-cs-unit]').textContent = unit(n) + ' ' + phase.nt;
        cnt.hidden = false;
      }
    }
  });

  // Registered teams (yb_registration_stats, migration 0005: counts only). Only when the backend is configured;
  // yb-api.js loads after this file, so wait for the page to finish loading.
  const teamsCount = async () => {
    const boxes = $$('[data-cs-teams]');
    const YB = window.YB;
    if (!boxes.length || !YB || !YB.configured || !YB.rpc) return;
    // registration news only while it matters (before and during registration), and never on the read-only board
    if (!(phase.k === 'before' || phase.k === 'open') || document.getElementById('tn-app')) return;
    const r = await YB.rpc('yb_registration_stats', {});
    const d = r && r.ok && r.data;
    if (!d || typeof d.registered !== 'number' || !d.target) return;
    const n = d.registered, t = d.target;
    const w = typeof d.waiting === 'number' ? d.waiting : 0;
    const txt = n >= t ? `اكتمل العدد (${t} فريقًا)${w ? ` · ${w} في قائمة الاحتياط` : ''} · التسجيل الآن في قائمة الاحتياط`
      : n === 0 ? `لم يُسجَّل أي فريق بعد · المستهدف ${t} فريقًا` : `سُجّل ${n} من ${t} فريقًا${d.approved ? ` · اعتُمد ${d.approved}` : ''} · بقي ${t - n}`;
    boxes.forEach(b => {
      b.querySelector('[data-cs-teams-t]').textContent = txt;
      b.querySelector('[data-cs-bar]').style.width = Math.min(100, Math.round(n / t * 100)) + '%';
      b.hidden = false;
    });
  };
  if (document.readyState === 'complete') teamsCount(); else addEventListener('load', () => { teamsCount(); });

  // Timeline: mark finished and current steps.
  $$('[data-timeline] .tl-step').forEach(li => {
    const to = li.dataset.to && day(li.dataset.to);
    const from = li.dataset.from ? day(li.dataset.from) : null;
    if (to && today > to) li.classList.add('is-past');
    else if ((!from || today >= from) && (!to || today <= to)) {
      li.classList.add('is-now');
      const now = li.querySelector('.tl-now');
      if (now) now.hidden = false;
    }
  });

  // Open / close every chapter of a section.
  $$('[data-fold-all]').forEach(b => {
    const scope = b.closest('section') || document;
    const label = b.querySelector('span');
    const sync = () => {
      const all = $$('details.fold', scope);
      const open = all.length > 0 && all.every(d => d.open);
      if (label) label.textContent = open ? 'اطوِ كل الفصول' : 'افتح كل الفصول';
      b.setAttribute('aria-pressed', open ? 'true' : 'false');
    };
    b.addEventListener('click', () => {
      const all = $$('details.fold', scope);
      const open = !all.every(d => d.open);
      all.forEach(d => { d.open = open; });
      sync();
    });
    $$('details.fold', scope).forEach(d => d.addEventListener('toggle', sync));
    sync();
  });

  // Print one part of the page only (body class picks it in comp.css @media print).
  const printOnly = cls => {
    document.body.classList.add(cls);
    const off = () => { document.body.classList.remove(cls); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  };
  window.__yanabeePrintOnly = printOnly;
  $$('[data-print-poster]').forEach(b => b.addEventListener('click', () => printOnly('print-poster')));
})();
