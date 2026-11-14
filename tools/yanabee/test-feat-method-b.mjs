// Browser test of feature bundle 'method-b' on method.html: pledge-cards (بطاقات الوعد والميثاق والمتابعة المنزلية).
//   node tools/yanabee/test-feat-method-b.mjs
// Covers: markup + the documents' words and numbers, tabs (click + RTL keyboard), the field pickers (insert at the
// cursor / pick tasks), draft in localStorage (the name only after the tick), the three printables (counts, verbatim
// lines, no score), print class toggling (window.print stubbed, afterprint, __yanabeePrintOnly), print CSS, clear,
// storage blocked, no JS, phone 390px (no overflow, 44px targets, preview hidden), dark theme, console errors, network.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

// The document lines, read straight from the source files (not from the page under test).
const METHOD = fs.readFileSync(path.join(ROOT, 'content/yanabee/method.txt'), 'utf8').split('\n');
const line = re => METHOD.find(l => re.test(l));
const PLEDGE = line(/^- ميثاق الوعد والالتزام للعضو:/).slice(2);
const CHARTER = line(/^- ميثاق الوعد والالتزام للفرق:/).slice(2);
const SAFF = line(/^> ﴿يَا أَيُّهَا/).slice(2);
const MUMINUN = line(/^> ﴿وَالَّذِينَ هُمْ/).slice(2);
const MEET = line(/\| المهمة السلوكية \|/).split('|').map(s => s.trim()).filter(Boolean);
const PARENTS = line(/^\| أولياء الأمور \|/).split('|').map(s => s.trim()).filter(Boolean);
const FIELDS = METHOD.slice(METHOD.indexOf('# m-fields | مجالات التطبيق الميداني') + 2).filter(l => l.startsWith('|')).slice(0, 5)
  .map(l => l.split('|').map(s => s.trim()).filter(Boolean)).map(([n, s]) => [n, s.split('، ')]);
const VALUES = line(/^\| المرحلة الثانية \|/).split('|')[4].trim().split('؛')[0].split('، ');
const STEPS = ['قيمة من القيم', 'طريقة التطبيق', 'من المسؤول', 'متى يتم تنفيذها'];
const COMP = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8');
check('source: the four phase-2 values', JSON.stringify(VALUES) === JSON.stringify(['التعاون', 'الأمانة والصدق', 'الاحترام وبر الوالدين', 'النظافة والمسؤولية']), VALUES.join('|'));
check('source: five fields', FIELDS.length === 5 && FIELDS[1][1].includes('والمشاركة المجتمعية') && FIELDS[4][1].includes('والوفاء بالوعود'));
check('source: charter steps are fragments of the charter line', STEPS.every(s => CHARTER.includes(s)));
check('source: 7 signature lines = competition c-terms maximum', COMP.includes('| عدد الفريق | 5 إلى 7 أعضاء شاملًا قائد الفريق |'));
check('source: meeting row', MEET[0] === '10 دقائق' && MEET[1] === 'المهمة السلوكية' && MEET[2] === 'تحديد مهمة منزلية وتوزيع بطاقة المتابعة');

const KEY = 'yanabee-pledge-cards-v1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const opened = [];
async function open(opts = {}, init = null) {
  const { viewport = { width: 1280, height: 900 }, theme = 'light', ...rest } = opts;
  while (opened.length) await opened.pop().ctx.close().catch(() => {});   // one scenario at a time
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', ...rest });
  await ctx.addInitScript(t => { try { localStorage.setItem('yanabee-theme', t); } catch (e) { /* blocked */ } }, theme);
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errs = [], net = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text() + (m.location() && m.location().url || ''))) errs.push(m.text()); });
  p.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com/.test(r.url())) net.push(r.url()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url('method.html'));
  await ready(p);
  await p.waitForTimeout(150);
  // stub print: record the body class at the moment print is called
  await p.evaluate(() => { window.__printed = []; window.print = () => { window.__printed.push(document.body.className); }; });
  opened.push({ ctx, p, errs, net });
  return { ctx, p, errs, net };
}
// main.js sets __yanabeeReady before the later deferred scripts run: wait for this feature's own script too
async function ready(p) { await p.waitForFunction(() => window.__yanabeeReady === true && !document.getElementById('pl-tool').hidden); }
const txt = (p, s) => p.$eval(s, e => e.textContent.replace(/\s+/g, ' ').trim());
const dbgState = async p => JSON.stringify({ name: await p.inputValue('#pl-name'), keep: await p.isChecked('#pl-keep'), pledge: await p.inputValue('#pl-pledge'), when: await p.inputValue('#pl-when'), tab: await p.$eval('[role=tab][aria-selected=true]', t => t.id), stored: await stored(p) });
// Reload, keeping localStorage. Headless Chromium sometimes starts a file:// page after a reload with an empty
// localStorage (seen with a bare setItem on 404.html too, unrelated to this feature). When that happens the stored
// items are put back and the page is reloaded again, so what is tested is this script's restore, not the quirk.
async function reloadKeep(p) {
  const snap = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  for (let i = 0; i < 4; i++) {
    await p.reload(); await ready(p);
    const same = await p.evaluate(s => Object.keys(s).every(k => localStorage.getItem(k) === s[k]), snap);
    if (same) return;
    await p.evaluate(s => { for (const k in s) localStorage.setItem(k, s[k]); }, snap);
  }
}
// #pl-status is cleared and re-filled on the next frame (so a repeated message is announced again): wait for it
const statusHas = (p, s) => p.waitForFunction(x => document.getElementById('pl-status').textContent.includes(x), s, { timeout: 3000 }).then(() => true, () => false);
const flush = p => p.waitForTimeout(500);   // > the 350ms save debounce
const stored = p => p.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'ERR'; } }, KEY);

console.log('\n# markup and the documents\' words');
{
  const { p } = await open();
  const order = await p.$$eval('main>[id]', a => a.map(e => e.id));
  const i = order.indexOf('pledge');
  check('section sits right after m-workshop, before m-roles', i > 0 && order[i - 1] === 'm-workshop' && order[i + 1] === 'm-roles', order.join(','));
  check('assets loaded', await p.evaluate(() => !!document.querySelector('link[href="css/pledge-cards.css"]') && !!document.querySelector('script[src="js/pledge-cards.js"]')));
  check('tool revealed by JS, no-JS text hidden', await p.$eval('#pl-tool', e => !e.hidden && e.offsetHeight > 0) && await p.$eval('[data-pl-nojs]', e => e.hidden));
  check('heading', (await txt(p, '#pl-h')) === 'بطاقات الوعد والميثاق والمتابعة');
  check('privacy line', (await txt(p, '.pl-safe')) === 'كل ما تكتبه يبقى في هذا المتصفح، ولا يُرسل إلى أي جهة.');
  const D = await p.$eval('#pl-data', e => JSON.parse(e.textContent));
  check('json: pledge line verbatim', D.pledgeLine === PLEDGE && D.pledge.join(': ') === PLEDGE);
  check('json: charter line verbatim', D.charterLine === CHARTER && D.charter.join(': ') === CHARTER);
  check('json: ayat verbatim', D.saff === SAFF && D.muminun === MUMINUN);
  check('json: fields', JSON.stringify(D.fields) === JSON.stringify(FIELDS));
  check('json: values, steps, meeting, parents', JSON.stringify(D.values) === JSON.stringify(VALUES) && JSON.stringify(D.steps) === JSON.stringify(STEPS)
    && JSON.stringify(D.meet) === JSON.stringify(MEET.slice(1)) && JSON.stringify(D.parents) === JSON.stringify(PARENTS));
  check('json: no HTML inside', !/<[a-z]/i.test(JSON.stringify(D)));
  const srcs = await p.$$eval('#pl-tool .pl-src', a => a.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('lines above the forms are the document lines', srcs[0] === PLEDGE && srcs[1] === CHARTER && srcs[2] === MEET[1] + ': ' + MEET[2], srcs.join(' / '));
  check('three tabs, first selected', JSON.stringify(await p.$$eval('#pl-tool [role=tab]', a => a.map(t => [t.textContent.trim(), t.getAttribute('aria-selected')]))) ===
    JSON.stringify([['وعدي الأسبوعي', 'true'], ['ميثاق الفريق', 'false'], ['بطاقة المتابعة المنزلية', 'false']]));
  for (const key of ['pp', 'cm', 'hm']) {
    const names = await p.$$eval(`.pl-pick[data-key="${key}"] .pl-fbtn`, a => a.map(b => b.textContent.trim()));
    const icons = await p.$$eval(`.pl-pick[data-key="${key}"] .pl-fbtn svg`, a => a.length);
    const segs = await p.$$eval(`.pl-pick[data-key="${key}"] .pl-segs`, a => a.map(g => [...g.querySelectorAll('.pl-seg')].map(b => b.dataset.seg)));
    check(`picker ${key}: five fields with icons, segments verbatim`, JSON.stringify(names) === JSON.stringify(FIELDS.map(f => f[0])) && icons === 5
      && JSON.stringify(segs) === JSON.stringify(FIELDS.map(f => f[1])));
  }
  check('value chips = the four values + «قيمة أخرى»', JSON.stringify(await p.$$eval('.pl-radio span', a => a.map(s => s.textContent.trim()))) === JSON.stringify([...VALUES, 'قيمة أخرى']));
  const stepLabels = await p.$$eval('.pl-steps .pl-step', a => a.map(s => (s.querySelector('legend') || s.querySelector('.f-l')).textContent.replace(/\s+/g, ' ').trim()));
  check('charter step headings verbatim (numbered)', JSON.stringify(stepLabels) === JSON.stringify(STEPS.map((s, i) => `${i + 1}${s}`)), stepLabels.join('|'));
  check('date input for step 4', await p.$eval('#pl-when', e => e.type === 'date'));
  check('no placeholder examples', await p.$$eval('#pl-tool input, #pl-tool textarea', a => a.every(e => !e.placeholder)));
  const ids = await p.$$eval('[id]', a => a.map(e => e.id));
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  check('ids unique on the page', dup.length === 0, dup.join(','));
  check('every control has a label', await p.$$eval('#pl-tool input, #pl-tool textarea', a => a.every(e => e.labels && e.labels.length && e.labels[0].textContent.trim())));
  check('tablist wiring', await p.$$eval('#pl-tool [role=tab]', a => a.every(t => { const pn = document.getElementById(t.getAttribute('aria-controls')); return pn && pn.getAttribute('role') === 'tabpanel' && pn.getAttribute('aria-labelledby') === t.id; })));
  check('live region for results', await p.$eval('#pl-status', e => e.getAttribute('aria-live') === 'polite') && await p.$eval('#pl-hsum', e => e.getAttribute('aria-live') === 'polite'));
  check('preview shown on wide screens', await p.$eval('.pl-prev[data-prev="cards"]', e => getComputedStyle(e).display !== 'none' && !!e.querySelector('.pl-card')));
}

console.log('\n# tabs');
{
  const { p } = await open();
  const sel = () => p.$$eval('#pl-tool [role=tab]', a => a.filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.dataset.tab));
  const vis = () => p.$$eval('#pl-tool [role=tabpanel]', a => a.filter(t => !t.hidden).map(t => t.id));
  await p.click('#pl-tab-charter');
  check('click selects charter', JSON.stringify(await sel()) === '["charter"]' && JSON.stringify(await vis()) === '["pl-p-charter"]');
  await p.focus('#pl-tab-charter');
  await p.keyboard.press('ArrowLeft');
  check('RTL: ArrowLeft moves forward to home + focus', JSON.stringify(await sel()) === '["home"]' && await p.evaluate(() => document.activeElement.id) === 'pl-tab-home');
  await p.keyboard.press('ArrowLeft');
  check('ArrowLeft wraps to the first', JSON.stringify(await sel()) === '["cards"]');
  await p.keyboard.press('ArrowRight');
  check('ArrowRight moves back (wraps to last)', JSON.stringify(await sel()) === '["home"]');
  await p.keyboard.press('Home');
  check('Home', JSON.stringify(await sel()) === '["cards"]' && JSON.stringify(await vis()) === '["pl-p-cards"]');
  await p.keyboard.press('End');
  check('End', JSON.stringify(await sel()) === '["home"]');
  check('roving tabindex', JSON.stringify(await p.$$eval('#pl-tool [role=tab]', a => a.map(t => t.tabIndex))) === '[-1,-1,0]');
  await flush(p);
  check('tab remembered in the draft', (await stored(p)).tab === 'home');
  check('focus ring visible on tab', await p.$eval('#pl-tab-home', e => getComputedStyle(e).outlineStyle !== 'none'));
}

console.log('\n# pledge: picker inserts at the cursor, draft, name privacy, print');
{
  const { p, errs, net } = await open();
  await p.fill('#pl-team', 'فريق النور');
  await p.fill('#pl-pledge', 'أبدأ كل يوم');
  await p.evaluate(() => { const t = document.getElementById('pl-pledge'); t.focus(); t.setSelectionRange(4, 4); });
  const fb = '.pl-pick[data-key="pp"] .pl-fbtn[data-f="0"]';
  await p.click(fb);
  check('field opens its segments', await p.$eval(fb, b => b.getAttribute('aria-expanded')) === 'true' && await p.$eval('#pl-pp-s0', g => !g.hidden) && await p.$eval('#pl-pp-s1', g => g.hidden));
  await p.click('#pl-pp-s0 .pl-seg[data-seg="بر الوالدين"]');
  check('chip text inserted at the cursor', await p.inputValue('#pl-pledge') === 'أبدأ بر الوالدين كل يوم', await p.inputValue('#pl-pledge'));
  check('insertion announced', await statusHas(p, 'بر الوالدين'));
  await p.click('.pl-pick[data-key="pp"] .pl-fbtn[data-f="1"]');
  check('another field swaps the open segments', await p.$eval('#pl-pp-s0', g => g.hidden) && await p.$eval('#pl-pp-s1', g => !g.hidden));
  await p.evaluate(() => { const t = document.getElementById('pl-pledge'); t.setSelectionRange(t.value.length, t.value.length); });
  await p.click('#pl-pp-s1 .pl-seg[data-seg="والمشاركة المجتمعية"]');
  check('segment kept exactly as written («والمشاركة المجتمعية»)', (await p.inputValue('#pl-pledge')).endsWith(' والمشاركة المجتمعية'));
  await p.click('.pl-pick[data-key="pp"] .pl-fbtn[data-f="1"]');
  check('pressing the open field closes it', await p.$eval('#pl-pp-s1', g => g.hidden));
  await p.fill('#pl-pledge', 'أساعد أمي في ترتيب المائدة كل يوم');
  await p.fill('#pl-name', 'سارة');
  await flush(p);
  let s = await stored(p);
  check('draft saved under ' + KEY, s && s.v === 1 && s.pledge === 'أساعد أمي في ترتيب المائدة كل يوم' && s.team === 'فريق النور');
  check('name NOT saved by default', s.name === '' && s.keepName === false);
  check('saved note shown', (await txt(p, '#pl-saved')).includes('حُفظت'));
  check('preview mirrors the form', (await txt(p, '.pl-prev[data-prev="cards"] .pl-txt')) === 'أساعد أمي في ترتيب المائدة كل يوم');
  await reloadKeep(p);
  check('draft survives reload', await p.inputValue('#pl-pledge') === 'أساعد أمي في ترتيب المائدة كل يوم' && await p.inputValue('#pl-team') === 'فريق النور', await dbgState(p));
  check('name not restored without the tick', await p.inputValue('#pl-name') === '');
  await p.fill('#pl-name', 'سارة');
  await p.check('#pl-keep');
  s = await stored(p);
  check('tick saves the name at once', s.name === 'سارة' && s.keepName === true);
  await reloadKeep(p);
  check('name restored after the tick', await p.inputValue('#pl-name') === 'سارة' && await p.isChecked('#pl-keep'), await dbgState(p));
  await p.uncheck('#pl-keep');
  check('untick removes the stored name', (await stored(p)).name === '');
  await p.evaluate(() => { window.__printed = []; window.print = () => { window.__printed.push(document.body.className); }; });

  await p.click('[data-pl-print="cards"]');
  const printed = await p.evaluate(() => window.__printed);
  check('print called once with body.print-pledge-cards', printed.length === 1 && printed[0].split(' ').includes('print-pledge-cards'), JSON.stringify(printed));
  const cards = await p.$$eval('#pl-print .pl-card', a => a.map(c => ({
    head: c.querySelector('.pl-chd').textContent, ayah: c.querySelector('.pl-ayah').textContent,
    rows: [...c.querySelectorAll('.pl-row')].map(r => r.textContent), txt: (c.querySelector('.pl-txt') || {}).textContent,
    days: [...c.querySelectorAll('.pl-days li')].map(l => l.textContent), ticks: c.querySelectorAll('.pl-tick').length,
    sign: c.querySelector('.pl-sign').textContent, all: c.textContent })));
  check('4 cards on one sheet', cards.length === 4 && await p.$$eval('#pl-print .pl-sheet', a => a.length) === 1);
  check('card header = the pledge line verbatim', cards.every(c => c.head === PLEDGE), cards[0] && cards[0].head);
  check('card ayah = al-Saff 2–3 verbatim', cards.every(c => c.ayah === SAFF));
  check('name, team and pledge on the card', cards.every(c => c.rows[0] === 'الاسمسارة' && c.rows[1] === 'الفريقفريق النور' && c.txt === 'أساعد أمي في ترتيب المائدة كل يوم'));
  check('7 day boxes «يوم 1»…«يوم 7»', cards.every(c => c.ticks === 7 && JSON.stringify(c.days) === JSON.stringify([1, 2, 3, 4, 5, 6, 7].map(n => 'يوم ' + n))));
  check('supervisor line', cards.every(c => c.sign === 'متابعة المشرف'));
  check('no score / percentage on the card', cards.every(c => !/%|درجة|نقاط|تقييم/.test(c.all)));
  await p.emulateMedia({ media: 'print' });
  const pv = await p.evaluate(() => ({
    area: getComputedStyle(document.getElementById('pl-print')).display, nav: getComputedStyle(document.querySelector('.nav')).display,
    work: getComputedStyle(document.getElementById('m-workshop')).display, tool: getComputedStyle(document.getElementById('pl-tool')).display,
    head: getComputedStyle(document.querySelector('#pledge .sec-head')).display, footer: getComputedStyle(document.querySelector('body>footer, .footer')).display,
    cardColor: getComputedStyle(document.querySelector('#pl-print .pl-card')).color, cardBg: getComputedStyle(document.querySelector('#pl-print .pl-card')).backgroundColor,
    cols: getComputedStyle(document.querySelector('#pl-print .pl-sheet')).gridTemplateColumns.split(' ').length,
    page: getComputedStyle(document.querySelector('#pl-print .pl-sheet')).page }));
  check('print media: only the print area shows', pv.area === 'block' && pv.nav === 'none' && pv.work === 'none' && pv.tool === 'none' && pv.head === 'none' && pv.footer === 'none', JSON.stringify(pv));
  check('print media: black on white, 2 columns, named A4 page', pv.cardColor === 'rgb(0, 0, 0)' && pv.cardBg === 'rgb(255, 255, 255)' && pv.cols === 2 && pv.page === 'pledge', JSON.stringify(pv));
  const pdf = await p.pdf({ preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('pdf: the 4 cards fit one A4 page', pages === 1, 'pages=' + pages);
  await p.emulateMedia({ media: null });
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes the print class', !(await p.evaluate(() => document.body.className)).includes('print-pledge'));
  await p.emulateMedia({ media: 'print' });
  check('whole-page print leaves the tool out', await p.$eval('#pledge', e => getComputedStyle(e).display) === 'none'
    && await p.$eval('#m-workshop', e => getComputedStyle(e).display) !== 'none');
  await p.emulateMedia({ media: null });

  await p.click('[data-pl-print="blank"]');
  const blank = await p.$$eval('#pl-print .pl-card', a => a.map(c => ({ head: c.querySelector('.pl-chd').textContent, ayah: c.querySelector('.pl-ayah').textContent,
    vals: [...c.querySelectorAll('.pl-rv')].map(r => r.textContent).join(''), txt: !!c.querySelector('.pl-txt'), lines: c.querySelectorAll('.pl-box .pl-line').length })));
  check('blank team cards: 4, header + ayah only, empty lines', blank.length === 4 && blank.every(c => c.head === PLEDGE && c.ayah === SAFF && c.vals === '' && !c.txt && c.lines === 3));
  check('blank cards use the cards print mode', (await p.evaluate(() => window.__printed)).pop().includes('print-pledge-cards'));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));

  await p.fill('#pl-pledge', '');
  const before = (await p.evaluate(() => window.__printed)).length;
  await p.click('[data-pl-print="cards"]');
  check('empty pledge: no print, message, focus on the pledge', (await p.evaluate(() => window.__printed)).length === before
    && await statusHas(p, 'اكتب وعدك') && await p.evaluate(() => document.activeElement.id) === 'pl-pledge');

  await p.fill('#pl-pledge', '<img src=x onerror="window.__xss=1">');
  await p.click('[data-pl-print="cards"]');
  check('typed text is rendered as text', await p.$$eval('#pl-print img', a => a.length) === 0 && !(await p.evaluate(() => window.__xss)) && (await txt(p, '#pl-print .pl-txt')).startsWith('<img'));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));

  // clear: cancel keeps everything, accept wipes storage and the form
  p.once('dialog', d => d.dismiss());
  await p.click('[data-pl-clear]');
  check('clear cancelled keeps the draft', await p.inputValue('#pl-team') === 'فريق النور');
  p.once('dialog', d => d.accept());
  await p.click('[data-pl-clear]');
  check('clear: storage key removed', await p.evaluate(k => localStorage.getItem(k), KEY) === null);
  check('clear: form emptied, first tab', await p.inputValue('#pl-team') === '' && await p.inputValue('#pl-pledge') === '' && await p.$eval('#pl-tab-cards', t => t.getAttribute('aria-selected')) === 'true');
  check('clear announced', await statusHas(p, 'مُسحت'));
  await flush(p);
  check('nothing re-saved after clear', await p.evaluate(k => localStorage.getItem(k), KEY) === null);
  check('no console errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' | '));
}

console.log('\n# team charter');
{
  const { p, errs } = await open();
  await p.fill('#pl-team', 'فريق النور');
  await p.click('#pl-tab-charter');
  await p.click('.pl-radio:has(input[value="الأمانة والصدق"])');
  check('value chip selected', await p.isChecked('input[name=pl-value][value="الأمانة والصدق"]'));
  await p.fill('#pl-vother', 'الأمانة والمسؤولية');
  check('typing «قيمة أخرى» selects the other option', await p.isChecked('input[name=pl-value][data-other]') && !(await p.isChecked('input[name=pl-value][value="الأمانة والصدق"]')));
  await p.fill('#pl-method', 'نرتب ');
  await p.click('.pl-pick[data-key="cm"] .pl-fbtn[data-f="3"]');
  await p.click('#pl-cm-s3 .pl-seg[data-seg="صيانة الممتلكات"]');
  check('method picker inserts into «طريقة التطبيق»', await p.inputValue('#pl-method') === 'نرتب صيانة الممتلكات', await p.inputValue('#pl-method'));
  await p.fill('#pl-who', 'أحمد');
  await p.fill('#pl-when', '2026-11-20');
  await p.click('[data-pl-print="charter"]');
  check('print class print-pledge-charter', (await p.evaluate(() => window.__printed)).pop().includes('print-pledge-charter'));
  const c = await p.$$eval('#pl-print .pl-card', a => a.map(x => ({ head: x.querySelector('.pl-chd').textContent, ayah: x.querySelector('.pl-ayah').textContent,
    team: x.querySelector('.pl-row').textContent, steps: [...x.querySelectorAll('.pl-csteps h4')].map(h => h.textContent),
    ans: [...x.querySelectorAll('.pl-csteps li')].map(l => (l.querySelector('.pl-txt') || {}).textContent || ''),
    sigs: [...x.querySelectorAll('.pl-sigs .pl-sign')].map(s => s.textContent), all: x.textContent })));
  check('one charter', c.length === 1);
  check('charter header = the charter line verbatim', c[0].head === CHARTER, c[0].head);
  check('charter ayah = al-Mu\'minun 8 verbatim', c[0].ayah === MUMINUN);
  check('team on the charter', c[0].team === 'الفريقفريق النور');
  check('four step headings verbatim', JSON.stringify(c[0].steps) === JSON.stringify(STEPS));
  check('answers under the steps', c[0].ans[0] === 'الأمانة والمسؤولية' && c[0].ans[1] === 'نرتب صيانة الممتلكات' && c[0].ans[2] === 'أحمد' && /20/.test(c[0].ans[3]) && /2026/.test(c[0].ans[3]), JSON.stringify(c[0].ans));
  check('7 lines «توقيع العضو»', c[0].sigs.length === 7 && c[0].sigs.every(s => s === 'توقيع العضو'));
  check('no visible claim of a team size', !/أعضاء|عدد الفريق|5 إلى 7/.test(c[0].all));
  await p.emulateMedia({ media: 'print' });
  check('print media: charter framed, one column', await p.$eval('#pl-print .pl-sheet', s => getComputedStyle(s).gridTemplateColumns.split(' ').length) === 1
    && await p.$eval('#pl-print .pl-card', s => getComputedStyle(s).borderTopStyle) === 'double');
  const pdf = await p.pdf({ preferCSSPageSize: true });
  check('pdf: the charter fits one A4 page', (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1);
  await p.emulateMedia({ media: null });
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  await p.click('.pl-radio:has(input[value="التعاون"])');
  await p.click('[data-pl-print="charter"]');
  check('a value chip prints that value', (await txt(p, '#pl-print .pl-csteps li:first-child .pl-txt')) === 'التعاون');
  await flush(p);
  const s = await stored(p);
  check('charter draft saved', s.value === 'التعاون' && s.valueOther === 'الأمانة والمسؤولية' && s.who === 'أحمد' && s.when === '2026-11-20');
  await reloadKeep(p);
  check('charter draft restored, tab remembered', await p.isChecked('input[name=pl-value][value="التعاون"]') && await p.inputValue('#pl-when') === '2026-11-20'
    && await p.$eval('#pl-tab-charter', t => t.getAttribute('aria-selected')) === 'true' && await p.$eval('#pl-p-charter', e => !e.hidden), await dbgState(p) + ' radio=' + await p.$$eval('input[name=pl-value]:checked', a => a.map(r => r.value)));
  check('no console errors', errs.length === 0, errs.join(' | '));
}

console.log('\n# home follow-up card');
{
  const { p, errs } = await open();
  await p.fill('#pl-name', 'عمر'); await p.fill('#pl-team', 'فريق النور');
  await p.click('#pl-tab-home');
  check('summary starts empty-state', (await txt(p, '#pl-hsum')) === 'لم يُختر مجال ولا مهمة بعد.');
  await p.click('.pl-pick[data-key="hm"] .pl-fbtn[data-f="2"]');
  check('field picked (aria-pressed) and its tasks shown', await p.$eval('.pl-pick[data-key="hm"] .pl-fbtn[data-f="2"]', b => b.getAttribute('aria-pressed')) === 'true'
    && await p.$eval('#pl-hm-s2', g => !g.hidden) && await p.$eval('#pl-hm-s0', g => g.hidden));
  await p.click('#pl-hm-s2 .pl-seg[data-seg="التسامح"]');
  await p.click('#pl-hm-s2 .pl-seg[data-seg="صلة الرحم"]');
  check('tasks toggle (aria-pressed)', JSON.stringify(await p.$$eval('#pl-hm-s2 .pl-seg[aria-pressed=true]', a => a.map(b => b.dataset.seg))) === JSON.stringify(['صلة الرحم', 'التسامح']));
  check('summary computed (document order)', (await txt(p, '#pl-hsum')) === 'المجال: الأقارب والأرحام. المهمة: صلة الرحم؛ التسامح', await txt(p, '#pl-hsum'));
  await p.click('#pl-hm-s2 .pl-seg[data-seg="التسامح"]');
  check('tap again removes a task', (await txt(p, '#pl-hsum')) === 'المجال: الأقارب والأرحام. المهمة: صلة الرحم');
  await p.click('.pl-pick[data-key="hm"] .pl-fbtn[data-f="0"]');
  check('changing the field clears its tasks', (await txt(p, '#pl-hsum')) === 'المجال: البيت والأسرة. لم تُختر مهمة بعد.');
  await p.click('#pl-hm-s0 .pl-seg[data-seg="المشاركة في الأعمال المنزلية"]');
  await p.fill('#pl-htask', 'ترتيب الغرفة قبل النوم');
  check('supervisor task joins the summary', (await txt(p, '#pl-hsum')).endsWith('المشاركة في الأعمال المنزلية؛ ترتيب الغرفة قبل النوم'));
  await p.click('[data-pl-print="home"]');
  check('print class print-pledge-home', (await p.evaluate(() => window.__printed)).pop().includes('print-pledge-home'));
  const h = await p.$$eval('#pl-print .pl-card', a => a.map(x => ({ k: x.querySelector('.pl-ck').textContent, cs: x.querySelector('.pl-cs').textContent,
    t: x.querySelector('.pl-ct').textContent, rows: [...x.querySelectorAll('.pl-row')].map(r => r.textContent),
    tasks: [...x.querySelectorAll('.pl-tasks li')].map(l => l.textContent), ticks: x.querySelectorAll('.pl-tick').length,
    days: [...x.querySelectorAll('.pl-days li')].map(l => l.textContent), notes: x.querySelector('.pl-notes .pl-bl').textContent,
    role: x.querySelector('.pl-role').textContent, sign: x.querySelector('.pl-sign').textContent, all: x.textContent })));
  check('2 cards on one sheet', h.length === 2);
  check('kicker + line = the meeting row (no duration cell)', h.every(c => c.k === MEET[1] && c.cs === MEET[2] && !c.all.includes(MEET[0])));
  check('title «بطاقة المتابعة» is a fragment of the row', h.every(c => c.t === 'بطاقة المتابعة') && MEET[2].includes('بطاقة المتابعة'));
  check('name, team, field', h.every(c => JSON.stringify(c.rows) === JSON.stringify(['الاسمعمر', 'الفريقفريق النور', 'المجالالبيت والأسرة'])), JSON.stringify(h[0].rows));
  check('tasks verbatim', h.every(c => JSON.stringify(c.tasks) === JSON.stringify(['المشاركة في الأعمال المنزلية', 'ترتيب الغرفة قبل النوم'])));
  check('7 tick boxes', h.every(c => c.ticks === 7 && c.days[6] === 'يوم 7'));
  check('parents box + the full roles row', h.every(c => c.notes === 'ملاحظات ولي الأمر (طوعية)' && c.role === PARENTS[0] + ' — ' + PARENTS[1]));
  check('supervisor box', h.every(c => c.sign === 'المشرف'));
  check('no score, rating or percentage', h.every(c => !/%|درجة|نقاط|تقييم|ممتاز|جيد/.test(c.all)));
  await p.emulateMedia({ media: 'print' });
  check('print media: 2 rows', await p.$eval('#pl-print .pl-sheet', s => getComputedStyle(s).gridTemplateRows.split(' ').length) === 2);
  const pdf = await p.pdf({ preferCSSPageSize: true });
  check('pdf: 2 cards fit one A4 page', (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length === 1);
  await p.emulateMedia({ media: null });
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes print-pledge-home', !(await p.evaluate(() => document.body.className)).includes('print-pledge'));
  // a page-wide helper wins when present (comp.js defines one on other pages)
  await p.evaluate(() => { window.__helper = []; window.__yanabeePrintOnly = c => window.__helper.push(c); });
  await p.click('[data-pl-print="home"]');
  check('uses window.__yanabeePrintOnly when present', JSON.stringify(await p.evaluate(() => window.__helper)) === '["print-pledge-home"]');
  await flush(p);
  const s = await stored(p);
  check('home draft saved', s.hField === 0 && JSON.stringify(s.hTasks) === '["المشاركة في الأعمال المنزلية"]' && s.hTask === 'ترتيب الغرفة قبل النوم' && s.name === '');
  await reloadKeep(p);
  check('home draft restored', await p.$eval('#pl-hm-s0 .pl-seg[data-seg="المشاركة في الأعمال المنزلية"]', b => b.getAttribute('aria-pressed')) === 'true'
    && await p.inputValue('#pl-htask') === 'ترتيب الغرفة قبل النوم' && (await txt(p, '#pl-hsum')).startsWith('المجال: البيت والأسرة'));
  check('no console errors', errs.length === 0, errs.join(' | '));
}

console.log('\n# review: long text, limits, stale print class, clear + pagehide');
{
  const { p, errs } = await open();
  const words = n => 'أساعد أمي في ترتيب المائدة وأصدق في كلامي '.repeat(40).slice(0, n);
  const lim = await p.$$eval('#pl-tool [maxlength]', a => Object.fromEntries(a.map(e => [e.id, +e.maxLength])));
  check('every text field has a length limit', ['pl-name', 'pl-team', 'pl-pledge', 'pl-vother', 'pl-method', 'pl-who', 'pl-htask'].every(id => lim[id] > 0), JSON.stringify(lim));
  await p.fill('#pl-pledge', words(1000));
  check('typing past the limit stops at it', (await p.inputValue('#pl-pledge')).length === lim['pl-pledge']);
  for (const id of ['pl-name', 'pl-team']) await p.fill('#' + id, words(lim[id]));
  // in print media: the whole text shows, and the day boxes / notes / signatures stay inside the card
  const fits = kind => p.evaluate(k => {
    const out = [];
    document.querySelectorAll('#pl-print .pl-card').forEach(c => {
      const cr = c.getBoundingClientRect();
      c.querySelectorAll(':scope>*').forEach(x => { const r = x.getBoundingClientRect(); if (r.bottom > cr.bottom + 0.5 || r.top < cr.top - 0.5) out.push(k + ' outside: ' + x.className); });
      c.querySelectorAll('.pl-box, .pl-csteps').forEach(x => { if (x.scrollHeight > x.clientHeight + 1) out.push(k + ' clipped: ' + x.className); });
    });
    return out;
  }, kind);
  const printKind = async (kind, tab) => {
    if (tab) await p.click('#pl-tab-' + tab);
    await p.click(`[data-pl-print="${kind}"]`);
    await p.emulateMedia({ media: 'print' });
    const bad = await fits(kind);
    const pages = ((await p.pdf({ preferCSSPageSize: true })).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    await p.emulateMedia({ media: null });
    await p.evaluate(() => dispatchEvent(new Event('afterprint')));
    return { bad, pages };
  };
  let r = await printKind('cards');
  check('longest pledge: whole text, days and supervisor line on each card, one page', r.bad.length === 0 && r.pages === 1, JSON.stringify(r));
  await p.click('#pl-tab-charter');
  await p.fill('#pl-vother', words(lim['pl-vother'])); await p.fill('#pl-method', words(lim['pl-method'])); await p.fill('#pl-who', words(lim['pl-who']));
  await p.fill('#pl-when', '2026-11-20');
  r = await printKind('charter');
  check('longest charter: all answers and the 7 signature lines on one page', r.bad.length === 0 && r.pages === 1, JSON.stringify(r));
  await p.click('#pl-tab-home');
  await p.click('.pl-pick[data-key="hm"] .pl-fbtn[data-f="1"]');
  for (const s of await p.$$('#pl-hm-s1 .pl-seg')) await s.click();
  await p.fill('#pl-htask', words(lim['pl-htask']));
  r = await printKind('home');
  check('longest home card: all tasks, days, notes and signature on both cards, one page', r.bad.length === 0 && r.pages === 1, JSON.stringify(r));
  // a draft that is longer than the limits (older or edited storage) still keeps the card's structure
  await p.evaluate(() => { const t = document.getElementById('pl-pledge'); t.removeAttribute('maxlength'); });
  await p.click('#pl-tab-cards');
  await p.fill('#pl-pledge', words(1200));
  await p.click('[data-pl-print="cards"]');
  await p.emulateMedia({ media: 'print' });
  check('over-long text gives way inside its own box only', (await fits('cards')).every(x => x.startsWith('cards clipped')));
  await p.emulateMedia({ media: null });
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  // a print class left behind (no afterprint) is replaced, not stacked
  await p.evaluate(() => { window.__printed = []; document.body.classList.add('print-pledge-home'); });
  await p.click('#pl-tab-charter');
  await p.click('[data-pl-print="charter"]');
  check('stale print class dropped before printing', JSON.stringify((await p.evaluate(() => window.__printed))[0].split(' ').filter(c => c.startsWith('print-pledge-'))) === '["print-pledge-charter"]');
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  // clear, then leave the page: nothing is written back
  p.once('dialog', d => d.accept());
  await p.click('[data-pl-clear]');
  await p.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  check('clear then pagehide: the key stays removed', await p.evaluate(k => localStorage.getItem(k), KEY) === null);
  await p.fill('#pl-team', 'فريق');
  await p.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  check('pagehide saves a pending change at once', (await stored(p)).team === 'فريق');
  check('no console errors', errs.length === 0, errs.join(' | '));
}
for (const bad of ['1.5', '-0.5', '"2"', '1e9']) {
  const { ctx, p, errs } = await (async () => {
    while (opened.length) await opened.pop().ctx.close().catch(() => {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(([k, h]) => { try { localStorage.setItem(k, `{"v":1,"tab":"home","hField":${h},"hTasks":["صلة الرحم"]}`); } catch (e) { /* */ } }, [KEY, bad]);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route('**/fonts.g*/**', r => r.abort());
    await p.goto(url('method.html'));
    opened.push({ ctx, p });
    return { ctx, p, errs };
  })();
  const shown = await p.waitForFunction(() => window.__yanabeeReady === true && !document.getElementById('pl-tool').hidden, null, { timeout: 5000 }).then(() => true, () => false);
  check(`draft with hField ${bad}: tool still starts, field reset`, shown && errs.length === 0 && (await txt(p, '#pl-hsum')) === 'لم يُختر مجال ولا مهمة بعد.', errs.join(' | '));
}

console.log('\n# review: long unbroken text on a phone');
{
  const { p, errs } = await open(PHONE);
  const long = 'a'.repeat(120);
  await p.fill('#pl-team', long); await p.fill('#pl-pledge', long);
  await p.click('#pl-tab-home');
  await p.click('.pl-pick[data-key="hm"] .pl-fbtn[data-f="0"]');
  await p.fill('#pl-htask', long);
  for (const tab of ['home', 'cards', 'charter']) {
    await p.click('#pl-tab-' + tab);
    const ov = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, sec: document.getElementById('pledge').scrollWidth - document.getElementById('pledge').clientWidth,
      out: [...document.querySelectorAll('#pl-tool *')].filter(e => e.offsetParent && (e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1)).length }));
    check(`unbroken text, ${tab}: nothing wider than the screen`, ov.doc <= 0 && ov.sec <= 0 && ov.out === 0, JSON.stringify(ov));
  }
  check('no console errors', errs.length === 0, errs.join(' | '));
}

console.log('\n# storage blocked');
{
  const { p, errs } = await open({}, () => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: boom }); } catch (e) { /* ignore */ }
  });
  check('tool still shown', await p.$eval('#pl-tool', e => !e.hidden));
  await p.fill('#pl-pledge', 'أصدق في كلامي');
  await flush(p);
  check('quiet note: saving unavailable', (await txt(p, '#pl-saved')).includes('الحفظ غير متاح'));
  await p.click('[data-pl-print="cards"]');
  check('print still works', await p.$$eval('#pl-print .pl-card', a => a.length) === 4 && (await p.evaluate(() => window.__printed)).length === 1);
  p.once('dialog', d => d.accept());
  await p.click('[data-pl-clear]');
  check('clear still works', await p.inputValue('#pl-pledge') === '');
  check('no errors with storage blocked', errs.length === 0, errs.join(' | '));
}

console.log('\n# a broken draft is ignored');
{
  const { p, errs } = await open({}, k => { try { localStorage.setItem(k, '{"v":1,"tab":"nope","hField":99,"hTasks":[1,"x"],"value":"<b>","name":"x","keepName":false}'); } catch (e) { /* */ } });
  await p.evaluate(() => 0);
  check('bad values fall back', await p.$eval('#pl-tab-cards', t => t.getAttribute('aria-selected')) === 'true' && await p.inputValue('#pl-name') === ''
    && await p.$$eval('input[name=pl-value]:checked', a => a.length) === 0);
  check('no errors', errs.length === 0, errs.join(' | '));
}

console.log('\n# phone 390px (light + dark)');
for (const theme of ['light', 'dark']) {
  const { p, errs } = await open({ ...PHONE, theme });
  check(`${theme}: theme applied`, await p.evaluate(() => document.documentElement.dataset.theme) === theme);
  for (const tab of ['cards', 'charter', 'home']) {
    await p.click('#pl-tab-' + tab);
    await p.click(`.pl-pick[data-key="${{ cards: 'pp', charter: 'cm', home: 'hm' }[tab]}"] .pl-fbtn[data-f="1"]`);
    const ov = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, sec: document.getElementById('pledge').scrollWidth - document.getElementById('pledge').clientWidth }));
    check(`${theme}/${tab}: no horizontal overflow`, ov.doc <= 0 && ov.sec <= 0, JSON.stringify(ov));
    const small = await p.$$eval(`#pl-tool [role=tab], #pl-p-${tab} button, #pl-p-${tab} .pl-radio span, #pl-p-${tab} input:not([type=radio]):not([type=checkbox]), #pl-p-${tab} textarea, [data-pl-clear], .pl-keep`,
      a => a.filter(e => e.offsetParent && (e.getBoundingClientRect().height < 43.5)).map(e => e.className + ':' + e.getBoundingClientRect().height.toFixed(1)));
    check(`${theme}/${tab}: 44px touch targets`, small.length === 0, small.join(','));
    check(`${theme}/${tab}: preview hidden below 600px`, await p.$eval(`.pl-prev[data-prev="${tab}"]`, e => getComputedStyle(e).display) === 'none');
  }
  const tl = await p.$eval('#pl-tool [role=tablist]', e => ({ ox: getComputedStyle(e).overflowX, w: e.getBoundingClientRect().width }));
  check(`${theme}: tabs scroll inside their own row`, tl.ox === 'auto' && tl.w <= 390, JSON.stringify(tl));
  const bg = await p.$eval('#pl-tool', e => getComputedStyle(e).backgroundColor);
  check(`${theme}: panel uses the theme surface`, theme === 'dark' ? bg !== 'rgb(255, 255, 255)' : true, bg);
  check(`${theme}: no console errors`, errs.length === 0, errs.join(' | '));
}

console.log('\n# without JavaScript');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url('method.html'));
  check('no JS: tool hidden', await p.$eval('#pl-tool', e => e.hidden && getComputedStyle(e).display === 'none'));
  const nj = await p.$eval('[data-pl-nojs]', e => ({ shown: getComputedStyle(e).display !== 'none', t: e.textContent.replace(/\s+/g, ' ') }));
  check('no JS: the pledge and charter lines read as text', nj.shown && nj.t.includes(PLEDGE) && nj.t.includes(CHARTER));
  check('no JS: no overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
}

for (const o of opened) await o.ctx.close().catch(() => {});
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
