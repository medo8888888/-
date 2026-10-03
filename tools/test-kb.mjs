// Offline-assistant tests: node tools/test-kb.mjs
// Loads site/data/kb.js and the brain from site/js/chat.js (Part 1, DOM-free) into a fake
// window and checks retrieval quality, small talk, answer verbatim-ness and XSS safety.
// Dependency-free (Node 22). Exit code 1 on failure.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(ROOT, p), 'utf8');

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('site/data/kb.js'), ctx, { filename: 'kb.js' });
vm.runInContext(read('site/js/chat.js'), ctx, { filename: 'chat.js' });
const Brain = ctx.TakamulBrain;
const KB = ctx.TAKAMUL_KB;

let failures = 0;
const fail = msg => { failures++; console.log('  ✗ ' + msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); return cond; };

if (!Brain || !KB) { console.log('TakamulBrain or TAKAMUL_KB missing'); process.exit(1); }
if (ctx.TakamulChat) fail('DOM part must not run without a document');

/* ------------------------------------------------------------------ retrieval */
// [question, expected id(s) — first is the ideal answer; any listed id counts as correct]
const CASES = [
  ['ما هي مبادرة «ينابيع»؟', ['s3-1']],
  ['ايش هي مبادرة منافع', ['s3-2']],
  ['شو يعني ينابيع', ['s3-1']],
  ['مبادره ينابع', ['s3-1']],                                   // typo
  ['كيف أنضم إلى الجمعية؟', ['s7-2', 's12']],
  ['ما شروط العضوية؟', ['s7-2']],
  ['هل يحق للأجانب الحصول على العضوية؟', ['s7-2']],
  ['بدي اشترك معكم شو الشروط', ['s7-2']],
  ['لماذا أنضم إلى تكامل؟', ['s12']],
  ['ما الذي يميز الجمعية عن غيرها', ['s12']],
  ['ما هي مراحل التوسع الجغرافي؟', ['s5']],
  ['خطة التوسع', ['s5']],
  ['المرحلة الثالثة أكبر ١٠ ولايات تركية', ['st3']],         // Arabic-Indic digits
  ['متى تصلون إلى أنقرة؟', ['st2']],
  ['الدول الإسلامية', ['st5', 'st6']],
  ['ما مصادر تمويل الجمعية؟', ['s8-1']],
  ['من وين بتجيبوا الفلوس', ['s8-1', 'f7']],
  ['كيف نحقق الاستدامة المالية بدون الاعتماد على التبرعات', ['f7']],
  ['هل يجوز للجمعية الاقتراض؟', ['s8-2']],
  ['ما حقوق العضو وواجباته؟', ['s9']],
  ['واجبات العضو الجديد', ['s9']],
  ['ما رؤية الجمعية؟', ['s2', 'f2']],
  ['رؤية ٢٠٣٥', ['s2', 'f2']],
  ['مَا هِيَ رُؤْيَةُ الجَمْعِيَّةِ؟', ['s2', 'f2']],                    // diacritics
  ['ما هي رسالة الجمعية', ['s2']],
  ['ما الأهداف الإستراتيجية؟', ['s2-1']],
  ['أين يقع مقر الجمعية؟', ['s1']],
  ['وين مقركم', ['s1']],
  ['من هم الأعضاء المؤسسون؟', ['s11']],
  ['ما هي الجمعية العمومية؟', ['s7-1']],
  ['كم عدد أعضاء مجلس الإدارة؟', ['s7-1', 'p2']],
  ['مجلس الرقابة', ['s7-1']],
  ['الهيكل الإداري والحوكمة', ['s7-1', 's7']],
  ['ما هي الأقسام التنفيذية في الجمعية؟', ['s4-2']],
  ['فلسفة العمل', ['s4-1']],
  ['من هي الفئات المستهدفة؟', ['s6']],
  ['قياس الأثر التنموي', ['s10']],
  ['منهجية التطبيق الميداني', ['s7-3']],
  ['ما الكيان القانوني للجمعية؟', ['f4']],
  ['متى نصل إلى نقطة التعادل؟', ['f8']],
  ['ما المخاطر التشغيلية والمالية؟', ['f9']],
  ['مؤشرات الأداء KPIs', ['b2']],
  ['هل لديكم خطط تعاقب وظيفي؟', ['b3']],
  ['هل القوائم المالية تخضع لمراجعة مستقلة؟', ['b4']],
  ['القيم الجوهرية', ['f3']],
  ['كيف توزع الصلاحيات بين الهياكل؟', ['f5']],
  ['هل يمكن استرداد الاشتراكات؟', ['f6']],
  ['ما مدة دورة مجلس الإدارة؟', ['p8']],
  ['جنسيات أعضاء مجلس الإدارة', ['p2']],
  ['الذكاء الاصطناعي والتحول الرقمي', ['p6']],
  ['تطبيق منافع', ['p10', 's3-2']],
  ['كم عضو متفرغ في الجمعية', ['p9']],
  ['الدعم التقني والأبحاث والدراسات', ['s3-3']],
  ['التمويـــل', ['s8-1', 's8', 'f7']],                         // tatweel
  ['شو بتعملوا للشباب اللي بدهم شغل', ['s3-2', 's6']],
  ['how do I join?', ['s7-2', 's12']],                           // non-Arabic → Arabic answer
  ['شو هي رؤيتكم للمستقبل', ['s2', 'f2']],
  ['ما هي القيم التي تحكم العمل', ['f3', 's4-1']],
  ['اريد ان اتطوع معكم', ['s7-2', 's12']],
  ['هل في تدريب مهني للنساء', ['s3-2', 's2-1']],
  ['برامج للأطفال', ['s3-1']],
  ['ماذا تقدمون للأسر المتعففة', ['s3-2']],
  ['كيف تقيسون نجاح الادارة التنفيذية', ['b2', 'b1']],
  ['ميزانية الجمعية السنوية', ['b5']],
  ['تقلبات العملة والتضخم', ['b7']],
  ['ما المشكلة التي تحلها الجمعية', ['f1']],
  ['هل الجمعية تعمل خارج تركيا', ['s1', 'p4', 'f4']],
  ['المرحلة الأخيرة من التوسع', ['st7', 's5']],
  ['من هم المستفيدون', ['s6']],
  ['دورة العمل التنفيذية', ['s7-3']],
  ['ما هو الأثر المزدوج', ['s4-1', 'f1']],
  ['هل يوجد احتياطي نقدي', ['f9']],
  ['ما هي الركائز العشر', ['s12']],
  ['هل الجمعية ربحية', ['f4', 's1']],
  ['من يدير الجمعية', ['s7-1', 's7']],
];

let top1 = 0, top3 = 0;
const misses = [];
for (const [q, exp] of CASES) {
  const res = Brain.search(q, { limit: 5 });
  const ids = res.map(r => r.id);
  const t1 = exp.includes(ids[0]);
  const t3 = ids.slice(0, 3).some(id => exp.includes(id));
  if (t1) top1++;
  if (t3) top3++;
  if (!t1) misses.push(`${t3 ? '~' : '✗'} «${q}» → ${ids.slice(0, 3).join(', ') || '—'} (expected ${exp.join(' | ')})`);
}
const p1 = top1 / CASES.length, p3 = top3 / CASES.length;
console.log(`retrieval: ${CASES.length} questions — top-1 ${(p1 * 100).toFixed(1)}%  top-3 ${(p3 * 100).toFixed(1)}%`);
misses.forEach(m => console.log('   ' + m));
ok(CASES.length >= 30, 'at least 30 questions');
ok(p1 >= 0.85, `top-1 accuracy ${(p1 * 100).toFixed(1)}% < 85%`);
ok(p3 >= 0.95, `top-3 accuracy ${(p3 * 100).toFixed(1)}% < 95%`);

/* ------------------------------------------------------------------ normalisation */
const N = Brain.normalize;
ok(N('أإآٱ') === 'اااا', 'alef variants');
ok(N('مدرسة') === 'مدرسه' && N('مستشفى') === 'مستشفي', 'ta marbuta / alef maqsura');
ok(N('رُؤْيَةُ') === 'رويه', 'diacritics + hamza on waw');
ok(N('التمويـــل') === 'التمويل', 'tatweel');
ok(N('٢٠٣٥ ۲۰۳۵') === '2035 2035', 'Arabic-Indic & Persian digits');
ok(N('کتاب یک') === 'كتاب يك', 'Persian kaf / yeh');
const V = w => Brain.variants(N(w));
ok(V('الولايات').some(v => V('ولايات').includes(v)), 'stemming: الولايات ~ ولايات');
ok(V('رسالتنا').some(v => V('الرسالة').includes(v)), 'stemming: رسالتنا ~ الرسالة');
ok(V('المبادرات').some(v => V('مبادرتين').includes(v)), 'stemming: المبادرات ~ مبادرتين');

/* ------------------------------------------------------------------ answers */
const brochure = new Set(read('content/brochure.txt').split('\n').map(l => l.trim().replace(/^[●✔◆]\s+/, '')));
const verbatimRows = () => {
  let bad = 0;
  for (const it of KB.items) {
    for (const r of it.rows || []) {
      for (const k of ['h', 'k', 'v', 'tag']) if (r[k] != null && !brochure.has(r[k])) { bad++; if (bad < 4) fail(`row not verbatim in ${it.id}: ${r[k].slice(0, 60)}`); }
    }
  }
  return bad === 0;
};
ok(verbatimRows(), 'every KB row is a verbatim brochure line');

const a1 = Brain.answer('ما هي مبادرة منافع؟');
ok(a1.kind === 'answer' && a1.top === 's3-2', 'answer() picks s3-2 for منافع');
ok(a1.text.startsWith(Brain.LEAD), 'answer starts with the lead line');
ok(a1.sources.length >= 1 && a1.sources[0].url === 'initiatives.html#s3-2', 'answer has a deep-link source');
ok(a1.followups.length >= 2 && a1.followups.length <= 3, 'answer has 2–3 follow-ups');
// every non-chrome line of the answer is verbatim brochure text
{
  const it = KB.items.find(i => i.id === 's3-2');
  const plain = a1.text.replace(/\*\*|_/g, '').split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean);
  const notVerbatim = plain.filter(l => l !== Brain.LEAD && !brochure.has(l) && !l.split(' — ').every(p => brochure.has(p)) && l !== it.title.replace(/^\d+\.\d+\s+/, ''));
  ok(notVerbatim.length === 0, 'answer lines are verbatim: ' + notVerbatim.join(' | '));
}
const big = Brain.answer('ما المخاطر المالية والاحتياطي النقدي؟');
ok(big.kind === 'answer', 'risk question answered');
const lines = big.text.split('\n').filter(l => l.startsWith('- ')).length;
ok(lines >= 2 && lines <= 8, `answer keeps 3–8 lines (got ${lines} bullets)`);

const off = Brain.answer('ما هي عاصمة اليابان وكم عدد سكانها؟');
ok(off.kind === 'fallback', 'off-topic → fallback (got ' + off.kind + ' ' + off.top + ')');
ok(/faq\.html/.test(off.text) && off.followups.length >= 2, 'fallback links faq.html and suggests topics');
const off2 = Brain.answer('اكتب لي قصيدة عن البحر');
ok(off2.kind === 'fallback', 'poem request → fallback (got ' + off2.kind + ' ' + off2.top + ')');

const en = Brain.answer('What is your vision?');
ok(en.kind === 'answer' && /العربية/.test(en.text) && ['s2', 'f2'].includes(en.top), 'English → Arabic note + best result');

const contact = Brain.answer('ما رقم الهاتف أو الإيميل؟');
ok(contact.kind === 'answer' && contact.top === 's1' && /لا يتضمن/.test(contact.text), 'contact question → honest note + headquarters (no invented contacts)');
ok(Brain.answer('من رئيس الجمعية؟').kind === 'fallback', 'unknown fact (president) → fallback, not a random match');

const ctxA = Brain.answer('وما شروطها؟', { prev: 'ما هي العضوية في الجمعية' });
ok(ctxA.kind === 'answer' && ctxA.top === 's7-2', 'follow-up question uses previous context (got ' + ctxA.top + ')');

/* ------------------------------------------------------------------ small talk */
const ST = [
  ['السلام عليكم', 'salam'], ['السلام عليكم ورحمة الله وبركاته', 'salam'], ['مرحبا', 'greet'], ['أهلاً', 'greet'],
  ['شكراً جزيلاً', 'thanks'], ['جزاك الله خيرا', 'thanks'], ['من أنت؟', 'who'], ['مين انت', 'who'],
  ['ماذا تستطيع أن تفعل؟', 'can'], ['شو بتقدر تساعدني', 'can'], ['مع السلامة', 'bye'], ['hello', 'greet'],
];
let stOk = 0;
for (const [q, k] of ST) {
  const a = Brain.answer(q);
  if (a.kind === 'smalltalk' && a.small === k) stOk++; else fail(`small talk «${q}» → ${a.kind}/${a.small || a.top}`);
}
const mixed = Brain.answer('السلام عليكم، كيف أنضم إلى الجمعية؟');
ok(mixed.kind === 'answer' && mixed.text.startsWith('وعليكم السلام'), 'greeting + question → greeting + answer');
ok(Brain.answer('ما هي الجمعية العمومية').kind === 'answer', '«ما هي» questions are not small talk');

/* ------------------------------------------------------------------ XSS safety */
const x1 = Brain.md('<img src=x onerror=alert(1)>');
ok(!/<img/i.test(x1) && x1.includes('&lt;img'), 'md escapes raw HTML');
const x2 = Brain.md('[اضغط](javascript:alert(1))');
ok(!/href/i.test(x2) && !/javascript:[^<]*<\/a>/i.test(x2), 'md drops javascript: links');
const x3 = Brain.md('[x](data:text/html;base64,PHNjcmlwdD4=)');
ok(!/href/i.test(x3), 'md drops data: links');
const x4 = Brain.md('[دليل](faq.html#f1) و[موقع](https://example.org/a?b=1&c=2)');
ok(/href="faq\.html#f1"/.test(x4) && /href="https:\/\/example\.org\/a\?b=1&amp;c=2"/.test(x4) && /rel="noopener noreferrer"/.test(x4), 'md keeps safe links');
const x5 = Brain.md('**"><svg onload=alert(1)>**');
ok(!/<svg/i.test(x5) && /<strong>/.test(x5), 'bold cannot smuggle markup');
const evil = Brain.answer('<img src=x onerror=alert(1)> ما هي ينابيع');
ok(!/<img/i.test(Brain.md(evil.text)), 'answer to malicious input renders safely');
const x6 = Brain.md('[a](https://x.org" onmouseover="alert(1))');
ok(!/onmouseover="/.test(x6), 'quote injection in link url is neutralised');

console.log(`small talk: ${stOk}/${ST.length} | kb items: ${KB.items.length}`);
console.log(failures ? `FAILED (${failures})` : 'all offline-assistant tests passed');
process.exit(failures ? 1 : 0);
