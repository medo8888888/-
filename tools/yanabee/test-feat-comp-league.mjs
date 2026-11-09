// Browser tests for the comp-league bundle on competition.html (#c-league):
//   rule-finder  «ماذا لو؟ ابحث في اللائحة»   (tools/yanabee/feat_rule_finder.py, js/rule-finder.js)
//   league-table «احسب ترتيب الدوري»          (tools/yanabee/feat_league_table.py, js/league-table.js)
//   match-day    «أدوات يوم المباراة»          (tools/yanabee/feat_match_day.py, js/match-day.js)
//   node tools/yanabee/test-feat-comp-league.mjs        (after python3 tools/yanabee/build.py)
// Covers: no-JS hiding, every interaction and computed result with the documents' numbers (15/5/15, 10, 15, 2, 3,
// 3, 24, 7; points 3/1/0, the tie-break chain, 0 – 3), storage blocked, print class toggling (window.print stubbed),
// 390px without horizontal overflow, console errors, and that no network request is made.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const PAGE = 'file://' + path.join(ROOT, 'site/yanabee/competition.html');
const TXT = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8');
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const inDoc = s => TXT.includes(s);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const net = [];
async function open(opts = {}) {
  const { viewport = { width: 1280, height: 900 }, block = false, clock = null, init = null, js = true, ...rest } = opts;
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', javaScriptEnabled: js, acceptDownloads: true, ...rest });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errs.push(m.text()); });
  p.on('request', r => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u) && !/fonts\.(googleapis|gstatic)\.com/.test(u)) net.push(u); });
  p.on('dialog', d => d.accept());
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ } });
  if (block) {
    await p.addInitScript(() => {
      const thrower = { get() { throw new DOMException('blocked', 'SecurityError'); } };
      try { Object.defineProperty(window, 'localStorage', thrower); } catch (e) { /* ignore */ }
    });
  }
  if (init) await p.addInitScript(init);
  if (clock) await p.clock.install({ time: new Date(clock.getTime() - 60000) });
  await p.goto(PAGE);
  await p.waitForTimeout(400);
  if (clock) await p.clock.pauseAt(clock); // time stands still unless the test moves it
  return { ctx, p, errs };
}
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const txt = (p, s) => p.$eval(s, e => e.textContent.trim()).catch(() => null);
const visible = (p, s) => p.$eval(s, e => { const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }).catch(() => false);
const stubPrint = p => p.evaluate(() => { window.__printed = []; window.print = () => { window.__printed.push(document.body.className); }; });
const afterprint = p => p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
const smallTargets = (p, scope) => p.evaluate(sc => {
  const bad = [];
  document.querySelectorAll(sc + ' button, ' + sc + ' select, ' + sc + ' input:not([type=checkbox]):not([type=radio]):not([type=file])').forEach(b => {
    const r = b.getBoundingClientRect();
    if (!r.width || b.closest('[hidden]') || getComputedStyle(b).visibility === 'hidden') return;
    if (r.height < 43.5 || r.width < 43.5) bad.push((b.textContent || b.getAttribute('aria-label') || b.id || b.className).trim().slice(0, 30) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  return bad;
}, scope);

/* ======================================================================= no JS */
console.log('no JavaScript: the three tools stay hidden, the regulation stays readable');
{
  const { ctx, p } = await open({ js: false });
  for (const id of ['#rule-finder', '#league-table', '#match-day']) check(`no-JS: ${id} not shown`, !(await visible(p, id)));
  check('no-JS: chapter lg4 text present', (await p.textContent('#lg4')).includes('بطاقتان صفراوان في مباراة'));
  const order = await p.evaluate(() => {
    const ids = [...document.querySelectorAll('#c-league .wrap > *')].map(e => e.id || e.className.split(' ')[0]);
    return ids;
  });
  const i = k => order.indexOf(k);
  check('placement: rule-finder before the fold tools', i('rule-finder') >= 0 && i('rule-finder') < i('fold-tools'), order.join(','));
  check('placement: league-table after .folds, before #c-rules', i('folds') < i('league-table') && i('league-table') < i('c-rules'), order.join(','));
  check('placement: match-day last, after #c-rules', i('c-rules') < i('match-day') && i('match-day') === order.length - 1, order.join(','));
  const dup = await p.evaluate(() => { const s = new Set(), d = []; document.querySelectorAll('[id]').forEach(e => { if (s.has(e.id)) d.push(e.id); s.add(e.id); }); return d; });
  check('no duplicate ids on the page', dup.length === 0, dup.join(','));
  await ctx.close();
}

/* ======================================================================= rule-finder */
console.log('rule-finder');
{
  const { ctx, p, errs } = await open();
  check('rule-finder visible with JS', await visible(p, '#rule-finder'));
  const cards = () => p.$$eval('#rf-out .rf-card', cs => cs.map(c => ({
    ch: c.querySelector('.rf-ch').textContent, text: c.querySelector('.rf-text') ? c.querySelector('.rf-text').textContent : '',
    cells: [...c.querySelectorAll('.rf-row > div')].map(d => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]),
    marks: c.querySelectorAll('mark').length })));
  const chip = w => p.click(`#rule-finder .rf-chip[data-q="${w}"]`);
  const rules = await p.$$eval('#c-rules li', ls => ls.map(l => l.textContent.trim()));
  const noRules = cs => cs.every(c => !rules.some(r => r === c.text.trim()));
  const noHeader = cs => cs.every(c => !c.cells.length || !['الحالة', 'المخالفة', 'النتيجة'].includes(c.cells[0][1]));

  await chip('بطاقة');
  let cs = await cards();
  check('«بطاقة»: lg4 row بطاقتان صفراوان', cs.some(c => c.cells.length && c.cells[0][1] === 'بطاقتان صفراوان في مباراة' && c.cells[1][1] === 'طرد من المباراة، وبعد 3 دقائق ينزل لاعب آخر'));
  check('«بطاقة»: lg4 row بطاقة حمراء مباشرة', cs.some(c => c.cells.length && c.cells[0][1] === 'بطاقة حمراء مباشرة'));
  check('«بطاقة»: lg6 tie-break item', cs.some(c => c.text.startsWith('عند التساوي: فارق الأهداف')));
  check('«بطاقة»: header words used as labels', cs.some(c => c.cells.length && c.cells[0][0] === 'المخالفة' && c.cells[1][0] === 'العقوبة'));
  check('«بطاقة»: matched words marked', cs.every(c => c.marks > 0));
  check('«بطاقة»: chip pressed', (await p.getAttribute('#rule-finder .rf-chip[data-q="بطاقة"]', 'aria-pressed')) === 'true');
  check('every card text is verbatim from competition.txt', cs.every(c => (c.text ? inDoc(c.text) : c.cells.every(([h, v]) => inDoc(h) && inDoc(v)))));
  check('kicker is the chapter title', cs.every(c => inDoc('| ' + c.ch) || inDoc(c.ch)));
  check('«بطاقة»: no c-rules line, no header row', noRules(cs) && noHeader(cs));

  await chip('ركلات ترجيح');
  cs = await cards();
  check('«ركلات ترجيح» returns the lg6 knockout item', cs.some(c => c.text === 'في خروج المغلوب: ثلاث ركلات ترجيح لكل فريق، ثم ركلة مقابل ركلة حتى الحسم.'));

  await p.fill('#rf-q', 'تأخر 12 دقيقة');
  await p.waitForTimeout(300);
  cs = await cards();
  check('«تأخر 12 دقيقة»: partial-match note', (await txt(p, '#rf-out .rf-note')) === 'لا توجد جملة فيها كل الكلمات. هذه أقرب الأسطر:');
  check('«تأخر 12 دقيقة»: both lg2 lateness rows', ['تأخر الفريق حتى 10 دقائق', 'تأخر الفريق لأكثر من 10 دقائق'].every(k => cs.some(c => c.cells.length && c.cells[0][1] === k)));
  check('typing un-presses the chips', (await p.$$eval('#rule-finder .rf-chip[aria-pressed=true]', b => b.length)) === 0);

  await chip('تأخر');
  cs = await cards();
  check('«تأخر»: the lateness rows come first', cs.length >= 2 && cs[0].cells.length && cs[0].cells[0][1] === 'تأخر الفريق حتى 10 دقائق' && cs[1].cells[0][1] === 'تأخر الفريق لأكثر من 10 دقائق', JSON.stringify(cs.slice(0, 2)));
  for (const w of ['إصابة', 'تأخر', 'غياب', 'انسحاب', 'تظلم', 'التعادل']) {
    await chip(w);
    cs = await cards();
    check(`«${w}»: results, max 8, no c-rules line, no header row`, cs.length > 0 && cs.length <= 8 && noRules(cs) && noHeader(cs), String(cs.length));
    if (w === 'إصابة') check('«إصابة»: the lg5 items', ['يوقف الحكم اللعب عند الإصابة التي تستدعي التدخل.', 'عند الاشتباه في إصابة الرأس أو الارتجاج لا يعود اللاعب للمباراة.'].every(s => cs.some(c => c.text === s)));
    if (w === 'تظلم') check('«تظلم»: 24 and 48 hour lines', cs.some(c => c.text.includes('خلال 24 ساعة')) && cs.some(c => c.text === 'يُبت في التظلم خلال 48 ساعة.'));
  }

  // open the chapter twice (closing it in between)
  await p.fill('#rf-q', 'الارتجاج'); await p.waitForTimeout(300);
  const link = '#rf-out .rf-open[href="#lg5"]';
  check('card link points at #lg5', await p.$(link) !== null);
  await p.evaluate(() => { document.getElementById('lg5').open = false; });
  await p.click(link);
  check('افتح الفصل opens details#lg5', await p.$eval('#lg5', d => d.open));
  check('افتح الفصل flashes the chapter', await p.$eval('#lg5', d => d.classList.contains('flash')));
  check('hash set to #lg5', await p.evaluate(() => location.hash) === '#lg5');
  await p.evaluate(() => { document.getElementById('lg5').open = false; document.getElementById('lg5').classList.remove('flash'); });
  await p.click(link);
  check('second click (same hash) opens it again', await p.$eval('#lg5', d => d.open && d.classList.contains('flash')));

  // nothing found
  await p.evaluate(() => document.querySelectorAll('#c-league details.fold').forEach((d, i) => { d.open = i === 0; }));
  await p.fill('#rf-q', 'ززززز'); await p.waitForTimeout(300);
  check('no result: message', ((await txt(p, '#rf-out')) || '').startsWith('لا نتيجة. جرّب كلمة أخرى، أو افتح كل الفصول'));
  await p.click('#rf-out .rf-link');
  check('«افتح كل الفصول» opens every chapter', await p.$$eval('#c-league details.fold', ds => ds.every(d => d.open)));

  // clear and Esc
  await p.click('#rule-finder .rf-x');
  check('× empties input and output', (await p.inputValue('#rf-q')) === '' && (await p.$$eval('#rf-out > *', e => e.length)) === 0);
  check('× returns focus to the input', await p.evaluate(() => document.activeElement && document.activeElement.id === 'rf-q'));
  await p.fill('#rf-q', 'غياب'); await p.waitForTimeout(300);
  await p.press('#rf-q', 'Escape');
  check('Esc clears', (await p.inputValue('#rf-q')) === '' && (await p.$$eval('#rf-out > *', e => e.length)) === 0);

  // row chips
  check('row chips hidden at first', !(await visible(p, '#rf-rows')));
  await p.click('#rule-finder .rf-more');
  check('«حالات من الجدول» opens the row chips', (await visible(p, '#rf-rows')) && (await p.getAttribute('#rule-finder .rf-more', 'aria-expanded')) === 'true');
  check('16 row chips (7 الحالة + 9 المخالفة)', (await p.$$eval('#rf-rows .rf-chip', b => b.length)) === 16);
  await p.click('#rf-rows .rf-chip >> text=تأخر الفريق حتى 10 دقائق');
  cs = await cards();
  check('row chip opens exactly that row', cs.length === 1 && cs[0].cells[1][1] === 'مهلة انتظار، ولا يتغير موعد انتهاء المباراة' && cs[0].cells[1][0] === 'القرار');
  check('rule-finder: no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // without the site engine the block stays hidden
  const { ctx, p } = await open({ init: () => { Object.defineProperty(window, 'YanabeeSearch', { get() { return undefined; }, set() {}, configurable: true }); } });
  check('rule-finder hidden when the search engine is missing', !(await visible(p, '#rule-finder')));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open(PHONE);
  await p.click('#rule-finder .rf-chip[data-q="بطاقة"]');
  await p.click('#rule-finder .rf-more');
  check('rule-finder 390px: no horizontal page overflow', (await overflow(p)) <= 0, String(await overflow(p)));
  const sm = await smallTargets(p, '#rule-finder');
  check('rule-finder 390px: touch targets ≥ 44px', sm.length === 0, sm.join(', '));
  check('rule-finder 390px: chips row scrolls inside itself', await p.$eval('#rule-finder .rf-chips', e => getComputedStyle(e).overflowX === 'auto'));
  check('rule-finder 390px: no errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ======================================================================= league-table */
console.log('league-table');
const LT = {
  set: async (p, s, v) => { await p.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [s, String(v)]); },
  team: async (p, name, group = '') => { await p.fill('#lt-tname', name); await p.fill('#lt-tgroup', group); await p.click('.lt-addteam button[type=submit]'); },
  id: (p, name) => p.evaluate(n => window.YanabeeLeague.state().teams.find(t => t.name === n).id, name),
  result: async (p, a, b, ga, gb, extra = {}) => {
    await LT.set(p, '#lt-ra', await LT.id(p, a)); await LT.set(p, '#lt-rb', await LT.id(p, b));
    for (const [k, v] of Object.entries({ '#lt-rga': ga, '#lt-rgb': gb, '#lt-rra': extra.ra || 0, '#lt-rya': extra.ya || 0, '#lt-rrb': extra.rb || 0, '#lt-ryb': extra.yb || 0 })) await LT.set(p, k, v);
    await p.click('#lt-radd');
  },
  reason: k => ['تأخر الفريق لأكثر من 10 دقائق', 'غياب الفريق دون عذر', 'انسحاب الفريق قبل المباراة', 'انسحاب الفريق أثناء المباراة', 'إشراك لاعب غير مسجل'].indexOf(k),
  forfeit: async (p, a, b, off, reason) => {
    await LT.set(p, '#lt-fa', await LT.id(p, a)); await LT.set(p, '#lt-fb', await LT.id(p, b));
    await LT.set(p, '#lt-foff', await LT.id(p, off)); await LT.set(p, '#lt-freason', LT.reason(reason));
  },
  table: (p, group) => p.evaluate(g => {
    const wrap = [...document.querySelectorAll('#lt-standings .lt-group')].find(w => { const h = w.querySelector('.lt-gtitle'); return g ? h && h.textContent === 'المجموعة: ' + g : !h || h.textContent === 'فرق بلا مجموعة'; });
    if (!wrap) return null;
    return [...wrap.querySelectorAll('tbody tr:not(.lt-note)')].map(tr => ({
      rank: tr.querySelector('.lt-rank').textContent, name: tr.querySelector('.lt-tn').textContent,
      badge: tr.querySelector('.lt-badge') ? tr.querySelector('.lt-badge').textContent : '',
      v: [...tr.querySelectorAll('td')].map(td => td.textContent),
      note: tr.nextElementSibling && tr.nextElementSibling.classList.contains('lt-note') ? tr.nextElementSibling.textContent : '',
    }));
  }, group),
};
{
  const { ctx, p, errs } = await open();
  check('league-table visible with JS', await visible(p, '#league-table'));
  const head = await p.$$eval('#league-table .lt-pts tbody tr', rs => rs.map(r => [...r.children].map(c => c.textContent)));
  check('points table shown verbatim (lg6)', JSON.stringify(head) === JSON.stringify([['الفوز', '3 نقاط'], ['التعادل', 'نقطة واحدة'], ['الخسارة', 'صفر']]));
  check('tie-break line shown verbatim', (await txt(p, '#league-table .lt-tb')) === 'عند التساوي: فارق الأهداف، ثم الأهداف المسجلة، ثم المواجهات المباشرة، ثم الأقل بطاقات حمراء فصفراء، ثم قرعة علنية.');
  check('format line shown (lg1), duty line (lg8)', (await p.textContent('#league-table .lt-src')).includes('تحدد اللجنة نظام البطولة (مجموعات أو خروج المغلوب) بحسب عدد الفرق.') && (await p.textContent('#league-table .lt-src')).includes('تسجيل النتائج والترتيب وإعداد التقرير الختامي.'));
  check('hint has no number', !/\d/.test(await txt(p, '#league-table .lt-hint')));
  const opts = await p.$$eval('#lt-freason option', o => o.map(x => x.textContent));
  check('5 reasons by regulation, verbatim', opts.length === 5 && opts.every(inDoc), opts.join(' | '));

  // validation
  await LT.team(p, ''); check('empty team name refused', (await txt(p, '#lt-team-msg')) === 'اكتب اسم الفريق.');
  for (const [n, g] of [['أ1', 'أ'], ['أ2', 'أ'], ['أ3', 'أ'], ['ب1', 'ب'], ['ب2', 'ب'], ['ب3', 'ب'], ['ج1', 'ج'], ['ج2', 'ج'], ['د1', 'د'], ['د2', 'د'], ['د3', 'د'], ['هـ1', 'هـ'], ['هـ2', 'هـ']]) await LT.team(p, n, g);
  await LT.team(p, 'أ1', 'أ'); check('duplicate team name refused', (await txt(p, '#lt-team-msg')) === 'يوجد فريق بهذا الاسم.');
  check('13 teams', (await p.evaluate(() => window.YanabeeLeague.state().teams.length)) === 13);
  await LT.result(p, 'أ1', 'ب1', 1, 0); check('teams of different groups refused', (await txt(p, '#lt-res-msg')) === 'الفريقان في مجموعتين مختلفتين.');
  await LT.set(p, '#lt-ra', await LT.id(p, 'أ1')); await LT.set(p, '#lt-rb', await LT.id(p, 'أ1')); await p.click('#lt-radd');
  check('same team twice refused', (await txt(p, '#lt-res-msg')) === 'اختر فريقين مختلفين.');
  await LT.result(p, 'أ1', 'أ2', -1, 0); check('negative goals refused', (await txt(p, '#lt-res-msg')) === 'اكتب أعدادًا صحيحة من 0 فأكثر.');
  await LT.result(p, 'أ1', 'أ2', 1.5, 0); check('fractional goals refused', (await txt(p, '#lt-res-msg')) === 'اكتب أعدادًا صحيحة من 0 فأكثر.');

  // group أ: points / GD / GF with 3 teams
  await LT.result(p, 'أ1', 'أ2', 2, 0);
  await LT.result(p, 'أ2', 'أ3', 1, 1);
  await LT.result(p, 'أ3', 'أ1', 0, 3);
  let T = await LT.table(p, 'أ');
  check('group أ: order أ1, أ2, أ3', T && T.map(r => r.name).join() === 'أ1,أ2,أ3', JSON.stringify(T));
  check('group أ: أ1 2 played, 2 won, GF 5, GA 0, GD +5, 6 points', T && T[0].v.join() === '2,2,0,0,5,0,+5,6', T && T[0].v.join());
  check('group أ: أ2 1 point (draw = 1), GD -2', T && T[1].v.join() === '2,0,1,1,1,3,-2,1', T && T[1].v.join());
  check('group أ: أ3 1 point, GD -3', T && T[2].v.join() === '2,0,1,1,1,4,-3,1', T && T[2].v.join());
  check('group أ: أ2/أ3 separated by فارق الأهداف (shown)', T && T[1].note.includes('الفاصل: فارق الأهداف (-2 مقابل -3)'), T && T[1].note);
  await p.click('#lt-standings .lt-why');
  check('«لماذا؟» toggles the note row', await p.$eval('#lt-standings .lt-why', b => b.getAttribute('aria-expanded') === 'true' && !document.getElementById(b.getAttribute('aria-controls')).hidden));

  // group ب: head-to-head decided (2 teams level on points, GD, GF; one mutual result)
  await LT.result(p, 'ب1', 'ب2', 1, 0);
  await LT.result(p, 'ب1', 'ب3', 1, 2);
  await LT.result(p, 'ب2', 'ب3', 2, 1);
  T = await LT.table(p, 'ب');
  check('group ب: ب3 first on goals scored, then ب1 ahead of ب2 by head-to-head', T && T.map(r => r.name).join() === 'ب3,ب1,ب2', JSON.stringify(T && T.map(r => r.name)));
  check('group ب: note names المواجهات المباشرة', T && T[1].note.includes('الفاصل: المواجهات المباشرة') && T[2].note.includes('المواجهات المباشرة'));
  check('group ب: ب3 separated by الأهداف المسجلة', T && T[0].note.includes('الفاصل: الأهداف المسجلة (3 مقابل 2)'), T && T[0].note);

  // group ج: all mutual matches drawn -> cards (fewer red, then fewer yellow), then public draw
  await LT.result(p, 'ج1', 'ج2', 1, 1, { ra: 1, rb: 0 });
  T = await LT.table(p, 'ج');
  check('group ج: drawn head-to-head -> fewer red cards first (ج2)', T && T.map(r => r.name).join() === 'ج2,ج1' && T[0].note.includes('الأقل بطاقات حمراء فصفراء'), JSON.stringify(T));
  await p.click('#lt-results li:last-child .lt-sm:not(.lt-danger)');
  check('edit loads the result into the form', (await p.inputValue('#lt-rra')) === '1' && (await txt(p, '#lt-radd span')) === 'احفظ التعديل');
  await LT.set(p, '#lt-rra', 0); await LT.set(p, '#lt-rya', 2); await LT.set(p, '#lt-ryb', 1);
  await p.click('#lt-radd');
  T = await LT.table(p, 'ج');
  check('edit saved (still 1 result in ج)', (await p.evaluate(() => window.YanabeeLeague.state().results.length)) === 7);
  check('group ج: equal red -> fewer yellow first (ج2)', T && T[0].name === 'ج2' && T[0].note.includes('بطاقات صفراء'), JSON.stringify(T));
  await p.click('#lt-results li:last-child .lt-sm:not(.lt-danger)');
  await LT.set(p, '#lt-rya', 0); await LT.set(p, '#lt-ryb', 0); await p.click('#lt-radd');
  T = await LT.table(p, 'ج');
  check('group ج: still level -> «قرعة علنية», the tool does not draw', T && T.every(r => r.badge === 'قرعة علنية') && T[0].rank === T[1].rank && T[0].note.includes('الأداة لا تجري القرعة'), JSON.stringify(T));

  // group د: three teams level -> committee
  await LT.result(p, 'د1', 'د2', 1, 0); await LT.result(p, 'د2', 'د3', 1, 0); await LT.result(p, 'د3', 'د1', 1, 0);
  T = await LT.table(p, 'د');
  check('group د: 3-team tie flagged «تحتاج قرار اللجنة», same position', T && T.every(r => r.badge === 'تحتاج قرار اللجنة' && r.rank === '1'), JSON.stringify(T));
  check('group د: lists the mutual results and shows the lg10 line', T && T[0].note.includes('المواجهات المباشرة المسجلة') && T[0].note.includes('تفصل اللجنة في الحالات غير المنصوص عليها مع مراعاة العدالة وسلامة المشاركين.'));

  // group هـ: two teams, no mutual match -> committee
  T = await LT.table(p, 'هـ');
  check('group هـ: level with no mutual match -> committee', T && T.every(r => r.badge === 'تحتاج قرار اللجنة') && T[0].note.includes('لم يلتقِ الفريقان بعد'), JSON.stringify(T));

  // results by regulation
  await LT.forfeit(p, 'هـ1', 'هـ2', 'هـ1', 'غياب الفريق دون عذر');
  check('decision cell shown for the reason', (await txt(p, '#lt-fdec')) === 'القرار: تُحسب النتيجة بخسارة الفريق المتغيب 0 – 3');
  await p.click('#lt-fadd');
  T = await LT.table(p, 'هـ');
  check('forfeit: offending team 0, opponent 3 (هـ2 3 points)', T && T[0].name === 'هـ2' && T[0].v.join() === '1,1,0,0,3,0,+3,3' && T[1].v.join() === '1,0,0,1,0,3,-3,0', JSON.stringify(T));
  const tag = await p.$eval('#lt-results li:last-child .lt-tag2', e => e.textContent);
  check('forfeit result tagged with the verbatim decision', tag.includes('غياب الفريق دون عذر') && tag.includes('تُحسب النتيجة بخسارة الفريق المتغيب 0 – 3'), tag);
  check('results show names and goals in separate cells', await p.$eval('#lt-results li:last-child', li => li.querySelectorAll('.lt-sn').length === 2 && li.querySelectorAll('.lt-sg').length === 2));
  check('one absence: listed, not flagged', await p.$eval('#lt-flags', f => f.textContent.includes('هـ1') && !f.querySelector('.lt-flag.on')));
  await LT.forfeit(p, 'هـ1', 'هـ2', 'هـ1', 'تأخر الفريق لأكثر من 10 دقائق'); await p.click('#lt-fadd');
  await LT.forfeit(p, 'هـ1', 'هـ2', 'هـ1', 'إشراك لاعب غير مسجل');
  check('lg4 reason decision shown', (await txt(p, '#lt-fdec')) === 'العقوبة: خسارة اعتبارية 3 – 0');
  await p.click('#lt-fadd');
  check('lateness and the lg4 reason are not counted as absences', await p.$eval('#lt-flags', f => !f.querySelector('.lt-flag.on')));
  T = await LT.table(p, 'هـ');
  check('lg4 forfeit also gives the offender 0 and the opponent 3', T && T[0].v.join() === '3,3,0,0,9,0,+9,9', T && T[0].v.join());

  // withdrawal during the match: choice only when the opponent leads
  await LT.forfeit(p, 'هـ1', 'هـ2', 'هـ1', 'انسحاب الفريق أثناء المباراة');
  check('withdrawal: «النتيجة القائمة» appears', await visible(p, '#lt-fcur'));
  await LT.set(p, '#lt-fcoff', 2); await LT.set(p, '#lt-fcopp', 1);
  check('withdrawal: no choice when the withdrawing team leads', !(await visible(p, '#lt-fchoice')));
  await LT.set(p, '#lt-fcoff', 1); await LT.set(p, '#lt-fcopp', 1);
  check('withdrawal: no choice when level', !(await visible(p, '#lt-fchoice')));
  await LT.set(p, '#lt-fcoff', 0); await LT.set(p, '#lt-fcopp', 2);
  check('withdrawal: choice offered when the opponent leads', await visible(p, '#lt-fchoice'));
  check('withdrawal: row 152 text shown beside the choice', (await txt(p, '#lt-fdec')).includes('أو تثبيت النتيجة القائمة إذا كانت أكبر لمصلحة الفريق المنافس'));
  await p.click('#lt-fadd');
  check('withdrawal: the committee must choose', (await txt(p, '#lt-ff-msg')).startsWith('اختر ما تقرره اللجنة'));
  await p.check('#lt-fchoice input[value="1"]');
  await p.click('#lt-fadd');
  const last = await p.evaluate(() => window.YanabeeLeague.state().results.slice(-1)[0]);
  const hid = await LT.id(p, 'هـ1');
  check('withdrawal kept score stored (0 withdrawing, 2 opponent)', last.keep === true && (last.a === hid ? last.ga === 0 && last.gb === 2 : last.gb === 0 && last.ga === 2), JSON.stringify(last));
  check('two absences/withdrawals -> exclusion row flagged for the committee', await p.$eval('#lt-flags .lt-flag.on', f => f.textContent.includes('تكرار غياب الفريق أو الانسحاب مرتين') && f.textContent.includes('استبعاد الفريق بقرار من لجنة المسابقة') && f.textContent.includes('للعرض على لجنة المسابقة')).catch(() => false));
  check('team is never removed automatically', (await p.evaluate(() => window.YanabeeLeague.state().teams.length)) === 13);

  // delete a result
  const n0 = await p.evaluate(() => window.YanabeeLeague.state().results.length);
  await p.click('#lt-results li:last-child .lt-danger');
  check('delete removes a result', (await p.evaluate(() => window.YanabeeLeague.state().results.length)) === n0 - 1);

  // persistence
  await p.reload(); await p.waitForTimeout(400);
  check('data survives a reload (localStorage yanabee-league-v1)', (await p.evaluate(() => window.YanabeeLeague.state().results.length)) === n0 - 1 && (await p.evaluate(() => !!localStorage.getItem('yanabee-league-v1'))));

  // CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#lt-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  check('CSV: UTF-8 BOM, Arabic headers, quoted cells', csv.charCodeAt(0) === 0xFEFF && csv.includes('"الفريق","لعب","فوز","تعادل","خسارة","له","عليه","الفارق","النقاط"') && csv.includes('"أ1"'), csv.slice(0, 120));
  check('CSV: flags carried', csv.includes('"تحتاج قرار اللجنة"') && csv.includes('"قرعة علنية"'));

  // JSON save / open
  const [dj] = await Promise.all([p.waitForEvent('download'), p.click('#lt-save')]);
  const jpath = await dj.path();
  const saved = JSON.parse(fs.readFileSync(jpath, 'utf8'));
  check('JSON save holds teams and results', saved.teams.length === 13 && saved.results.length === n0 - 1);
  await p.click('#lt-clear');
  check('clear empties the tool', (await p.evaluate(() => window.YanabeeLeague.state().teams.length)) === 0);
  const badPath = path.join(path.dirname(jpath), 'bad.json');
  fs.writeFileSync(badPath, JSON.stringify({ teams: [{ id: 'x' }], results: [] }));
  await p.setInputFiles('#lt-open', badPath); await p.waitForTimeout(200);
  check('invalid file refused', (await txt(p, '#lt-tools-msg')) === 'الملف ليس نسخة صالحة من هذه الأداة.' && (await p.evaluate(() => window.YanabeeLeague.state().teams.length)) === 0);
  const goodPath = path.join(path.dirname(jpath), 'good.json');
  fs.copyFileSync(jpath, goodPath);
  await p.setInputFiles('#lt-open', goodPath); await p.waitForTimeout(200);
  check('valid file restores the data (after confirm)', (await p.evaluate(() => window.YanabeeLeague.state().results.length)) === n0 - 1);

  // print
  await stubPrint(p);
  await p.click('#lt-print');
  check('print uses body class print-league-table', (await p.evaluate(() => window.__printed[0] || '')).split(' ').includes('print-league-table'));
  await p.emulateMedia({ media: 'print' });
  check('print mode: standings shown, inputs hidden, rest of the page hidden', await p.evaluate(() => {
    const d = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'none'; };
    return d('#lt-standings') !== 'none' && d('#league-table .lt-in') === 'none' && d('#c-rules') === 'none' && d('#c-league .folds') === 'none' && d('#match-day') === 'none' && d('#c-ad') === 'none' && d('.lt-print-only') !== 'none';
  }));
  await afterprint(p);
  check('afterprint removes the class', !(await p.evaluate(() => document.body.classList.contains('print-league-table'))));
  check('whole-page print: inputs hidden, standings kept', await p.evaluate(() => getComputedStyle(document.querySelector('#league-table .lt-in')).display === 'none' && getComputedStyle(document.querySelector('#lt-standings')).display !== 'none'));
  await p.emulateMedia({ media: 'screen' });
  check('league-table: no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open({ block: true });
  check('storage blocked: tool still shown', await visible(p, '#league-table'));
  await LT.team(p, 'س'); await LT.team(p, 'ص');
  await LT.result(p, 'س', 'ص', 3, 1);
  const T = await LT.table(p, '');
  check('storage blocked: standings computed', T && T[0].name === 'س' && T[0].v[7] === '3', JSON.stringify(T));
  check('storage blocked: warning shown', ((await txt(p, '#lt-tools-msg')) || '').includes('لا يمكن الحفظ'));
  check('storage blocked: no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open(PHONE);
  for (const n of ['فريق النور', 'فريق الهدى', 'فريق الفجر']) await LT.team(p, n);
  await LT.result(p, 'فريق النور', 'فريق الهدى', 2, 2);
  check('league-table 390px: no horizontal page overflow', (await overflow(p)) <= 0, String(await overflow(p)));
  check('league-table 390px: table scrolls in its own wrapper', await p.$eval('#lt-standings .lt-scroll', e => getComputedStyle(e).overflowX === 'auto'));
  check('league-table 390px: team column sticky', await p.$eval('#lt-standings tbody .lt-team', e => getComputedStyle(e).position === 'sticky'));
  const sm = await smallTargets(p, '#league-table .lt-in');
  check('league-table 390px: touch targets ≥ 44px', sm.length === 0, sm.join(', '));
  check('league-table 390px: no errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ======================================================================= match-day */
console.log('match-day');
const T0 = new Date(2026, 10, 20, 15, 0, 0); // 20 Nov 2026, 15:00 local
const MD = {
  digits: p => txt(p, '#md-digits'),
  phase: p => txt(p, '#md-phase'),
  tab: (p, k) => p.click('#md-tab-' + k),
  player: async (p, team, num, name = '') => {
    const s = `#md-teams .md-team.md-t${team}`;
    await p.fill(`${s} [data-k="num${team}"]`, String(num));
    if (name) await p.fill(`${s} [data-k="pname${team}"]`, name);
    await p.click(`${s} [data-k="add${team}"]`);
  },
  open: (p, team, num) => p.click(`#md-teams .md-t${team} .md-pl-b:has(.md-pl-n:text-is("${num}"))`),
  state: p => p.evaluate(() => window.YanabeeMatch.state()),
};
{
  const { ctx, p, errs } = await open({ clock: T0 });
  check('match-day visible with JS', await visible(p, '#match-day'));
  check('banner note + lg3 line', (await txt(p, '#match-day .md-note')) === 'أداة مساعدة للحكم في الملعب، ولا تحل محل قراره أو قرار لجنة تنظيم الدوري.' && (await txt(p, '#match-day .md-final')) === 'قرارات الحكم في وقائع اللعب نهائية، ويُمنع الاعتراض غير اللائق.');
  check('four tabs, first selected', (await p.$$eval('#match-day [role=tab]', t => t.map(x => x.textContent.trim() + ':' + x.getAttribute('aria-selected')).join('|'))) === 'ساعة المباراة:true|المخالفات والبطاقات:false|ركلات الترجيح:false|ورقة المباراة:false');
  await p.focus('#md-tab-clock'); await p.keyboard.press('ArrowLeft');
  check('tabs: arrow key (RTL) moves to the next tab', await visible(p, '#md-p-cards') && await p.evaluate(() => document.activeElement.id === 'md-tab-cards'));
  await MD.tab(p, 'clock');

  // derived times (lg2: 15 minutes before; lg1: 15 + 5 + 15)
  await p.fill('#md-kick', '15:00');
  check('arrival = kickoff − 15 (14:45)', (await txt(p, '#md-arrive')) === '14:45');
  check('end = kickoff + 15 + 5 + 15 (15:35)', (await txt(p, '#md-end')) === '15:35');
  check('arithmetic shown as 15 + 5 + 15', (await txt(p, '#md-p-clock .md-sum')) === '15 + 5 + 15');
  check('source lines under the times', (await p.textContent('#md-p-clock .md-times')).includes('يلتزم كل فريق بالحضور قبل موعد المباراة بخمس عشرة دقيقة لإتمام التجهيز والتسجيل.') && (await p.textContent('#md-p-clock .md-times')).includes('مدة المباراة 30 دقيقة على شوطين، كل شوط 15 دقيقة، وبينهما استراحة خمس دقائق.'));
  check('pause rules quoted (lg3, lg5)', (await p.textContent('#md-p-clock .md-why')).includes('للحكم إيقاف المباراة عند وجود خطر على اللاعبين أو سلوك غير رياضي.') && (await p.textContent('#md-p-clock .md-why')).includes('يوقف الحكم اللعب عند الإصابة التي تستدعي التدخل.'));
  check('tone off by default', !(await p.isChecked('#md-tone')));

  // on time
  await p.click('#md-start');
  check('on-time start: first half 15:00', (await MD.digits(p)) === '15:00' && (await MD.phase(p)) === 'الشوط الأول');
  await p.clock.runFor(60000);
  check('after 1 minute: 14:00', (await MD.digits(p)) === '14:00');
  check('pause/resume buttons ≥ 56px', (await p.$eval('#md-pause', b => b.getBoundingClientRect().height)) >= 56 && (await p.$eval('#md-next', b => b.getBoundingClientRect().height)) >= 56);
  await p.click('#md-pause');
  check('paused: «استأنف», aria-pressed', (await txt(p, '#md-pause span')) === 'استأنف' && (await p.getAttribute('#md-pause', 'aria-pressed')) === 'true');
  await p.clock.runFor(30000);
  check('paused clock does not move', (await MD.digits(p)) === '14:00');
  await p.click('#md-pause');
  await p.clock.runFor(30000);
  check('resumed: 13:30', (await MD.digits(p)) === '13:30');
  check('stoppage shown', ((await txt(p, '#md-sub')) || '').includes('وقت الإيقاف: 00:30'));
  // survives a reload
  await p.reload(); await p.waitForTimeout(300);
  check('clock state survives a reload', (await MD.digits(p)) === '13:30' && (await MD.phase(p)) === 'الشوط الأول');
  await p.clock.runFor(14 * 60000);
  check('half over: 00:00, says so, does not jump by itself', (await MD.digits(p)) === '00:00' && (await MD.phase(p)).includes('انتهى الوقت'));
  await p.click('#md-next');
  check('break: 05:00', (await MD.digits(p)) === '05:00' && (await MD.phase(p)) === 'الاستراحة');
  await p.clock.runFor(5 * 60000);
  await p.click('#md-next');
  check('second half: 15:00', (await MD.digits(p)) === '15:00' && (await MD.phase(p)) === 'الشوط الثاني');
  await p.clock.runFor(15 * 60000);
  await p.click('#md-next');
  check('end: «انتهت المباراة», end time recorded', (await MD.phase(p)) === 'انتهت المباراة' && (await MD.state(p)).sheet.end === '15:36', (await MD.state(p)).sheet.end);

  // late ≤ 10: fixed end
  await p.click('#md-reset-clock');
  await p.fill('#md-kick', '15:28');
  await p.click('#md-start');
  const st = await MD.state(p);
  check('late 8 min: late mode, fixed end 16:03', st.clock.mode === 'late' && st.clock.delay === 8 && st.clock.endAt === new Date(2026, 10, 20, 16, 3).getTime(), JSON.stringify(st.clock));
  check('late ≤ 10: lg2 row and decision verbatim', (await p.textContent('#md-late')).includes('تأخر الفريق حتى 10 دقائق') && (await p.textContent('#md-late')).includes('مهلة انتظار، ولا يتغير موعد انتهاء المباراة'));
  check('late ≤ 10: one countdown to the fixed end (27:00)', (await MD.digits(p)) === '27:00' && (await MD.phase(p)).includes('حتى موعد الانتهاء'));
  await p.clock.runFor(10 * 60000);
  await p.click('#md-next');
  check('late: referee ends the first half → 5-minute break', (await MD.digits(p)) === '05:00' && ((await txt(p, '#md-sub')) || '').includes('حتى موعد الانتهاء: 17:00'));
  await p.clock.runFor(5 * 60000);
  await p.click('#md-next');
  check('late: second half continues the same countdown (12:00)', (await MD.digits(p)) === '12:00');

  // late > 10: decision shown, clock waits for the referee
  await p.click('#md-reset-clock');
  await p.fill('#md-kick', '15:30');
  await p.click('#md-start');
  check('late > 10: lg2 decision verbatim with the label', (await p.textContent('#md-late')).includes('تُحسب النتيجة بخسارة الفريق المتأخر 0 – 3') && (await p.textContent('#md-late')).includes('إن كان التأخر من أحد الفريقين — القرار للحكم واللجنة'));
  check('late > 10: clock not started, score untouched', (await MD.state(p)).clock.phase === null && (await MD.state(p)).teams.every(t => t.goals[0] + t.goals[1] === 0));
  await p.click('#md-force');
  check('late > 10: referee can still run the clock (15:00)', (await MD.digits(p)) === '15:00');
  check('wake lock request did not throw', errs.length === 0, errs.join(' | '));

  // ---- cards
  await MD.tab(p, 'cards');
  await MD.player(p, 0, 7); await MD.player(p, 0, 9, 'سامي'); await MD.player(p, 1, 4);
  await MD.player(p, 0, 7);
  check('duplicate shirt number refused', (await p.textContent('#md-teams .md-t0')).includes('هذا الرقم مسجل في الفريق.'));
  await MD.open(p, 0, 7);
  check('player sheet opens with 5 offences + «بلا مخالفة»', (await p.$$eval('#md-player input[name=md-off]', i => i.length)) === 6);
  const offs = await p.$$eval('#md-player input[name=md-off] + .md-opt-t b', b => b.map(x => x.textContent));
  check('offences are the lg4 cells verbatim', offs.slice(1).every(o => inDoc('| ' + o + ' |')), offs.join('|'));
  await p.click('#md-player .md-opt:has(b:text-is("الإساءة اللفظية أو السخرية"))');
  await p.click('#md-player button[type=submit]');
  check('verbal abuse logged with «طرد دقيقتين»', (await p.textContent('#md-log')).includes('الإساءة اللفظية أو السخرية') && (await p.textContent('#md-log')).includes('العقوبة: طرد دقيقتين'));
  check('an offence alone creates no card', (await txt(p, '#md-teams .md-t0 .md-red')) === 'بطاقات حمراء: 0' && (await txt(p, '#md-teams .md-t0 .md-yel')) === 'بطاقات صفراء: 0');
  check('offer: «طرد دقيقتين» chip 02:00', (await txt(p, '#md-player .md-offer')) === 'ابدأ مؤقت «طرد دقيقتين» (02:00)');
  await p.click('#md-player .md-offer');
  check('chip started at 02:00', (await txt(p, '#md-chips .md-chip-n')) === '02:00' && (await txt(p, '#md-chips .md-chip-t b')) === 'طرد دقيقتين');
  await p.click('#md-player .md-small:not(.md-primary)');
  await p.clock.runFor(30000);
  check('chip runs on wall-clock time (01:30)', (await txt(p, '#md-chips .md-chip-n')) === '01:30');
  await p.click('#md-chips .md-chip-b');
  await p.clock.runFor(20000);
  check('chip has its own pause (01:30)', (await txt(p, '#md-chips .md-chip-n')) === '01:30' && (await txt(p, '#md-chips .md-chip-b')) === 'استأنف');
  await p.click('#md-chips .md-chip-b');
  await p.clock.runFor(95000);
  check('chip ends: «انتهى»', (await txt(p, '#md-chips .md-chip-n')) === 'انتهى');
  await p.click('#md-chips .md-chip-x');
  check('chip removed', !(await visible(p, '#md-chips')));

  // yellow, yellow
  await MD.open(p, 0, 7);
  await p.click('#md-player .md-opt:has(b:text-is("بطاقة صفراء"))');
  await p.click('#md-player button[type=submit]');
  check('first yellow counted', (await txt(p, '#md-teams .md-t0 .md-yel')) === 'بطاقات صفراء: 1');
  check('first yellow: no 3:00 offer', (await p.$('#md-player .md-offer')) === null);
  await p.click('#md-player .md-small');
  await MD.open(p, 0, 7);
  await p.click('#md-player .md-opt:has(b:text-is("بطاقة صفراء"))');
  await p.click('#md-player button[type=submit]');
  check('second yellow: row «بطاقتان صفراوان في مباراة» and its cell verbatim', (await p.textContent('#md-player')).includes('بطاقتان صفراوان في مباراة') && (await p.textContent('#md-player')).includes('طرد من المباراة، وبعد 3 دقائق ينزل لاعب آخر'));
  check('second yellow: 3:00 chip offered with the document words', (await txt(p, '#md-player .md-offer')) === 'ابدأ مؤقت «وبعد 3 دقائق ينزل لاعب آخر» (03:00)');
  await p.click('#md-player .md-offer');
  check('3:00 chip running', (await txt(p, '#md-chips .md-chip-n')) === '03:00');
  check('two yellows do not become a red card', (await txt(p, '#md-teams .md-t0 .md-red')) === 'بطاقات حمراء: 0' && (await txt(p, '#md-teams .md-t0 .md-yel')) === 'بطاقات صفراء: 2');
  await p.click('#md-player .md-small:not(.md-primary)');

  // violent play: referee chooses
  await MD.open(p, 0, 9);
  await p.click('#md-player .md-opt:has(b:text-is("اللعب العنيف أو المتهور"))');
  check('violent play shows «الحكم يختار: إنذار / طرد»', await visible(p, '#md-player .md-violent'));
  await p.click('#md-player button[type=submit]');
  check('violent play needs the choice', (await txt(p, '#md-player .md-err')) === 'اختر: إنذار أو طرد.');
  await p.click('#md-player .md-violent .md-opt:has(b:text-is("طرد"))');
  await p.click('#md-player button[type=submit]');
  check('violent play logged with the chosen sanction and the cell', (await p.textContent('#md-log')).includes('العقوبة: إنذار أو طرد بحسب الخطورة — اختيار الحكم: طرد'));
  check('«طرد» chosen is not a red card', (await txt(p, '#md-teams .md-t0 .md-red')) === 'بطاقات حمراء: 0');
  await p.click('#md-player .md-small');
  // assault
  await MD.open(p, 0, 9);
  await p.click('#md-player .md-opt:has(b:text-is("اعتداء بدني متعمد"))');
  await p.click('#md-player button[type=submit]');
  check('assault logs «طرد فوري وإحالة للجنة الانضباط»', (await p.textContent('#md-log')).includes('طرد فوري وإحالة للجنة الانضباط'));
  await p.click('#md-player .md-small');
  // nothing chosen
  await MD.open(p, 1, 4);
  await p.click('#md-player button[type=submit]');
  check('empty sheet refused', (await txt(p, '#md-player .md-err')) === 'اختر مخالفة أو بطاقة.');
  // direct red
  await p.click('#md-player .md-opt:has(b:text-is("بطاقة حمراء مباشرة"))');
  await p.click('#md-player button[type=submit]');
  check('direct red: counted for team ب, cell verbatim', (await txt(p, '#md-teams .md-t1 .md-red')) === 'بطاقات حمراء: 1' && (await p.textContent('#md-log')).includes('طرد وإيقاف المباراة التالية على الأقل، مع مراجعة الواقعة'));
  await p.click('#md-player .md-small');
  check('player marked red', await p.$eval('#md-teams .md-t1 .md-pl-b', b => b.classList.contains('is-red')));
  check('focus returns to the player button', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('md-pl-b')));
  await MD.open(p, 0, 9);
  check('player sheet is a modal dialog', await p.$eval('#md-player', d => d.open && d.matches(':modal')));
  await p.keyboard.press('Escape');
  check('Esc closes the sheet and focus returns to the player', await p.evaluate(() => !document.getElementById('md-player').open && document.activeElement && document.activeElement.dataset.k && document.activeElement.dataset.k.startsWith('pl')));
  check('tie-break line under the counters (lg6)', (await txt(p, '#md-p-cards .md-tb')) === 'عند التساوي: فارق الأهداف، ثم الأهداف المسجلة، ثم المواجهات المباشرة، ثم الأقل بطاقات حمراء فصفراء، ثم قرعة علنية.');

  // team incidents
  const incs = await p.$$eval('#md-teams .md-t1 select option', o => o.map(x => x.textContent));
  check('team incidents: 5 verbatim rows', incs.join('|') === 'تدخل الجمهور أو المشرفين|إشراك لاعب غير مسجل|غياب الفريق دون عذر|انسحاب الفريق قبل المباراة|انسحاب الفريق أثناء المباراة');
  await p.selectOption('#md-teams .md-t1 select', '4');
  await p.click('#md-teams .md-t1 [data-k="incb1"]');
  check('incident logged with its decision, score unchanged', (await p.textContent('#md-log')).includes('تُحسب النتيجة بخسارة الفريق المنسحب 0 – 3 أو تثبيت النتيجة القائمة إذا كانت أكبر لمصلحة الفريق المنافس') && (await MD.state(p)).teams.every(t => t.goals.join() === '0,0'));

  // goals
  await p.click('#md-teams .md-t0 [data-k="gp00"]'); await p.click('#md-teams .md-t0 [data-k="gp01"]'); await p.click('#md-teams .md-t1 [data-k="gp11"]');
  check('goals per half', (await txt(p, '#md-teams .md-t0 .md-total b')) === '2' && (await txt(p, '#md-teams .md-t1 .md-total b')) === '1');
  // rename
  await p.fill('#md-teams .md-t0 [data-k="name0"]', 'النور'); await p.press('#md-teams .md-t0 [data-k="name0"]', 'Tab');
  check('team rename', (await MD.state(p)).teams[0].name === 'النور');

  // max 7 per team (c-terms)
  for (let n = 10; n < 15; n++) await MD.player(p, 0, n);
  check('7 players in team أ', (await MD.state(p)).teams[0].players.length === 7);
  await MD.player(p, 0, 99);
  check('8th player refused with the c-terms row', (await MD.state(p)).teams[0].players.length === 7 && (await p.textContent('#md-teams .md-t0')).includes('عدد الفريق: 5 إلى 7 أعضاء شاملًا قائد الفريق'));

  // delete a log line recomputes cards
  const before = (await MD.state(p)).log.length;
  await p.click('#md-log li:has(.md-le-x b:text-is("بطاقة حمراء مباشرة")) .md-pl-x');
  check('deleting the red-card line updates the counter', (await txt(p, '#md-teams .md-t1 .md-red')) === 'بطاقات حمراء: 0' && (await MD.state(p)).log.length === before - 1);

  // ---- shootout
  await MD.tab(p, 'pens');
  check('groups: no shootout, draw row + note + lg6 line', (await p.textContent('#md-pens')).includes('نقطة واحدة') && (await p.textContent('#md-pens')).includes('ركلات الترجيح في خروج المغلوب فقط') && (await p.textContent('#md-pens')).includes('في خروج المغلوب: ثلاث ركلات ترجيح لكل فريق، ثم ركلة مقابل ركلة حتى الحسم.') && (await p.$('#md-pens .md-kick')) === null);
  await p.click('#md-pens .md-small');
  check('switch to knockout: 3 kicks per team', (await p.$$eval('#md-pens .md-pk-k .md-kick', k => k.length)) === 6 && (await MD.state(p)).format === 'ko');
  const kick = async (team, j, times) => { for (let t = 0; t < times; t++) await p.click(`#md-pens [data-k="k${team}${j}"]`); };
  await kick(0, 0, 1); await kick(0, 1, 1); await kick(0, 2, 1); // A: S S S
  await kick(1, 0, 1); await kick(1, 1, 2); // B: S M
  check('early decision (3 vs at most 2)', ((await txt(p, '#md-pk-res')) || '').startsWith('الفائز بركلات الترجيح: النور') && (await txt(p, '#md-pk-res')).includes('حُسمت قبل اكتمال الركلات الثلاث'));
  check('result quotes the lg6 line', (await p.textContent('#md-pk-res')).includes('ثم ركلة مقابل ركلة حتى الحسم.'));
  check('kick buttons cycle with labels', (await p.getAttribute('#md-pens [data-k="k11"]', 'aria-label')).endsWith('أضاع'));
  await p.click('#md-pens .md-small');
  await kick(0, 0, 1); await kick(0, 1, 2); await kick(0, 2, 1); // A: S M S
  await kick(1, 0, 1); await kick(1, 1, 1); await kick(1, 2, 2); // B: S S M
  check('level after 3 each → «ركلة مقابل ركلة» round added', (await p.$$eval('#md-pens .md-sd-r', r => r.length)) === 1 && (await txt(p, '#md-pk-res')).includes('ركلة مقابل ركلة'));
  await p.click('#md-pens [data-k="s00"]'); await p.click('#md-pens [data-k="s01"]'); // both score
  check('both score → another round', (await p.$$eval('#md-pens .md-sd-r', r => r.length)) === 2);
  await p.click('#md-pens [data-k="s10"]'); await p.click('#md-pens [data-k="s11"]'); await p.click('#md-pens [data-k="s11"]'); // A scores, B misses
  check('sudden death decided: النور 4 – 3', (await txt(p, '#md-pk-res b')) === 'الفائز بركلات الترجيح: النور' && (await p.evaluate(() => { const r = window.YanabeeMatch.pens(); return r.sa + '-' + r.sb; })) === '4-3');

  // save result
  await MD.tab(p, 'cards');
  await p.click('#md-save-res');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-league-results-v1')));
  const r0 = saved && saved[0];
  check('result saved to yanabee-league-results-v1', r0 && r0.a === 'النور' && r0.ga === 2 && r0.gb === 1 && r0.ya === 2 && r0.ra === 0 && r0.rb === 0 && r0.format === 'خروج المغلوب', JSON.stringify(r0));
  check('saved result keeps the shootout winner', r0 && r0.pens && r0.pens.winner === 'النور' && r0.pens.a === 4 && r0.pens.b === 3, JSON.stringify(r0 && r0.pens));
  check('saved results listed', (await p.$$eval('#md-saved .md-sv', l => l.length)) === 1);

  // ---- match sheet
  await MD.tab(p, 'sheet');
  await p.fill('#md-s-ref', 'الحكم س');
  await p.fill('#md-s-safe', 'المشرف ص');
  await p.fill('#md-s-date', '2026-11-20');
  await p.fill('#md-s-end', '15:35');
  const doc = await p.textContent('#md-doc');
  check('sheet: names, referee, safety person, format', doc.includes('النور') && doc.includes('الحكم س') && doc.includes('المشرف ص') && doc.includes('خروج المغلوب'));
  check('sheet: lg1 squad line as heading, 7 rows per team (no reserve count)', (await p.$$eval('#md-doc .md-doc-team', t => t.map(x => x.querySelector('.md-q').textContent + ':' + x.querySelectorAll('tbody tr').length))).every(s => s === 'يتكون فريق المباراة من خمسة لاعبين أساسيين ولاعبين احتياطيين.:7') && !/\b2\b احتياطي/.test(doc));
  const checks = await p.$$eval('#md-doc .md-doc-check li', l => l.map(x => x.textContent.trim()));
  check('sheet: 4 verbatim checklist lines', checks.length === 4 && checks.every(inDoc), checks.join(' | '));
  check('sheet: safety line highlighted (lg5)', (await txt(p, '#md-doc .md-doc-safety')) === 'عند الاشتباه في إصابة الرأس أو الارتجاج لا يعود اللاعب للمباراة.');
  check('sheet: empty box headed with lg5 line', (await txt(p, '#md-doc .md-doc-box h5')) === 'عند تعذر الاستكمال بسبب إصابة خطيرة أو طارئ، تقرر اللجنة الاستكمال أو الإعادة بعد توثيق الواقعة.');
  check('sheet: lg7 line and appeal deadline end + 24 h', doc.includes('يقدم مسؤول الفريق تظلمًا مكتوبًا خلال 24 ساعة من نهاية المباراة.') && (await txt(p, '#md-deadline')) === 'آخر موعد للتظلم: 21 نوفمبر 2026، الساعة 15:35', await txt(p, '#md-deadline'));
  check('sheet: sanctions log with verbatim decisions', doc.includes('طرد فوري وإحالة للجنة الانضباط') && doc.includes('اختيار الحكم: طرد'));
  check('sheet: shootout with winner', doc.includes('الفائز بركلات الترجيح: النور'));
  check('sheet: signature line', doc.includes('توقيع الحكم'));
  check('sheet: score per half', (await p.$$eval('#md-doc .md-doc-score tbody tr', r => r.map(x => [...x.children].map(c => c.textContent).join(',')))).join('|') === 'النور,1,1,2|الفريق ب,0,1,1');
  await p.check('#md-doc .md-doc-check input >> nth=0');
  check('sheet: ticks stored', (await MD.state(p)).sheet.checks[0] === true);
  await stubPrint(p);
  await p.click('#md-print');
  check('print sheet: body class print-match-day', (await p.evaluate(() => window.__printed[0] || '')).split(' ').includes('print-match-day'));
  await p.emulateMedia({ media: 'print' });
  check('print sheet: only the sheet is shown', await p.evaluate(() => {
    const d = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'none'; };
    return d('#md-doc') !== 'none' && d('#md-sheet-form') === 'none' && d('.md-tablist') === 'none' && d('#league-table') === 'none' && d('#c-league .folds') === 'none' && d('#c-ad') === 'none' && d('.nav') === 'none';
  }));
  await afterprint(p);
  check('afterprint removes print-match-day', !(await p.evaluate(() => document.body.classList.contains('print-match-day'))));
  check('whole-page print hides the kit', await p.evaluate(() => getComputedStyle(document.getElementById('match-day')).display === 'none'));
  await p.emulateMedia({ media: 'screen' });
  await p.click('#md-print-blank');
  const blank = await p.textContent('#md-doc');
  check('blank sheet: same document lines, no names or referee', !blank.includes('النور') && !blank.includes('الحكم س') && blank.includes('يتكون فريق المباراة من خمسة لاعبين أساسيين ولاعبين احتياطيين.') && blank.includes('يقدم مسؤول الفريق تظلمًا مكتوبًا خلال 24 ساعة من نهاية المباراة.') && (await p.evaluate(() => window.__printed.length)) === 2);
  check('blank sheet: no ticks', await p.$$eval('#md-doc input[type=checkbox]', c => c.every(x => !x.checked)));
  await afterprint(p);
  check('after blank print the filled sheet returns', (await p.textContent('#md-doc')).includes('الحكم س'));

  // delete saved result, clear match
  await MD.tab(p, 'cards');
  await p.click('#md-saved .md-pl-x');
  check('saved result deleted', (await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-league-results-v1')).length)) === 0);
  await p.click('#md-clear');
  const s2 = await MD.state(p);
  check('«امسح بيانات هذه المباراة» resets everything', s2.log.length === 0 && s2.teams[0].players.length === 0 && s2.clock.phase === null && s2.chips.length === 0 && s2.kick === '');
  check('match-day: no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open({ block: true, clock: T0 });
  check('storage blocked: kit shown', await visible(p, '#match-day'));
  await p.fill('#md-kick', '15:00');
  await p.click('#md-start');
  await p.clock.runFor(61000);
  check('storage blocked: clock runs (13:59)', (await MD.digits(p)) === '13:59');
  await MD.tab(p, 'cards');
  await MD.player(p, 0, 5);
  check('storage blocked: players can be added', (await MD.state(p)).teams[0].players.length === 1);
  check('storage blocked: warning shown', ((await txt(p, '#md-save-msg')) || '').includes('لا يمكن الحفظ'));
  await p.click('#md-save-res');
  check('storage blocked: save reports failure', ((await txt(p, '#md-save-msg')) || '').includes('لا يمكن الحفظ'));
  check('storage blocked: no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
for (const theme of ['light', 'dark']) {
  const { ctx, p, errs } = await open({ ...PHONE, clock: T0, colorScheme: theme, init: t => { try { localStorage.setItem('yanabee-theme', t); } catch (e) { /* ignore */ } } });
  await p.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  for (const k of ['clock', 'cards', 'pens', 'sheet']) {
    await MD.tab(p, k);
    if (k === 'clock') { await p.fill('#md-kick', '14:55'); await p.click('#md-start'); }
    if (k === 'cards') { await MD.player(p, 0, 10, 'اسم طويل جدًا للاختبار'); await MD.open(p, 0, 10); await p.click('#md-player .md-opt:has(b:text-is("الإساءة اللفظية أو السخرية"))'); await p.click('#md-player button[type=submit]'); await p.click('#md-player .md-offer'); await p.click('#md-player .md-small:not(.md-primary)'); }
    if (k === 'pens') { await p.click('#md-pens .md-small'); }
    check(`match-day 390px ${theme} [${k}]: no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
    const sm = await smallTargets(p, '#md-p-' + k);
    check(`match-day 390px ${theme} [${k}]: touch targets ≥ 44px`, sm.length === 0, sm.join(', '));
  }
  check(`match-day 390px ${theme}: chip controls ≥ 44px`, (await smallTargets(p, '#md-chips')).length === 0);
  check(`match-day 390px ${theme}: no errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ======================================================================= source checks */
console.log('source: classic scripts, try/catch storage, no network APIs');
for (const f of ['rule-finder', 'league-table', 'match-day']) {
  const js = fs.readFileSync(path.join(ROOT, 'site/yanabee/js', f + '.js'), 'utf8');
  const code = js.replace(/\/\/.*$/gm, '');
  check(`${f}.js: IIFE, no import/export/fetch/XHR/sendBeacon/WebSocket`, /^\(\(\) => \{/m.test(code) && !/\b(import|export)\s|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(code));
  const lines = code.split('\n').filter(l => /localStorage\./.test(l));
  check(`${f}.js: every localStorage access inside try`, lines.every(l => /try\s*\{/.test(l) || /^\s{4,}(const raw|try|localStorage)/.test(l)), lines.join('\n'));
}
check('no network requests from the page', net.length === 0, net.join(', '));

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
