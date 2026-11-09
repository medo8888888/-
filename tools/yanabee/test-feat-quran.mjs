// Browser test of the quran.html feature bundle: «دفتري: حفظ، فهم، تطبيق» (#student-week, in #a4) and
// «أدوات مجلس قادة الفرق» (#halaqa-council, in #a3).
//   node tools/yanabee/test-feat-quran.mjs        (after python3 tools/yanabee/build.py)
// Covers: placement and verbatim quotes (checked against content/yanabee/quran.txt and competition.txt), tabs + keyboard,
// the days computation with the document's paces, the calendar (today, future disabled, month navigation, marks, reload),
// understanding notes, the weekly form (week shift, save, history, open, delete), the A5 print sheet, clearing data,
// the monthly leader rotation (7 names -> each leads once, the two other roles never rotate, overrides, size warning),
// the values league (sums, week/month/season, ties), export -> import round trip and a rejected file, both print modes,
// blocked storage, no JavaScript, 390px phone without overflow, no console errors and no network requests.
// The clock is fixed to 18 Nov 2026 so the calendar checks are deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const URL_Q = 'file://' + path.join(ROOT, 'site/yanabee/quran.html');
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const norm = s => s.replace(/[«»"“”]/g, '').replace(/^\s*-\s*/, '').replace(/\s+/g, ' ').trim();
const QTXT = fs.readFileSync(path.join(ROOT, 'content/yanabee/quran.txt'), 'utf8').split('\n');
const CTXT = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8').split('\n');
const qline = start => { const l = QTXT.find(x => norm(x).startsWith(start)); if (!l) throw new Error('no line ' + start); return norm(l); };
const NOW = new Date(2026, 10, 18, 10, 0, 0);      // Wednesday 18 November 2026, local time
const TODAY = '2026-11-18';
const KEY_SW = 'yanabee-student-week-v1', KEY_HC = 'yanabee-halaqa-council-v1';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(opts = {}) {
  const { viewport = { width: 1280, height: 900 }, block = false, js = true, storageInit = null, ...rest } = opts;
  const ctx = opts.ctx || await browser.newContext({ viewport, reducedMotion: 'reduce', javaScriptEnabled: js, acceptDownloads: true, ...rest });
  const p = await ctx.newPage();
  const errs = [], net = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text() + ((m.location() && m.location().url) || ''))) errs.push(m.text()); });
  p.on('request', r => { const u = r.url(); if (!/^(file:|data:|blob:|about:)/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u)) net.push(u); });
  await p.route('**/fonts.g*/**', r => r.abort());
  if (js) await p.clock.setFixedTime(NOW);
  if (block) await p.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  if (storageInit) await p.addInitScript(storageInit);
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* blocked */ } });
  await p.goto(URL_Q);
  await p.waitForTimeout(400);
  return { ctx, p, errs, net };
}
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && (r.width > 0 || r.height > 0); }, sel);
const type = (p, sel, v) => p.evaluate(([s, val]) => { const e = document.querySelector(s); e.value = val; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const stubPrint = p => p.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.className); });

// ============================================================================ student-week
console.log('student-week: placement and verbatim quotes');
{
  const { ctx, p, errs, net } = await open();
  check('#student-week sits inside section #a4', await p.evaluate(() => !!document.querySelector('section#a4 #student-week')));
  const quotes = await p.$$eval('#student-week .sw-q p, #student-week .sw-kpi a', els => els.map(e => e.textContent));
  const want = [qline('المنهجية:'), qline('استنباط القيم:'), qline('استمارة التطبيق العملي الفردي:'), qline('KPI 2 ')];
  want.forEach(w => check('quote verbatim: ' + w.slice(0, 30), quotes.some(q => norm(q) === w), quotes.map(norm).join(' | ').slice(0, 200)));
  check('print sheet closes with the quality role line verbatim', norm(await txt(p, '#sw-print .sw-print-role')) === qline('مسؤول الجودة والسلوك:'));
  check('print sheet has no signature lines', !/توقيع/.test(await txt(p, '#sw-print')));
  check('no Surat As-Saff preset in the notebook', !/سورة الصف/.test(await txt(p, '#student-week')));
  check('pace data is exactly [1,2,3]', JSON.stringify(await p.evaluate(() => JSON.parse(document.getElementById('sw-data').textContent).paces)) === '[1,2,3]');
  check('radios offer only 1, 2, 3', JSON.stringify(await p.$$eval('input[name=sw-pace]', r => r.map(x => x.value))) === '["1","2","3"]');
  check('no pace preselected and no ayah count preset', await p.evaluate(() => !document.querySelector('input[name=sw-pace]:checked') && document.getElementById('sw-total').value === ''));
  check('the tools\' ids are unique in the page', await p.evaluate(() => {
    const all = [...document.querySelectorAll('[id]')].map(e => e.id);
    const mine = [...document.querySelectorAll('#student-week, #student-week [id], #halaqa-council, #halaqa-council [id]')].map(e => e.id);
    return mine.length > 40 && mine.every(id => all.filter(x => x === id).length === 1);
  }));

  console.log('student-week: tabs');
  check('tablist shown with JS, 3 tabs', await shown(p, '#student-week [role=tablist]') && (await p.$$('#student-week [role=tab]')).length === 3);
  check('only the first panel is visible', await p.evaluate(() => ['sw-p-hifz', 'sw-p-fahm', 'sw-p-tatbeeq'].map(id => document.getElementById(id).hidden).join() === 'false,true,true'));
  await p.focus('#sw-tab-hifz'); await p.keyboard.press('ArrowLeft');
  check('ArrowLeft (RTL forward) selects «فهمي» and moves focus', await p.evaluate(() => document.activeElement.id === 'sw-tab-fahm' && document.getElementById('sw-tab-fahm').getAttribute('aria-selected') === 'true' && !document.getElementById('sw-p-fahm').hidden));
  await p.keyboard.press('End');
  check('End selects «تطبيقي هذا الأسبوع»', await p.evaluate(() => document.activeElement.id === 'sw-tab-tatbeeq' && !document.getElementById('sw-p-tatbeeq').hidden));
  await p.keyboard.press('Home');
  check('Home goes back to «حفظي اليومي»', await p.evaluate(() => !document.getElementById('sw-p-hifz').hidden));

  console.log('student-week: days with the document paces');
  await p.check('input[name=sw-pace][value="2"]');
  await p.fill('#sw-total', '7');
  check('pace 2 + 7 ayahs -> «عدد الأيام بهذا المقدار: 4»', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 4', await txt(p, '#sw-days'));
  check('the result is in an aria-live region', (await p.getAttribute('#sw-days', 'aria-live')) === 'polite');
  await p.check('input[name=sw-pace][value="3"]');
  check('pace 3 + 7 -> 3', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 3');
  await p.check('input[name=sw-pace][value="1"]');
  check('pace 1 + 7 -> 7', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 7');
  await p.fill('#sw-total', '');
  check('empty count -> a prompt, no number', !/\d/.test(await txt(p, '#sw-days')));
  await p.check('input[name=sw-pace][value="2"]'); await p.fill('#sw-total', '7');

  console.log('student-week: calendar');
  check('month heading is November 2026', /نوفمبر 2026/.test(await txt(p, '#sw-month')), await txt(p, '#sw-month'));
  check('7 weekday headers', (await p.$$('#sw-wd span')).length === 7);
  check('30 day buttons', (await p.$$('#sw-grid .sw-day')).length === 30);
  check('today is marked (aria-current=date) and selected', await p.evaluate(t => { const b = document.querySelector('#sw-grid [aria-current=date]'); return b && b.dataset.day === t && b.classList.contains('sel'); }, TODAY));
  check('future days are disabled (19–30)', await p.evaluate(() => [...document.querySelectorAll('#sw-grid .sw-day')].filter(b => b.disabled).length === 12));
  check('next month is disabled on the current month', await p.evaluate(() => document.getElementById('sw-next-m').disabled));
  check('day buttons are at least 40px wide and 44px tall', await p.evaluate(() => [...document.querySelectorAll('#sw-grid .sw-day')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 40 && r.height >= 44; })));
  check('day labels start «لم أسجّل»', /لم أسجّل/.test(await p.getAttribute(`#sw-grid [data-day="${TODAY}"]`, 'aria-label')));
  check('no aria-pressed on days', (await p.$$('#sw-grid [aria-pressed]')).length === 0);
  await p.check('#sw-did-h');
  check('«حفظت مقداري» stores 1 for today', await p.evaluate(t => window.YanabeeStudentWeek.state.days[t] === 1, TODAY));
  check('today label reads «حفظت»', /: حفظت(،|$)/.test(await p.getAttribute(`#sw-grid [data-day="${TODAY}"]`, 'aria-label')));
  check('last 7 days: 1 of 7', (await txt(p, '#sw-last7')) === 'آخر 7 أيام: حفظت في 1 من 7');
  await p.check('#sw-did-r');
  check('«راجعت» too -> «حفظت وراجعت»', /حفظت وراجعت/.test(await p.getAttribute(`#sw-grid [data-day="${TODAY}"]`, 'aria-label')));
  check('dots show both marks', await p.evaluate(t => { const b = document.querySelector(`#sw-grid [data-day="${t}"]`); return b.classList.contains('h') && b.classList.contains('r'); }, TODAY));
  // keyboard: ArrowRight = previous day in RTL
  await p.focus(`#sw-grid [data-day="${TODAY}"]`); await p.keyboard.press('ArrowRight');
  check('ArrowRight selects the previous day and focuses it', await p.evaluate(() => document.activeElement.dataset.day === '2026-11-17' && /17/.test(document.getElementById('sw-day-l').textContent)));
  await p.keyboard.press('Enter');
  await p.check('#sw-did-h');
  check('last 7 days: 2 of 7', (await txt(p, '#sw-last7')) === 'آخر 7 أيام: حفظت في 2 من 7');
  await p.focus('#sw-grid .sw-day.sel');
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  check('cannot move into the future (stays on today)', await p.evaluate(t => document.activeElement.dataset.day === t, TODAY));
  await p.click('#sw-prev-m');
  check('previous month: October 2026, 31 days, all enabled', /أكتوبر 2026/.test(await txt(p, '#sw-month')) && await p.evaluate(() => { const d = [...document.querySelectorAll('#sw-grid .sw-day')]; return d.length === 31 && d.every(b => !b.disabled); }));
  check('next month enabled again', await p.evaluate(() => !document.getElementById('sw-next-m').disabled));
  await p.click('#sw-grid [data-day="2026-10-05"]');
  await p.check('#sw-did-h');
  check('a day in October can be marked', await p.evaluate(() => window.YanabeeStudentWeek.state.days['2026-10-05'] === 1));
  check('last 7 days is a rolling window (still 2)', (await txt(p, '#sw-last7')) === 'آخر 7 أيام: حفظت في 2 من 7');
  await p.click('#sw-next-m');
  check('back on November', /نوفمبر/.test(await txt(p, '#sw-month')));

  console.log('student-week: understanding notes');
  await p.click('#sw-tab-fahm');
  check('date defaults to today', (await p.inputValue('#sw-f-date')) === TODAY);
  await p.click('#sw-fahm-form button[type=submit]');
  check('an empty note is refused with a message', (await p.evaluate(() => window.YanabeeStudentWeek.state.fahm.length)) === 0 && !!(await txt(p, '#sw-fahm-msg')));
  await p.fill('#sw-f-ayat', 'الآيات 1-4'); await p.fill('#sw-f-value', 'قيمة الصدق');
  await p.click('#sw-fahm-form button[type=submit]');
  await p.fill('#sw-f-ayat', 'الآيات 5-6'); await p.fill('#sw-f-value', 'قيمة التعاون');
  await p.fill('#sw-f-date', '2026-11-10');
  await p.click('#sw-fahm-form button[type=submit]');
  check('two notes listed, newest date first', JSON.stringify(await p.$$eval('#sw-fahm-list li b', b => b.map(x => x.textContent))) === '["الآيات 1-4","الآيات 5-6"]');
  check('form cleared after adding', (await p.inputValue('#sw-f-ayat')) === '' && (await p.inputValue('#sw-f-date')) === TODAY);
  await p.click('#sw-fahm-list li:nth-child(2) button');
  check('«احذف» removes one note', (await p.evaluate(() => window.YanabeeStudentWeek.state.fahm.length)) === 1 && (await p.$$('#sw-fahm-list li')).length === 1);

  console.log('student-week: weekly form');
  await p.click('#sw-tab-tatbeeq');
  check('week starts today by default (date input, not type=week)', (await p.inputValue('#sw-w-start')) === TODAY && (await p.getAttribute('#sw-w-start', 'type')) === 'date');
  check('range shown: 18 to 24 November', /18 نوفمبر 2026 إلى 24 نوفمبر 2026/.test(await txt(p, '#sw-w-range')), await txt(p, '#sw-w-range'));
  await p.click('#sw-w-prev');
  check('«الأسبوع السابق» moves 7 days back', (await p.inputValue('#sw-w-start')) === '2026-11-11');
  await p.click('#sw-w-next');
  check('«الأسبوع التالي» moves 7 days forward', (await p.inputValue('#sw-w-start')) === TODAY);
  await p.fill('#sw-w-name', 'طالب'); await p.fill('#sw-w-value', 'الصدق');
  await p.fill('#sw-w-task', 'أن أصدق في كل كلامي'); await p.fill('#sw-w-report', 'سطر أول\nسطر ثان');
  await p.click('#sw-week-form button[type=submit]');
  check('week saved under its start date', await p.evaluate(t => { const w = window.YanabeeStudentWeek.state.weeks[t]; return w && w.value === 'الصدق' && w.report === 'سطر أول\nسطر ثان'; }, TODAY));
  check('history lists the week', (await p.$$('#sw-weeks li')).length === 1);
  await p.click('#sw-w-prev');
  check('another week starts empty (name kept)', (await p.inputValue('#sw-w-value')) === '' && (await p.inputValue('#sw-w-name')) === 'طالب');
  await p.fill('#sw-w-value', 'الأمانة'); await p.click('#sw-week-form button[type=submit]');
  check('history newest first', /18 نوفمبر/.test(await txt(p, '#sw-weeks li:first-child b')) && (await p.$$('#sw-weeks li')).length === 2);
  await p.click('#sw-weeks li:first-child button:first-child');
  check('«افتح» loads that week', (await p.inputValue('#sw-w-start')) === TODAY && (await p.inputValue('#sw-w-value')) === 'الصدق');
  await p.click('#sw-weeks li:nth-child(2) button:nth-child(2)');
  check('«احذف» removes a week', (await p.$$('#sw-weeks li')).length === 1 && await p.evaluate(() => !window.YanabeeStudentWeek.state.weeks['2026-11-11']));

  console.log('student-week: print (A5 form only)');
  await stubPrint(p);
  await p.click('#sw-print-btn');
  check('print called with body.print-student-week', await p.evaluate(() => window.__printed.length === 1 && /print-student-week/.test(window.__printed[0])));
  check('sheet filled with the fields', (await txt(p, '#sw-print [data-f=value]')) === 'الصدق' && (await txt(p, '#sw-print [data-f=name]')) === 'طالب' && /18 نوفمبر/.test(await txt(p, '#sw-print [data-f=range]')));
  await p.emulateMedia({ media: 'print' });
  check('print media: the sheet is shown', await shown(p, '#sw-print'));
  check('print media: everything else is hidden', await p.evaluate(() => ['.nav', '.q-hero', '#a3', '#a4 .q-head', '#a4 .q-steps', '#sw-p-hifz', '.sw-tabs', '.footer', '.cta']
    .every(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; })));
  check('print sheet uses the A5 named page', await p.evaluate(() => getComputedStyle(document.getElementById('sw-print')).page === 'sw-a5'));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes the class', await p.evaluate(() => !document.body.classList.contains('print-student-week')));
  check('print media without the class: the sheet stays hidden', !(await shown(p, '#sw-print')));
  await p.emulateMedia({ media: 'screen' });
  check('screen: the sheet is hidden', !(await shown(p, '#sw-print')));

  console.log('student-week: reload keeps the data');
  await p.reload(); await p.waitForTimeout(300);
  check('marks survive a reload', await p.evaluate(t => window.YanabeeStudentWeek.state.days[t] === 3 && document.querySelector(`#sw-grid [data-day="${t}"]`).classList.contains('h'), TODAY));
  check('pace and count survive a reload', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 4' && await p.isChecked('input[name=sw-pace][value="2"]'));
  check('no storage notice when storage works', !(await shown(p, '#sw-store')));

  console.log('student-week: clear');
  p.once('dialog', d => d.dismiss());
  await p.click('#sw-clear');
  check('cancelled confirm keeps the data', await p.evaluate(k => !!localStorage.getItem(k), KEY_SW));
  p.once('dialog', d => d.accept());
  await p.click('#sw-clear');
  check('«امسح بياناتي» removes the key and resets', await p.evaluate(k => localStorage.getItem(k) === null && Object.keys(window.YanabeeStudentWeek.state.days).length === 0 && document.getElementById('sw-total').value === '', KEY_SW));
  check('no page errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' '));
  await ctx.close();
}

// ============================================================================ halaqa-council
console.log('halaqa-council: placement and verbatim quotes');
{
  const { ctx, p, errs, net } = await open();
  check('#halaqa-council sits inside section #a3', await p.evaluate(() => !!document.querySelector('section#a3 #halaqa-council')));
  const quotes = (await p.$$eval('#halaqa-council .hc-q', els => els.map(e => [...e.querySelectorAll('p')].map(x => x.textContent).join(' ')))).map(norm);
  const all = quotes.join(' | ');
  for (const w of [qline('مجلس قادة الفرق:'), qline('الاجتماع الأسبوعي لقادة الفرق'), qline('قائد الفريق:'), qline('تأهيل صف ثاني من القادة:'),
    qline('KPI 6 '), qline('درع الفريق المثالي:'), norm(CTXT.find(l => l.startsWith('اعتماد معايير تقييم المسابقة')))])
    check('quote verbatim: ' + w.slice(0, 30), all.includes(w), all.slice(0, 160));
  const leagueTxt = norm(await p.evaluate(() => { const q = document.querySelector('#hc-p-league .hc-q'); return [...q.querySelectorAll('p, li.q-point, li.q-plus')].map(x => x.textContent).join(' '); }));
  check('league line verbatim (with its four components)', leagueTxt.replace(/[()]/g, '').replace(/\s+/g, ' ') === qline('الدوري القيمي والتنافس الشريف:').replace(/[()]/g, '').replace(/\.$/, '').replace(/\s+/g, ' '), leagueTxt);
  check('no «100 نقطة» anywhere in the tool', !/100 نقطة/.test(await txt(p, '#halaqa-council')));
  check('no competition-team toggle (5 إلى 7) in the tool', !/5 إلى 7/.test(await txt(p, '#halaqa-council')));
  check('role headers are the three document labels', JSON.stringify(await p.$$eval('#hc-rot-tbl thead th', t => t.slice(1).map(x => x.childNodes[0].textContent.trim()))) === JSON.stringify(['قائد الفريق', 'مسؤول الجودة والسلوك', 'المسؤول التقني والإعلامي']));
  check('role headers carry the duty as title', (await p.getAttribute('#hc-rot-tbl thead th:nth-child(3)', 'title')) === 'متابعة تطبيق المهام السلوكية والقيمية لأعضاء الفريق.');
  check('the simulation link points to lab.html', !!(await p.$('#halaqa-council a[href="lab.html#panel-studio"]')));
  check('competition separator links to #c-score', !!(await p.$('#halaqa-council a[href="competition.html#c-score"]')));
  check('league grid headers are the four components', JSON.stringify(await p.$$eval('#hc-grid thead th', t => t.slice(1, 5).map(x => x.textContent.trim()))) === JSON.stringify(['الحفظ', 'التفسير', 'تنفيذ المبادرات الميدانية لبناء القيم وتنمية المجتمع', 'التزام الفريق']));

  console.log('halaqa-council: tabs');
  await p.focus('#hc-tab-rot'); await p.keyboard.press('ArrowLeft');
  check('ArrowLeft selects the league tab', await p.evaluate(() => document.activeElement.id === 'hc-tab-league' && !document.getElementById('hc-p-league').hidden && document.getElementById('hc-p-rot').hidden));
  await p.keyboard.press('ArrowRight');
  check('ArrowRight returns to the rotation tab', await p.evaluate(() => !document.getElementById('hc-p-rot').hidden));

  console.log('halaqa-council: monthly leader rotation');
  check('start month defaults to the current month', await p.evaluate(() => window.YanabeeHalaqa.state.start === '2026-11' && document.getElementById('hc-start-m').value === '10' && document.getElementById('hc-start-y').value === '2026'));
  const N7 = ['أ1', 'ب2', 'ج3', 'د4', 'ه5', 'و6', 'ز7'];
  await type(p, '#hc-names', N7.join('\n') + '\n ب2 \n\n');
  check('names trimmed and de-duplicated', JSON.stringify(await p.evaluate(() => window.YanabeeHalaqa.state.names)) === JSON.stringify(N7));
  check('months default to the number of names (7)', (await p.inputValue('#hc-months')) === '7' && (await p.$$('#hc-rot-body tr')).length === 7);
  const leaders = await p.$$eval('#hc-rot-body .hc-leader', c => c.map(x => x.textContent));
  check('7 names, 7 months: every name leads exactly once, in order', JSON.stringify(leaders) === JSON.stringify(N7), leaders.join());
  check('first row is November 2026 and marked as this month', /نوفمبر 2026/.test(await txt(p, '#hc-rot-body tr:first-child th')) && (await p.getAttribute('#hc-rot-body tr:first-child', 'aria-current')) === 'date');
  check('size range 6–10: no warning for 7', !(await shown(p, '#hc-warn')));
  check('quality/tech start unassigned (never auto-filled)', await p.evaluate(() => [...document.querySelectorAll('#hc-rot-body .hc-role .hc-name')].every(s => s.textContent === '—')));
  await p.selectOption('#hc-fix-q', 'ج3'); await p.selectOption('#hc-fix-t', 'ه5');
  const roleCols = await p.$$eval('#hc-rot-body tr', rows => rows.map(r => [...r.querySelectorAll('.hc-name')].map(s => s.textContent).join('/')));
  check('the two other roles are copied to every month and never rotate', roleCols.every(x => x === 'ج3/ه5'), roleCols.join());
  await p.selectOption('#hc-rot-body tr:nth-child(3) select[data-role=quality]', 'ز7');
  const after = await p.$$eval('#hc-rot-body tr', rows => rows.map(r => r.querySelector('.hc-name').textContent));
  check('a per-month override changes only that month', after[2] === 'ز7' && after.filter(x => x === 'ج3').length === 6, after.join());
  check('override stored by month', await p.evaluate(() => window.YanabeeHalaqa.state.overrides['2027-01'].quality === 'ز7'));
  await p.fill('#hc-months', '14'); await p.dispatchEvent('#hc-months', 'change');
  const l14 = await p.$$eval('#hc-rot-body .hc-leader', c => c.map(x => x.textContent));
  check('14 months: two full cycles (names[i % 7])', l14.length === 14 && N7.every(n => l14.filter(x => x === n).length === 2) && l14[7] === N7[0]);
  await p.click('#hc-full');
  check('«دورة كاملة» resets to one cycle', (await p.$$('#hc-rot-body tr')).length === 7);
  await type(p, '#hc-names', N7.slice(0, 5).join('\n'));
  check('5 names: warning shown next to the quoted label', await shown(p, '#hc-warn') && /تكوين الفريق \(6 - 10 طلاب\)/.test(await txt(p, '#hc-warn')));
  await type(p, '#hc-names', [...N7, 'ح8', 'ط9', 'ي10', 'ك11'].join('\n'));
  check('11 names: warning shown, table still built (warn, never block)', await shown(p, '#hc-warn') && (await p.$$('#hc-rot-body tr')).length === 11);
  await type(p, '#hc-names', N7.join('\n'));
  check('back to 7: warning gone', !(await shown(p, '#hc-warn')));
  check('«من تولّى القيادة حتى الآن» lists November with the first name', /نوفمبر 2026\s*أ1/.test(await txt(p, '#hc-sofar')));
  await p.selectOption('#hc-start-m', '8');   // September 2026: three months have started by 18 Nov
  check('start September: three leaders so far, in order', JSON.stringify(await p.$$eval('#hc-sofar b', b => b.map(x => x.textContent))) === JSON.stringify(N7.slice(0, 3)));
  await p.selectOption('#hc-start-y', '2027');
  check('a future start says the table has not started', /لم يبدأ/.test(await txt(p, '#hc-sofar')));
  await p.selectOption('#hc-start-y', '2026'); await p.selectOption('#hc-start-m', '10');

  console.log('halaqa-council: print the rotation');
  await stubPrint(p);
  await p.click('#hc-print-rot');
  check('print called with body.print-halaqa-rot', await p.evaluate(() => window.__printed.length === 1 && /print-halaqa-rot/.test(window.__printed[0])));
  await p.emulateMedia({ media: 'print' });
  check('print: the rotation table and footnotes show', await shown(p, '#hc-rot-tbl') && await shown(p, '#hc-p-rot .hc-fn'));
  check('print: names show as text, the selects and controls are hidden', await shown(p, '#hc-rot-body .hc-name') && !(await shown(p, '#hc-rot-body select')) && !(await shown(p, '#hc-names')));
  check('print: the rest of the page is hidden', await p.evaluate(() => ['.nav', '.q-hero', '#a4', '#a3 .q-head', '#a3 .q-team', '#hc-p-league', '.hc-top', '.footer'].every(s => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none'; })));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes the class', await p.evaluate(() => !document.body.className.includes('print-halaqa')));
  await p.emulateMedia({ media: 'screen' });

  console.log('halaqa-council: values league');
  await p.click('#hc-tab-league');
  check('without teams: a prompt instead of the grid', !(await shown(p, '#hc-grid')) && /الفرق/.test(await txt(p, '#hc-grid-empty')));
  await type(p, '#hc-teams', 'النور\nالهدى\nالفجر');
  check('without a week: a prompt', /أسبوع/.test(await txt(p, '#hc-grid-empty')));
  await p.click('#hc-week-add');
  check('first week starts today', await p.evaluate(t => window.YanabeeHalaqa.state.weeks.length === 1 && window.YanabeeHalaqa.state.weeks[0].start === t, TODAY));
  const setPts = async (team, arr) => { for (let c = 0; c < 4; c++) await type(p, `#hc-grid-body input[data-team="${team}"][data-c="${c}"]`, String(arr[c])); };
  await setPts('النور', [5, 4, 3, 2]); await setPts('الهدى', [6, 2, 4, 2]); await setPts('الفجر', [1, 1, 1, 1]);
  check('row sum = sum of the four inputs (14)', (await txt(p, '#hc-grid-body tr:first-child .hc-sum')) === '14');
  const tot = await p.$$eval('#hc-tot-body tr', r => r.map(x => x.querySelector('th').textContent + ':' + x.querySelector('.hc-sum').textContent + ':' + x.querySelector('.hc-marks').textContent));
  check('week totals sorted', tot[2].startsWith('الفجر:4'), tot.join());
  check('a tie at the top gives two «تساوٍ» marks', (await p.$$eval('#hc-tot-body .hc-tie', t => t.length)) === 2);
  check('both tied teams marked «الأعلى نقاطاً في هذه الفترة»', (await p.$$eval('#hc-tot-body .hc-mtop', t => t.map(x => x.textContent))).join('|') === 'الأعلى نقاطاً في هذه الفترة|الأعلى نقاطاً في هذه الفترة');
  check('no shield wording in the marks', !/درع|فاز/.test(await txt(p, '#hc-tot-body')));
  await type(p, '#hc-grid-body input[data-team="الهدى"][data-c="3"]', '3');
  check('a single top team: one mark, no tie', (await p.$$eval('#hc-tot-body .hc-mtop', t => t.length)) === 1 && (await p.$$eval('#hc-tot-body .hc-tie', t => t.length)) === 0 && /الهدى/.test(await txt(p, '#hc-tot-body tr:first-child th')));
  await type(p, '#hc-grid-body input[data-team="الفجر"][data-c="0"]', '-3');
  check('negative points are refused', await p.evaluate(() => window.YanabeeHalaqa.state.weeks[0].pts['الفجر'][0] === null));
  await p.click('#hc-week-add');
  check('second week starts 7 days later and is selected', await p.evaluate(() => window.YanabeeHalaqa.state.weeks[1].start === '2026-11-25' && window.YanabeeHalaqa.state.sel === 1));
  await setPts('الفجر', [10, 10, 10, 10]);
  await p.click('#hc-week-add');
  await p.fill('#hc-week-start', '2026-12-02'); await p.dispatchEvent('#hc-week-start', 'change');
  await setPts('النور', [1, 0, 0, 0]);
  check('weeks: three, sorted', await p.evaluate(() => window.YanabeeHalaqa.state.weeks.map(w => w.start).join() === '2026-11-18,2026-11-25,2026-12-02'));
  await p.click('.hc-seg [data-view=season]');
  check('season = all weeks (الفجر 43, النور 15, الهدى 15)', JSON.stringify(await p.$$eval('#hc-tot-body tr', r => r.map(x => x.querySelector('th').textContent + x.querySelector('.hc-sum').textContent))) === JSON.stringify(['الفجر43', 'النور15', 'الهدى15']));
  check('season tie below the top is marked «تساوٍ» twice', (await p.$$eval('#hc-tot-body .hc-tie', t => t.length)) === 2);
  check('view button pressed state', (await p.getAttribute('.hc-seg [data-view=season]', 'aria-pressed')) === 'true');
  await p.selectOption('#hc-week', '0');
  await p.click('.hc-seg [data-view=month]');
  check('month = the November weeks only (2 weeks)', /نوفمبر 2026 \(عدد الأسابيع: 2\)/.test(await txt(p, '#hc-period')) && JSON.stringify(await p.$$eval('#hc-tot-body tr', r => r.map(x => x.querySelector('.hc-sum').textContent))) === JSON.stringify(['43', '15', '14']));
  await p.click('.hc-seg [data-view=week]');
  check('week view = the selected week', /18 نوفمبر/.test(await txt(p, '#hc-period')));
  check('totals table has the component columns', (await p.$$('#hc-tot thead th')).length === 7);

  console.log('halaqa-council: print the period');
  await stubPrint(p);
  await p.click('#hc-print-league');
  check('print called with body.print-halaqa-league', await p.evaluate(() => /print-halaqa-league/.test(window.__printed[0] || '')));
  await p.emulateMedia({ media: 'print' });
  check('print: the totals table and the league quote show; inputs grid hidden', await shown(p, '#hc-tot') && await shown(p, '#hc-p-league .hc-q') && !(await shown(p, '#hc-grid')));
  check('print: the rotation panel is hidden', !(await shown(p, '#hc-p-rot')));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  await p.emulateMedia({ media: 'screen' });

  console.log('halaqa-council: export / import');
  const before = await p.evaluate(() => JSON.stringify(window.YanabeeHalaqa.state));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#hc-export')]);
  const file = path.join(path.dirname(await dl.path()), 'hc-export.json');
  await dl.saveAs(file);
  const exported = fs.readFileSync(file, 'utf8');
  check('export is the tool state as JSON', JSON.stringify(JSON.parse(exported)) === before && /\.json$/.test(dl.suggestedFilename()));
  p.once('dialog', d => d.accept());
  await p.click('#hc-clear');
  check('«امسح البيانات» clears state and key', await p.evaluate(k => localStorage.getItem(k) === null && window.YanabeeHalaqa.state.names.length === 0 && window.YanabeeHalaqa.state.weeks.length === 0, KEY_HC));
  await p.setInputFiles('#hc-file', file);
  await p.waitForTimeout(200);
  check('import restores exactly the exported state', (await p.evaluate(() => JSON.stringify(window.YanabeeHalaqa.state))) === before);
  check('import re-renders the tables', (await p.$$('#hc-rot-body tr')).length === 7 && (await p.inputValue('#hc-names')).split('\n').length === 7);
  const bad = path.join(path.dirname(file), 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ v: 1, names: ['x'], start: '2026-11', teams: [], weeks: [{ start: '2026-11-18', pts: { a: [1, 2, 3] } }] }));
  await p.setInputFiles('#hc-file', bad);
  await p.waitForTimeout(200);
  check('a file with the wrong shape is refused and nothing changes', (await p.evaluate(() => JSON.stringify(window.YanabeeHalaqa.state))) === before && /لا يطابق/.test(await txt(p, '#hc-msg')));
  fs.writeFileSync(bad, 'not json');
  await p.setInputFiles('#hc-file', bad);
  await p.waitForTimeout(200);
  check('a non-JSON file is refused', (await p.evaluate(() => JSON.stringify(window.YanabeeHalaqa.state))) === before);

  console.log('halaqa-council: reload, delete week');
  await p.reload(); await p.waitForTimeout(300);
  check('state survives a reload', (await p.evaluate(() => JSON.stringify(window.YanabeeHalaqa.state))) === before);
  await p.click('#hc-tab-league');
  p.once('dialog', d => d.accept());
  await p.click('#hc-week-del');
  check('«احذف الأسبوع» removes the selected week', await p.evaluate(() => window.YanabeeHalaqa.state.weeks.length === 2));
  check('no page errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' '));
  await ctx.close();
}

// ============================================================================ both: storage blocked
console.log('storage blocked');
{
  const { ctx, p, errs, net } = await open({ block: true });
  check('page works: both tools rendered', await shown(p, '#student-week [role=tablist]') && await shown(p, '#halaqa-council [role=tablist]'));
  check('quiet notices shown', await shown(p, '#sw-store') && await shown(p, '#hc-store'));
  await p.check('input[name=sw-pace][value="2"]'); await p.fill('#sw-total', '7');
  check('days still computed (4)', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 4');
  await p.check('#sw-did-h');
  check('marks kept for the session', await p.evaluate(() => window.YanabeeStudentWeek.state.days['2026-11-18'] === 1));
  await type(p, '#hc-names', 'a\nb\nc\nd\ne\nf');
  check('rotation still built (6 rows)', (await p.$$('#hc-rot-body tr')).length === 6);
  p.once('dialog', d => d.accept());
  await p.click('#sw-clear');
  check('clear works without storage', await p.evaluate(() => Object.keys(window.YanabeeStudentWeek.state.days).length === 0));
  check('no page errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' '));
  await ctx.close();
}

// ============================================================================ no JavaScript
console.log('no JavaScript');
{
  const { ctx, p } = await open({ js: false });
  check('student-week: three panels stacked, each with its quote', await p.evaluate(() => ['sw-p-hifz', 'sw-p-fahm', 'sw-p-tatbeeq'].every(id => { const e = document.getElementById(id); return !e.hidden && e.querySelector('.sw-q'); })));
  check('student-week: tabs and JS-only tools hidden', !(await shown(p, '#student-week [role=tablist]')) && !(await shown(p, '#sw-p-hifz .sw-tool')));
  check('halaqa: both panels readable, controls hidden', await shown(p, '#hc-p-rot .hc-q') && await shown(p, '#hc-p-league .hc-q') && !(await shown(p, '#hc-names')) && !(await shown(p, '#halaqa-council [role=tablist]')));
  await ctx.close();
}

// ============================================================================ phone 390px, dark
console.log('phone 390px');
{
  const { ctx, p, errs, net } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  check('no horizontal overflow (initial)', (await overflow(p)) <= 0, String(await overflow(p)));
  await type(p, '#hc-names', 'أحمد\nخالد\nسالم\nعمر\nيوسف\nبلال\nزيد');
  await p.click('#hc-tab-league');
  await type(p, '#hc-teams', 'فريق النور\nفريق الهدى\nفريق الفجر');
  await p.click('#hc-week-add');
  await p.click('#sw-tab-tatbeeq');
  check('no horizontal overflow (tools filled)', (await overflow(p)) <= 0, String(await overflow(p)));
  check('tables scroll inside their own wrapper', await p.evaluate(() => { const w = document.getElementById('hc-grid-w'); return getComputedStyle(w).overflowX === 'auto' && w.getBoundingClientRect().right <= innerWidth + 1; }));
  check('tool boxes fit the viewport', await p.evaluate(() => ['student-week', 'halaqa-council'].every(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })));
  await p.click('#hc-tab-rot');
  const small = await p.evaluate(() => [...document.querySelectorAll('#student-week button, #student-week input:not([type=radio]):not([type=checkbox]), #halaqa-council button, #halaqa-council select, #halaqa-council input:not([type=file])')]
    .filter(e => e.offsetParent).filter(e => e.getBoundingClientRect().height < 44).map(e => e.id || e.className || e.tagName));
  check('touch targets: buttons, selects and fields at least 44px tall (incl. per-month selects)', small.length === 0, small.join());
  await p.click('#hc-tab-league');
  check('touch targets: the view switch buttons are at least 44px tall', await p.evaluate(() => [...document.querySelectorAll('.hc-seg button, #hc-grid-body input')].every(e => e.getBoundingClientRect().height >= 44)));
  await p.click('#sw-tab-hifz');
  check('calendar cells at least 40px', await p.evaluate(() => [...document.querySelectorAll('#sw-grid .sw-day')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; })));
  check('all three notebook tabs visible without scrolling', await p.evaluate(() => { const tl = document.querySelector('.sw-tabs'); return tl.scrollWidth <= tl.clientWidth + 1; }));
  await p.focus('#sw-grid .sw-day.sel'); await p.keyboard.press('ArrowRight');
  check('keyboard focus is visible on a day button', await p.evaluate(() => { const b = document.activeElement; return b.classList.contains('sw-day') && getComputedStyle(b).outlineStyle !== 'none'; }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' '));
  await ctx.close();
}

// ============================================================================ review: regressions found after the first build
console.log('review: the tools never move the page on load');
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, p, errs } = await open({ viewport });
  await p.waitForTimeout(600);
  check(`${viewport.width}px: page stays at the top after load (no jump to #a4)`, (await p.evaluate(() => scrollY)) === 0, String(await p.evaluate(() => scrollY)));
  await p.click('#sw-tab-fahm');
  const y = await p.evaluate(() => scrollY);
  await p.click('#sw-tab-tatbeeq');
  check(`${viewport.width}px: choosing a notebook tab does not scroll the page`, (await p.evaluate(() => scrollY)) === y);
  check(`${viewport.width}px: no page errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* blocked */ } });
  await p.goto(URL_Q + '#a1'); await p.waitForTimeout(800);
  check('a link to quran.html#a1 still lands on #a1', await p.evaluate(() => Math.abs(document.getElementById('a1').getBoundingClientRect().top) < 200), String(await p.evaluate(() => document.getElementById('a1').getBoundingClientRect().top)));
  await ctx.close();
}

console.log('review: notebook tabs are never cut off on small phones');
for (const width of [320, 360, 390]) {
  const { ctx, p } = await open({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
  check(`${width}px: all three notebook tabs fit fully inside the tab row`, await p.evaluate(() => {
    const tl = document.querySelector('.sw-tabs'), r = tl.getBoundingClientRect();
    return tl.scrollWidth <= tl.clientWidth + 1 && [...tl.querySelectorAll('[role=tab]')].every(t => { const b = t.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1 && b.height >= 44 && t.scrollWidth <= t.clientWidth + 1; });
  }));
  check(`${width}px: no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
  await ctx.close();
}

console.log('review: Arabic-Indic digits are read as numbers');
{
  const { ctx, p, errs } = await open();
  await p.check('input[name=sw-pace][value="2"]');
  await p.click('#sw-total'); await p.keyboard.type('٧');
  check('typing «٧» with pace 2 -> «عدد الأيام بهذا المقدار: 4»', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 4', await txt(p, '#sw-days'));
  check('the field shows the digit as 7 and the state keeps 7', (await p.inputValue('#sw-total')) === '7' && await p.evaluate(() => window.YanabeeStudentWeek.state.total === 7));
  await p.fill('#sw-total', '۱۲');
  check('Extended Arabic-Indic «۱۲» with pace 2 -> 6', (await txt(p, '#sw-days')) === 'عدد الأيام بهذا المقدار: 6', await txt(p, '#sw-days'));
  await p.fill('#sw-total', '2.5');
  check('a non-integer gives a prompt, no number of days', !/\d/.test(await txt(p, '#sw-days')) && await p.evaluate(() => window.YanabeeStudentWeek.state.total === null));
  await type(p, '#hc-names', 'أ\nب\nج\nد\nه\nو\nز');
  await p.fill('#hc-months', '١٤'); await p.dispatchEvent('#hc-months', 'change');
  check('months «١٤» -> 14 rows', (await p.$$('#hc-rot-body tr')).length === 14 && (await p.inputValue('#hc-months')) === '14');
  await p.click('#hc-tab-league');
  await type(p, '#hc-teams', 'النور\nالهدى');
  await p.click('#hc-week-add');
  await p.click('#hc-grid-body input[data-team="النور"][data-c="0"]'); await p.keyboard.type('٥');
  await p.click('#hc-grid-body input[data-team="النور"][data-c="1"]'); await p.keyboard.type('١٠');
  check('points «٥» + «١٠» -> sum 15 in the grid and the totals', (await txt(p, '#hc-grid-body tr:first-child .hc-sum')) === '15' && (await txt(p, '#hc-tot-body tr:first-child .hc-sum')) === '15');
  check('the point fields show 5 and 10', (await p.inputValue('#hc-grid-body input[data-team="النور"][data-c="0"]')) === '5' && (await p.inputValue('#hc-grid-body input[data-team="النور"][data-c="1"]')) === '10');
  check('no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('review: team names that are JavaScript object keys');
{
  const { ctx, p, errs } = await open();
  await p.click('#hc-tab-league');
  await type(p, '#hc-teams', 'constructor\n__proto__\ntoString');
  await p.click('#hc-week-add');
  check('three grid rows for «constructor», «__proto__», «toString»', (await p.$$('#hc-grid-body tr')).length === 3);
  await type(p, '#hc-grid-body input[data-team="constructor"][data-c="0"]', '3');
  await type(p, '#hc-grid-body input[data-team="__proto__"][data-c="2"]', '4');
  check('their sums are 3, 4 and 0', JSON.stringify(await p.$$eval('#hc-grid-body .hc-sum', s => s.map(x => x.textContent))) === '["3","4","0"]');
  check('«__proto__» points are stored', await p.evaluate(k => JSON.parse(localStorage.getItem(k)).weeks[0].pts.__proto__[2] === 4, KEY_HC));
  await p.reload(); await p.waitForTimeout(300); await p.click('#hc-tab-league');
  check('they survive a reload', JSON.stringify(await p.$$eval('#hc-grid-body .hc-sum', s => s.map(x => x.textContent))) === '["3","4","0"]');
  check('no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('review: whole-page print shows the panels without a fade');
{
  const { ctx, p } = await open({ reducedMotion: 'no-preference' });
  await p.click('#sw-tab-tatbeeq'); await p.click('#hc-tab-league');
  await p.emulateMedia({ media: 'print' });
  check('print media: no fade animation on the open panels', await p.evaluate(() => ['sw-p-tatbeeq', 'hc-p-league'].every(id => getComputedStyle(document.getElementById(id)).animationName === 'none')));
  check('print media: every panel of both tools is laid out', await p.evaluate(() => ['sw-p-hifz', 'sw-p-fahm', 'sw-p-tatbeeq', 'hc-p-rot', 'hc-p-league'].every(id => getComputedStyle(document.getElementById(id)).display !== 'none')));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
