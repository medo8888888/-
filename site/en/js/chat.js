// «مساعد تكامل الذكي» — hybrid assistant.
//  1. window.TakamulBrain: a pure, DOM-free brochure engine (Arabic normalisation, light
//     stemming, synonyms, BM25) that answers ONLY with verbatim brochure lines from
//     window.TAKAMUL_KB (site/data/kb.js). Also evaluated by tools/test-kb.mjs in Node.
//  2. The chat widget: streams from the Worker (/api/chat → Gemini) when /api/health says
//     configured:true; otherwise — or on any API failure / timeout — answers locally.
//     The textarea is never disabled; only Send is disabled while a request is in flight.
//  Public API: window.TakamulChat = { open(), close(), ask(text), isOpen(), mode() }.

/* =====================================================================================
   Part 1 — TakamulBrain (pure functions, no DOM)
   ===================================================================================== */
(function (root) {
  'use strict';

  /* ---------- normalisation ---------- */
  const ARABIC = /[؀-ۿ]/;
  function normalize(input) {
    return String(input == null ? '' : input)
      .normalize('NFKD')                                   // أ→ا+ٔ, ﻻ→لا, ş→s+̧ ...
      .replace(/[̀-ͯؐ-ًؚ-ٰٟۖ-ۭ]/g, '') // marks & tashkeel
      .replace(/ـ/g, '')                              // tatweel
      .replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[کڪ]/g, 'ك').replace(/[یۍې]/g, 'ي').replace(/گ/g, 'ك').replace(/ھ/g, 'ه')
      .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
      .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0))
      .replace(/ı/g, 'i')
      .toLowerCase()
      .replace(/[​-‏‪-‮⁦-⁩]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  const words = s => (s ? s.split(' ').filter(Boolean) : []);

  /* ---------- stopwords (normalised forms) ---------- */
  const STOP = new Set((
    'من في على علي الى الي إلى عن ما ماذا ماذى هل كيف كيفيه لماذا ليش ليه متى متي اين وين فين هي هو هم هن ' +
    'هذه هذا هذي هاد هادا هادي ذلك تلك ده دي دا التي الذي الذين اللي يلي او ام ثم مع كل بعض عند قد لقد ' +
    'ان انه انها كان كانت يكون تكون لا لم لن ليس نعم انا نحن انت انتم انتي لي لك له لها لنا لكم لهم ' +
    'كم اي ايش شو وش شنو شنهو شلون ممكن اريد اود ابغي ابغى ابي بدي بدنا عايز عاوز حاب اعرف نعرف معرفه ' +
    'اخبرني خبرني قل قللي قولي حدثني احكيلي احكي اشرح اشرحلي وضح وضحلي فسر عرفني بخصوص حول بشان ' +
    'يا طيب بس يعني لو سمحت فضلك رجاء ارجو الرجاء ممكن تقلي تقولي ' +
    'عندكم عندك لديكم لديك عنكم عنها عنه فيها فيه بها به منها منه معكم معك معنا عندنا الكم الك ' +
    'جمعيتكم تكامل تكاملكم ' +
    'what is the a an of to in and or how do does can i you we are for about tell me please your our my ' +
    'is it its this that which who whom with be was were there their them us me ' +
    // Turkish (normalised: diacritics stripped, ı→i)
    'bir ve ile icin de da mi mu ne nedir neler nasil neden nicin kim kimler hangi bu su o ben biz siz onlar ' +
    'olarak olan cok daha gibi kadar mudur midir var yok hakkinda bana lutfen ise ki'
  ).split(' '));
  // Kept even though common: words that are the whole point of some questions.
  const KEEP = new Set(['اين', 'وين', 'فين', 'متى', 'كم', 'لماذا', 'ليش', 'ليه']);

  /* ---------- light stemming → a set of variants per token ---------- */
  const ARTICLES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال'];
  // No bare 'ي' / 'يه': keeps nisba adjectives apart from nouns (رئيسية ≠ رئيس); synonyms bridge the rest.
  const SUFFIXES = ['هما', 'كما', 'تين', 'تان', 'ات', 'ون', 'ين', 'ان', 'ها', 'هم', 'هن', 'كم', 'كن', 'نا', 'تي', 'ه', 'ك'];
  const PRONOUNS = new Set(['هما', 'كما', 'ها', 'هم', 'هن', 'كم', 'كن', 'نا', 'ك', 'ين', 'ان']);
  function stripArticle(w) {
    for (const p of ARTICLES) if (w.startsWith(p) && w.length - p.length >= 2) return w.slice(p.length);
    return null;
  }
  function stripSuffix(w) {
    let pron = false;
    for (let pass = 0; pass < 2; pass++) {
      let hit = false;
      for (const s of SUFFIXES) {
        if (w.length - s.length >= 3 && w.endsWith(s)) {
          w = w.slice(0, -s.length);
          if (s === 'تي') return w;                         // عضويتي → عضوي
          pron = pron || PRONOUNS.has(s); hit = s; break;
        }
      }
      if (!hit || hit === 'ه') break;                      // after تاء مربوطة nothing else is a suffix
    }
    if (pron && w.length >= 4 && w.endsWith('ت')) w = w.slice(0, -1);   // تاء مربوطة مضافة: رسالتنا → رسال
    return w;
  }
  const vcache = new Map();
  function variants(tok) {
    if (vcache.has(tok)) return vcache.get(tok);
    let out;
    if (/^\d+$/.test(tok)) out = [tok];
    else if (!ARABIC.test(tok)) {
      // Latin (en/tr sites): plural strip + a 5-letter prefix form as a light stem
      // (membership/members → "membe", üyelik/üyeler → "uyeli"/"uyele" share "uye…" via fuzzy)
      const b = tok.length > 4 && tok.endsWith('s') ? tok.slice(0, -1) : tok;
      out = b.length >= 6 ? [b, b.slice(0, 5)] : [b];
    }
    else {
      const forms = [tok];
      const a = stripArticle(tok);
      if (a) forms.push(a);
      if (/^[وفبلك]/.test(tok) && tok.length >= 4) {
        const b = tok.slice(1);
        forms.push(b);
        const ba = stripArticle(b);
        if (ba) forms.push(ba);
      }
      const set = new Set();
      forms.forEach(f => { const s = stripSuffix(f); if (s.length >= 2) set.add(s); });
      out = Array.from(set);
      if (!out.length) out = [tok];
    }
    vcache.set(tok, out);
    return out;
  }
  const primary = tok => {
    if (!ARABIC.test(tok)) return variants(tok)[0];
    return stripSuffix(stripArticle(tok) || tok);
  };

  /* ---------- domain synonyms & intents ---------- */
  const SYN_GROUPS = [
    'انضمام انضم انضمامي انتساب انتسب عضويه عضو اعضاء اشتراك اشتراكات اشترك التحاق التحق تسجيل اسجل منتسب تطوع اتطوع متطوع تطوعي',
    'تمويل دخل موارد مال مالي ماليه اموال ايرادات تبرعات تبرع هبات منح فلوس مصاري ميزانيه ارباح عوائد ريع',
    'حوكمه اداره مجلس رقابه عموميه هيكل تنظيمي صلاحيات سلطه قرار',
    'توسع مراحل مرحله فروع دول ولايات انتشار جغرافي توسيع خطه',
    'ينابيع قيم قيمي قيميه تربيه تربوي اسره اسر اطفال ناشئه اخلاق اخلاقي ارشاد فكري',
    'منافع توظيف تمكين عمل وظايف وظيفه شغل مهني تدريب تاهيل اقتصادي صغري بطاله',
    'رويه 2035 مستقبل طموح بعيد',
    'رساله مهمه',
    'اهداف هدف غايات غايه استراتيجيه',
    'مخاطر خطر تهديدات طوارئ ازمات',
    'استدامه مستدام ديمومه استمراريه استقلاليه',
    'اقسام قسم فرق ادارات تنفيذيه',
    'فئات فئه مستهدفه مستفيدين مستفيد جمهور شرائح',
    'موسسون موسسين موسس تاسيسيه تاسيس',
    'حقوق حق واجبات واجب التزامات مسووليات',
    'مقر مكان عنوان موقع اسطنبول',
    'اثر تاثير نتائج قياس',
    'قيم جوهريه مبادي اخلاقيات ثقافه',
    'رقمي ذكاء اصطناعي تقنيه تكنولوجيا تطبيق برمجه الكتروني',
    'دوره مده تداول تجديد ولايه',
    'مؤشرات موشرات kpi kpis اداء',
    'اقتراض قرض قروض دين ديون',
    'قانوني قانونيه كيان ترخيص مسجله تشريعات',
    'جنسيات جنسيه دولي تنوع',
    'متفرغ تفرغ متفرغين',
    'اجتماعات اجتماع بعد رقميه',
  ].map(g => words(g));
  // Question-word intents → extra terms (weight 0.6). Each test receives the normalised query.
  const INTENT = [
    [n => /(^| )(اين|وين|فين|مكان|عنوان)( |$)/.test(n) && !/(^| )من (اين|وين|فين)( |$)/.test(n), ['مقر']],
    [n => /(^| )(كيف|كيفيه|طريقه|خطوات|بدي|اريد|ابغي|ابي|حاب|اود)( |$).*(انضم|اشترك|اسجل|انتسب|التحق|عضو)/.test(n), ['شروط', 'عضويه', 'اهليه']],
    [n => /(^| )(لماذا|ليش|ليه|ميزات|مميزات|يميز|يميزكم|فوايد|فائده)( |$)/.test(n), ['يميز', 'ركايز']],
    [n => /(^| )(من|مين)( |$)(هم )?(ال)?(موسس|اعضاء الموسس)/.test(n), ['موسسون', 'تاسيسيه']],
    [n => /(^| )(من|مين|لمن)( |$)(هم )?(ال)?(مستفيد|فيات|مستهدف|تخدم|تعمل)/.test(n), ['فيات', 'مستهدفه']],
  ];
  const CONTACT = /(^| )(ال)?(هاتف|تلفون|تليفون|جوال|موبايل|واتس|واتساب|ايميل|بريد|تواصل|اتصال|نتواصل|اتواصل|email|mail|phone|contact|whatsapp)( |$)/;
  // Fillers that may follow small talk without turning it into a question.
  const FILLER = new Set(('جزيلا كثيرا كتير جدا اخي اختي استاذ عزيزي حبيبي يا الله فيك فيكم ' +
    'تفعل تعمل تسوي تقدم القيام فعله عمله تساعدني تساعد مساعدتي تخدمني لي much very so lot do you').split(' '));
  const EN = {
    join: 'عضويه شروط اهليه', membership: 'عضويه شروط', member: 'عضو', members: 'اعضاء', register: 'عضويه',
    fund: 'تمويل', funding: 'تمويل مصادر', money: 'تمويل', income: 'دخل مصادر', finance: 'ماليه', financial: 'ماليه',
    donation: 'تبرعات', donations: 'تبرعات', vision: 'رويه', mission: 'رساله', goal: 'اهداف', goals: 'اهداف',
    objective: 'اهداف', objectives: 'اهداف', governance: 'حوكمه', board: 'مجلس اداره', management: 'اداره',
    expansion: 'توسع', expand: 'توسع', countries: 'دول', country: 'دول', branches: 'فروع', stages: 'مراحل',
    phases: 'مراحل', plan: 'خطه', risk: 'مخاطر', risks: 'مخاطر', yanabee: 'ينابيع', yanabi: 'ينابيع',
    yanabia: 'ينابيع', springs: 'ينابيع', manafea: 'منافع', manafi: 'منافع', benefits: 'منافع', values: 'قيم',
    departments: 'اقسام', department: 'اقسام', target: 'فئات مستهدفه', beneficiaries: 'مستفيدين',
    founders: 'موسسون', founder: 'موسس', rights: 'حقوق', duties: 'واجبات', location: 'مقر', where: 'مقر',
    headquarters: 'مقر', address: 'مقر', office: 'مقر', istanbul: 'اسطنبول', ankara: 'انقره', impact: 'اثر',
    sustainability: 'استدامه', loan: 'اقتراض', loans: 'اقتراض', borrowing: 'اقتراض', legal: 'قانوني',
    initiatives: 'مبادرات', initiative: 'مبادره', why: 'يميز', uyelik: 'عضويه', katil: 'انضمام',
    vizyon: 'رويه', misyon: 'رساله', hedef: 'اهداف', finansman: 'تمويل', kurul: 'kurul', genel: 'genel',
  };

  /* ---------- safe markdown (escape FIRST, then format) ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SAFE_URL = /^(?:https:\/\/[^\s<>"']+|(?:\.\/)?[\w-]+\.html(?:#[\w-]+)?|#[\w-]+)$/i;
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, (m, label, url) => {
        const raw = url.replace(/&amp;/g, '&');
        if (!SAFE_URL.test(raw)) return label;                 // javascript:, data:, etc. → plain text
        const ext = /^https:/i.test(raw) ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${url}"${ext}>${label}</a>`;
      })
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=$|[^*\w])/g, '$1<em>$2</em>');
  }
  function md(text) {
    const out = [];
    let list = null;
    const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.t}>`); list = null; } };
    String(text == null ? '' : text).split('\n').forEach(raw => {
      const line = raw.trim();
      let m;
      if ((m = line.match(/^[-*•●]\s+(.*)$/))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(inline(m[1])); }
      else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(inline(m[1])); }
      else if (!line) flush();
      else { flush(); out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`); }
    });
    flush();
    return out.join('');
  }

  /* ---------- index ---------- */
  const PRIOR_TYPE = { faq: 1.1, subsection: 1.06, pillar: 1.0, stage: 1.0, section: 0.9, intro: 0.55 };
  const PRIOR_ID = { s11: 1.15, s13: 0.55, 's13-1': 0.62, 's13-2': 0.62, s12: 0.8, toc: 0.35, closing: 0.4, welcome: 0.7 };
  const FIELDS = [['title', 3], ['subtitle', 1.4], ['text', 1]];
  const K1 = 1.2, B = 0.55;
  let IX = null;

  function tokenize(s) { return words(normalize(s)); }

  function build(kb) {
    const items = (kb && Array.isArray(kb.items)) ? kb.items : [];
    const docs = items.map(it => {
      const tf = new Map();
      let len = 0;
      const bigrams = new Set();
      const nums = new Set();
      FIELDS.forEach(([f, w]) => {
        const toks = tokenize(it[f] || '');
        len += toks.length * w;
        let prev = null;
        toks.forEach(t => {
          variants(t).forEach(v => tf.set(v, (tf.get(v) || 0) + w));
          if (/^\d+$/.test(t)) nums.add(t);
          const p = primary(t);
          if (prev && !STOP.has(t)) bigrams.add(prev + ' ' + p);
          prev = STOP.has(t) ? prev : p;
        });
      });
      const titleSet = new Set();
      tokenize(it.title + ' ' + (it.subtitle || '')).forEach(t => variants(t).forEach(v => titleSet.add(v)));
      return { it, tf, len, bigrams, nums, titleSet };
    });
    const df = new Map();
    docs.forEach(d => d.tf.forEach((_, v) => df.set(v, (df.get(v) || 0) + 1)));
    const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
    const byId = new Map(items.map(it => [it.id, it]));
    const synIndex = new Map();   // variant → group indexes
    SYN_GROUPS.forEach((g, gi) => g.forEach(w => variants(w).forEach(v => {
      if (!synIndex.has(v)) synIndex.set(v, new Set());
      synIndex.get(v).add(gi);
    })));
    // a translated KB (en/tr site) is matched in its own language: no Arabic synonym bridging
    const latin = items.length > 0 && !ARABIC.test(items.slice(0, 5).map(it => it.title).join(' '));
    IX = { kb, items, docs, df, avg, N: docs.length, byId, vocab: Array.from(df.keys()), synIndex, latin };
    return IX;
  }
  function ensure() {
    const kb = root.TAKAMUL_KB;
    if (!IX || IX.kb !== kb) build(kb);
    return IX;
  }
  const idf = v => { const n = IX.df.get(v) || 0; return n ? Math.log(1 + (IX.N - n + 0.5) / (n + 0.5)) : 0; };

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /* ---------- query analysis ---------- */
  const isStop = t => STOP.has(t) || (t.length > 2 && /^[وف]/.test(t) && STOP.has(t.slice(1)));
  const known = t => variants(t).some(v => IX.df.has(v) || IX.synIndex.has(v)) || !!EN[t];

  function analyze(q) {
    ensure();
    const norm = normalize(q);
    const toks = words(norm);
    const english = !ARABIC.test(q) && /[a-z]/i.test(q);
    const content = toks.filter(t => (!isStop(t) || KEEP.has(t)) && (t.length > 1 || /\d/.test(t)));
    const terms = [];
    const seen = new Set();
    const addTerm = (t, w, kind, origin) => {
      const forms = variants(t);
      const key = forms.join('|');
      if (seen.has(key)) return;
      seen.add(key);
      terms.push({ t, forms, w, kind, origin });
    };
    content.forEach((t, i) => {
      if (EN[t] && !IX.latin) { words(EN[t]).forEach(m => addTerm(m, 1, 'q', i)); return; }
      if (!ARABIC.test(t) && !/^\d+$/.test(t) && !variants(t).some(v => IX.df.has(v))
        && !(IX.latin && t.length >= 5)) return; // unknown foreign word (kept on en/tr sites for typo matching)
      addTerm(t, KEEP.has(t) ? 0.35 : 1, 'q', i);
    });
    INTENT.forEach(([test, add]) => { if (test(norm)) add.forEach(t => addTerm(t, 0.6, 'x', -1)); });
    // fuzzy (typos): forms unknown to the corpus → nearest vocabulary forms
    terms.forEach(term => {
      if (term.kind !== 'q' || term.w < 1 || /^\d+$/.test(term.t) || (!ARABIC.test(term.t) && !IX.latin)) return;
      if (term.forms.some(f => IX.df.has(f) || IX.synIndex.has(f))) return;
      const base = term.forms[term.forms.length - 1];
      if (base.length < 5) return;
      const max = base.length >= 8 ? 2 : 1;
      const near = [];
      for (const v of IX.vocab) {
        if (v.length < 3 || /^\d+$/.test(v)) continue;
        const d = lev(base, v, max);
        if (d <= max) near.push([d, v]);
      }
      near.sort((a, b) => a[0] - b[0] || (IX.df.get(b[1]) - IX.df.get(a[1])));
      if (near.length) { term.forms = term.forms.concat(near.slice(0, 2).map(n => n[1])); term.fuzzy = true; }
    });
    // synonym expansion
    const syn = [];
    terms.forEach(term => {
      const groups = new Set();
      term.forms.forEach(f => (IX.synIndex.get(f) || []).forEach(g => groups.add(g)));
      groups.forEach(g => SYN_GROUPS[g].forEach(w => {
        const forms = variants(w);
        if (forms.some(f => term.forms.includes(f))) return;
        syn.push({ t: w, forms, w: 0.45 * term.w, kind: 's', origin: term.origin });
      }));
    });
    const bigrams = [];
    for (let i = 1; i < content.length; i++) {
      if (STOP.has(content[i]) || STOP.has(content[i - 1])) continue;
      bigrams.push(primary(content[i - 1]) + ' ' + primary(content[i]));
    }
    const nums = content.filter(t => /^\d+$/.test(t));
    const howMany = /(^| )(كم|عدد)( |$)/.test(norm);
    // weights for coverage: rare words matter more; words unknown to the brochure count fully against it
    const core = terms.filter(t => t.kind === 'q' && t.w >= 1);
    core.forEach(t => {
      const f = t.forms.filter(x => IX.df.has(x));
      t.cw = f.length ? Math.max(...f.map(idf))
        : t.forms.some(x => IX.synIndex.has(x)) ? 1.5
        : /^(ب[يتن]|[يتن])\S{2,}(وا|ون|ين)$|^ب[يتن]\S{3,}$/.test(t.t) ? 0.8   // colloquial verb (بتجيبوا، بيعملوا)
        : 3.2;                                                               // word the brochure never uses
    });
    return { q, norm, english, terms, syn, bigrams, nums, howMany, core, nq: core.length };
  }

  function termScore(term, d) {
    let best = 0;
    for (const f of term.forms) {
      const tf = d.tf.get(f);
      if (!tf) continue;
      const s = idf(f) * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.len / IX.avg));
      if (s > best) best = s;
    }
    return best * term.w;
  }

  function score(A, d) {
    let s = 0, matched = 0, titleHits = 0;
    const synBest = new Map();
    const hit = new Map();   // core term → match quality (1 direct, .7 fuzzy, .6 via synonym)
    A.terms.forEach(term => {
      const v = termScore(term, d);
      if (v > 0) {
        s += v;
        if (term.kind === 'q' && term.w >= 1) {
          matched++;
          const direct = term.forms.some((f, i) => i < variants(term.t).length && d.tf.has(f));
          hit.set(term, direct ? 1 : 0.7);
        }
        if (term.forms.some(f => d.titleSet.has(f))) titleHits += term.kind === 'q' ? 1 : 0.5;
      }
    });
    const synTitle = new Set();
    A.syn.forEach(term => {
      const v = termScore(term, d);
      if (v > 0) {
        if (v > (synBest.get(term.origin) || 0)) synBest.set(term.origin, v);
        const owner = A.core.find(t => t.origin === term.origin);
        if (owner && !hit.has(owner)) hit.set(owner, 0.6);
        if (term.forms.some(f => d.titleSet.has(f))) synTitle.add(term.origin);
      }
    });
    titleHits += 0.25 * synTitle.size;
    synBest.forEach(v => { s += v; });
    A.bigrams.forEach(bg => { if (d.bigrams.has(bg)) s += 1.6; });
    A.nums.forEach(n => { if (d.nums.has(n)) s += 2.2; });
    if (A.howMany && d.nums.size) s += 1.5;
    if (A.nq && titleHits) s += 2.4 * Math.min(1, titleHits / A.nq);
    const it = d.it;
    s *= (PRIOR_ID[it.id] != null ? PRIOR_ID[it.id] : (PRIOR_TYPE[it.type] || 1));
    let cw = 0, cm = 0;
    A.core.forEach(t => { cw += t.cw; cm += t.cw * (hit.get(t) || 0); });
    return { s, matched, cover: cw ? cm / cw : 0 };
  }

  function search(q, opts) {
    ensure();
    const limit = (opts && opts.limit) || 8;
    const A = typeof q === 'string' ? analyze(q) : q;
    if (!A.terms.length && !A.syn.length) return [];
    const res = [];
    IX.docs.forEach(d => {
      const r = score(A, d);
      if (r.s > 0) res.push({ id: d.it.id, item: d.it, score: r.s, matched: r.matched, cover: r.cover });
    });
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, limit);
  }

  /* ---------- small talk ---------- */
  const SMALL = [
    ['salam', /(^| )(ال)?سلام عليكم( ورحمه الله( وبركاته)?)?|^(ال)?سلام$/],
    ['greet', /(^| )(مرحبا|مرحبتين|اهلا|اهلين|هلا|هاي|صباح الخير|مساء الخير|صباح النور|مساء النور|hello|hi|hey|merhaba|selam)( |$)/],
    ['thanks', /(^| )(شكرا|شكر|مشكور|مشكوره|يعطيك العافيه|جزاك الله خيرا?|جزاكم الله خيرا?|تسلم|ممنون|thanks|thank you|thx|tesekkurler|tesekkur ederim|sagol)( |$)/],
    ['who', /(^| )(من|مين|شو|ايش|وش) (انت|انتي|تكون)( |$)|عرفني (عن|ب)نفسك|عرف (عن )?نفسك|ما اسمك|شو اسمك|who are you|what are you/],
    ['can', /(ماذا|شو|ايش|وش|بماذا|بايش|كيف) (تستطيع|بتقدر|تقدر|يمكنك|تعرف|بتعرف|تساعدني|بتساعدني|يمكنك ان تساعدني)|ساعدني|what can you do|^help$|^مساعده$/],
    ['bye', /(^| )(مع السلامه|الي اللقاء|وداعا|باي|bye|goodbye)( |$)/],
    ['ok', /^(تمام|حسنا|اوكي|اوك|ok|okay|طيب|ممتاز|رائع|جميل|حلو)$/],
  ];
  function smallTalk(q) {
    let rest = normalize(q);
    const kinds = [];
    SMALL.forEach(([k, re]) => { if (re.test(rest)) { kinds.push(k); rest = rest.replace(re, ' ').replace(/\s+/g, ' ').trim(); } });
    if (!kinds.length) return null;
    ensure();
    const left = words(rest).filter(t => !isStop(t) && !FILLER.has(t) && t.length > 1 && known(t));
    return { kinds, pure: left.length === 0, rest };
  }

  /* ---------- answer composition (verbatim brochure lines only) ---------- */
  const LEAD = 'From the brochure:';
  const strip = s => String(s || '').replace(/^\d+(\.\d+)?\s+/, '').trim();
  function shortTitle(it) {
    if (!it) return '';
    if (it.type === 'stage') return `${it.subtitle} — ${it.title}`;
    const t = strip(it.title);
    return it.type === 'faq' ? t : t.split(' – ')[0];
  }
  function source(it) { return { id: it.id, num: it.num || '', title: shortTitle(it), url: it.url }; }
  const rowText = r => (r.h ? r.h : r.k ? `${r.k}${r.tag ? ` (${r.tag})` : ''} ${r.v}` : `${r.v}${r.tag ? ` ${r.tag}` : ''}`);
  function rowsOf(it) {
    if (Array.isArray(it.rows) && it.rows.length) return it.rows;
    return String(it.text || '').split('\n').filter(Boolean).map(v => ({ v }));
  }
  function pickRows(it, A) {
    const rows = rowsOf(it);
    if (rows.length <= 8) return rows.map((r, i) => i);
    const all = A ? A.terms.concat(A.syn) : [];
    const sc = rows.map((r, i) => {
      const toks = new Set();
      tokenize(rowText(r)).forEach(t => variants(t).forEach(v => toks.add(v)));
      let s = 0;
      all.forEach(term => { if (term.forms.some(f => toks.has(f))) s += term.w * (idf(term.forms.find(f => toks.has(f))) || 0.5); });
      return { i, s: s + (r.h ? 0.01 : 0) };
    });
    let chosen = sc.filter(x => x.s > 0.02).sort((a, b) => b.s - a.s).slice(0, 7).map(x => x.i);
    if (chosen.length < 3) chosen = rows.map((r, i) => i).filter(i => !rows[i].h).slice(0, 6);
    // keep the heading that introduces a chosen row (when there is room)
    const set = new Set(chosen);
    chosen.slice().sort((a, b) => a - b).forEach(i => {
      for (let j = i - 1; j >= 0; j--) { if (rows[j].h) { if (set.size < 8) set.add(j); break; } }
    });
    return Array.from(set).sort((a, b) => a - b);
  }
  function renderRows(it, idx) {
    const rows = rowsOf(it);
    const out = [];
    idx.forEach((i, n) => {
      const r = rows[i];
      if (r.h) { out.push('', `**${r.h}**`); return; }
      const body = r.k ? `**${r.k}**${r.tag ? ` (${r.tag})` : ''} — ${r.v}` : `${r.v}${r.tag ? ` (${r.tag})` : ''}`;
      if (!r.k && !r.li && !r.n && idx.length > 1 && (n === 0 || /:$/.test(r.v))) out.push('', body, '');
      else out.push(`- ${body}`);
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function itemBlock(it, A) {
    const head = [`**${it.type === 'faq' ? strip(it.title) : it.type === 'stage' ? `${it.subtitle} — ${it.title}` : strip(it.title)}**`];
    if (it.subtitle && it.type !== 'stage' && it.type !== 'intro') head.push(`_${it.subtitle}_`);
    return head.join('\n') + '\n\n' + renderRows(it, pickRows(it, A));
  }
  function followups(ids, exclude) {
    const out = [];
    const ex = new Set(exclude || []);
    ids.forEach(id => {
      const it = IX.byId.get(id);
      if (!it || ex.has(id) || out.length >= 3) return;
      ex.add(id);
      out.push({ id, label: shortTitle(it) });
    });
    return out;
  }
  const DEFAULT_FOLLOW = ['s3-1', 's3-2', 's7-2', 's5', 's8-1'];

  function answerItem(id, A) {
    ensure();
    const it = IX.byId.get(id);
    if (!it) return null;
    return {
      kind: 'answer', top: id, confidence: 1,
      text: `${LEAD}\n${itemBlock(it, A)}`,
      sources: [source(it)],
      followups: followups((it.related || []).concat(DEFAULT_FOLLOW), [id]),
    };
  }

  const SMALL_REPLY = {
    salam: 'Wa alaikum assalam — and peace, mercy and blessings of Allah be upon you too 🌿',
    greet: 'Welcome — it’s a pleasure to have you here 🌿',
    thanks: 'You’re welcome, it’s always my pleasure 🌿 Do you have another question about the Association?',
    who: 'I’m the **Takamul AI Assistant**, the virtual assistant of the “Takamul Association for Building Values and Development”. I answer from the text of the introductory brochure for new members, and attach to every answer a link to where it appears on the site.',
    bye: 'Fi aman Allah — go in God’s care 🌿 It was a pleasure talking with you, and I’m here whenever you need me.',
    ok: 'Glad to hear it 🌿 Would you like to know more? Choose one of the suggested topics or type your question.',
  };
  function capabilities() {
    const ids = ['s2', 's3', 's5', 's7', 's8', 's9', 's12'];
    const lines = ids.map(id => IX.byId.get(id)).filter(Boolean).map(it => `- ${strip(it.title)}`);
    return 'I can answer anything covered in the introductory brochure, including:\n' + lines.join('\n') +
      '\n\nAsk your question in your own words, and I’ll show you the brochure text with a link to where it appears.';
  }

  function fallback(A, results) {
    const ids = (results || []).map(r => r.id).concat(DEFAULT_FOLLOW);
    return {
      kind: 'fallback', top: null, confidence: 0,
      text: 'I couldn’t find a clear answer to your question in the introductory brochure 🌿\nTry different wording or a keyword such as “Membership”, “Funding” or “Yanabee”, choose one of the suggested topics, or browse the [Answer Guide](faq.html).',
      sources: [],
      followups: followups(ids, []),
    };
  }

  function isParentChild(a, b) {
    return a.section && a.section === b.section && (a.type === 'section' || b.type === 'section' ||
      (a.id.startsWith('s13') || b.id.startsWith('s13')));
  }

  function answer(q, opts) {
    ensure();
    opts = opts || {};
    const text = String(q || '').trim();
    if (!text) return fallback(null, []);
    const st = smallTalk(text);
    if (st && st.pure) {
      const k = st.kinds.includes('who') ? 'who' : st.kinds.includes('can') ? 'can' : st.kinds.includes('thanks') ? 'thanks'
        : st.kinds.includes('bye') ? 'bye' : st.kinds.includes('salam') ? 'salam' : st.kinds.includes('ok') ? 'ok' : 'greet';
      let body;
      if (k === 'can') body = capabilities();
      else if (k === 'salam' || k === 'greet') body = SMALL_REPLY[k] + '\nI’m the **Takamul AI Assistant**, here to answer your questions about the Association’s vision, its two initiatives “Yanabee” and “Manafea”, the expansion plan, membership, governance and funding. Where shall I start?';
      else body = SMALL_REPLY[k];
      return { kind: 'smalltalk', small: k, top: null, confidence: 1, text: body, sources: [], followups: followups(DEFAULT_FOLLOW, []) };
    }
    const query = st ? st.rest : text;
    let A = analyze(query);
    let results = search(A, { limit: 6 });
    let conf = confidence(A, results);
    if (conf < 0.5 && opts.prev) {               // short follow-up ("وما شروطها؟") → use the previous question as context
      const A2 = analyze(opts.prev + ' ' + query);
      const r2 = search(A2, { limit: 6 });
      const c2 = confidence(A2, r2);
      if (c2 > conf) { A = A2; results = r2; conf = c2; }
    }
    const prefix = [];
    if (CONTACT.test(normalize(query)) && (conf < 0.75 || !results.length)) {
      const c = answerItem('s1', analyze('المقر الرئيسي'));
      if (c) {
        c.text = 'The introductory brochure does not include phone numbers or email addresses; here is what it says about the Association’s headquarters and scope of work:\n\n' + c.text;
        c.contact = true;
        return c;
      }
    }
    if (st && st.kinds.includes('salam')) prefix.push(SMALL_REPLY.salam);
    else if (st && st.kinds.includes('greet')) prefix.push(SMALL_REPLY.greet);
    if (!IX.latin && (A.english || (!ARABIC.test(text) && /\p{L}/u.test(text)))) {
      prefix.push('Brochure mode — here is the closest match to your question:');
    }
    if (!results.length || conf < 0.4) {
      const fb = fallback(A, results);
      if (prefix.length) fb.text = prefix.join('\n') + '\n\n' + fb.text;
      fb.confidence = conf;
      return fb;
    }
    const top = results[0];
    const out = answerItem(top.id, A);
    out.confidence = conf;
    out.results = results.map(r => ({ id: r.id, score: +r.score.toFixed(3) }));
    const second = results[1];
    if (second && second.score >= top.score * 0.82 && !isParentChild(top.item, second.item)) out.sources.push(source(second.item));
    out.followups = followups(results.slice(1, 3).map(r => r.id).concat(top.item.related || [], DEFAULT_FOLLOW),
      out.sources.map(s => s.id));
    if (prefix.length) out.text = prefix.join('\n') + '\n\n' + out.text;
    return out;
  }
  // Best single row (with the item's title) coverage: real answers sit in one place,
  // accidental matches are scattered across unrelated lines.
  const rowSets = new Map();
  function rowTokenSets(it) {
    if (rowSets.has(it.id)) return rowSets.get(it.id);
    const head = tokenize(`${it.title} ${it.subtitle || ''}`);
    const sets = rowsOf(it).map(r => {
      const set = new Set();
      head.concat(tokenize(rowText(r))).forEach(t => variants(t).forEach(v => set.add(v)));
      return set;
    });
    if (!sets.length) { const set = new Set(); head.forEach(t => variants(t).forEach(v => set.add(v))); sets.push(set); }
    rowSets.set(it.id, sets);
    return sets;
  }
  function rowCover(A, it) {
    if (!A.nq) return 0;
    let best = 0, total = 0;
    A.core.forEach(t => { total += t.cw; });
    rowTokenSets(it).forEach(set => {
      let c = 0;
      A.core.forEach(t => {
        const base = variants(t.t);
        if (t.forms.some(f => set.has(f) && base.includes(f))) c += t.cw;
        else if (t.forms.some(f => set.has(f))) c += 0.7 * t.cw;
        else if (A.syn.some(s => s.origin === t.origin && s.forms.some(f => set.has(f)))) c += 0.6 * t.cw;
      });
      if (c > best) best = c;
    });
    return total ? best / total : 0;
  }
  function confidence(A, results) {
    if (!results.length) return 0;
    const top = results[0];
    const cover = A.nq ? top.cover : (top.score > 2 ? 0.6 : 0.2);
    const row = A.nq ? rowCover(A, top.item) : cover;
    const strength = Math.min(1, top.score / 6);
    return Math.max(0, Math.min(1, 0.45 * cover + 0.35 * row + 0.2 * strength)) * (cover < 0.3 ? 0.5 : 1);
  }

  root.TakamulBrain = {
    version: 2, LEAD,
    normalize, tokenize, variants, analyze, search, answer, answerItem, smallTalk, md, esc, shortTitle,
    reset() { IX = null; vcache.clear(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* =====================================================================================
   Part 2 — the chat widget (DOM)
   ===================================================================================== */
(() => {
  if (typeof document === 'undefined') return;
  const Brain = window.TakamulBrain;
  const $ = (s, r = document) => r.querySelector(s);
  const box = $('.chat');
  if (!box) return;
  const panel = $('.chat-panel', box), log = $('.chat-log', box), form = $('.chat-form', box),
    input = $('textarea', form), send = $('.chat-send', form), sug = $('.chat-suggest', box),
    note = $('.chat-note', box), headSmall = $('.chat-head small', box);
  const mobileMQ = matchMedia('(max-width: 760px)');
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'takamul-chat';
  const REOPEN = 'takamul-chat-reopen';
  const MAX_CHARS = 2000;        // per message (the Worker truncates to the same)
  const MAX_PAYLOAD = 24 * 1024; // bytes; the Worker rejects bodies above 32 KB
  const FIRST_TOKEN_MS = 25000;  // no first token by then → answer from the brochure
  const IDLE_MS = 30000;         // stalled stream → keep the partial answer + cut note
  const HEALTH_WAIT_MS = 4000;   // don't keep a question waiting on a slow health check
  const SUGGESTIONS = [
    'What is the “Yanabee” initiative?',
    'What is the “Manafea” initiative?',
    'How do I join the Association?',
    'What are the stages of geographic expansion?',
    'What are the Association’s funding sources?',
    'What are a member’s rights and duties?',
  ];
  const WELCOME = 'Welcome to the “Takamul” family 🌿\nI’m the **Takamul AI Assistant**, happy to answer your questions about the Association’s vision, its initiatives “Yanabee” and “Manafea”, the expansion plan, membership and governance. Where shall I start?';
  const MODE = {
    checking: { label: 'Connecting…', tip: 'Checking whether the AI assistant is available. You can type now — you’ll get an answer either way.' },
    gemini: { label: 'Powered by Gemini', tip: 'Smart answers generated by Gemini based on the introductory brochure text, with links to their sources on the site.' },
    local: { label: 'Brochure Mode', tip: 'The assistant answers directly from the introductory brochure text without needing a server, quoting it verbatim with a link to where it appears on the site.' },
  };
  const NOTES = {
    gemini: 'The assistant may occasionally make mistakes; please verify important information.',
    local: 'Brochure mode: answers are quoted verbatim from the introductory brochure.',
  };
  const FALLBACK_NOTE = {
    not_configured: 'The AI assistant isn’t enabled on this server yet, so I answered directly from the introductory brochure.',
    forbidden: 'Couldn’t connect to Gemini from this page, so I answered directly from the introductory brochure.',
    rate_limited: 'You’ve reached the temporary question limit for Gemini, so I answered directly from the introductory brochure. You can try again in a minute.',
    bad_request: 'Unfortunately, Gemini couldn’t process the request, so I answered directly from the introductory brochure.',
    timeout: 'It seems Gemini took longer than usual, so I answered directly from the introductory brochure.',
    upstream: 'Couldn’t get an answer from Gemini right now, so I answered directly from the introductory brochure.',
    network: 'Couldn’t connect to Gemini, so I answered directly from the introductory brochure.',
  };
  const CUT_NOTE = '\n\n_(The answer was cut off before it was complete; you can ask the question again.)_';
  const md = Brain.md, esc = Brain.esc;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const kbItem = id => {
    const kb = window.TAKAMUL_KB;
    return kb && Array.isArray(kb.items) ? kb.items.find(i => i.id === id) : null;
  };

  /* ---------- history ---------- */
  let messages = [];
  try { messages = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { messages = []; }
  if (!Array.isArray(messages)) messages = [];
  const cleanIds = a => (Array.isArray(a) ? a.filter(id => typeof id === 'string' && kbItem(id)).slice(0, 4) : []);
  messages = messages
    .filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text)
    .map(m => (m.role === 'user' ? { role: 'user', text: m.text } : {
      role: 'model', text: m.text, src: m.src === 'local' ? 'local' : 'gemini',
      note: typeof m.note === 'string' ? m.note : '', sources: cleanIds(m.sources), follow: cleanIds(m.follow),
    }));
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(messages.slice(-20))); } catch (e) { /* storage unavailable */ } };
  const lastUserText = () => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i].text; return ''; };

  let busy = false;
  let mode = 'checking'; // 'checking' | 'gemini' | 'local'
  let health = null;

  /* ---------- mode badge ---------- */
  let modeBtn = null, modeTip = null, modeLabel = null;
  if (headSmall) {
    headSmall.classList.add('chat-mode-wrap');
    headSmall.innerHTML = '<span class="dot" aria-hidden="true"></span>' +
      '<button type="button" class="chat-mode" aria-describedby="chat-mode-tip" aria-expanded="false">' +
      '<span class="chat-mode-label"></span><svg class="chat-mode-i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg></button>' +
      '<span class="chat-mode-tip" role="tooltip" id="chat-mode-tip"></span>';
    modeBtn = $('.chat-mode', headSmall); modeTip = $('.chat-mode-tip', headSmall); modeLabel = $('.chat-mode-label', headSmall);
    const setTip = on => { headSmall.classList.toggle('tip-open', on); modeBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    modeBtn.addEventListener('click', e => { e.stopPropagation(); setTip(!headSmall.classList.contains('tip-open')); });
    modeBtn.addEventListener('blur', () => setTip(false));
    modeBtn.addEventListener('keydown', e => { if (e.key === 'Escape' && headSmall.classList.contains('tip-open')) { e.stopPropagation(); setTip(false); } });
  }
  function setMode(m) {
    mode = m;
    box.dataset.mode = m;
    box.classList.remove('offline');
    if (modeLabel) { modeLabel.textContent = MODE[m].label; modeTip.textContent = MODE[m].tip; }
    if (note) note.textContent = m === 'local' ? NOTES.local : NOTES.gemini;
  }
  setMode('checking');

  /* ---------- rendering ---------- */
  const scrollEnd = () => { log.scrollTop = log.scrollHeight; };
  function el(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  const ICON_BOOK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H9a3 3 0 0 1 3 3v14a2.5 2.5 0 0 0-2.5-2.5h-6A1.5 1.5 0 0 1 2 16z"/><path d="M22 4.5A1.5 1.5 0 0 0 20.5 3H15a3 3 0 0 0-3 3v14a2.5 2.5 0 0 1 2.5-2.5h6a1.5 1.5 0 0 0 1.5-1.5z"/></svg>';
  const ICON_LINK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  const ICON_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/></svg>';

  function sourcesEl(ids) {
    const items = ids.map(kbItem).filter(Boolean);
    if (!items.length) return null;
    const wrap = el('div', 'chat-sources');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Sources');
    wrap.appendChild(el('span', 'chat-meta-label', 'Sources'));
    items.forEach(it => {
      const a = el('a', 'src-chip');
      a.href = it.url;
      a.innerHTML = (it.num ? `<span class="src-num">${esc(it.num)}</span>` : '') +
        `<span class="src-title">${esc(Brain.shortTitle(it))}</span>${ICON_LINK}`;
      a.title = Brain.shortTitle(it);
      a.dataset.id = it.id;
      wrap.appendChild(a);
    });
    return wrap;
  }
  function followEl(ids) {
    const items = ids.map(kbItem).filter(Boolean);
    if (!items.length) return null;
    const wrap = el('div', 'chat-follow');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Related questions');
    wrap.appendChild(el('span', 'chat-meta-label', 'You may also be interested in'));
    items.forEach(it => {
      const b = el('button', 'follow-chip');
      b.type = 'button';
      b.dataset.id = it.id;
      b.innerHTML = `${ICON_SPARK}<span>${esc(Brain.shortTitle(it))}</span>`;
      wrap.appendChild(b);
    });
    return wrap;
  }
  function paintBot(node, m, withFollow) {
    node.className = `msg bot${m.src === 'local' ? ' local' : ''}${m.err ? ' err' : ''}`;
    let body = m.text;
    let html = '';
    if (m.note) html += `<p class="kb-note">${esc(m.note)}</p>`;
    if (m.src === 'local' && body.indexOf(Brain.LEAD) !== -1) {
      const at = body.indexOf(Brain.LEAD);
      const before = body.slice(0, at).trim();
      body = body.slice(at + Brain.LEAD.length).trim();
      if (before) html += md(before);
      html += `<div class="kb-lead">${ICON_BOOK}<span>${esc(Brain.LEAD.replace(/:$/, ''))}</span></div>`;
    }
    html += `<div class="msg-body">${md(body)}</div>`;
    node.innerHTML = html;
    const meta = el('div', 'chat-meta');
    const s = m.sources && m.sources.length ? sourcesEl(m.sources) : null;
    const f = withFollow && m.follow && m.follow.length ? followEl(m.follow) : null;
    if (s) meta.appendChild(s);
    if (f) meta.appendChild(f);
    if (s || f) node.appendChild(meta);
  }
  const bubble = (role, text, cls = '') => {
    const node = el('div', `msg ${role === 'user' ? 'user' : 'bot'} ${cls}`.trim());
    if (role === 'user') node.textContent = text; else node.innerHTML = md(text);
    log.appendChild(node);
    scrollEnd();
    return node;
  };
  // Long answers: bring their beginning into view (not their last line).
  function revealAnswer(node) {
    const room = log.clientHeight;
    const prevUser = node.previousElementSibling;
    if (node.offsetHeight + (prevUser ? prevUser.offsetHeight + 10 : 0) <= room - 16) { scrollEnd(); return; }
    const anchor = prevUser && prevUser.classList.contains('user') && node.offsetHeight < room * 1.6 ? prevUser : node;
    const y = log.scrollTop + anchor.getBoundingClientRect().top - log.getBoundingClientRect().top - 12;
    try { log.scrollTo({ top: y, behavior: reduceMQ.matches ? 'auto' : 'smooth' }); } catch (e) { log.scrollTop = y; }
  }
  const dropFollow = () => log.querySelectorAll('.chat-follow').forEach(n => n.remove());
  const renderSuggestions = () => {
    sug.innerHTML = '';
    if (messages.length) { sug.hidden = true; return; }
    sug.hidden = false;
    SUGGESTIONS.forEach(q => {
      const b = el('button');
      b.type = 'button'; b.textContent = q;
      b.addEventListener('click', () => ask(q));
      sug.appendChild(b);
    });
  };
  const renderAll = () => {
    log.innerHTML = '';
    bubble('model', WELCOME, 'welcome');
    let lastBot = -1;
    messages.forEach((m, i) => { if (m.role === 'model') lastBot = i; });
    messages.forEach((m, i) => {
      if (m.role === 'user') bubble('user', m.text);
      else { const n = el('div'); log.appendChild(n); paintBot(n, m, i === lastBot); }
    });
    scrollEnd();
    renderSuggestions();
  };
  const syncControls = () => {
    send.disabled = busy;
    input.disabled = false;   // typing is ALWAYS possible
    input.removeAttribute('aria-disabled');
    box.classList.toggle('busy', busy);
    log.setAttribute('aria-busy', busy ? 'true' : 'false');
  };

  /* ---------- health (decides Gemini vs brochure mode) ---------- */
  function checkHealth() {
    if (!health) {
      const canFetch = typeof fetch === 'function' && /^https?:$/.test(location.protocol);
      health = (canFetch
        ? fetch('/api/health', { headers: { accept: 'application/json' }, cache: 'no-store' })
          .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
          .catch(() => null)
        : Promise.resolve(null))
        .then(j => { if (mode !== 'local' || (j && j.configured === true)) setMode(j && j.configured === true ? 'gemini' : 'local'); });
    }
    return health;
  }

  /* ---------- request payload (fits the Worker limits) ---------- */
  const clip = t => (t.length > MAX_CHARS ? Array.from(t).slice(0, MAX_CHARS).join('') : t);
  function payload() {
    let list = messages.slice(-12).map(m => ({ role: m.role, text: clip(m.text) }));
    const size = () => new TextEncoder().encode(JSON.stringify({ messages: list })).length;
    while (list.length > 1 && (size() > MAX_PAYLOAD || list[0].role !== 'user')) list.shift();
    return JSON.stringify({ messages: list });
  }

  /* ---------- Gemini streaming ---------- */
  async function streamGemini(node) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    let answer = '', errKey = null, frame = 0, aborted = '';
    let firstTimer = setTimeout(() => { aborted = 'timeout'; if (ctrl) ctrl.abort(); }, FIRST_TOKEN_MS);
    let idleTimer = 0;
    const bumpIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { aborted = 'timeout'; if (ctrl) ctrl.abort(); }, IDLE_MS); };
    const paint = () => { frame = 0; node.innerHTML = `<div class="msg-body">${md(answer)}</div>`; scrollEnd(); };
    const handleEvent = ev => {
      const data = ev.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') return;
      let obj;
      try { obj = JSON.parse(data); } catch (e) { return; }
      if (obj.error) { errKey = 'upstream'; return; }
      const parts = (obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts) || [];
      for (const p of parts) if (p.text && !p.thought) answer += p.text;
      if (answer) { clearTimeout(firstTimer); firstTimer = 0; bumpIdle(); }
      if (answer && !frame) frame = requestAnimationFrame(paint);
    };
    let status = 0;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: payload(),
        signal: ctrl ? ctrl.signal : undefined,
      });
      status = res.status;
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('text/event-stream')) {
        let j = null;
        try { j = await res.json(); } catch (e) { /* not json */ }
        const k = j && j.error;
        errKey = [404, 405].includes(res.status) || k === 'not_found' || k === 'method_not_allowed' ? 'not_configured'
          : res.status === 429 ? 'rate_limited' : (k && FALLBACK_NOTE[k] ? k : 'upstream');
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const events = buf.split(/\r?\n\r?\n/);
          buf = events.pop();
          events.forEach(handleEvent);
        }
        buf += dec.decode();
        if (buf.trim()) handleEvent(buf);   // trailing event without a blank line
      }
    } catch (e) {
      errKey = errKey || aborted || 'network';
    }
    clearTimeout(firstTimer); clearTimeout(idleTimer);
    cancelAnimationFrame(frame);
    return { answer, errKey, status };
  }

  /* ---------- local (brochure) answer ---------- */
  function localAnswer(text, opts) {
    try {
      if (!window.TAKAMUL_KB) throw new Error('kb missing');
      const a = opts && opts.id ? Brain.answerItem(opts.id) : Brain.answer(text, { prev: opts && opts.prev });
      if (a) return a;
    } catch (e) { /* fall through */ }
    return { kind: 'fallback', text: 'Couldn’t load the brochure text on this page. You can browse the [Answer Guide](faq.html) directly.', sources: [], followups: [] };
  }

  /* ---------- ask ---------- */
  async function ask(text, opts = {}) {
    text = clip(String(text == null ? '' : text).trim());
    if (!text) return;
    if (busy) { input.value = text; autosize(); return; }
    busy = true;
    syncControls();
    const prev = lastUserText();
    messages.push({ role: 'user', text });
    save();
    sug.innerHTML = ''; sug.hidden = true;
    dropFollow();
    bubble('user', text);
    if (input.value.trim() === text.trim() || opts.fromInput) { input.value = ''; autosize(); }
    const node = bubble('model', '');
    node.innerHTML = '<span class="typing" role="status" aria-label="Typing"><i></i><i></i><i></i></span>';

    if (mode === 'checking') await Promise.race([checkHealth(), wait(HEALTH_WAIT_MS)]);

    let m = null;
    let errKey = null;
    if (mode === 'gemini' && !opts.id) {
      const r = await streamGemini(node);
      errKey = r.errKey;
      if (errKey === 'not_configured' || errKey === 'forbidden') setMode('local');
      if (r.answer) {
        const a = localAnswer(text, { prev });
        m = {
          role: 'model', src: 'gemini', text: r.answer + (errKey ? CUT_NOTE : ''), note: '',
          sources: a.kind === 'answer' ? a.sources.map(s => s.id) : [],
          follow: a.kind === 'answer' ? a.followups.map(f => f.id) : [],
        };
      }
    } else if (!reduceMQ.matches) {
      await wait(260 + Math.min(420, text.length * 6));   // a breath, so the answer doesn't "snap"
    }
    if (!m) {
      const a = localAnswer(text, { prev, id: opts.id });
      m = {
        role: 'model', src: 'local', text: a.text, note: errKey ? (FALLBACK_NOTE[errKey] || FALLBACK_NOTE.upstream) : '',
        sources: (a.sources || []).map(s => s.id), follow: (a.followups || []).map(f => f.id),
      };
    }
    messages.push(m);
    save();
    paintBot(node, m, true);
    revealAnswer(node);
    busy = false;
    syncControls();
    const act = document.activeElement;
    if (!mobileMQ.matches && !box.hidden && (!act || act === document.body || box.contains(act))) input.focus({ preventScroll: true });
  }

  /* ---------- clicks inside the log: follow-ups & source deep links ---------- */
  log.addEventListener('click', e => {
    const f = e.target.closest('.follow-chip');
    if (f) {
      const it = kbItem(f.dataset.id);
      if (!it) return;
      const label = Brain.shortTitle(it);
      ask(it.type === 'faq' ? label : label, mode === 'gemini' ? {} : { id: it.id });
      return;
    }
    const a = e.target.closest('a[href]');
    if (!a) return;
    const url = new URL(a.getAttribute('href'), location.href);
    const samePage = url.pathname.replace(/\/index\.html$/, '/') === location.pathname.replace(/\/index\.html$/, '/');
    if (samePage && url.hash) {
      if (mobileMQ.matches) close();
      setTimeout(() => flash(url.hash.slice(1)), 60);
    } else if (!mobileMQ.matches && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      try { sessionStorage.setItem(REOPEN, '1'); } catch (err) { /* ignore */ }
    }
  });
  function flash(id) {
    const t = id && document.getElementById(id);
    if (!t) return;
    t.classList.remove('kb-flash');
    void t.offsetWidth;
    t.classList.add('kb-flash');
    setTimeout(() => t.classList.remove('kb-flash'), 2200);
  }

  /* ---------- open / close (modal + focus handling) ---------- */
  const outside = () => ['.nav', 'main', '.footer', '.tabbar', '.chat-fab', '.totop', '.progress']
    .map(s => document.querySelector(s)).filter(Boolean);
  let opened = false, lastFocus = null;
  const setModal = on => {
    const modal = on && mobileMQ.matches;
    panel.setAttribute('aria-modal', modal ? 'true' : 'false');
    outside().forEach(n => { n.inert = modal; });
  };
  const fitViewport = () => {
    const vv = window.visualViewport;
    if (box.hidden || !vv || !mobileMQ.matches) { box.style.height = ''; box.style.top = ''; return; }
    box.style.top = vv.offsetTop + 'px';
    box.style.height = vv.height + 'px';
    scrollEnd();
  };
  const open = () => {
    if (!box.hidden) return;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add('chat-open');
    setModal(true);
    fitViewport();
    if (!opened) { opened = true; renderAll(); checkHealth(); }
    syncControls();
    setTimeout(() => {
      if (mobileMQ.matches) { panel.setAttribute('tabindex', '-1'); panel.focus({ preventScroll: true }); }
      else input.focus({ preventScroll: true });
    }, 60);
  };
  const close = () => {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('chat-open');
    if (headSmall) headSmall.classList.remove('tip-open');
    setModal(false);
    fitViewport();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  };
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); open(); }));
  $('.chat-close', box).addEventListener('click', close);
  $('.chat-clear', box).addEventListener('click', () => {
    if (busy) return;
    messages = []; save(); renderAll(); syncControls();
    input.focus({ preventScroll: true });
  });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || box.hidden || e.defaultPrevented) return;
    const a = document.activeElement;
    if (mobileMQ.matches || !a || a === document.body || box.contains(a)) close();
  });
  document.addEventListener('click', e => {
    if (headSmall && headSmall.classList.contains('tip-open') && !headSmall.contains(e.target)) headSmall.classList.remove('tip-open');
  });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitViewport);
    visualViewport.addEventListener('scroll', fitViewport);
  }
  const onMQ = () => { if (!box.hidden) { setModal(true); fitViewport(); } };
  mobileMQ.addEventListener ? mobileMQ.addEventListener('change', onMQ) : mobileMQ.addListener(onMQ);

  /* ---------- input ---------- */
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 130) + 'px'; };
  input.disabled = false;
  input.addEventListener('input', () => { autosize(); box.classList.toggle('has-text', !!input.value.trim()); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) ask(input.value, { fromInput: true }); }
  });
  form.addEventListener('submit', e => { e.preventDefault(); if (!busy) ask(input.value, { fromInput: true }); });

  /* ---------- public API ---------- */
  window.TakamulChat = {
    open,
    close,
    ask(text) { open(); if (text && String(text).trim()) ask(String(text)); },
    isOpen: () => !box.hidden,
    mode: () => mode,
  };

  // Desktop continuity: a source link to another page re-opens the conversation there.
  let reopen = false;
  try { reopen = sessionStorage.getItem(REOPEN) === '1'; sessionStorage.removeItem(REOPEN); } catch (e) { /* ignore */ }
  if (reopen && !mobileMQ.matches) {
    open();
    if (location.hash) setTimeout(() => flash(location.hash.slice(1)), 400);
  }
})();
