// @i18n-self — carries its own ar/en/tr strings (tools/i18n.py copies it unchanged).
// Support page: donation basket, "on behalf of" / gift donations with a printable gift card,
// and the zakat calculator. Works with join.js through two hooks on the donate form:
// form._extraRows() → extra rows for the pledge sheet; form._afterSheet(done) → gift card.
(() => {
  const lang = (document.documentElement.lang || 'ar').slice(0, 2);
  const T = {
    ar: {
      locale: 'ar', remove: 'حذف', items: n => `${n} ${n === 1 ? 'برنامج' : 'برامج'}`, line: 'بند', total: 'إجمالي السلة',
      needAmount: 'اكتب مبلغاً أكبر من صفر', needProgram: 'اختر البرنامج', added: 'أُضيف إلى السلة ✓',
      forWhom: 'لمن هذا التبرع', self: 'عن نفسي', behalf: 'عن شخص آخر', gift: 'إهداء',
      giftTitle: 'بطاقة إهداء', giftLead: 'أُهديت إليك صدقةٌ باسمك', giftTo: 'إلى', giftFrom: 'من',
      giftBody: 'تبرّعٌ باسمك لدعم برامج «جمعية تكامل لبناء القيم والتنمية» في بناء القيم والتمكين والتكافل.',
      giftPrograms: 'البرامج المدعومة', zakatLine: 'الزكاة المحسوبة',
      zkNeedPrice: 'أدخل سعر غرام الذهب أو الفضة لمعرفة النصاب.', zkNeedGoldPrice: 'أدخل سعر غرام الذهب لاحتساب قيمة ذهبك.',
      zkNeedSilverPrice: 'أدخل سعر غرام الفضة لاحتساب قيمة فضتك.',
      zkBelow: 'لم يبلغ مالك النصاب، فلا تجب عليك الزكاة فيه حالياً. ويمكنك التصدق تطوعاً.',
      zkDue: 'بلغ مالك النصاب: تجب عليك الزكاة إذا مرّ عليه حول هجري كامل.',
      where: 'حيث الحاجة أكبر',
    },
    en: {
      locale: 'en', remove: 'Remove', items: n => `${n} ${n === 1 ? 'program' : 'programs'}`, line: 'Item', total: 'Basket total',
      needAmount: 'Enter an amount greater than zero', needProgram: 'Choose a program', added: 'Added to the basket ✓',
      forWhom: 'This donation is', self: 'On my own behalf', behalf: 'On behalf of someone else', gift: 'A gift',
      giftTitle: 'Gift card', giftLead: 'A charity gift has been given in your name', giftTo: 'To', giftFrom: 'From',
      giftBody: 'A donation in your name supporting the programs of the “Takamul Association for Building Values and Development” in values, empowerment and solidarity.',
      giftPrograms: 'Programs supported', zakatLine: 'Calculated zakat',
      zkNeedPrice: 'Enter the price of a gram of gold or silver to find the nisab.', zkNeedGoldPrice: 'Enter the gold price per gram to value your gold.',
      zkNeedSilverPrice: 'Enter the silver price per gram to value your silver.',
      zkBelow: 'Your wealth is below the nisab, so no zakat is due on it for now. You can still give voluntary charity.',
      zkDue: 'Your wealth has reached the nisab: zakat is due once a full lunar year has passed on it.',
      where: 'Where it is needed most',
    },
    tr: {
      locale: 'tr', remove: 'Kaldır', items: n => `${n} program`, line: 'Kalem', total: 'Sepet toplamı',
      needAmount: 'Sıfırdan büyük bir tutar girin', needProgram: 'Bir program seçin', added: 'Sepete eklendi ✓',
      forWhom: 'Bu bağış', self: 'Kendi adıma', behalf: 'Başkası adına', gift: 'Hediye',
      giftTitle: 'Hediye kartı', giftLead: 'Adınıza bir hayır hediyesi yapıldı', giftTo: 'Kime', giftFrom: 'Kimden',
      giftBody: 'Adınıza yapılan bu bağış, «Takamul Değerler İnşası ve Kalkınma Derneği»nin değer, güçlendirme ve dayanışma programlarını destekler.',
      giftPrograms: 'Desteklenen programlar', zakatLine: 'Hesaplanan zekât',
      zkNeedPrice: 'Nisabı bulmak için altın veya gümüşün gram fiyatını girin.', zkNeedGoldPrice: 'Altınınızın değerini hesaplamak için altının gram fiyatını girin.',
      zkNeedSilverPrice: 'Gümüşünüzün değerini hesaplamak için gümüşün gram fiyatını girin.',
      zkBelow: 'Malınız nisaba ulaşmadığı için şu an zekât gerekmiyor. Dilerseniz gönüllü sadaka verebilirsiniz.',
      zkDue: 'Malınız nisaba ulaştı: üzerinden tam bir kameri yıl geçtiyse zekât farzdır.',
      where: 'En çok ihtiyaç duyulan yere',
    },
  }[lang] || {};
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; };

  const form = document.querySelector('.donate-form');
  if (!form) return;
  const E = form.elements;
  const code = () => (E.currency.value || 'TRY').split(' ')[0];
  const money = (n, c) => new Intl.NumberFormat(T.locale, { maximumFractionDigits: 2 }).format(n) + ' ' + (c || code());

  /* ---------------- basket ---------------- */
  const basket = [];
  const box = form.querySelector('.basket-box');
  const list = form.querySelector('.basket-list');
  const setErr = (el, msg) => {
    const em = el.closest('label') && el.closest('label').querySelector('.err');
    if (em) em.textContent = msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  function render() {
    box.hidden = !basket.length;
    list.innerHTML = basket.map((b, i) =>
      `<li><span>${esc(b.program)}</span><b>${esc(money(b.amount))}</b><button type="button" class="basket-rm" data-rm="${i}" aria-label="${esc(T.remove)}">×</button></li>`).join('');
    form.querySelector('[data-basket-total]').textContent = money(basket.reduce((a, b) => a + b.amount, 0));
    form.querySelector('.basket-count').textContent = T.items(basket.length);
    // with items in the basket the single amount/program fields become optional
    E.amount.required = !basket.length;
    E.program.required = !basket.length;
    if (basket.length) { setErr(E.amount, ''); setErr(E.program, ''); }
  }
  function add(program, amount) {
    basket.push({ program, amount: Math.round(amount * 100) / 100 });
    render();
    const btn = form.querySelector('[data-basket-add]');
    const old = btn.innerHTML;
    btn.classList.add('ok'); btn.textContent = T.added;
    setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = old; }, 1400);
  }
  form.querySelector('[data-basket-add]').addEventListener('click', () => {
    const amount = num(E.amount.value);
    let bad = false;
    if (!amount) { setErr(E.amount, T.needAmount); bad = true; }
    if (!E.program.value) { setErr(E.program, T.needProgram); bad = true; }
    if (bad) { (amount ? E.program : E.amount).focus(); return; }
    add(E.program.value, amount);
    E.amount.value = ''; E.program.value = '';
    form.querySelectorAll('[name=amount_preset]').forEach(r => { r.checked = false; });
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (b) { basket.splice(+b.dataset.rm, 1); render(); }
  });
  E.currency.addEventListener('change', render);

  /* ---------------- pre-fill from the home page quick-donate box ---------------- */
  const qs = new URLSearchParams(location.search);
  if (qs.get('amount') && num(qs.get('amount'))) {
    E.amount.value = num(qs.get('amount'));
    form.querySelectorAll('[name=amount_preset]').forEach(r => { r.checked = r.value === E.amount.value; });
  }
  if (qs.get('program')) {
    const opt = [...E.program.options].find(o => o.value === qs.get('program') || o.text === qs.get('program'));
    if (opt) E.program.value = opt.value;
  }

  /* ---------------- on behalf of / gift ---------------- */
  const mode = () => (form.querySelector('[name=gift_mode]:checked') || {}).value || 'self';
  function syncGift() {
    form.querySelectorAll('.gift-fields').forEach(g => {
      const on = g.dataset.gift === mode();
      g.hidden = !on;
      g.querySelectorAll('input, textarea').forEach(el => {
        el.disabled = !on;
        if (!on) setErr(el, '');
        if (el.name === 'behalf_name' || el.name === 'gift_to') el.required = on;
      });
    });
  }
  form.querySelectorAll('[name=gift_mode]').forEach(r => r.addEventListener('change', syncGift));
  syncGift();

  form._extraRows = () => {
    const rows = [];
    if (basket.length) {
      basket.forEach((b, i) => rows.push([`${T.line} ${i + 1}`, `${b.program} — ${money(b.amount)}`]));
      rows.push([T.total, money(basket.reduce((a, b) => a + b.amount, 0))]);
    }
    rows.push([T.forWhom, T[mode()]]);
    return rows;
  };
  form._afterSheet = done => {
    const card = done.querySelector('.gift-card');
    if (!card) return;
    if (mode() !== 'gift') { card.hidden = true; card.innerHTML = ''; return; }
    const progs = basket.map(b => b.program).concat(E.program.value ? [E.program.value] : []);
    const logo = (document.querySelector('.brand img') || {}).getAttribute ? document.querySelector('.brand img').getAttribute('src') : 'assets/logo.png';
    card.innerHTML =
      `<div class="gc-inner"><img src="${esc(logo)}" alt="" width="64" height="64"><span class="gc-kicker">${esc(T.giftTitle)}</span>` +
      `<h3>${esc(T.giftLead)}</h3>` +
      `<p class="gc-to"><small>${esc(T.giftTo)}</small><b>${esc(E.gift_to.value)}</b></p>` +
      (E.gift_msg.value.trim() ? `<blockquote>${esc(E.gift_msg.value.trim())}</blockquote>` : '') +
      `<p class="gc-body">${esc(T.giftBody)}</p>` +
      (progs.length ? `<p class="gc-progs"><small>${esc(T.giftPrograms)}</small>${progs.map(esc).join(' · ')}</p>` : '') +
      `<p class="gc-from"><small>${esc(T.giftFrom)}</small><b>${esc(E.gift_from.value.trim() || E.full_name.value)}</b></p></div>`;
    card.hidden = false;
  };

  /* ---------------- zakat calculator ---------------- */
  const zf = document.querySelector('[data-zakat]');
  if (!zf) return;
  const Z = zf.elements;
  const out = k => zf.querySelector(`[data-zk="${k}"]`);
  const zbtn = zf.querySelector('[data-zk-donate]');
  let due = 0;
  function calc() {
    const c = Z.zk_cur.value;
    const gp = num(Z.zk_gold_price.value), sp = num(Z.zk_silver_price.value);
    const total = num(Z.zk_cash.value) + num(Z.zk_gold_g.value) * gp + num(Z.zk_silver_g.value) * sp
      + num(Z.zk_trade.value) + num(Z.zk_recv.value) - num(Z.zk_debt.value);
    const nisab = Z.zk_basis.value === 'silver' ? 595 * sp : 85 * gp;
    out('total').textContent = money(Math.max(total, 0), c);
    out('nisab').textContent = nisab ? money(nisab, c) : '—';
    let status;
    if (num(Z.zk_gold_g.value) && !gp) status = T.zkNeedGoldPrice;
    else if (num(Z.zk_silver_g.value) && !sp) status = T.zkNeedSilverPrice;
    else if (!nisab) status = T.zkNeedPrice;
    due = nisab && total >= nisab ? Math.round(total * 2.5) / 100 : 0;
    if (!status) status = due ? T.zkDue : T.zkBelow;
    out('zakat').textContent = nisab ? money(due, c) : '—';
    out('status').textContent = status;
    zf.classList.toggle('is-due', due > 0);
    zbtn.disabled = !due;
  }
  zf.addEventListener('input', calc);
  zf.addEventListener('change', calc);
  calc();
  zbtn.addEventListener('click', () => {
    if (!due) return;
    const c = Z.zk_cur.value;
    const opt = [...E.currency.options].find(o => o.value.split(' ')[0] === c);
    if (opt) E.currency.value = opt.value;
    add(T.zakatLine, due);
    document.getElementById('donate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
