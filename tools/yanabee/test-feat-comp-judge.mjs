// Browser test of the 'comp-judge' bundle on competition.html: judge-sheet (#jsh), activity-card (#ac), partner-kit (#pk).
//   node tools/yanabee/test-feat-comp-judge.mjs      (build first: python3 tools/yanabee/build.py competition)
// Covers: markup + the documents' numbers, every interaction and computed result, storage persistence and storage
// blocked, print modes (window.print stubbed), file save/open, no JS, 390px without overflow, console errors, network.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const PAGE = 'file://' + path.join(ROOT, 'site/yanabee/competition.html');
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const allErrs = [], netReqs = [];
async function open(opts = {}, { blockStorage = false, keepCtx = null, js = true } = {}) {
  const { viewport = { width: 1280, height: 900 }, ...rest } = opts;
  const ctx = keepCtx || await browser.newContext({ viewport, reducedMotion: 'reduce', javaScriptEnabled: js, acceptDownloads: true, ...rest });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => { errs.push(e.message); allErrs.push(e.message); });
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) { errs.push(m.text()); allErrs.push(m.text()); } });
  p.on('request', r => { const u = r.url(); if (!/^(file:|data:|blob:|about:)/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u)) netReqs.push(u); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(() => {
    try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ }
    window.__prints = [];
    window.print = () => { window.__prints.push({ cls: document.body.className, jsh: (document.getElementById('jsh') || {}).dataset ? document.getElementById('jsh').dataset.mode : '' }); dispatchEvent(new Event('afterprint')); };
    window.__copied = null;
    try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); } catch (e) { /* ignore */ }
  });
  if (blockStorage) await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } }); });
  await p.goto(PAGE);
  await p.waitForTimeout(500);
  return { ctx, p, errs };
}
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const txt = (p, s) => p.evaluate(q => { const e = document.querySelector(q); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, s);
const typeIn = async (p, sel, v) => { await p.fill(sel, v); };

// ------------------------------------------------------------------ static checks
console.log('static: source files, ids, documents');
{
  const html = fs.readFileSync(path.join(ROOT, 'site/yanabee/competition.html'), 'utf8');
  const ids = [...html.replace(/<template>[\s\S]*?<\/template>/g, '').matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  check('ids on competition.html are unique', dup.length === 0, [...new Set(dup)].join(', '));
  for (const f of ['judge-sheet', 'activity-card', 'partner-kit']) {
    const js = fs.readFileSync(path.join(ROOT, `site/yanabee/js/${f}.js`), 'utf8');
    check(`${f}.js: no network APIs`, !/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s*\(/.test(js));
    check(`${f}.js: classic IIFE with 'use strict'`, /^\(function \(\) \{\n  'use strict';/m.test(js) && !/^\s*(import|export)\s/m.test(js));
    const lines = js.split('\n');
    check(`${f}.js: every localStorage access inside try`, lines.every((l, i) => !/localStorage\./.test(l) || /try \{/.test(l) || /try \{\s*$/.test(lines[i - 1] || '')));
    check(`competition.html loads css/${f}.css and js/${f}.js after comp.js`,
      html.includes(`href="css/${f}.css"`) && html.indexOf(`src="js/${f}.js"`) > html.indexOf('src="js/comp.js"'));
  }
  const doc = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8');
  check('document still has the weights line', doc.includes('اعتماد معايير تقييم المسابقة: الحفظ 10 نقاط، الفهم 15، التطبيق 45، كرة القدم 20، الشطرنج 10.'));
  check('no invented tie-break text', !html.includes('تفصل لجنة التحكيم') && !html.includes('نموذج للنقاش والاتفاق'));
}

// ------------------------------------------------------------------ judge-sheet
console.log('judge-sheet: self-check');
{
  const { ctx, p, errs } = await open();
  check('tool is revealed by JS', await p.evaluate(() => !document.getElementById('jsh').hidden));
  check('no prize labels or amounts inside the judge sheet', await p.evaluate(() => !/المركز|700|500|300|\$/.test(document.getElementById('jsh').textContent)));
  const data = await p.evaluate(() => JSON.parse(document.getElementById('jsh-data').textContent));
  check('weights from the document: 10/15/45/20/10 (sum 100)', JSON.stringify(data.weights) === '[10,15,45,20,10]' && data.total === 100);
  check('rubric from the document: 10/10/15/10 (sum 45)', JSON.stringify(data.rubric) === '[10,10,15,10]' && data.applyMax === 45);
  check('rubric title shown as written', (await txt(p, '#jsh-p-self .jsh-rubt')) === 'التقييم المقترح لمحور التطبيق السلوكي (45 نقطة)');
  check('ranges: max = rubric rows', JSON.stringify(await p.$$eval('.jsh-range', r => r.map(x => +x.max))) === '[10,10,15,10]');
  check('evidence lines quoted (f-apply, cd4 warning)', (await txt(p, '.jsh-crit[data-i="0"] .jsh-ev')).includes('يختار الفريق أنشطة مناسبة لتطبيق قيم سورة الصف')
    && (await txt(p, '.jsh-crit[data-i="3"] .jsh-ev')).includes('تنبيه: لا تُنشر صور أو بيانات المشاركين القاصرين'));
  check('start: largest gap highlighted (التنفيذ الفعلي للمشروع, 15)', await p.evaluate(() => {
    const c = document.querySelectorAll('.jsh-crit'); return c[2].classList.contains('is-start') && !c[2].querySelector('.jsh-start').hidden && document.querySelectorAll('.jsh-crit.is-start').length === 1; }));
  // keyboard on a slider: RTL range, End = max
  await p.focus('#jsh-s2'); await p.keyboard.press('End');
  check('slider End → 15/15, aria-valuetext «15 من 15»', (await p.getAttribute('#jsh-s2', 'aria-valuetext')) === '15 من 15');
  check('ring + live text: «تقديركم: 15 من 45»', (await txt(p, '.jsh-score')) === 'تقديركم: 15 من 45' && (await txt(p, '[data-ring-n]')) === '15');
  check('tie of gaps → first in document order', await p.evaluate(() => document.querySelectorAll('.jsh-crit')[0].classList.contains('is-start')));
  await p.evaluate(() => { document.querySelectorAll('.jsh-range').forEach(r => { r.value = r.max; r.dispatchEvent(new Event('input')); }); });
  check('all at max: no highlight, «اكتملت الدرجات في تقديركم»', await p.evaluate(() => !document.querySelector('.jsh-crit.is-start') && !document.querySelector('.jsh-full').hidden) && (await txt(p, '.jsh-score')) === 'تقديركم: 45 من 45');
  await p.evaluate(() => { const r = document.getElementById('jsh-s1'); r.value = 4; r.dispatchEvent(new Event('input')); });
  check('stored: only the four integers', await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('yanabee-judge-sheet-v1')).self) === '[10,4,15,10]'));
  await p.reload(); await p.waitForTimeout(400);
  check('self-check restored after reload (39 من 45)', (await txt(p, '.jsh-score')) === 'تقديركم: 39 من 45');
  await p.click('[data-self-reset]');
  check('أعد الضبط → 0 من 45', (await txt(p, '.jsh-score')) === 'تقديركم: 0 من 45');

  console.log('judge-sheet: tabs and worksheet');
  await p.focus('#jsh-t-self'); await p.keyboard.press('ArrowLeft');
  check('tabs: ArrowLeft (RTL) selects the judges tab', await p.evaluate(() => document.getElementById('jsh-t-judge').getAttribute('aria-selected') === 'true' && !document.getElementById('jsh-p-judge').hidden && document.getElementById('jsh-p-self').hidden));
  check('banner quotes timeline lines 16 and 18', (await txt(p, '.jsh-quotes')).includes('ومراجعة نتائج التحكيم أسبوعيًا') && (await txt(p, '.jsh-quotes')).includes('15 – 24 يناير: اختبارات ومنافسات ختامية'));
  check('0 teams: «أضف فريقًا لتظهر ورقة الترتيب», print team/rank disabled', await p.evaluate(() => !document.querySelector('.jsh-empty').hidden && document.querySelector('.jsh-scroll').hidden && document.querySelector('[data-print-mode=team]').disabled && document.querySelector('[data-print-mode=rank]').disabled));
  await p.click('[data-add]');
  check('empty name rejected', (await p.getAttribute('#jsh-name', 'aria-invalid')) === 'true' && (await txt(p, '#jsh-name-e')) === 'اكتب اسم الفريق');
  await typeIn(p, '#jsh-name', 'فريق الصدق'); await p.keyboard.press('Enter');
  check('team added with Enter, card shown', await p.evaluate(() => !document.querySelector('.jsh-card').hidden) && (await txt(p, '[data-team-name]')) === 'فريق الصدق');
  check('1 team: table without the tie note', await p.evaluate(() => !document.querySelector('.jsh-scroll').hidden && document.querySelector('.jsh-tie').hidden));
  await typeIn(p, '#jsh-name', 'فريق الصدق'); await p.click('[data-add]');
  check('duplicate name rejected', (await txt(p, '#jsh-name-e')) === 'هذا الاسم مضاف من قبل');
  const maxes = await p.$$eval('.jsh-card input[data-k]', a => a.map(i => i.dataset.k + ':' + i.dataset.max).join(' '));
  check('field maximums from W and R', maxes === 'a0:10 a1:15 r0:10 r1:10 r2:15 r3:10 a3:20 a4:10', maxes);
  await typeIn(p, '#jsh-in-a0', '11');
  check('above max rejected: «الحد الأعلى لهذا المعيار 10»', (await txt(p, '#jsh-e-a0')) === 'الحد الأعلى لهذا المعيار 10' && (await p.getAttribute('#jsh-in-a0', 'aria-invalid')) === 'true');
  await typeIn(p, '#jsh-in-a0', '-2');
  check('negative rejected: «أدخل رقمًا من 0 إلى 10»', (await txt(p, '#jsh-e-a0')) === 'أدخل رقمًا من 0 إلى 10');
  await typeIn(p, '#jsh-in-a0', 'abc');
  check('non-numeric rejected, total keeps last valid (—)', (await txt(p, '#jsh-e-a0')) === 'أدخل رقمًا من 0 إلى 10' && (await txt(p, '[data-total]')) === '—');
  await typeIn(p, '#jsh-in-a0', '٨');
  check('Arabic-Indic digit accepted (٨ = 8), error cleared', (await p.getAttribute('#jsh-in-a0', 'aria-invalid')) === null && (await txt(p, '[data-total]')) === '8');
  const fill = async (vals) => { const ks = ['a0', 'a1', 'r0', 'r1', 'r2', 'r3', 'a3', 'a4']; for (let i = 0; i < ks.length; i++) await typeIn(p, '#jsh-in-' + ks[i], String(vals[i])); };
  await fill([8, 12.5, 9, 7, 13, 8, 15, 6]);
  check('التطبيق / 45 = 9+7+13+8 = 37', (await txt(p, '[data-apply-sum]')) === '37');
  check('المجموع / 100 = 8+12.5+37+15+6 = 78.5', (await txt(p, '[data-total]')) === '78.5');
  check('5-segment bar fills each axis (الحفظ 0.8, التطبيق 37/45)', await p.evaluate(() => { const f = [...document.querySelectorAll('.jsh-seg i')].map(i => +i.style.getPropertyValue('--f')); return Math.abs(f[0] - 0.8) < 1e-3 && Math.abs(f[2] - 37 / 45) < 1e-3 && f.length === 5; }));
  await typeIn(p, '#jsh-in-a3', '21');
  check('كرة القدم capped at 20', (await txt(p, '#jsh-e-a3')) === 'الحد الأعلى لهذا المعيار 20');
  await p.locator('#jsh-in-a3').blur();
  check('blur after a rejected entry shows the kept value (15)', (await p.inputValue('#jsh-in-a3')) === '15');
  await typeIn(p, '#jsh-name', 'فريق الأمانة'); await p.click('[data-add]');
  await fill([9, 11.5, 9, 8, 12, 8, 14, 7]);   // 9+11.5+37+14+7 = 78.5
  await typeIn(p, '#jsh-name', 'فريق الوفاء'); await p.click('[data-add]');
  await typeIn(p, '#jsh-in-a0', '5');
  const rank = await p.evaluate(() => window.YanabeeJudgeSheet.ranking());
  check('ranking: equal totals share ordinal 1, next is 3', rank.map(r => r.rank + ':' + r.total).join(' ') === '1:78.5 1:78.5 3:5', JSON.stringify(rank));
  check('tie rows tagged «تساوٍ في المجموع», tie quote from c-rules', await p.evaluate(() => document.querySelectorAll('.jsh-table .jsh-tag').length === 2 && !document.querySelector('.jsh-tie').hidden)
    && (await txt(p, '.jsh-tie')) === 'وضع سياسة تحكيم، وتحديد قواعد التأخر والغياب والانسحاب والإصابات والتعادل والتظلم.');
  check('empty team shows — for empty cells', await p.evaluate(() => [...document.querySelectorAll('.jsh-table tbody tr')][2].textContent.includes('—')));
  await p.click('.jsh-table tbody tr:first-child .jsh-rk-name');
  check('click a team in the table selects it', (await txt(p, '[data-team-name]')) === 'فريق الصدق' && (await p.inputValue('#jsh-sel')) === '0');
  await p.selectOption('#jsh-sel', '1');
  check('select switches the card', (await txt(p, '[data-team-name]')) === 'فريق الأمانة' && (await p.inputValue('#jsh-in-a1')) === '11.5');

  console.log('judge-sheet: print');
  for (const mode of ['team', 'blank', 'rank']) {
    await p.evaluate(() => { window.__prints = []; });
    await p.click(`[data-print-mode=${mode}]`);
    const pr = await p.evaluate(() => window.__prints);
    check(`print ${mode}: body.print-judge-sheet during print, data-mode=${mode}, removed after`, pr.length === 1 && pr[0].cls.includes('print-judge-sheet') && pr[0].jsh === mode
      && !(await p.evaluate(() => document.body.classList.contains('print-judge-sheet'))));
    if (mode === 'team') check('team sheet filled (name, total 78.5)', (await txt(p, '.jsh-print [data-pv=name]')) === 'فريق الأمانة' && (await txt(p, '.jsh-print [data-pv=total]')) === '78.5');
    if (mode === 'blank') check('blank sheet empty boxes', await p.evaluate(() => [...document.querySelectorAll('.jsh-print [data-pv]')].every(c => c.textContent === '')));
    if (mode === 'rank') check('ranking print rows: 3, ordinals 1,1,3', await p.evaluate(() => [...document.querySelectorAll('[data-prank] tr')].map(r => r.cells[0].textContent).join(',') === '1,1,3'));
  }
  await p.emulateMedia({ media: 'print' });
  check('ordinary print hides the tool', await p.evaluate(() => getComputedStyle(document.getElementById('jsh')).display === 'none'));
  await p.evaluate(() => document.body.classList.add('print-judge-sheet'));
  check('print mode shows only the sheet', await p.evaluate(() => getComputedStyle(document.querySelector('.jsh-print')).display === 'block' && getComputedStyle(document.getElementById('c-prizes')).display === 'none' && getComputedStyle(document.querySelector('.jsh-panel')).display === 'none'));
  await p.evaluate(() => document.body.classList.remove('print-judge-sheet'));
  await p.emulateMedia({ media: 'screen' });

  console.log('judge-sheet: file save / open');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-export]')]);
  const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('saved file: version 1, 3 teams, scores within maxima', saved.version === 1 && saved.teams.length === 3 && saved.teams[0].scores.length === 8 && saved.teams[1].scores[1] === 11.5);
  p.on('dialog', d => d.accept());
  await p.setInputFiles('[data-import]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, teams: [{ name: 'x', scores: [11, 0, 0, 0, 0, 0, 0, 0] }] })) });
  await p.waitForTimeout(200);
  check('out-of-range file rejected: «الملف غير صالح», teams unchanged', (await txt(p, '.jsh-status')) === 'الملف غير صالح' && (await p.evaluate(() => window.YanabeeJudgeSheet.state().teams.length)) === 3);
  await p.setInputFiles('[data-import]', { name: 'bad2.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await p.waitForTimeout(200);
  check('broken JSON rejected', (await txt(p, '.jsh-status')) === 'الملف غير صالح');
  await p.setInputFiles('[data-import]', { name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, teams: [saved.teams[2], saved.teams[0]] })) });
  await p.waitForTimeout(200);
  check('valid file replaces the teams (after confirm)', (await txt(p, '.jsh-status')) === 'فُتحت النسخة من الملف' && (await p.evaluate(() => window.YanabeeJudgeSheet.state().teams.map(t => t.name).join('|'))) === 'فريق الوفاء|فريق الصدق');
  await p.click('[data-del]');
  check('delete (confirmed) removes the team', (await p.evaluate(() => window.YanabeeJudgeSheet.state().teams.length)) === 1);
  check('worksheet stored under yanabee-judge-sheet-v1', await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-judge-sheet-v1')).teams.length === 1));
  check('no page errors (judge-sheet)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ activity-card
console.log('activity-card');
{
  const { ctx, p, errs } = await open();
  check('tool revealed; six parts with ac- ids; fold c-card kept', await p.evaluate(() => !document.getElementById('ac').hidden && ['cd1', 'cd2', 'cd3', 'cd4', 'cd5', 'cd6'].every(i => document.getElementById('ac-' + i) && document.getElementById(i)) && !!document.getElementById('c-card')));
  check('parts are fieldsets, not details.fold', await p.evaluate(() => !document.querySelector('#ac details.fold')));
  check('subtitle verbatim', (await txt(p, '.ac-head p')) === 'نموذج موحد يُعبّأ لكل نشاط أو ورشة أو مسابقة أو مبادرة.');
  check('5 status pills from the document', (await p.$$eval('[data-k=status]', a => a.map(x => x.parentElement.textContent).join('/'))) === 'مقترح/معتمد/جارٍ/مكتمل/مؤجل');
  check('5 attachments, mini-nav أولًا…سادسًا', (await p.$$eval('[data-k^=att-]', a => a.length)) === 5 && (await p.$$eval('.ac-nav a', a => a.map(x => x.getAttribute('href')).join(','))) === '#ac-cd1,#ac-cd2,#ac-cd3,#ac-cd4,#ac-cd5,#ac-cd6');
  check('placeholder «من البطاقة: …»', (await p.getAttribute('[data-k=t0]', 'placeholder')).startsWith('من البطاقة: ورشة'));
  await p.click('[data-example]');
  check('example fill: verbatim cells + dates read from the cell', (await p.inputValue('[data-k=t0]')) === 'ورشة «الفعل لا القول» (يُكتب اسم النشاط المحدد عند إعداد كل بطاقة)'
    && (await p.inputValue('[data-k=from]')) === '2026-11-15' && (await p.inputValue('[data-k=to]')) === '2027-01-31'
    && await p.evaluate(() => !document.querySelector('[data-ex-strip]').hidden && !document.querySelector('[data-k=status]:checked')));
  let asked = 0;
  p.on('dialog', d => { asked++; d.dismiss(); });
  await p.fill('[data-k=t0]', 'ورشتنا');
  await p.click('[data-example]');
  check('example asks before overwriting, cancel keeps text', asked === 1 && (await p.inputValue('[data-k=t0]')) === 'ورشتنا');
  await p.fill('[data-k=subV]', '10'); await p.fill('[data-k=subN]', '12');
  check('subscriptions: الإجمالي = 10 × 12 = 120 (no currency)', (await txt(p, '[data-k=subT]')) === '120');
  check('الفرق hidden until both costs', await p.evaluate(() => document.querySelector('[data-diff]').hidden));
  await p.fill('[data-k=est]', '1000'); await p.fill('[data-k=act]', '1250');
  check('الفرق = 1250 − 1000 = 250', (await txt(p, '[data-diff-v]')) === '250');
  await p.fill('[data-k=k0t]', '84'); await p.fill('[data-k=k0a]', '70');
  check('نسبة التحقق = 70 ÷ 84 × 100 = 83.3%', (await txt(p, '[data-pct="0"]')) === '83.3%');
  await p.fill('[data-k=k1t]', '0'); await p.fill('[data-k=k1a]', '5');
  check('target 0 → —', (await txt(p, '[data-pct="1"]')) === '—');
  await p.fill('[data-k=k2t]', '4'); await p.fill('[data-k=k2a]', '6');
  check('above 100% allowed (150.0%)', (await txt(p, '[data-pct="2"]')) === '150.0%');
  check('impact row note labelled «بأداة تقييم واضحة»', (await txt(p, '.ac-tool .f-l')) === 'بأداة تقييم واضحة');
  await p.check('[data-k="s0-0"]'); await p.check('[data-k="s0-1"]'); await p.check('[data-k="s2-0"]');
  check('stage count «تم 2 من 4», overall «تم 3 من 15» (4+4+4+3 steps in cd2)', (await txt(p, '#ac-cd2 .ac-stage .ac-count')) === 'تم 2 من 4' && (await txt(p, '.ac-total-count')) === 'تم 3 من 15');
  await p.check('[data-k="d1-3"]');
  check('photos ticked without «إذن التصوير والنشر» → warning highlighted', await p.evaluate(() => document.querySelector('[data-photo-warn]').classList.contains('is-on')));
  await p.check('[data-k="n2-2"]');
  check('permit ticked → highlight off', await p.evaluate(() => !document.querySelector('[data-photo-warn]').classList.contains('is-on')));
  await p.click('.ac-pill:nth-child(4)');
  check('«مكتمل» with unticked attachments → warning', await p.evaluate(() => [...document.querySelectorAll('[data-att-warn]')].every(w => !w.hidden)));
  for (let j = 0; j < 5; j++) await p.check(`[data-k="att-${j}"]`);
  check('all attachments ticked → no warning', await p.evaluate(() => [...document.querySelectorAll('[data-att-warn]')].every(w => w.hidden)));
  await p.click('[data-rep="sp"] [data-rep-add]');
  await p.fill('[data-rep="sp"] li:nth-child(1) [data-c="0"]', 'جهة داعمة'); await p.fill('[data-rep="sp"] li:nth-child(1) [data-c="1"]', '500');
  check('repeatable rows: add (2 rows)', (await p.$$eval('[data-rep="sp"] li', l => l.length)) === 2);
  await p.click('[data-rep="sp"] li:nth-child(2) .ac-rep-del');
  check('repeatable rows: remove', (await p.$$eval('[data-rep="sp"] li', l => l.length)) === 1);
  await p.waitForTimeout(900);
  let st = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-activity-card-v1')));
  check('autosaved: one card {id, updated, data}, title from اسم المهمة', Array.isArray(st) && st.length === 1 && st[0].data.t0 === 'ورشتنا' && st[0].data['rep-sp'][0][0] === 'جهة داعمة' && (await txt(p, '.ac-list li b')) === 'ورشتنا');

  console.log('activity-card: print');
  await p.evaluate(() => { window.__prints = []; });
  await p.click('[data-print-card=filled]');
  let pr = await p.evaluate(() => window.__prints);
  check('print filled: body.print-activity-card during print, removed after', pr.length === 1 && pr[0].cls.includes('print-activity-card') && !(await p.evaluate(() => document.body.classList.contains('print-activity-card'))));
  check('filled view: 6 parts, ☑ ticks, values, verbatim headers', await p.evaluate(() => { const v = document.querySelector('.ac-print'); return v.querySelectorAll('.ac-p-part').length === 6 && v.textContent.includes('☑') && v.textContent.includes('ورشتنا') && v.textContent.includes('83.3%') && v.textContent.includes('المهام والإجراءات') && v.textContent.includes('15 / 11 / 2026'); }));
  await p.click('[data-print-card=blank]');
  check('blank view: no ticks or values, form untouched', await p.evaluate(() => { const v = document.querySelector('.ac-print'); return !v.textContent.includes('☑') && !v.textContent.includes('ورشتنا') && v.textContent.includes('☐'); }) && (await p.inputValue('[data-k=t0]')) === 'ورشتنا' && await p.isChecked('[data-k="d1-3"]'));
  await p.emulateMedia({ media: 'print' });
  check('ordinary print hides the form; c-card fold still prints', await p.evaluate(() => getComputedStyle(document.getElementById('ac')).display === 'none' && getComputedStyle(document.getElementById('c-card')).display !== 'none'));
  await p.evaluate(() => document.body.classList.add('print-activity-card'));
  check('print mode: only .ac-print', await p.evaluate(() => getComputedStyle(document.querySelector('.ac-print')).display === 'block' && getComputedStyle(document.querySelector('.ac-form')).display === 'none' && getComputedStyle(document.querySelector('#guide .folds')).display === 'none'));
  await p.evaluate(() => document.body.classList.remove('print-activity-card'));
  await p.emulateMedia({ media: 'screen' });

  console.log('activity-card: saved cards');
  await p.click('[data-new]');
  check('بطاقة جديدة clears the form', (await p.inputValue('[data-k=t0]')) === '' && !(await p.isChecked('[data-k="d1-3"]')));
  await p.fill('[data-k=t1]', 'هدف آخر');
  await p.waitForTimeout(900);
  st = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-activity-card-v1')));
  check('second card saved, untitled → «بطاقة بلا اسم»', st.length === 2 && (await p.$$eval('.ac-list li b', b => b.map(x => x.textContent))).includes('بطاقة بلا اسم'));
  await p.click('.ac-list li:not(.is-cur) .btn:not(.ac-del)');
  check('افتح restores the first card', (await p.inputValue('[data-k=t0]')) === 'ورشتنا' && (await txt(p, '[data-pct="0"]')) === '83.3%' && (await txt(p, '[data-k=subT]')) === '120');
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept());
  await p.click('.ac-list li.is-cur .ac-del');
  check('احذف (confirmed) removes the open card and clears the form', (await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-activity-card-v1')).length)) === 1 && (await p.inputValue('[data-k=t0]')) === '');
  check('no page errors (activity-card)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ partner-kit
console.log('partner-kit');
{
  const { ctx, p, errs } = await open();
  check('c-p-goal, kit, c-p-after in order; obligations not rendered twice', await p.evaluate(() => {
    const w = document.querySelector('#c-partner .wrap'); const kids = [...w.children].map(c => c.id || c.className);
    return kids.indexOf('c-p-goal') < kids.indexOf('pk') && kids.indexOf('pk') < kids.indexOf('c-p-after') && document.querySelectorAll('#c-partner #c-p-partner').length === 1; }));
  check('8 + 6 checklist items, verbatim', (await p.$$eval('[data-tick=p]', a => a.length)) === 8 && (await p.$$eval('[data-tick=y]', a => a.length)) === 6
    && (await p.$$eval('[data-tick=p]', a => a[6].nextElementSibling.textContent)) === 'تقديم ملاحظات تربوية وتقرير متابعة مختصر كل أسبوعين وفق نموذج موحد، مع مراعاة خصوصية الطلاب.');
  check('c-p-by is a real table with both columns', await p.evaluate(() => { const t = document.querySelector('.pk-tbl'); return t && t.tHead.rows[0].cells.length === 3 && t.tBodies[0].rows.length === 5; }));
  await p.click('.pk-tbtn[data-type=assoc]');
  check('type toggle جمعية: aria-pressed, school column dimmed (not removed)', await p.evaluate(() => {
    const b = document.querySelector('.pk-tbtn[data-type=assoc]'); const c2 = document.querySelector('.pk-tbl tbody td:nth-child(2)'); const c3 = document.querySelector('.pk-tbl tbody td:nth-child(3)');
    return b.getAttribute('aria-pressed') === 'true' && +getComputedStyle(c2).opacity < 0.5 && +getComputedStyle(c3).opacity === 1 && getComputedStyle(c2).display !== 'none'; }));
  await p.check('[data-tick=p][data-i="1"]');
  await p.reload(); await p.waitForTimeout(400);
  check('type + ticks restored after reload', await p.evaluate(() => document.getElementById('pk').dataset.type === 'assoc' && document.querySelector('[data-tick=p][data-i="1"]').checked));
  await p.evaluate(() => { window.__prints = []; });
  await p.click('[data-print-sheet]');
  let pr = await p.evaluate(() => window.__prints);
  check('print sheet: body.print-partner-sheet during print', pr.length === 1 && pr[0].cls.includes('print-partner-sheet'));
  await p.emulateMedia({ media: 'print' });
  await p.evaluate(() => document.body.classList.add('print-partner-sheet'));
  check('partnership sheet: verbatim title, chosen column only, blank lines', await p.evaluate(() => {
    const s = document.querySelector('.pk-print-sheet'); return getComputedStyle(s).display === 'block' && s.querySelector('header b').textContent === 'الشراكة مع المدارس والجمعيات'
      && getComputedStyle(s.querySelector('.pk-prow .pk-col-s')).display === 'none' && getComputedStyle(s.querySelector('.pk-prow .pk-col-a')).display !== 'none'
      && s.textContent.includes('اسم المشرف') && getComputedStyle(document.getElementById('c-league')).display === 'none'; }));
  await p.evaluate(() => document.body.classList.remove('print-partner-sheet'));
  await p.emulateMedia({ media: 'screen' });

  console.log('partner-kit: report');
  await p.click('#pk-t-report');
  check('report panel quotes c-p-partner, q1-ready, c-follow; draft note', (await txt(p, '.pk-quotes')).includes('يُرفع تقرير مختصر كل أسبوعين يتضمن المستهدف والمتحقق ونسبة الإنجاز وأسباب التعثر.')
    && (await txt(p, '.pk-draft')) === 'مسودة للاستخدام الداخلي مبنية على بنود المتابعة أعلاه');
  check('fields from c-follow (و dropped only for the label)', (await p.$$eval('.pk-set legend', l => l.map(x => x.textContent).join('|'))) === 'عدد الفرق والأعضاء المسجلين والمنتظمين|المشروع التطبيقي لكل فريق|نسبة إنجاز المستهدف'
    && (await txt(p, 'label[for=pk-next]')) === 'خطوة التحسين التالية' && (await txt(p, 'label[for=pk-acts]')) === 'عدد الأنشطة المنفذة');
  check('defaults: report 1, today, no prefilled target', (await p.inputValue('[data-f=n]')) === '1' && /^\d{4}-\d{2}-\d{2}$/.test(await p.inputValue('[data-f=date]')) && (await p.inputValue('[data-f=target]')) === '' && (await txt(p, '[data-pct]')) === '—');
  await p.fill('[data-f=target]', '10'); await p.fill('[data-f=done]', '7');
  check('نسبة إنجاز المستهدف = round(7 ÷ 10 × 100) = 70%', (await txt(p, '[data-pct]')) === '70%');
  await p.fill('[data-f=target]', '0');
  check('target 0 → —', (await txt(p, '[data-pct]')) === '—');
  await p.fill('[data-f=target]', '3'); await p.fill('[data-f=done]', '2');
  check('2 ÷ 3 → 67%', (await txt(p, '[data-pct]')) === '67%');
  await p.fill('[data-f=teamsReg]', '12'); await p.fill('[data-f=challenges]', 'تحدٍّ');
  await p.fill('.pk-proj li [data-c="0"]', 'فريق الصدق'); await p.fill('.pk-proj li [data-c="1"]', 'زيارة');
  await p.click('[data-proj-add]');
  check('project rows: add', (await p.$$eval('.pk-proj li', l => l.length)) === 2);
  await p.click('[data-save]');
  await p.fill('[data-f=n]', '2'); await p.fill('[data-f=target]', '10'); await p.fill('[data-f=done]', '12');
  check('above 100 shown as is (120%)', (await txt(p, '[data-pct]')) === '120%');
  await p.click('[data-save]');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-partner-kit-v1')));
  check('history: {n, date, fields, pct} ×2 (67, 120)', st.history.length === 2 && st.history[0].pct === 67 && st.history[1].pct === 120 && st.history[0].fields.teamsReg === '12');
  check('history list + «حُفظ آخر تقرير اليوم» + sparkline summary', (await p.$$eval('.pk-hlist li', l => l.length)) === 2 && (await txt(p, '.pk-since')) === 'حُفظ آخر تقرير اليوم'
    && (await p.getAttribute('.pk-spark', 'aria-label')) === 'نسبة إنجاز المستهدف في التقارير المحفوظة: 67%، 120%');
  await p.click('[data-save]');
  check('saving the same number updates it', (await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-partner-kit-v1')).history.length)) === 2 && (await txt(p, '.pk-status')) === 'حُدّث التقرير رقم 2');
  await p.click('[data-new-report]');
  check('تقرير جديد → number 3, empty fields', (await p.inputValue('[data-f=n]')) === '3' && (await p.inputValue('[data-f=done]')) === '');
  await p.click('.pk-hlist li:first-child .btn');
  check('افتح restores report 1 (67%)', (await p.inputValue('[data-f=n]')) === '1' && (await txt(p, '[data-pct]')) === '67%' && (await p.inputValue('.pk-proj li [data-c="0"]')) === 'فريق الصدق');
  await p.click('[data-copy]'); await p.waitForTimeout(100);
  const copied = await p.evaluate(() => window.__copied);
  check('copy text: plain report with labels and values', typeof copied === 'string' && copied.includes('نسبة إنجاز المستهدف: 67%') && copied.includes('الفرق المسجلة: 12') && copied.includes('فريق الصدق: زيارة') && (await txt(p, '.pk-status')) === 'نُسخ نص التقرير');
  await p.evaluate(() => { window.__prints = []; });
  await p.click('[data-print-report]');
  pr = await p.evaluate(() => window.__prints);
  check('print report: body.print-partner-report, filled rows', pr.length === 1 && pr[0].cls.includes('print-partner-report') && (await txt(p, '[data-preport]')).includes('67%'));
  p.on('dialog', d => d.accept());
  await p.click('[data-clear]');
  check('امسح كل البيانات (confirmed) removes the key and resets', await p.evaluate(() => localStorage.getItem('yanabee-partner-kit-v1') === null && document.getElementById('pk').dataset.type === 'school' && !document.querySelector('[data-tick]:checked') && document.querySelectorAll('.pk-hlist li').length === 0));
  check('no page errors (partner-kit)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ no JS
console.log('without JavaScript');
{
  const { ctx, p } = await open({}, { js: false });
  check('no JS: both partner panels visible with the obligations', await p.evaluate(() => {
    const a = document.getElementById('pk-p-deal'), b = document.getElementById('pk-p-report');
    return !a.hidden && !b.hidden && a.offsetHeight > 0 && b.offsetHeight > 0 && document.querySelectorAll('#c-p-partner li').length === 8; }));
  check('no JS: interactive tools stay hidden', await p.evaluate(() => document.getElementById('jsh').hidden && document.getElementById('ac').hidden && document.querySelector('.pk-form').hidden));
  await ctx.close();
}

// ------------------------------------------------------------------ storage blocked
console.log('storage blocked');
{
  const { ctx, p, errs } = await open({}, { blockStorage: true });
  check('all three tools render', await p.evaluate(() => !document.getElementById('jsh').hidden && !document.getElementById('ac').hidden && !document.querySelector('.pk-form').hidden));
  await p.click('#jsh-t-judge');
  await p.fill('#jsh-name', 'فريق'); await p.click('[data-add]');
  await p.fill('#jsh-in-a1', '15');
  check('judge sheet works in memory', (await txt(p, '[data-total]')) === '15');
  await p.evaluate(() => { const r = document.getElementById('jsh-s0'); r.value = 6; r.dispatchEvent(new Event('input')); });
  check('self-check works in memory', (await txt(p, '.jsh-score')) === 'تقديركم: 6 من 45');
  await p.fill('[data-k=t0]', 'ورشة'); await p.waitForTimeout(900);
  check('activity card kept in memory, failure explained', (await txt(p, '.ac-list li b')) === 'ورشة' && (await txt(p, '.ac-status')).startsWith('تعذّر الحفظ'));
  await p.click('#pk-t-report');
  await p.fill('[data-f=target]', '4'); await p.fill('[data-f=done]', '3');
  check('partner report computes (75%)', (await txt(p, '[data-pct]')) === '75%');
  await p.click('[data-save]');
  check('partner report saved in memory', (await p.$$eval('.pk-hlist li', l => l.length)) === 1);
  check('no page errors with storage blocked', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ phone
console.log('phone 390px');
{
  const { ctx, p, errs } = await open(PHONE);
  check('no horizontal overflow (self-check)', (await overflow(p)) <= 0, String(await overflow(p)));
  await p.click('#jsh-t-judge');
  for (const n of ['فريق الصدق والأمانة', 'فريق الوفاء']) { await p.fill('#jsh-name', n); await p.click('[data-add]'); }
  await p.fill('#jsh-in-a0', '9');
  check('no horizontal overflow (worksheet + ranking)', (await overflow(p)) <= 0);
  check('ranking table scrolls inside its wrapper', await p.evaluate(() => { const s = document.querySelector('.jsh-scroll'); return s.scrollWidth > s.clientWidth && getComputedStyle(s).overflowX === 'auto'; }));
  check('worksheet inputs in 2 columns', await p.evaluate(() => { const a = document.getElementById('jsh-in-a0').getBoundingClientRect(), b = document.getElementById('jsh-in-a1').getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && a.width < 200; }));
  await p.click('#pk-t-report');
  await p.click('[data-proj-add]');
  check('no horizontal overflow (partner report)', (await overflow(p)) <= 0);
  const small = await p.evaluate(() => [...document.querySelectorAll('#jsh button:not([hidden]), #jsh input, #jsh select, #ac button, #ac input:not([type=checkbox]):not([type=radio]), #ac .ac-opt, #ac .ac-pill span, #pk button, #pk input:not([type=checkbox]), #pk .pk-opt, .ac-nav a')]
    .filter(e => e.offsetParent && !e.closest('[hidden]') && !e.classList.contains('sr-only')).map(e => { const r = e.getBoundingClientRect(); return { h: r.height, w: r.width, t: (e.id || e.className || e.tagName) + '' }; })
    .filter(r => r.h < 43.5 || r.w < 43.5));
  check('touch targets ≥ 44px', small.length === 0, JSON.stringify(small.slice(0, 5)));
  check('no page errors (phone)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

check('no network requests (besides blocked fonts)', netReqs.length === 0, netReqs.slice(0, 3).join(' '));
check('no console errors overall', allErrs.length === 0, allErrs.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
