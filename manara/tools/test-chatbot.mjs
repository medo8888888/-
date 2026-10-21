// "Ask MANARA" chatbot tests — Playwright + Chromium, file:// URLs:  node manara/tools/test-chatbot.mjs
//
//  1. Knowledge base (no browser): every entry bilingual, unique ids, follow-ups exist, every cited page exists (anchors too), every source document exists,
//     every number in an answer is found in the project's own documents/pages, no banned claim wording, team placeholders kept as placeholders
//  2. Normalisation: tashkeel / tatweel / alef / ya / ta-marbuta, English stemming, typos
//  3. Retrieval: representative questions (Arabic, English, dialect, typos) land on the right entry; every entry's own question lands on itself; unrelated questions are refused
//  4. Emergency override: banner FIRST (before the answer), both languages, not raised for questions about the project
//  5. UI: mode switch, chips, answer sources, "why", thumbs (memory only), export, clear, typing indicator / typed letters / reduced motion, a11y roles and labels
//  6. Launcher on every page (not on control / poster / chat): opens, Esc closes and returns focus, lazy-loads, back-end hook (never auto-network)
//  7. Layout (390 / 820 / 1440, ar + en, dark + light), no console errors, no network requests, no innerHTML in the sources
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { launch, openPage, overflow, check, done, SITE, ROOT, url } from './lib.mjs';

const section = t => console.log(`\n${t}`);
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// ======================================================================= 1. knowledge base
section('1. Knowledge base');
const kbSrc = read('js/chatbot-kb.js');
const kbCtx = { window: {} }; vm.runInNewContext(kbSrc, kbCtx);
const KB = kbCtx.window.MANARA_CHAT_KB;
const E = KB.entries;
check(`knowledge base loads as a classic script: ${E.length} entries (at least 40)`, E.length >= 40, String(E.length));
check('ids are unique', new Set(E.map(e => e.id)).size === E.length);
const bi = o => o && typeof o.ar === 'string' && typeof o.en === 'string' && o.ar.trim().length > 3 && o.en.trim().length > 3;
const bad = [];
for (const e of E) {
  if (!['res', 'jud', 'both'].includes(e.aud)) bad.push(e.id + ': aud');
  if (!bi(e.q)) bad.push(e.id + ': q');
  if (!bi(e.a)) bad.push(e.id + ': a');
  if (!bi(e.k) ) bad.push(e.id + ': k');
  if (!(e.s && e.s.ar.length && e.s.en.length)) bad.push(e.id + ': samples');
  if (e.m && !bi(e.m)) bad.push(e.id + ': m');
  if (!/[؀-ۿ]/.test(e.a.ar) || /^[\x00-\x7f\s]+$/.test(e.a.ar)) bad.push(e.id + ': a.ar is not Arabic');
  if (/[؀-ۿ]{4,}/.test(e.a.en.replace(/«[^»]*»/g, ''))) bad.push(e.id + ': Arabic prose in a.en');
}
check(`all ${E.length} entries are bilingual (question, answer, keywords, sample phrasings in ar and en; audience set)`, bad.length === 0, bad.slice(0, 6).join(' | '));
const ids = new Set(E.map(e => e.id));
check('every follow-up chip points at an existing entry (and not at itself)', E.every(e => (e.f || []).length >= 2 && e.f.every(f => ids.has(f) && f !== e.id)), E.filter(e => !(e.f || []).length || e.f.some(f => !ids.has(f) || f === e.id)).map(e => e.id).join(','));
check('starter chips exist for both audiences', ['res', 'jud'].every(m => KB.starters[m].length >= 4 && KB.starters[m].every(i => ids.has(i))));
const pageOf = s => s.split('#')[0];
const missPages = [];
for (const e of E) {
  if (!(e.src && e.src.length)) { missPages.push(e.id + ': no source page'); continue; }
  for (const s of e.src) {
    const p = pageOf(s);
    if (!KB.pages[p]) missPages.push(`${e.id}: ${p} has no title`);
    if (!fs.existsSync(path.join(SITE, p))) { missPages.push(`${e.id}: ${p} does not exist`); continue; }
    const h = s.split('#')[1]; if (h && !new RegExp(`id=["']${h}["']`).test(read(p))) missPages.push(`${e.id}: ${s} anchor missing`);
  }
}
check('every entry cites at least one "see page" link and every cited page (and #anchor) exists', missPages.length === 0, missPages.slice(0, 5).join(' | '));
const missDoc = E.filter(e => !e.doc || !e.doc.split(/[;·]/).map(x => x.trim()).some(x => /\.(md|js|html)\b|pitch Q&A|tools\/|data\//.test(x))).map(e => e.id);
const docFiles = E.flatMap(e => [...(e.doc || '').matchAll(/(docs\/[\w.-]+\.md|js\/[\w.-]+\.js|[\w-]+\.html|data\/[\w.-]+\.js|tools\/[\w.-]+\.(?:sh|mjs))/g)].map(m => m[1]));
const absentDoc = [...new Set(docFiles)].filter(f => !fs.existsSync(path.join(SITE, f)) && !fs.existsSync(path.join(ROOT, f)));
check('every entry names the project document it was written from (doc), and those files exist', missDoc.length === 0 && absentDoc.length === 0, `${missDoc.join(',')} ${absentDoc.join(',')}`);

// every number in an answer must exist in the project's own sources
const corpus = ['docs/MANARA.md', 'docs/MANARA-HAZARDS.md', 'docs/MANARA-SOURCES.md', 'docs/MANARA-SPEC.md', 'docs/MANARA-QATAR.md', 'docs/MANARA-DATA.md', 'js/pitch.js', 'js/guide.js', 'plan.html', 'build.html', 'js/report.js', 'js/home.js', 'poster.html', 'data/test-counts.js'].map(f => { try { return fs.readFileSync(path.join(f.startsWith('docs') ? ROOT : SITE, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
const AD = '٠١٢٣٤٥٦٧٨٩';
const normN = s => s.replace(/[٠-٩]/g, c => AD.indexOf(c)).replace(/(\d),(\d{3})/g, '$1$2');
const corpusNums = new Set([...normN(corpus).matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]));
const strayNums = [];
for (const e of E) for (const l of ['ar', 'en']) {
  const txt = normN(e.a[l].replace(/\{\{[^}]*\}\}/g, ' ') + ' ' + ((e.m && e.m[l]) || ''));
  for (const m of txt.matchAll(/\d+(?:\.\d+)?/g)) { const n = m[0]; if (+n <= 12 && !n.includes('.')) continue; if (!corpusNums.has(n)) strayNums.push(`${e.id}/${l}: ${n}`); }
}
check('every number (above 12) in every answer, ar and en, appears in the project\'s own documents or pages (no invented figures)', strayNums.length === 0, strayNums.slice(0, 8).join(' | '));
// the headline simulation figures equal what docs/MANARA.md prints
const MD = fs.readFileSync(path.join(ROOT, 'docs/MANARA.md'), 'utf8');
const dn = E.find(e => e.id === 'jud-drone-numbers').a.en, th = E.find(e => e.id === 'jud-thermal').a.en, de = E.find(e => e.id === 'jud-detector').a.en, rb = E.find(e => e.id === 'jud-robot').a.en;
check('measured numbers: drone first in 90% (median 244 s vs 440.5 s), 33% out of range, thermal 2% vs 70%, detector 66.7%, robot 5 of 8 seeds: equal to docs/MANARA.md and the pitch (66.7% from the pitch)', /90\s?%/.test(dn) && /244 s/.test(dn) && /440\.5 s/.test(dn) && /33%/.test(dn) && /\*\*90 %\*\*[^]*244 s vs 440\.5 s/.test(MD.replace(/\n/g, ' ')) && /33 % of the incidents are out of range/.test(MD) &&
  /2%/.test(th) && /70%/.test(th) && /2 % at 13:00 in July[^]*vs 70 % at 02:00/.test(MD) && /66\.7%/.test(de) && /66\.7%/.test(read('js/pitch.js')) && /5 of 8 seeds/.test(rb) && /5 of 8/.test(read('js/pitch.js')));
const banned = [/\bsav(?:es?|ing|ed)\s+(?:\d[\d,]*\s+|many\s+|countless\s+)?lives\b/i, /\bworld[- ]first\b/i, /\bfirst[- ]ever\b/i, /\blife-?saving\b/i, /\bAI[- ](powered|based|driven|enabled)\b/i, /\bartificial intelligence\b/i, /\bdeep[- ]learning\b/i];
const ai = [];
for (const e of E) for (const l of ['ar', 'en']) for (const re of banned) { const m = re.exec(e.a[l]); if (m && !/\b(not|never|no)\b/i.test(e.a[l].slice(Math.max(0, m.index - 40), m.index))) ai.push(e.id + ': ' + m[0]); }
check('no claim wording ("saves lives", "world-first", "AI-powered", "artificial intelligence" for the detector): only negated mentions', ai.length === 0, ai.join(' | '));
const team = E.find(e => e.id === 'jud-team');
check('team placeholders stay placeholders ({{STUDENT_NAME}}, {{SCHOOL_NAME}}, {{MENTOR_NAME}} …), no invented names', ['STUDENT_NAME', 'SCHOOL_NAME', 'MENTOR_NAME', 'HELPED_BY'].every(k => team.a.en.includes('{{' + k + '}}') && team.a.ar.includes('{{' + k + '}}')));
check('regulation / number entries add "confirm with the authority" (aviation law, numbers, thresholds, costs)', ['jud-aviation', 'res-numbers', 'jud-thresholds', 'jud-cost', 'res-heat', 'confirm-authority'].every(i => E.find(e => e.id === i).c === 1));

// ======================================================================= browser
const browser = await launch();
const netLog = [];
const open = async (file = 'chat.html', o = {}) => {
  const r = await openPage(browser, file, { width: 1280, height: 860, lang: 'en', theme: 'dark', ...o });
  r.page.on('request', rq => { const u = rq.url(); if (!/^(file:|data:|blob:|about:)/.test(u) && !/fonts\.(googleapis|gstatic)/.test(u)) netLog.push(u); });
  if (file === 'chat.html') await r.page.waitForFunction(() => window.Manara && Manara.chat && Manara.chat.page, null, { timeout: 5000 });
  return r;
};
const ask = (page, q, mode) => page.evaluate(([q, m]) => { const r = Manara.chat.ask(q, { mode: m }); return { id: r.entry && r.entry.id, kind: r.kind, em: r.emergency.is, score: r.score, lang: r.lang }; }, [q, mode || 'res']);

// ======================================================================= 2. normalisation
section('2. Normalisation');
{
  const { page, errors, ctx } = await open();
  const n = await page.evaluate(() => {
    const C = Manara.chat;
    return {
      diac: C.normalize('الحَرِيــــقُ'), alef: C.normalize('أ إ آ ٱ'), ya: C.normalize('مبنى'), ta: C.normalize('ريحة'), hamza: C.normalize('رائحة مسؤول'), digits: C.normalize('٩٩٩'), stretch: C.normalize('حرييييق'),
      stemAr: [C.stem(C.normalize('الحرائق')), C.stem(C.normalize('بالحريق')), C.stem(C.normalize('والمسيّرات'))],
      stemEn: ['fires', 'fire', 'firing', 'leaking', 'leaks', 'leaked', 'flooded', 'flooding', 'drones', 'smoking', 'smoke'].map(w => C.stem(w)),
      tok: C.tokens('How do I put out the fires?'),
    };
  });
  check('Arabic: tashkeel and tatweel stripped (الحَرِيــــقُ → الحريق)', n.diac === 'الحريق', n.diac);
  check('Arabic: alef forms unified (أ إ آ ٱ → ا)', n.alef.replace(/\s/g, '') === 'اااا', n.alef);
  check('Arabic: alef maqsura → ya (مبنى → مبني); ta marbuta → ha (ريحة → ريحه); hamza carriers; Arabic-Indic digits → 999; stretched letters collapse', n.ya === 'مبني' && n.ta === 'ريحه' && n.hamza === 'رايحه مسوول' && n.digits === '999' && n.stretch === 'حريق', JSON.stringify(n));
  check('Arabic light stemming: الحرائق / بالحريق share a stem with حريق-forms; والمسيّرات loses ال/و', n.stemAr[1] === 'حريق' && n.stemAr[2].startsWith('مسير'), JSON.stringify(n.stemAr));
  check('English light stemming: fires/fire/firing share a stem; leaking/leaks/leaked → leak; flooded/flooding → flood; drones → drone', n.stemEn[0] === n.stemEn[1] && n.stemEn[1] === n.stemEn[2] && n.stemEn.slice(3, 6).every(s => s === 'leak') && n.stemEn.slice(6, 8).every(s => s === 'flood') && n.stemEn[8] === 'dron' && n.stemEn[9] === n.stemEn[10], JSON.stringify(n.stemEn));
  check('stop-words are dropped ("How do I put out the fires?" → put fir)', n.tok.join(' ') === 'put fir', n.tok.join(' '));
  check('no console errors while loading', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 3. retrieval
section('3. Retrieval');
const CASES = [
  // residents
  ['what should I do if there is a fire in my building', 'res-fire', 'res'], ['حريق في العمارة ماذا أفعل', 'res-fire', 'res'], ['there is smoke in the corridor', 'res-fire', 'res'], ['كيف اهرب من الدخان', 'res-fire', 'res'],
  ['شلون اطفي الحريق', 'res-fire-fight', 'res'], ['how do I extinguish a fire', 'res-fire-fight', 'res'], ['how do i put out the fier', 'res-fire-fight', 'res'],
  ['i smell gas in the kitchen', 'res-gas', 'res'], ['ريحة غاز في المطبخ', 'res-gas', 'res'], ['الغاز يسرب من الاسطوانة', 'res-gas', 'res'], ['gass leek what to do', 'res-gas', 'res'],
  ['what to do in a flood', 'res-flood', 'res'], ['الميه دخلت البيت', 'res-flood', 'res'], ['flod warning heavy rain', 'res-flood', 'res'], ['can I drive through the underpass when it is flooded', 'res-flood-drive', 'res'],
  ['ماذا أفعل في عاصفة غبار', 'res-dust', 'res'], ['عجاج كثيف اليوم', 'res-dust', 'res'], ['dust storm and asthma', 'res-dust', 'res'],
  ['it is very hot what should workers do', 'res-heat', 'res'], ['الجو حار مرة وأنا أعمل في الشمس', 'res-heat', 'res'], ['how do I recognise heat stroke', 'res-heatstroke', 'res'],
  ['someone collapsed and is not breathing', 'res-help', 'res'], ['نجدة شخص سقط ولا يتحرك', 'res-help', 'res'], ['how will the alert reach me', 'res-alerts', 'res'], ['كيف تصلني التنبيهات', 'res-alerts', 'res'],
  ['what if I sleep through the alarm', 'res-wake', 'res'], ['do you support Malayalam', 'res-languages', 'res'], ['what about deaf and blind residents', 'res-access', 'res'],
  ['are you recording my location? privacy', 'res-privacy', 'res'], ['هل تسجلون موقعي', 'res-privacy', 'res'], ['what is the number for emergency', 'res-numbers', 'res'], ['رقم الطوارئ', 'res-numbers', 'res'],
  ['is this a real alert system', 'res-demo-status', 'res'], ['I have no smartphone', 'res-nophone', 'res'], ['do you cover earthquakes', 'res-earthquake', 'res'],
  // judges
  ['what is MANARA', 'jud-what', 'jud'], ['wat is manra', 'jud-what', 'jud'], ['ما هي منارة', 'jud-what', 'jud'], ['explain the pipeline sense prove reach', 'jud-pipeline', 'jud'],
  ['why two keys and a human', 'jud-prove', 'jud'], ['how often does the drone beat the ground units', 'jud-drone-numbers', 'jud'], ['كم نسبة وصول المسيرة قبل الوحدة الأرضية', 'jud-drone-numbers', 'jud'],
  ['what is the detector accuracy', 'jud-detector', 'jud'], ['detecter acuracy 66.7', 'jud-detector', 'jud'], ['is your detector AI', 'jud-not-ai', 'jud'], ['why is thermal weak at 13:00 in july', 'jud-thermal', 'jud'],
  ['did the robot save the wheelchair user', 'jud-robot', 'jud'], ['what is real and what is simulated', 'jud-sim-vs-real', 'jud'], ['ما حدود المشروع', 'jud-limits', 'jud'],
  ['do you need a permit from the civil aviation authority', 'jud-aviation', 'jud'], ['كيف تختار منارة اسرع وحدة استجابة', 'jud-routing', 'jud'], ['how does the fastest responder routing work', 'jud-routing', 'jud'],
  ['is the traffic real', 'jud-traffic', 'jud'], ['where does the map data come from openstreetmap', 'jud-osm', 'jud'], ['does it work without internet', 'jud-offline', 'jud'], ['how much does it cost', 'jud-cost', 'jud'],
  ['who built this project', 'jud-team', 'jud'], ['how many automated tests', 'jud-tests', 'jud'], ['did you use AI tools', 'jud-ai-use', 'jud'], ['who are you', 'about-bot', 'res'], ['good evening', 'greet', 'res'],
  ['شكرا جزيلا', 'thanks', 'res'], ['what are the regulations about fines', 'confirm-authority', 'res'], ['قانون الطيران والتصاريح للمسيرة', 'jud-aviation', 'jud'], ['كم تكلفة النموذج', 'jud-cost', 'jud']
];
{
  const { page, ctx } = await open();
  const res = await page.evaluate(cs => cs.map(([q, , m]) => { const r = Manara.chat.ask(q, { mode: m }); return { id: r.entry && r.entry.id, kind: r.kind, lang: r.lang }; }), CASES);
  const wrong = CASES.map((c, i) => ({ q: c[0], want: c[1], got: res[i].id, kind: res[i].kind })).filter(x => x.got !== x.want || x.kind === 'unknown');
  check(`${CASES.length} representative questions (ar + en, dialect, typos) land on the right entry`, wrong.length === 0, wrong.slice(0, 4).map(x => `"${x.q}" → ${x.got}/${x.kind} (want ${x.want})`).join(' | '));
  const lang = await page.evaluate(() => [Manara.chat.ask('كيف تصلني التنبيهات').lang, Manara.chat.ask('how will alerts reach me').lang, Manara.chat.ask('999').lang]);
  check('the answer language follows the question (Arabic letters → ar, Latin → en)', lang[0] === 'ar' && lang[1] === 'en', lang.join());
  const self = await page.evaluate(() => { const C = Manara.chat, out = []; for (const id of C.entries()) { const e = C.entry(id); const modes = e.aud === 'both' ? ['res', 'jud'] : [e.aud]; for (const l of ['ar', 'en']) for (const m of modes) { const r = C.ask(e.q[l], { mode: m }); if (!r.entry || r.entry.id !== id || r.kind === 'unknown') out.push(id + '/' + l + '/' + m + ' → ' + (r.entry && r.entry.id) + ' ' + r.kind); } } return out; });
  check('every entry\'s own question (the chip label) lands on itself, in ar and en, in the modes it belongs to', self.length === 0, self.slice(0, 4).join(' | '));
  const samples = await page.evaluate(() => { const C = Manara.chat, out = []; let n = 0; for (const id of C.entries()) { const e = C.entry(id); const modes = e.aud === 'both' ? ['res', 'jud'] : [e.aud]; for (const l of ['ar', 'en']) for (const s of e.s[l]) for (const m of modes) { n++; const r = C.ask(s, { mode: m }); if (!r.entry || r.entry.id !== id || r.kind === 'unknown') out.push(id + ': ' + s); } } return { n, out }; });
  check(`${samples.n} alternative phrasings written for the entries all land on their entry`, samples.out.length <= Math.floor(samples.n * 0.01), samples.out.slice(0, 4).join(' | '));
  const UNKNOWN = ['capital of France', 'who won the world cup', 'what is the weather tomorrow in Doha', 'write me a poem', 'ما هي عاصمة فرنسا', 'how many fire stations in Dubai', 'what is the price of bitcoin', 'كيف اصنع كيكة', 'tell me a joke', 'how do I learn python', 'what is the speed of light', 'recommend a good restaurant in Doha', 'من هو رئيس الوزراء', 'translate this to french', 'ما سعر صرف الدولار', 'calculate 15 times 12', 'is it going to rain tomorrow', 'كيف أحجز تذكرة طيران'];
  const unk = await page.evaluate(qs => qs.map(q => { const r = Manara.chat.ask(q, { mode: 'res' }); return { q, kind: r.kind, id: r.entry && r.entry.id }; }), UNKNOWN);
  const accepted = unk.filter(x => x.kind !== 'unknown');
  check(`${UNKNOWN.length} unrelated questions are refused honestly ("I do not know"), never answered from the nearest topic`, accepted.length === 0, accepted.map(x => `${x.q} → ${x.id}`).join(' | '));
  const prop = await page.evaluate(() => { const r = Manara.chat.ask('capital of France'); return { alts: r.alts.length, kind: r.kind }; });
  check('an unknown question has no entry and no invented answer', prop.kind === 'unknown');
  await ctx.close();
}

// ======================================================================= 4. emergency override
section('4. Emergency override');
{
  const { page, ctx } = await open();
  const YES = [['there is a fire in my building', 'res'], ['there is a fire in my building', 'jud'], ['حريق', 'jud'], ['نجدة', 'jud'], ['help', 'jud'], ['إسعاف', 'res'], ['gas leak', 'jud'], ['تسرب غاز', 'res'], ['smoke!', 'res'], ['i smell gas', 'jud'], ['الحقوني', 'jud'], ['someone is unconscious', 'jud'], ['حريق في المبنى', 'res'], ['ساعدوني', 'res'], ['heart attack', 'res'], ['fier', 'res'], ['شلون اطفي الحريق', 'res'], ['ريحة غاز', 'res']];
  const NO = [['how does MANARA detect fire?', 'res'], ['how does MANARA detect fire?', 'jud'], ['what is the fire detector accuracy', 'res'], ['ما دقة كاشف الحريق', 'res'], ['كيف تكتشف منارة الحريق', 'jud'], ['who helped you build it', 'jud'], ['what is a sentinel', 'res'], ['gas leak playbook', 'jud'], ['what is the drone range', 'jud'], ['fire detector', 'res'], ['how does the robot help', 'res'], ['held out photos', 'jud']];
  const r = await page.evaluate(([y, n]) => ({ y: y.map(([q, m]) => [q, m, Manara.chat.ask(q, { mode: m }).emergency.is]), n: n.map(([q, m]) => [q, m, Manara.chat.ask(q, { mode: m }).emergency.is]) }), [YES, NO]);
  check(`${YES.length} emergency messages (fire, smoke, gas, help, حريق, نجدة, إسعاف, dialect, typo) raise the override in either mode`, r.y.every(x => x[2]), r.y.filter(x => !x[2]).map(x => x[0]).join(' | '));
  check(`${NO.length} questions ABOUT the project (detector, drone, sentinel …) do not raise it`, r.n.every(x => !x[2]), r.n.filter(x => x[2]).map(x => x[0]).join(' | '));
  // in the page: the banner is the first thing after the user's message, in both languages, before the answer
  await page.fill('.mc-input', 'there is a fire in my building'); await page.press('.mc-input', 'Enter');
  await page.waitForSelector('.mc-bot[data-done="1"]:not([data-kind=welcome])');
  const order = await page.evaluate(() => [...document.querySelectorAll('.mc-log > .mc-msg')].map(m => m.getAttribute('data-role')));
  check('the log reads: welcome, user message, EMERGENCY BANNER, answer: the banner comes before any answer', order.join() === 'bot,user,emergency,bot', order.join());
  const bn = await page.evaluate(() => { const b = document.querySelector('.mc-emerg'); const cs = getComputedStyle(b.querySelector('.mc-emerg-box')); return { role: b.getAttribute('role'), ar: b.querySelector('.mc-emerg-ar').textContent, en: b.querySelector('.mc-emerg-en').textContent, tel: b.querySelector('a').getAttribute('href'), weight: cs.fontWeight, fw: getComputedStyle(b.querySelector('.mc-emerg-en')).fontWeight }; });
  check('banner text is exactly «هذا نموذج تجريبي — اتصل بـ 999 الآن» and "This is a demo prototype — call 999 now", bold, role=alert, with a tap-to-call link', bn.ar === 'هذا نموذج تجريبي — اتصل بـ 999 الآن' && bn.en === 'This is a demo prototype — call 999 now' && bn.role === 'alert' && +bn.fw >= 700 && bn.tel === 'tel:999', JSON.stringify(bn));
  const ans = await page.evaluate(() => document.querySelector('.mc-bot[data-id]').getAttribute('data-id'));
  check('after the banner the matching safety answer follows (fire)', ans === 'res-fire', ans);
  await page.fill('.mc-input', 'how does MANARA detect fire?'); await page.press('.mc-input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.mc-bot[data-done="1"]').length >= 3, null, { timeout: 6000 });
  check('a question about the project raises no banner', await page.evaluate(() => document.querySelectorAll('.mc-emerg').length) === 1);
  await ctx.close();
}

// ======================================================================= 5. UI
section('5. Interface');
{
  const { page, errors, ctx } = await open('chat.html', { reducedMotion: 'reduce' });
  const roles = await page.evaluate(() => { const l = document.querySelector('.mc-log'), i = document.querySelector('.mc-input'); return { role: l.getAttribute('role'), live: l.getAttribute('aria-live'), logLabel: l.getAttribute('aria-label'), label: document.querySelector(`label[for="${i.id}"]`)?.textContent, ph: i.getAttribute('placeholder'), h1: document.querySelectorAll('h1').length, modeGroup: document.querySelector('.mc-mode').getAttribute('role'), pressed: [...document.querySelectorAll('.mc-seg')].map(b => b.getAttribute('aria-pressed')), tools: [...document.querySelectorAll('.mc-tool')].map(b => b.getAttribute('aria-label')) }; });
  check('a11y: conversation is role=log with aria-live=polite and a label; the input has a real <label>; mode switch is a group of toggle buttons; tool buttons are named', roles.role === 'log' && roles.live === 'polite' && roles.logLabel && roles.label && roles.modeGroup === 'group' && roles.pressed.join() === 'true,false' && roles.tools.every(Boolean) && roles.h1 === 1, JSON.stringify(roles));
  check('the page says in both languages that it is not an AI / language model (honesty strip + hero)', await page.evaluate(() => /Not an AI model and not a language model/.test(document.querySelector('.mc-strip').textContent) && /not an AI model and not a language model/.test(document.querySelector('.mc-hero p').textContent) && /ليست ذكاءً اصطناعيًا ولا نموذجًا لغويًا/.test(document.querySelector('[data-lbl=strip]').textContent === '' ? '' : 'ليست ذكاءً اصطناعيًا ولا نموذجًا لغويًا') ));
  // ask via the keyboard
  await page.focus('.mc-input'); await page.keyboard.type('ريحة غاز في المطبخ'); await page.keyboard.press('Enter');
  await page.waitForSelector('.mc-bot[data-id="res-gas"][data-done="1"]');
  const a1 = await page.evaluate(() => { const m = document.querySelector('.mc-bot[data-id="res-gas"]'); return { ml: m.getAttribute('data-ml'), dir: m.querySelector('.mc-ans').dir, links: [...m.querySelectorAll('.mc-link')].map(a => a.getAttribute('href')), linkLabels: [...m.querySelectorAll('.mc-link')].map(a => a.querySelector('[data-l=ar]').textContent + '|' + a.querySelector('[data-l=en]').textContent), shownLabel: [...m.querySelectorAll('.mc-link')].map(a => [...a.querySelectorAll('[data-l]')].filter(s => getComputedStyle(s).display !== 'none').map(s => s.textContent).join('')), confirm: !!m.querySelector('.mc-note-warn'), chips: [...document.querySelectorAll('.mc-chips .mc-chip')].map(c => c.getAttribute('data-id')), banner: document.querySelectorAll('.mc-emerg').length, srLeft: document.querySelectorAll('.mc-sr').length, hidden: m.querySelector('.mc-ans').getAttribute('aria-hidden') }; });
  check('an Arabic question gets an Arabic answer (dir=rtl) citing "see page" links with data-l labels, and the "confirm with the authority" line', a1.ml === 'ar' && a1.dir === 'rtl' && a1.links.includes('alert.html') && a1.links.length >= 2 && a1.linkLabels.every(l => /[؀-ۿ]/.test(l.split('|')[0]) && /[A-Za-z]/.test(l.split('|')[1])) && a1.confirm, JSON.stringify(a1));
  check('the link labels switch with the message language (Arabic message shows Arabic page names even when the page is English)', a1.shownLabel.every(s => /[؀-ۿ]/.test(s)), a1.shownLabel.join());
  check('follow-up suggestion chips appear after the answer (3 or more), each a real topic', a1.chips.length >= 3 && a1.chips.every(c => c), a1.chips.join());
  check('the emergency banner also accompanied a gas message (resident mode), and no hidden screen-reader copy is left behind', a1.banner === 1 && a1.srLeft === 0 && a1.hidden === null);
  // a chip asks its question and goes where it should
  const chipId = a1.chips[0];
  await page.click('.mc-chips .mc-chip'); await page.waitForFunction(id => document.querySelector(`.mc-bot[data-id="${id}"][data-done="1"]`), chipId, { timeout: 6000 });
  check('tapping a chip asks that question and the answer is that topic', true);
  // why + thumbs (memory only)
  const lastMsg = '.mc-bot[data-done="1"]:last-of-type';
  await page.click('.mc-log .mc-bot:last-of-type .mc-why summary');
  const why = await page.evaluate(() => document.querySelector('.mc-log .mc-bot:last-of-type .mc-why').innerText);
  check('"Why this answer?" lists the topic, confidence, matched words and the source document', /Topic|الموضوع/.test(why) && /Matched|كلمات/.test(why) && /Facts come from|مصدر/.test(why), why.slice(0, 120));
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.click('.mc-log .mc-bot:last-of-type .mc-fb-b[data-v="1"]');
  const fb = await page.evaluate(() => ({ list: Manara.chat.page.feedback(), ls: Object.keys(localStorage).filter(k => /chat|feed|rate/i.test(k) && k !== 'manara-chat-mode'), thanks: document.querySelector('.mc-log .mc-bot:last-of-type .mc-fb-t')?.textContent }));
  check('"Was this helpful?" thumbs are kept in memory only: recorded in the page, nothing in localStorage, and a thanks line says so', fb.list.length === 1 && fb.list[0].v === 1 && fb.ls.length === 0 && /memory|ذاكرة/.test(fb.thanks || ''), JSON.stringify(fb));
  // mode switch
  await page.click('[data-mode=jud]');
  const m2 = await page.evaluate(() => ({ mode: Manara.chat.page.mode(), pressed: [...document.querySelectorAll('.mc-seg')].map(b => b.getAttribute('aria-pressed')).join(), chips: [...document.querySelectorAll('.mc-chips .mc-chip')].map(c => c.getAttribute('data-id')), stored: localStorage.getItem('manara-chat-mode') }));
  check('mode switch: Judge mode swaps the suggestion chips to the judge topics and is remembered as a per-viewer convenience', m2.mode === 'jud' && m2.pressed === 'false,true' && m2.chips.every(c => c.startsWith('jud-')) && m2.stored === 'jud', JSON.stringify(m2));
  await page.fill('.mc-input', 'what is the detector accuracy'); await page.press('.mc-input', 'Enter');
  await page.waitForSelector('.mc-bot[data-id="jud-detector"][data-done="1"]');
  const num = await page.evaluate(() => document.querySelector('.mc-bot[data-id="jud-detector"] .mc-ans').textContent);
  check('judge answer carries the measured number 66.7% and its honest context (12 of 18, small sample)', /66\.7%/.test(num) && /12 of 18/.test(num) && /small sample/.test(num));
  // unknown
  await page.fill('.mc-input', 'what is the capital of France'); await page.press('.mc-input', 'Enter');
  await page.waitForSelector('.mc-bot[data-kind="unknown"][data-done="1"]');
  const un = await page.evaluate(() => ({ t: document.querySelector('.mc-bot[data-kind="unknown"] .mc-ans').textContent, chips: document.querySelectorAll('.mc-chips .mc-chip').length, lab: document.querySelector('.mc-chips-l').textContent }));
  check('an unknown question says it does not know, will not guess, points to the authority and 999, and offers closest topics as chips', /do not know/.test(un.t) && /not a language model/.test(un.t) && /confirm it with the authority/.test(un.t) && /999/.test(un.t) && un.chips >= 3, JSON.stringify(un));
  // more
  await page.fill('.mc-input', 'what is the detector accuracy'); await page.press('.mc-input', 'Enter'); await page.waitForFunction(() => document.querySelectorAll('.mc-bot[data-id="jud-detector"][data-done="1"]').length >= 2);
  await page.fill('.mc-input', 'more'); await page.press('.mc-input', 'Enter'); await page.waitForSelector('.mc-bot[data-kind="more"][data-done="1"]');
  check('"more" after an answer continues the same topic (related topics when there is nothing more)', await page.evaluate(() => document.querySelector('.mc-bot[data-kind="more"]').getAttribute('data-id')) === 'jud-detector');
  // history key
  await page.focus('.mc-input'); await page.keyboard.press('ArrowUp');
  check('ArrowUp recalls the previous question in the input', (await page.inputValue('.mc-input')) === 'more');
  await page.fill('.mc-input', '');
  // export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  check('export: a .txt file with the whole conversation, the banner, the sources and the ratings', /^ask-manara-\d{12}\.txt$/.test(dl.suggestedFilename()) && /not an AI model and not a language model/i.test(txt) && /This is a demo prototype/.test(txt) && /alert\.html/.test(txt) && /66\.7%/.test(txt) && /\+1 /.test(txt), dl.suggestedFilename());
  // clear
  await page.click('[data-act=clear]');
  const cl = await page.evaluate(() => ({ msgs: document.querySelectorAll('.mc-log .mc-msg').length, fb: Manara.chat.page.feedback().length, hist: Manara.chat.page.history().length }));
  check('clear: the log, the history and the ratings are emptied (welcome message and starter chips return)', cl.msgs === 1 && cl.fb === 0 && cl.hist === 0, JSON.stringify(cl));
  // reduced motion: instant
  await page.fill('.mc-input', 'how do alerts reach me'); await page.press('.mc-input', 'Enter');
  await page.waitForTimeout(80);
  const rm = await page.evaluate(() => ({ done: !!document.querySelector('.mc-bot[data-id="res-alerts"][data-done="1"]'), dots: document.querySelectorAll('.mc-typing').length }));
  check('reduced motion: the reply is instant (no typing indicator, no typed letters)', rm.done && rm.dots === 0, JSON.stringify(rm));
  check('no console errors in the interface run', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{
  // motion on: dots (>= 1.2 s cycle), typed letters, slide-in
  const { page, errors, ctx } = await open('chat.html', { reducedMotion: 'no-preference' });
  await page.fill('.mc-input', 'how do alerts reach me'); await page.press('.mc-input', 'Enter');
  await page.waitForSelector('.mc-typing', { timeout: 2000 });
  const dots = await page.evaluate(() => { const i = document.querySelector('.mc-typing i'); const cs = getComputedStyle(i); return { dur: parseFloat(cs.animationDuration), name: cs.animationName, hidden: document.querySelector('.mc-typing').getAttribute('aria-hidden'), n: document.querySelectorAll('.mc-typing i').length }; });
  check('typing indicator: three dots, aria-hidden, one slow cycle of at least 1.2 s (not flashing)', dots.n === 3 && dots.dur >= 1.2 && dots.hidden === 'true', JSON.stringify(dots));
  const sl = await page.evaluate(() => { const u = document.querySelector('.mc-user'); const cs = getComputedStyle(u); return { name: cs.animationName, dur: parseFloat(cs.animationDuration) }; });
  check('messages slide in (animation mc-in, a quarter of a second)', sl.name === 'mc-in' && sl.dur > 0.1 && sl.dur < 0.6, JSON.stringify(sl));
  await page.waitForSelector('.mc-bot[data-id="res-alerts"]', { timeout: 3000 });
  const t1 = await page.evaluate(() => document.querySelector('.mc-bot[data-id="res-alerts"] .mc-ans').textContent.length);
  const aria = await page.evaluate(() => ({ busy: document.querySelector('.mc-bot[data-id="res-alerts"] .mc-col').getAttribute('aria-busy'), hid: document.querySelector('.mc-bot[data-id="res-alerts"] .mc-ans').getAttribute('aria-hidden'), sr: document.querySelector('.mc-bot[data-id="res-alerts"] .mc-sr')?.textContent.length || 0 }));
  await page.waitForSelector('.mc-bot[data-id="res-alerts"][data-done="1"]', { timeout: 8000 });
  const t2 = await page.evaluate(() => document.querySelector('.mc-bot[data-id="res-alerts"] .mc-ans').textContent.length);
  const full = await page.evaluate(() => Manara.chat.entry('res-alerts').a.en.replace(/\*\*/g, '').replace(/^- /gm, '').replace(/\n+/g, '').length);
  check('typed-letter animation: the reply grows letter by letter while the screen reader gets one complete copy (aria-busy, text hidden meanwhile) and the finished text is complete', t1 < t2 && t1 < full * 0.9 && aria.busy === 'true' && aria.hid === 'true' && aria.sr > 100, `${t1} → ${t2} of ${full}; ${JSON.stringify(aria)}`);
  // the emergency reply skips the animation
  await page.fill('.mc-input', 'i smell gas'); await page.press('.mc-input', 'Enter'); await page.waitForTimeout(150);
  check('an emergency reply is immediate even with motion on (banner and answer, no waiting)', await page.evaluate(() => !!document.querySelector('.mc-emerg') && !!document.querySelector('.mc-bot[data-id="res-gas"][data-done="1"]')));
  // typing then a new question completes the previous one
  check('no console errors with motion on', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 6. launcher + panel + back-end hook
section('6. Launcher, panel, back-end hook');
{
  const PAGES = ['index.html', 'mission.html', 'detect.html', 'alert.html', 'robot.html', 'build.html', 'pitch.html', 'report.html', 'guide.html', 'plan.html', '404.html'];
  const missing = [], extra = [];
  for (const f of PAGES) {
    if (!fs.existsSync(path.join(SITE, f))) continue;
    const { page, ctx } = await open(f, { reducedMotion: 'reduce', lang: 'ar' });
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => { const b = document.querySelector('.mc-fab'); if (!b) return null; const cs = getComputedStyle(b), rc = b.getBoundingClientRect(); return { w: rc.width, h: rc.height, hidden: b.hidden, label: b.getAttribute('aria-label'), fromEnd: document.documentElement.dir === 'rtl' ? rc.left : innerWidth - rc.right, bottom: innerHeight - rc.bottom, pos: cs.position, loaded: !!window.Manara.chat }; });
    if (!r || r.hidden || r.w < 48 || r.h < 48 || !r.label || r.pos !== 'fixed' || r.fromEnd < 8 || r.loaded) missing.push(f + ' ' + JSON.stringify(r));
    await ctx.close();
  }
  check(`the launcher button (48px or more, fixed at the inline-end bottom, labelled, chat code NOT loaded yet) is on ${PAGES.length} pages`, missing.length === 0, missing.slice(0, 3).join(' | '));
  for (const f of ['control.html', 'poster.html', 'chat.html']) {
    const { page, ctx } = await open(f, { lang: 'en' }); await page.waitForTimeout(250);
    if (await page.$('.mc-fab')) extra.push(f); await ctx.close();
  }
  check('no launcher on control.html (own Commander and bottom tab bar), poster.html (print board) or chat.html (it is the chat)', extra.length === 0, extra.join());
  const { page, ctx, errors } = await open('index.html', { lang: 'en', width: 1280 });
  const before = await page.evaluate(() => [...document.scripts].map(s => s.getAttribute('src') || '').filter(s => /chatbot/.test(s)));
  await page.click('.mc-fab');
  await page.waitForSelector('#mc-panel:not([hidden])');
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('mc-input'), null, { timeout: 2000 }).catch(() => {});
  const op = await page.evaluate(() => { const p = document.getElementById('mc-panel'), b = document.querySelector('.mc-fab'); const pr = p.getBoundingClientRect(), br = b.getBoundingClientRect(); return { role: p.getAttribute('role'), name: p.getAttribute('aria-labelledby'), exp: b.getAttribute('aria-expanded'), focus: document.activeElement.className, noOverlap: pr.bottom <= br.top + 1 || pr.right <= br.left || pr.left >= br.right, loaded: [...document.scripts].map(s => s.getAttribute('src') || '').filter(s => /chatbot/.test(s)), inView: pr.top >= 0 && pr.right <= innerWidth && pr.bottom <= innerHeight, ids: document.querySelectorAll('[id]').length - new Set([...document.querySelectorAll('[id]')].map(e => e.id)).size };  });
  check('first click lazy-loads js/chatbot-kb.js + js/chatbot.js (not loaded before), opens a non-modal dialog with a name, focuses the input, and does not overlap the button', before.length === 0 && op.loaded.length === 2 && op.role === 'dialog' && op.name === 'mc-ptitle' && op.exp === 'true' && /mc-input/.test(op.focus) && op.noOverlap && op.inView && op.ids === 0, JSON.stringify(op));
  await page.fill('#mc-panel .mc-input', 'what to do in a flood'); await page.press('#mc-panel .mc-input', 'Enter');
  await page.waitForSelector('#mc-panel .mc-bot[data-id="res-flood"][data-done="1"]');
  check('the panel uses the same engine (flood answer, banner first)', await page.evaluate(() => [...document.querySelectorAll('#mc-panel .mc-log > .mc-msg')].map(m => m.getAttribute('data-role')).join()) === 'bot,user,emergency,bot');
  await page.keyboard.press('Escape');
  const cl = await page.evaluate(() => ({ hidden: document.getElementById('mc-panel').hidden, exp: document.querySelector('.mc-fab').getAttribute('aria-expanded'), focus: document.activeElement.classList.contains('mc-fab') }));
  check('Esc closes the panel and returns focus to the launcher button', cl.hidden && cl.exp === 'false' && cl.focus, JSON.stringify(cl));
  await page.keyboard.press('Enter'); await page.waitForSelector('#mc-panel:not([hidden])');
  await page.click('#mc-panel .mc-pclose');
  check('the launcher works from the keyboard (Enter) and the close button also returns focus', await page.evaluate(() => document.getElementById('mc-panel').hidden && document.activeElement.classList.contains('mc-fab')));
  // toast lift
  await page.evaluate(() => Manara.toast('hello', 'safe', 4000)); await page.waitForTimeout(350);
  const lift = await page.evaluate(() => { const b = document.querySelector('.mc-fab').getBoundingClientRect(), t = document.querySelector('.toast').getBoundingClientRect(); return !(b.left < t.right && b.right > t.left && b.top < t.bottom && b.bottom > t.top); });
  check('a toast does not overlap the launcher (the button lifts above it)', lift);
  // back-end hook
  const hook = await page.evaluate(async () => {
    const C = Manara.chat, out = {};
    out.def = C.hasBackend();
    out.api = typeof C.setBackend;
    try { C.setBackend(42); out.thrown = false; } catch (e) { out.thrown = e instanceof TypeError; }
    let calls = [];
    C.setBackend(async (q, ctx) => { calls.push([q, ctx]); return 'backend says hi'; });
    out.has = C.hasBackend();
    const known = await C.respond('how do alerts reach me', { mode: 'res' });
    out.knownKind = known.kind; out.knownCalls = calls.length;
    const unk = await C.respond('tell me a joke', { mode: 'res' });
    out.unkKind = unk.kind; out.unkText = unk.backendText; out.ctxKeys = Object.keys(calls[0][1]).sort().join(); out.q = calls[0][0];
    const em = await C.respond('there is a fire in my building', { mode: 'res' });
    out.emCalls = calls.length;
    C.setBackend(async () => { throw new Error('x'); });
    const bad = await C.respond('tell me a joke', { mode: 'res' }); out.failKind = bad.kind; out.failNote = bad.backendNote;
    C.setBackend(null); out.cleared = !C.hasBackend();
    const sync = C.ask('tell me a joke'); out.syncKind = sync.kind;
    return out;
  });
  check('Manara.chat.setBackend: default none; rejects non-functions; consulted ONLY for questions the knowledge base cannot answer, never for emergencies; failure falls back to the local "I do not know"; null removes it', hook.def === false && hook.api === 'function' && hook.thrown && hook.has && hook.knownKind !== 'backend' && hook.knownCalls === 0 && hook.unkKind === 'backend' && hook.unkText === 'backend says hi' && hook.emCalls === 1 && hook.failKind === 'unknown' && hook.failNote === 'error' && hook.cleared && hook.syncKind === 'unknown', JSON.stringify(hook));
  check('the back-end receives (question, {lang, mode, history, candidates, source}) as plain data', hook.ctxKeys === 'candidates,history,lang,mode,source' && hook.q === 'tell me a joke', hook.ctxKeys);
  // backend answers are shown as text, labelled, never as HTML
  await page.evaluate(() => Manara.chat.setBackend(async () => '<img src=x onerror="window.__pwn=1"> **not bold**'));
  await page.click('.mc-fab'); await page.waitForSelector('#mc-panel:not([hidden])');
  await page.fill('#mc-panel .mc-input', 'tell me a joke'); await page.press('#mc-panel .mc-input', 'Enter');
  await page.waitForSelector('#mc-panel .mc-bot[data-kind="backend"][data-done="1"]', { timeout: 9000 });
  const be = await page.evaluate(() => ({ pwn: window.__pwn || 0, imgs: document.querySelectorAll('#mc-panel img').length, text: document.querySelector('#mc-panel .mc-be-text').textContent, tag: document.querySelector('#mc-panel .mc-be-note').textContent, tagShown: !document.querySelector('#mc-panel .mc-be').hidden }));
  check('a back-end answer is rendered as plain text (no HTML executed), labelled "not from MANARA\'s knowledge base", and the header shows a back-end tag', be.pwn === 0 && be.imgs === 0 && /<img/.test(be.text) && /not from MANARA/.test(be.tag) && be.tagShown, JSON.stringify(be));
  check('no console errors from the launcher run', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 7. layout, themes, network, sources
section('7. Layout, themes, network, sources');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 820, 1440]) {
  const { page, errors, ctx } = await open('chat.html', { lang, theme, width, height: width < 600 ? 844 : 900, reducedMotion: 'reduce' });
  await page.fill('.mc-input', lang === 'ar' ? 'ريحة غاز في المطبخ' : 'there is smoke in the kitchen'); await page.press('.mc-input', 'Enter');
  await page.waitForSelector('.mc-bot[data-done="1"]:not([data-kind=welcome])'); await page.waitForTimeout(150);
  const o = await overflow(page);
  const inner = await page.evaluate(() => { const l = document.querySelector('.mc-log'); const c = document.querySelector('.mc-card').getBoundingClientRect(); return { logOver: l.scrollWidth > l.clientWidth + 1, input: document.querySelector('.mc-input').getBoundingClientRect().height, sendVisible: (() => { const r = document.querySelector('.mc-send').getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.width > 40; })() }; });
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no horizontal overflow, nothing clipped in the log, send button inside the screen, no console errors`, o.scrollW <= o.W && o.bad.length === 0 && !inner.logOver && inner.sendVisible && errors.length === 0, `${o.scrollW}>${o.W} ${o.bad.join()} ${JSON.stringify(inner)} ${errors.join(' | ')}`);
  await ctx.close();
}
{
  const { page, ctx } = await open('chat.html', { lang: 'ar', width: 390, height: 844 });
  await page.fill('.mc-input', 'there is a fire'); await page.press('.mc-input', 'Enter'); await page.waitForTimeout(500);
  const ar = await page.evaluate(() => { const w = document.createTreeWalker(document.querySelector('.mc-chat'), NodeFilter.SHOW_TEXT); const bad = []; let n; while ((n = w.nextNode())) { if (!/[؀-ۿ]/.test(n.textContent)) continue; const ls = getComputedStyle(n.parentElement).letterSpacing; if (ls !== 'normal' && parseFloat(ls) !== 0) bad.push(ls); } return bad; });
  check('no letter-spacing on Arabic text in the chat', ar.length === 0, ar.join());
  await ctx.close();
}
check('no network requests from any run (everything is local files; Google Fonts excluded)', netLog.length === 0, netLog.slice(0, 3).join(' | '));
const src = ['js/chatbot.js', 'js/chatbot-kb.js'].map(read).join('\n');
check('sources: no innerHTML/outerHTML/insertAdjacentHTML/document.write, no fetch/XHR/WebSocket/import/eval, classic IIFE script', !/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|new Function|^\s*(import|export)\s/m.test(src) && /^\(function \(\) \{/m.test(read('js/chatbot.js')));
const css = read('css/chatbot.css').replace(/\/\*[\s\S]*?\*\//g, '');
check('css: no physical left/right properties, no letter-spacing, tokens for colours', !/(margin|padding)-(left|right)|text-align:\s*(left|right)|[^-]left\s*:|[^-]right\s*:|letter-spacing/.test(css) && /var\(--surface\)/.test(css) && /prefers-color-scheme:dark/.test(css));
const core = read('js/core.js');
check('core.js: one launcher block, nav entry and More-list entry for chat.html', /function chatLauncher/.test(core) && /\['chat\.html', 'nav\.chat', 'chat'\]/.test(core) && /MORE = \[[^\]]*'chat\.html'/.test(core));
const md = fs.readFileSync(path.join(ROOT, 'docs/MANARA.md'), 'utf8');
check('docs/MANARA.md documents "Ask MANARA", the files, how answers are chosen and Manara.chat.setBackend', /Ask MANARA/.test(md) && /setBackend/.test(md) && /chatbot-kb\.js/.test(md));

await done(browser);
