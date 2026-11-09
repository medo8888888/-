// Browser test of the 'method-a' feature bundle on method.html: meeting-timer («مؤقّت اللقاء») and
// publish-check («قبل أن تنشر: افحص المادة»), plus the leaders.html deep links into the timer.
//   node tools/yanabee/test-feat-method-a.mjs
// Covers: data = the documents' numbers (90 = 10+25+20+20+10+5, 100 = 10+20+45+15+10, 30, 10), verbatim labels and
// sources, start / pause / resume / next / previous / +1 minute / overrun / auto-advance / keyboard / end summary /
// new meeting, reload resume, ?mt= preselect, agenda change confirm, storage blocked, print class toggling (local
// fallback and window.__yanabeePrintOnly), print media; publish-check paths (every answer), focus, reset, phone vs
// desktop steps, verbatim quotes with the right source chip, the channels fold; no JS; 390px overflow, 44px targets,
// console errors, network.
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
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 900 } };
const allErrs = [], netReqs = [];
async function open(file = 'method.html', opts = {}, { clock = false, blockStorage = false, js = true } = {}) {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', javaScriptEnabled: js, ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => { errs.push(e.message); allErrs.push(file + ': ' + e.message); });
  p.on('console', m => {
    const where = m.text() + (m.location() && m.location().url || '');
    if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(where)) { errs.push(m.text()); allErrs.push(file + ': ' + m.text()); }
  });
  p.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com/.test(u)) netReqs.push(u); });
  await p.route('**/fonts.g*/**', r => r.abort());
  if (blockStorage) {
    await p.addInitScript(() => {
      const thrower = { get() { throw new Error('storage blocked'); } };
      try { Object.defineProperty(window, 'localStorage', thrower); } catch (e) { /* ignore */ }
      try { Object.defineProperty(window, 'sessionStorage', thrower); } catch (e) { /* ignore */ }
    });
  }
  if (clock) await p.clock.install({ time: new Date('2026-11-20T16:00:00') });
  await p.goto(url(file));
  await p.waitForTimeout(400);
  if (clock) await p.clock.pauseAt(new Date('2026-11-20T16:00:05')); // from here time moves only with runFor
  return { ctx, p, errs };
}
const txt = (p, s) => p.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, s);
const visible = (p, s) => p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }, s);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const state = p => p.evaluate(() => window.YanabeeMeetingTimer.state());
const smallTargets = (p, scope) => p.evaluate(s => [...document.querySelectorAll(s + ' button, ' + s + ' select, ' + s + ' summary, ' + s + ' a.btn, ' + s + ' label:has(input)')]
  .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })
  .filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 - 0.5 || r.width < 44 - 0.5; })
  .map(e => e.textContent.trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)), scope);

// ---------------------------------------------------------------- source ---
console.log('source: privacy and structure');
{
  const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '');
  const mt = read('site/yanabee/js/meeting-timer.js'), pc = read('site/yanabee/js/publish-check.js');
  for (const [n, s] of [['meeting-timer.js', mt], ['publish-check.js', pc]]) {
    check(n + ': no network APIs', !/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s|navigator\.share/.test(s));
    check(n + ': classic IIFE', /^\s*\(function \(\) \{/m.test(s) && !/\bexport\b/.test(s));
  }
  check('meeting-timer.js: every localStorage access is inside try', (mt.match(/localStorage\./g) || []).length === 3 && (mt.match(/try \{ var v = localStorage|try \{ localStorage\./g) || []).length === 3);
  check('meeting-timer.js: storage key yanabee-meeting-timer-v1', /'yanabee-meeting-timer-v1'/.test(mt));
  check('publish-check.js: no storage of any kind', !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(pc));
  const html = fs.readFileSync(path.join(ROOT, 'site/yanabee/method.html'), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  check('method.html: ids are unique', dup.length === 0, dup.join(' '));
  check('method.html loads the two features', /css\/meeting-timer\.css/.test(html) && /css\/publish-check\.css/.test(html) && /js\/meeting-timer\.js" defer/.test(html) && /js\/publish-check\.js" defer/.test(html));
  check('widget sits inside section#m-meeting, after the static table', /<section[^>]*id="m-meeting"[\s\S]*?<table[\s\S]*?<\/table>[\s\S]*?id="mt"[\s\S]*?<\/section>/.test(html.match(/<section[^>]*id="m-meeting"[\s\S]*?<\/section>/)[0]));
  check('publish check sits inside section#m-impact, right after #m-privacy', /id="m-privacy"[\s\S]*?<\/div>\s*<div class="dp-sub pc rv" id="publish-check"/.test(html.match(/<section[^>]*id="m-impact"[\s\S]*?<\/section>/)[0]));
  check('widget ships hidden (revealed by JS)', /<div id="mt" class="mt" hidden data-mt>/.test(html));
  const lead = fs.readFileSync(path.join(ROOT, 'site/yanabee/leaders.html'), 'utf8');
  check('leaders.html: deep link to the 100-minute agenda', /href="method\.html\?mt=l100#mt"[^>]*>[\s\S]*?شغّل هذا اللقاء بالمؤقّت/.test(lead));
  check('leaders.html: deep link to the 30-minute review, after its sentence', /يضاف لقاء تقييم قيادي أسبوعي مدته 30 دقيقة[\s\S]{0,400}href="method\.html\?mt=l30#mt"[\s\S]*?شغّل لقاء التقييم بالمؤقّت/.test(lead));
}

// ------------------------------------------------------------------ data ---
console.log('meeting timer: data and labels');
{
  const { ctx, p, errs } = await open('method.html', PHONE);
  const d = await p.evaluate(() => JSON.parse(document.getElementById('mt-data').textContent));
  const by = Object.fromEntries(d.map(a => [a.id, a]));
  const mins = id => by[id].blocks.map(b => b.min);
  const sum = a => a.reduce((s, x) => s + x, 0);
  check('four agendas m90 l100 l30 q10', d.map(a => a.id).join() === 'm90,l100,l30,q10', d.map(a => a.id).join());
  check('m90 = 10+25+20+20+10+5 = 90', mins('m90').join() === '10,25,20,20,10,5' && sum(mins('m90')) === 90);
  check('l100 = 10+20+45+15+10 = 100', mins('l100').join() === '10,20,45,15,10' && sum(mins('l100')) === 100);
  check('l30 = one block of 30', mins('l30').join() === '30');
  check('q10 = one block of 10', mins('q10').join() === '10');
  check('m90 names and goals verbatim', by.m90.blocks.map(b => b.name).join('|') === 'الاستقبال والمراجعة|التسميع والتلاوة|الفهم والاستنباط|النشاط العملي|المهمة السلوكية|التغذية الراجعة'
    && by.m90.blocks[0].goal === 'الترحيب ومراجعة المهمة السابقة' && by.m90.blocks[5].goal === 'تقييم مختصر وختام وتحفيز');
  check('l100 names verbatim, no goals', by.l100.blocks.map(b => b.name).join('|') === 'مراجعة المهمة السابقة|تعلم مهارة جديدة|ورشة وتطبيق جماعي|محاكاة موقف قيادي|تكليف وتقييم' && by.l100.blocks.every(b => !b.goal));
  check('l30 name is the verbatim substring, the sentence is a note (not a goal)', by.l30.blocks[0].name === 'لقاء تقييم قيادي أسبوعي' && !by.l30.blocks[0].goal
    && by.l30.blocks[0].note === 'يضاف لقاء تقييم قيادي أسبوعي مدته 30 دقيقة، ويمكن عقده حضوريًا أو إلكترونيًا.');
  check('q10 keeps the full label and body', by.q10.blocks[0].name === 'حلقة «المصارحة والقصص الأسبوعية»' && /^تخصيص أول 10 دقائق لسؤال الطلاب/.test(by.q10.blocks[0].note));
  const opts = await p.evaluate(() => [...document.querySelectorAll('#mt-agenda option')].map(o => o.value + '=' + o.textContent));
  check('options are the documents\' labels', JSON.stringify(opts) === JSON.stringify(['m90=نموذج اللقاء الأسبوعي (90 دقيقة)', 'l100=هيكل اللقاء التدريبي (100 دقيقة)', 'l30=لقاء تقييم قيادي أسبوعي مدته 30 دقيقة', 'q10=حلقة «المصارحة والقصص الأسبوعية»']), opts.join(' | '));
  const groups = await p.evaluate(() => [...document.querySelectorAll('#mt-agenda optgroup')].map(g => g.label));
  check('options grouped under the documents\' titles', groups.join('|') === 'منهجية ربط القرآن الكريم بالسلوك والتطبيق|الخطة التنفيذية للمرحلة الثانية|مبادرة «حفظ، فهم، تطبيق»', groups.join('|'));
  check('no date or schedule claim in the widget', await p.evaluate(() => { const c = document.getElementById('mt').cloneNode(true); c.querySelectorAll('script').forEach(s => s.remove()); return !/نوفمبر|ديسمبر|يناير|أسبوعيًا|كل أسبوع/.test(c.textContent); }));
  await ctx.close();
  check('no errors (data)', errs.length === 0, errs.join(' | '));
}

// --------------------------------------------------------------- engine ---
console.log('meeting timer: run a meeting (phone, fake clock)');
{
  const { ctx, p, errs } = await open('method.html', PHONE, { clock: true });
  check('widget visible with JS', await visible(p, '#mt'));
  check('source line shows the method appendix title', (await txt(p, '[data-mt-src]')) === 'منهجية ربط القرآن الكريم بالسلوك والتطبيق');
  check('idle: 10:00, first segment, its goal', (await txt(p, '[data-mt-time]')) === '10:00' && (await txt(p, '[data-mt-name]')) === 'الاستقبال والمراجعة' && (await txt(p, '[data-mt-goal]')) === 'الترحيب ومراجعة المهمة السابقة');
  check('idle: next and elapsed lines', (await txt(p, '[data-mt-next]')) === 'التالي: التسميع والتلاوة (25 د)' && (await txt(p, '[data-mt-elapsed]')) === 'مضى 0 من 90 دقيقة');
  check('segment list = 6 rows with the table\'s durations', (await p.evaluate(() => [...document.querySelectorAll('[data-mt-list] li')].map(li => li.querySelector('.mt-li-dur').textContent).join('|'))) === '10 دقائق|25 دقيقة|20 دقيقة|20 دقيقة|10 دقائق|5 دقائق');
  check('controls disabled before start', await p.evaluate(() => ['[data-mt-prev]', '[data-mt-next-btn]', '[data-mt-add]', '[data-mt-end]'].every(s => document.querySelector(s).disabled)));
  const timeFont = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-mt-time]')).fontSize));
  check('time is at least 64px at 390px', timeFont >= 64, String(timeFont));
  check('time is role=timer, aria-live=off; a separate polite region exists', await p.evaluate(() => { const t = document.querySelector('[data-mt-time]'); const l = document.querySelector('[data-mt-live]'); return t.getAttribute('role') === 'timer' && t.getAttribute('aria-live') === 'off' && l.getAttribute('aria-live') === 'polite'; }));
  check('390px: no horizontal overflow (idle)', (await overflow(p)) <= 0, String(await overflow(p)));
  const small = await smallTargets(p, '#mt');
  check('touch targets ≥ 44px', small.length === 0, small.join(' | '));

  await p.click('[data-mt-start]');
  await p.clock.runFor(65000);
  check('start: 65 s later 08:55 left', (await txt(p, '[data-mt-time]')) === '08:55', await txt(p, '[data-mt-time]'));
  check('start: list marks segment 1 as current', await p.evaluate(() => document.querySelector('[data-mt-list] li:first-child').classList.contains('is-now') && document.querySelector('[data-mt-list] li:first-child').getAttribute('aria-current') === 'step'));
  check('start: live region announced the segment', /الاستقبال والمراجعة/.test(await txt(p, '[data-mt-live]')));
  await p.click('[data-mt-pause]');
  check('pause: label becomes «استأنف», aria-pressed', (await txt(p, '[data-mt-pause-l]')) === 'استأنف' && (await p.getAttribute('[data-mt-pause]', 'aria-pressed')) === 'true');
  await p.clock.runFor(60000);
  check('paused: the clock does not move', (await txt(p, '[data-mt-time]')) === '08:55', await txt(p, '[data-mt-time]'));
  await p.click('[data-mt-pause]');
  await p.clock.runFor(5000);
  check('resume: 08:50 after 5 s more', (await txt(p, '[data-mt-time]')) === '08:50', await txt(p, '[data-mt-time]'));
  check('storage saved under yanabee-meeting-timer-v1', await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('yanabee-meeting-timer-v1')); return s && s.started && s.agenda === 'm90'; }));

  await p.click('[data-mt-next-btn]');
  check('next: segment 2, 25:00, its goal', (await txt(p, '[data-mt-name]')) === 'التسميع والتلاوة' && (await txt(p, '[data-mt-time]')) === '25:00' && (await txt(p, '[data-mt-goal]')) === 'تصحيح التلاوة وتسميع المقرر');
  check('next: actual time of segment 1 recorded (1:10)', (await state(p)).actual[0] === 70000, String((await state(p)).actual[0]));
  check('next: «التالي» line moves on', (await txt(p, '[data-mt-next]')) === 'التالي: الفهم والاستنباط (20 د)');
  check('next: position «الفقرة 2 من 6»', (await txt(p, '[data-mt-pos]')) === 'الفقرة 2 من 6');
  await p.clock.runFor(1000);
  check('elapsed line: 1 of 90 minutes', (await txt(p, '[data-mt-elapsed]')) === 'مضى 1 من 90 دقيقة', await txt(p, '[data-mt-elapsed]'));
  await p.click('[data-mt-add]');
  check('+ دقيقة: 25 → 26 minutes on the current segment', (await txt(p, '[data-mt-time]')) === '25:59' && (await state(p)).added[1] === 1, await txt(p, '[data-mt-time]'));
  check('+ دقيقة: total shows «90 + 1»', (await txt(p, '[data-mt-elapsed]')) === 'مضى 1 من 90 + 1 دقيقة', await txt(p, '[data-mt-elapsed]'));
  check('+ دقيقة: list shows (+1)', /\(\+1\)/.test(await txt(p, '[data-mt-list] li:nth-child(2) .mt-li-dur')));

  await p.clock.runFor(26 * 60000 - 1000 + 12000);
  check('overrun: +00:12, «انتهى وقت الفقرة», no auto-advance', (await txt(p, '[data-mt-time]')) === '+00:12' && await visible(p, '[data-mt-over]') && (await txt(p, '[data-mt-name]')) === 'التسميع والتلاوة', await txt(p, '[data-mt-time]'));
  check('overrun: muted, calm (no animation on the time)', await p.evaluate(() => { const t = document.querySelector('[data-mt-time]'); const cs = getComputedStyle(t); return t.classList.contains('is-over') && cs.animationName === 'none'; }));
  check('overrun: segment end announced once', /انتهى وقت الفقرة: التسميع والتلاوة/.test(await txt(p, '[data-mt-live]')));
  await p.check('[data-mt-opt=auto]');
  await p.clock.runFor(500);
  check('auto-advance: moves on; the next segment started when the last ran out (19:47.5 left)', (await txt(p, '[data-mt-name]')) === 'الفهم والاستنباط' && /^19:4[78]$/.test(await txt(p, '[data-mt-time]')), (await txt(p, '[data-mt-name]')) + ' ' + (await txt(p, '[data-mt-time]')));
  check('auto-advance: the finished segment counts its planned 26:00', (await state(p)).actual[1] === 26 * 60000);
  check('auto-advance: goal, «التالي» and list follow', (await txt(p, '[data-mt-goal]')) === 'شرح المعاني واستخراج القيمة التربوية' && (await txt(p, '[data-mt-next]')) === 'التالي: النشاط العملي (20 د)'
    && await p.evaluate(() => document.querySelector('[data-mt-list] li:nth-child(3)').classList.contains('is-now')));
  await p.uncheck('[data-mt-opt=auto]');

  // keyboard (RTL: ← is forward)
  await p.focus('[data-mt-stage]');
  await p.keyboard.press('Space');
  check('keyboard: Space pauses', (await state(p)).pausedAt != null);
  await p.keyboard.press('Space');
  check('keyboard: Space resumes', (await state(p)).pausedAt == null);
  await p.keyboard.press('ArrowLeft');
  check('keyboard: ← goes to the next segment', (await state(p)).idx === 3, String((await state(p)).idx));
  await p.keyboard.press('ArrowRight');
  check('keyboard: → goes back', (await state(p)).idx === 2);
  await p.click('[data-mt-prev]');
  check('previous: back to segment 2 with its time kept (26:00 used → +00:00)', (await state(p)).idx === 1 && (await txt(p, '[data-mt-time]')) === '+00:00', await txt(p, '[data-mt-time]'));
  check('390px: no horizontal overflow (running)', (await overflow(p)) <= 0);

  // change agenda while running: confirm
  let asked = '';
  p.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await p.selectOption('#mt-agenda', 'l100');
  await p.waitForTimeout(50);
  check('agenda change while running asks first; «لا» keeps the meeting', asked === 'سيُلغى اللقاء الحالي، متابعة؟' && (await p.inputValue('#mt-agenda')) === 'm90' && (await state(p)).started, asked);

  // end
  p.once('dialog', d => d.accept());
  await p.click('[data-mt-end]');
  check('end: summary shown, run hidden', await visible(p, '[data-mt-sum]') && !(await visible(p, '[data-mt-run]')));
  const sum = await p.evaluate(() => ({
    head: [...document.querySelectorAll('[data-mt-sum-head] th')].map(e => e.textContent),
    rows: [...document.querySelectorAll('[data-mt-sum-body] tr')].map(r => [...r.children].map(c => c.textContent)),
    foot: [...document.querySelectorAll('[data-mt-sum-foot] tr > *')].map(c => c.textContent),
    meta: document.querySelector('[data-mt-sum-meta]').textContent,
  }));
  check('summary columns: المكون · المدة · الفعلي', sum.head.join('|') === 'المكون|المدة|الفعلي', sum.head.join('|'));
  check('summary: 6 rows with planned minutes from the table', sum.rows.length === 6 && sum.rows[0][1] === '10 دقائق' && sum.rows[1][1] === '25 دقيقة (+1 د)' && sum.rows[5][1] === '5 دقائق', JSON.stringify(sum.rows));
  check('summary: actual times recorded', sum.rows[0][2] === '01:10' && sum.rows[1][2] === '26:00' && sum.rows[3][2] === '—', JSON.stringify(sum.rows.map(r => r[2])));
  check('summary: total 90 + 1 minutes', sum.foot[0] === 'المجموع' && sum.foot[1] === '90 + 1 دقيقة', sum.foot.join('|'));
  check('summary names the agenda', sum.meta.startsWith('نموذج اللقاء الأسبوعي (90 دقيقة)'));
  check('390px: no horizontal overflow (summary)', (await overflow(p)) <= 0);

  // print: local fallback (no comp.js on this page)
  await p.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.className); });
  await p.click('[data-mt-print]');
  const printed = await p.evaluate(() => window.__printed);
  check('print: body has print-meeting-timer while printing', printed.length === 1 && /\bprint-meeting-timer\b/.test(printed[0]), JSON.stringify(printed));
  await p.emulateMedia({ media: 'print' });
  const pv = await p.evaluate(() => ({
    sum: getComputedStyle(document.querySelector('[data-mt-sum]')).display,
    intro: getComputedStyle(document.getElementById('m-intro')).display,
    table: getComputedStyle(document.querySelector('#m-meeting .tbl-wrap')).display,
    btns: getComputedStyle(document.querySelector('.mt-sum-btns')).display,
    pick: getComputedStyle(document.querySelector('.mt-top')).display,
  }));
  check('print media: only the summary', pv.sum !== 'none' && pv.intro === 'none' && pv.table === 'none' && pv.btns === 'none' && pv.pick === 'none', JSON.stringify(pv));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('print: class removed after printing', !(await p.evaluate(() => document.body.classList.contains('print-meeting-timer'))));
  const pv2 = await p.evaluate(() => ({ mt: getComputedStyle(document.getElementById('mt')).display, table: getComputedStyle(document.querySelector('#m-meeting .tbl-wrap')).display }));
  check('whole-page print: live widget left out, static table kept', pv2.mt === 'none' && pv2.table !== 'none', JSON.stringify(pv2));
  await p.emulateMedia({ media: 'screen' });
  // print through the shared helper when a page provides it
  await p.evaluate(() => { window.__calls = []; window.__yanabeePrintOnly = c => window.__calls.push(c); });
  await p.click('[data-mt-print]');
  check('print: uses window.__yanabeePrintOnly when present', (await p.evaluate(() => window.__calls.join())) === 'print-meeting-timer');

  await p.click('[data-mt-new]');
  const fresh = await state(p);
  check('new meeting: cleared, start button back, same agenda', !fresh.started && !fresh.done && fresh.actual.every(x => x === 0) && await visible(p, '[data-mt-start]') && (await txt(p, '[data-mt-time]')) === '10:00');
  // agenda change when idle: no confirm
  await p.selectOption('#mt-agenda', 'q10');
  check('idle agenda change: q10 one block, list and prev/next hidden, note shown', (await txt(p, '[data-mt-name]')) === 'حلقة «المصارحة والقصص الأسبوعية»'
    && (await txt(p, '[data-mt-time]')) === '10:00' && !(await visible(p, '[data-mt-list]')) && !(await visible(p, '[data-mt-prev]'))
    && /^تخصيص أول 10 دقائق/.test(await txt(p, '[data-mt-goal]')) && (await txt(p, '[data-mt-src]')) === 'مبادرة «حفظ، فهم، تطبيق»');
  await p.click('[data-mt-start]');
  await p.clock.runFor(10 * 60000 + 3000);
  check('one-block agenda: overrun at the end, no auto end', (await txt(p, '[data-mt-time]')) === '+00:03' && !(await state(p)).done);
  p.once('dialog', d => d.accept());
  await p.click('[data-mt-end]');
  const qsum = await p.evaluate(() => [...document.querySelectorAll('[data-mt-sum-head] th')].map(e => e.textContent).join('|'));
  check('one-block summary: generic columns', qsum === 'الفقرة|المدة|الفعلي', qsum);
  await ctx.close();
  check('no errors (engine)', errs.length === 0, errs.join(' | '));
}

console.log('meeting timer: reload resumes (real clock)');
{
  const { ctx, p, errs } = await open('method.html', PHONE);
  await p.click('[data-mt-start]');
  await p.click('[data-mt-next-btn]');
  await p.click('[data-mt-add]');
  await p.waitForTimeout(1200);
  await p.reload();
  await p.waitForTimeout(500);
  const s = await state(p);
  const tm = await txt(p, '[data-mt-time]');
  check('reload: same agenda, segment, added minute, still running', s.agenda === 'm90' && s.idx === 1 && s.added[1] === 1 && s.started && s.pausedAt == null, JSON.stringify(s));
  check('reload: time kept running (25:5x)', /^25:5\d$/.test(tm), tm);
  check('reload: stop / pause button shown, start hidden', await visible(p, '[data-mt-pause]') && !(await visible(p, '[data-mt-start]')));
  await ctx.close();
  check('no errors (reload)', errs.length === 0, errs.join(' | '));
}

console.log('meeting timer: deep links');
{
  const { ctx, p, errs } = await open('method.html?mt=l100#mt', PHONE);
  check('?mt=l100 preselects the 100-minute agenda', (await p.inputValue('#mt-agenda')) === 'l100' && (await txt(p, '[data-mt-name]')) === 'مراجعة المهمة السابقة'
    && (await txt(p, '[data-mt-elapsed]')) === 'مضى 0 من 100 دقيقة' && (await p.locator('[data-mt-list] li').count()) === 5);
  check('?mt=l100: source = leaders plan title', (await txt(p, '[data-mt-src]')) === 'الخطة التنفيذية للمرحلة الثانية');
  check('?mt=l100: no goal line (the table has none)', !(await visible(p, '[data-mt-goal]')));
  check('#mt scrolled into view', await p.evaluate(() => { const r = document.getElementById('mt').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  await p.goto(url('method.html?mt=l30#mt'));
  await p.waitForTimeout(300);
  check('?mt=l30: one block 30:00 with the sentence as a note', (await p.inputValue('#mt-agenda')) === 'l30' && (await txt(p, '[data-mt-time]')) === '30:00'
    && (await txt(p, '[data-mt-name]')) === 'لقاء تقييم قيادي أسبوعي' && (await txt(p, '[data-mt-goal]')) === 'يضاف لقاء تقييم قيادي أسبوعي مدته 30 دقيقة، ويمكن عقده حضوريًا أو إلكترونيًا.');
  // a running meeting is never cancelled by a deep link
  await p.click('[data-mt-start]');
  await p.goto(url('method.html?mt=m90#mt'));
  await p.waitForTimeout(300);
  check('deep link does not cancel a running meeting', (await p.inputValue('#mt-agenda')) === 'l30' && (await state(p)).started);
  await p.goto(url('leaders.html'));
  await p.waitForTimeout(300);
  check('leaders.html at 390px: no horizontal overflow with the links', (await overflow(p)) <= 0);
  check('leaders.html: the links are ≥ 44px tall', await p.evaluate(() => [...document.querySelectorAll('a[href^="method.html?mt="]')].every(a => a.getBoundingClientRect().height >= 44)));
  await p.click('a[href="method.html?mt=l100#mt"]');
  await p.waitForURL(/method\.html\?mt=l100/);
  await p.waitForTimeout(500);
  check('leaders → method link opens the timer (running meeting kept)', (await p.inputValue('#mt-agenda')) === 'l30');
  await ctx.close();
  check('no errors (deep links)', errs.length === 0, errs.join(' | '));
}

console.log('meeting timer: storage blocked');
{
  const { ctx, p, errs } = await open('method.html?mt=l100', PHONE, { clock: true, blockStorage: true });
  check('works without storage: visible, preselected', await visible(p, '#mt') && (await p.inputValue('#mt-agenda')) === 'l100');
  await p.click('[data-mt-start]');
  await p.clock.runFor(30000);
  await p.click('[data-mt-next-btn]');
  p.once('dialog', d => d.accept());
  await p.click('[data-mt-end]');
  check('storage blocked: a whole meeting runs to the summary', await visible(p, '[data-mt-sum]') && (await p.locator('[data-mt-sum-body] tr').count()) === 5);
  await ctx.close();
  check('no errors (storage blocked)', errs.length === 0, errs.join(' | '));
}

// --------------------------------------------------------- publish check ---
console.log('publish check: phone');
{
  const { ctx, p, errs } = await open('method.html', PHONE);
  const st = () => p.evaluate(() => [...document.querySelectorAll('[data-pc-step]')].map(li => li.dataset.state).join(','));
  const shown = () => p.evaluate(() => [...document.querySelectorAll('[data-pc-step]')].filter(li => getComputedStyle(li).display !== 'none').map(li => li.dataset.pcStep).join(','));
  const resShown = () => p.evaluate(() => [...document.querySelectorAll('[data-pc-res]')].filter(r => !r.hidden).map(r => r.dataset.pcRes).join(','));
  check('title', (await txt(p, '#pc-h')) === 'قبل أن تنشر: افحص المادة');
  check('phone: one question at a time', (await shown()) === '1' && (await st()) === 'cur,later,later', await shown());
  check('static next-step block hidden with JS', !(await visible(p, '[data-pc-static]')));
  check('result region is aria-live polite', (await p.getAttribute('[data-pc-result]', 'aria-live')) === 'polite');
  // quotes and sources
  const q = await p.evaluate(() => [...document.querySelectorAll('#publish-check .pc-quote')].map(b => [b.querySelector('.pc-src').textContent, b.querySelector('p').textContent.replace(/\s+/g, ' ').trim()]));
  const has = (src, line) => q.some(([s, l]) => s === src && l === line);
  check('Q1 quote: the child-protection line, whole, from the method appendix', has('من ملحق المنهجية', 'ضوابط حماية الطفل والخصوصية: لا يُنشر أي محتوى يُعرّف بطفل دون موافقة كتابية صريحة من ولي أمره، مع التركيز على الأنشطة والمنتجات بدلًا من الوجوه عند الحاجة.'));
  check('Q2 quotes: prior consent (method), one copy per minor + k-photo (competition), media documenter row (method)',
    has('من ملحق المنهجية', 'الموافقة المسبقة: الحصول على موافقة كتابية صريحة من ولي الأمر قبل نشر صور الأطفال أو مقاطعهم.')
    && has('من ملف المسابقة', 'تُملأ نسخة منفصلة لكل مشارك قاصر، وتُحفظ لدى إدارة المسابقة.')
    && has('من ملف المسابقة', 'اختيارات التصوير والنشر – مستقلة عن المشاركة أوافق على تصوير المشارك واستخدام صوره ومقاطعه في توثيق ونشر أنشطة المسابقة عبر قنوات الجمعية الرسمية المحددة.')
    && has('من ملحق المنهجية', 'الموثق الإعلامي — توثيق الأنشطة بالصور أو الفيديو وفق الإذن المسبق والضوابط المعتمدة وإعداد المواد للعرض البصري'));
  check('Q3 quote: safe use (method)', has('من ملحق المنهجية', 'الاستخدام الآمن: النشر فقط عبر القنوات المغلقة والمعتمدة من إدارة البرنامج.'));
  check('approval row quoted from the competition file', has('من ملف المسابقة', 'اعتماد المواد للنشر — يعرض مسؤول التوثيق المواد على المشرف ثم المسؤول المعتمد في إدارة المشروع'));
  check('«مسؤول التوثيق» and «الموثق الإعلامي» only inside quotes', await p.evaluate(() => {
    const c = document.getElementById('publish-check').cloneNode(true);
    c.querySelectorAll('.pc-quote').forEach(e => e.remove());
    return !/مسؤول التوثيق|الموثق الإعلامي/.test(c.textContent);
  }));
  check('warning line always visible', await visible(p, '.pc-warn') && (await txt(p, '.pc-warn')) === 'تنبيه: لا تُنشر صور أو بيانات المشاركين القاصرين دون الموافقات اللازمة، مع مراعاة السلامة والخصوصية.');
  check('consent form link', (await p.getAttribute('#pc-s2 a', 'href')) === 'register.html#c-consent');

  await p.click('#pc-s1 [data-pc-ans=yes]');
  check('Q1 نعم → Q2 asked, focus on it', (await st()) === 'done,cur,later' && (await shown()) === '1,2' && (await p.evaluate(() => document.activeElement.id)) === 'pc-q2');
  check('aria-pressed on the chosen answer', (await p.getAttribute('#pc-s1 [data-pc-ans=yes]', 'aria-pressed')) === 'true' && (await p.getAttribute('#pc-s1 [data-pc-ans=no]', 'aria-pressed')) === 'false');
  await p.click('#pc-s2 [data-pc-ans=no]');
  check('Q2 لا → stop: missing consent, Q3 not asked', (await resShown()) === 'consent' && (await st()) === 'done,done,skip' && !(await shown()).includes('3'));
  const cr = await txt(p, '[data-pc-res=consent]');
  check('consent result: message + prior-consent rule + edit hint with the child line', /لا تُنشر بعد: تنقص الموافقة الكتابية من ولي الأمر\./.test(cr) && /الموافقة المسبقة/.test(cr)
    && /يمكنك تعديل المادة ثم إعادة الفحص من البداية\./.test(cr) && /ضوابط حماية الطفل والخصوصية/.test(cr) && !/الخطوة التالية/.test(cr));
  check('focus moves to the result heading', await p.evaluate(() => document.activeElement.classList.contains('pc-res-h')));
  check('390px: no horizontal overflow (result)', (await overflow(p)) <= 0);
  await p.click('#pc-s2 [data-pc-ans=yes]');
  check('changing Q2 to نعم clears the stop, asks Q3', (await resShown()) === '' && (await st()) === 'done,done,cur');
  await p.click('#pc-s3 [data-pc-ans=no]');
  check('Q3 لا → stop: channel not in the rules (+ safe-use rule)', (await resShown()) === 'channel' && /لا تُنشر بعد: القناة غير مذكورة في الضوابط\./.test(await txt(p, '[data-pc-res=channel]')) && /الاستخدام الآمن/.test(await txt(p, '[data-pc-res=channel]')));
  await p.click('#pc-s3 [data-pc-ans=yes]');
  const nx = await txt(p, '[data-pc-res=next]');
  check('all yes → next step: the cd4 approval row, then the supervisor row', (await resShown()) === 'next' && /^الخطوة التالية قبل النشر:/.test(nx)
    && nx.indexOf('اعتماد المواد للنشر') < nx.indexOf('المشرف التربوي — مراجعة جودة الأنشطة والتقارير، اعتماد النشر، حماية الخصوصية، والمتابعة التربوية'));
  check('the tool never states its own approval', await p.evaluate(() => [...document.querySelectorAll('#publish-check .pc-res-h, #publish-check .pc-intro, #publish-check .pc-hint, #publish-check .pc-q, #publish-check button')]
    .every(e => !/مسموح|يجوز|معتمد(?!ة من إدارة البرنامج)/.test(e.textContent))));
  await p.click('#pc-s1 [data-pc-ans=no]');
  check('Q1 لا → Q2 skipped, Q3 asked', (await st()) === 'done,skip,cur' && (await resShown()) === '' && (await shown()) === '1,3');
  await p.click('#pc-s3 [data-pc-ans=yes]');
  check('Q1 لا + Q3 نعم → next step', (await resShown()) === 'next');
  await p.click('[data-pc-reset]');
  check('reset: back to Q1, focus on it, nothing pressed', (await st()) === 'cur,later,later' && (await resShown()) === '' && (await p.evaluate(() => document.activeElement.id)) === 'pc-q1'
    && (await p.evaluate(() => document.querySelectorAll('#publish-check [aria-pressed=true]').length)) === 0);
  // fold
  await p.click('.pc-fold summary');
  const fold = await p.evaluate(() => [...document.querySelectorAll('.pc-fold .pc-quote')].map(b => b.querySelector('.pc-src').textContent + '|' + b.querySelector('p').textContent.replace(/\s+/g, ' ').trim()));
  check('fold «سطور تحتاج قرار الإدارة»: Telegram, Instagram, content making, k-photo, safe use — side by side', fold.length === 5
    && /^من ملحق المنهجية\|قناة تيليجرام تفاعلية:/.test(fold[0]) && /^من ملحق المنهجية\|حساب إنستجرام:/.test(fold[1])
    && /^من ملف المسابقة\|صناعة المحتوى: توثيق الأنشطة والتفاعل المجتمعي ونشرها على منصات التواصل الاجتماعي\.$/.test(fold[2])
    && /^من ملف المسابقة\|.*عبر قنوات الجمعية الرسمية المحددة\.$/.test(fold[3]) && /^من ملحق المنهجية\|الاستخدام الآمن:/.test(fold[4]), fold.join(' || '));
  check('390px: no horizontal overflow (fold open)', (await overflow(p)) <= 0);
  const small = await smallTargets(p, '#publish-check');
  check('touch targets ≥ 44px', small.length === 0, small.join(' | '));
  check('no storage written by the check', await p.evaluate(() => Object.keys(localStorage).every(k => !/publish/.test(k))));
  await ctx.close();
  check('no errors (publish check, phone)', errs.length === 0, errs.join(' | '));
}

console.log('publish check: desktop');
{
  const { ctx, p, errs } = await open('method.html', DESK);
  const vis = await p.evaluate(() => [...document.querySelectorAll('[data-pc-step]')].filter(li => getComputedStyle(li).display !== 'none').length);
  check('desktop: all three steps at once', vis === 3);
  check('desktop: steps not reached yet are not answerable', await p.evaluate(() => document.querySelector('#pc-s2 [data-pc-ans=yes]').disabled && document.querySelector('#pc-s3 [data-pc-ans=yes]').disabled && !document.querySelector('#pc-s1 [data-pc-ans=yes]').disabled));
  await p.click('#pc-s1 [data-pc-ans=no]');
  check('desktop: Q1 لا shows Q2 as «لا ينطبق»', await visible(p, '#pc-s2 [data-pc-skip]') && !(await visible(p, '#pc-s2 [data-pc-ans=yes]')));
  check('1280: no horizontal overflow', (await overflow(p)) <= 0);
  check('media section points to the check', (await p.getAttribute('#m-media .pc-jump a', 'href')) === '#publish-check');
  await ctx.close();
  check('no errors (desktop)', errs.length === 0, errs.join(' | '));
}

console.log('no JavaScript');
{
  const { ctx, p } = await open('method.html', PHONE, { js: false });
  check('no JS: timer hidden, static bar and table shown', !(await visible(p, '#mt')) && await visible(p, '#m-meeting .segbar') && await visible(p, '#m-meeting table'));
  check('no JS: checklist readable (3 questions + quotes + next step), no dead buttons', (await p.evaluate(() => [...document.querySelectorAll('[data-pc-step]')].filter(li => li.offsetHeight > 0).length)) === 3
    && await visible(p, '[data-pc-static]') && !(await visible(p, '[data-pc-yn]')) && !(await visible(p, '[data-pc-reset]')));
  check('no JS: 390px no overflow', (await overflow(p)) <= 0);
  await ctx.close();
}

console.log('dark theme');
{
  const { ctx, p, errs } = await open('method.html', { ...PHONE, colorScheme: 'dark' });
  const c = await p.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.getElementById('mt')).backgroundColor, pc: getComputedStyle(document.getElementById('publish-check')).backgroundColor }));
  check('dark: widget surfaces follow the tokens', c.theme === 'dark' && c.bg !== 'rgb(255, 255, 255)' && c.pc !== 'rgb(255, 255, 255)', JSON.stringify(c));
  await ctx.close();
  check('no errors (dark)', errs.length === 0, errs.join(' | '));
}

await browser.close();
check('no network requests (other than the site\'s web fonts, aborted)', netReqs.length === 0, netReqs.join(' '));
check('no console errors anywhere', allErrs.length === 0, allErrs.join(' | '));
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('FAILURES:\n- ' + fails.join('\n- ')); process.exit(1); }
