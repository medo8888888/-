// Browser test of the 'comp-plan' bundle on competition.html: calendar-ics (#ics in #c-timeline) and ad-maker (#c-ad).
//   python3 tools/yanabee/build.py && node tools/yanabee/test-feat-comp-plan.mjs
// Covers: markup + no-JS, every interaction and computed result (the documents' dates, the generated .ics: CRLF, 75-octet
// folding, escaping, exclusive DTEND, stable UIDs, the weekly RRULE), past events unchecked by the visitor's date, the
// fallback text, live filling of the announcement's two blanks, plain-text copy (no duplicated sub-items, LRI/PDI around
// the number), copy fallbacks, reset, storage kept / blocked, print modes (window.print stubbed), 390px phone (no
// overflow, 44px targets), unique ids, no console errors, no network requests.
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

// the document itself (the only source of facts)
const DOC = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8').split('\n');
const line = re => { const l = DOC.find(x => re.test(x)); if (!l) throw new Error('doc line not found: ' + re); return l; };
const TL = n => line(new RegExp('^- ' + n + ':')).slice(2); // a c-timeline item without its bullet
const body = s => s.slice(s.indexOf(':') + 1).trim();
const ROW = name => line(new RegExp('^\\| ' + name + ' \\|')).split('|').map(c => c.trim()).filter(Boolean);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const ALLOWED = u => /^(file|data|blob|about):/.test(u) || /fonts\.(googleapis|gstatic)\.com/.test(u);

async function open(opts = {}) {
  const { viewport = { width: 1440, height: 900 }, now = '2026-11-20T10:00:00', blockStorage = false, js = true, theme, ...rest } = opts;
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', javaScriptEnabled: js, acceptDownloads: true, ...rest });
  const p = await ctx.newPage();
  const errs = [], net = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  p.on('request', r => { if (!ALLOWED(r.url())) net.push(r.url()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  if (now && js) await p.clock.setFixedTime(new Date(now));
  await p.addInitScript(([block, th]) => {
    try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ }
    if (th) try { localStorage.setItem('yanabee-theme', th); } catch (e) { /* ignore */ }
    window.__printed = [];
    window.print = () => { window.__printed.push(document.body.className); };
    if (block) {
      const thrower = { get() { throw new Error('storage blocked'); } };
      Object.defineProperty(window, 'localStorage', thrower);
    }
  }, [blockStorage, theme || '']);
  await p.goto(url('competition.html'));
  await p.waitForTimeout(400);
  return { ctx, p, errs, net };
}
const text = (p, s) => p.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, s);
const visible = (p, s) => p.evaluate(sel => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, s);
const display = (p, s) => p.evaluate(sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : null; }, s);
const checked = p => p.evaluate(() => [...document.querySelectorAll('#ics .ics-cb')].map(b => b.checked));
async function download(p) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-ics-dl]')]);
  const f = await d.path();
  return { name: d.suggestedFilename(), raw: fs.readFileSync(f, 'utf8') };
}
const unfold = raw => raw.replace(/\r\n /g, '');
const unesc = s => s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
const vevents = raw => unfold(raw).split('BEGIN:VEVENT').slice(1).map(b => {
  const o = {};
  b.split('\r\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1); });
  return o;
});

// expected events, in date order, straight from the document
const P = 'مشروع ينابيع';
const EXPECT = [
  ['yanabee-c-timeline-1@yanabee.local', '20261101', '20261115', P + ' — 1 – 14 نوفمبر', body(TL('1 – 14 نوفمبر'))],
  ['yanabee-c-terms-start@yanabee.local', '20261115', '20261116', P + ' — بداية المسابقة', 'بداية المسابقة: ' + ROW('بداية المسابقة')[1]],
  ['yanabee-c-timeline-2@yanabee.local', '20261115', '20261201', P + ' — 15 – 30 نوفمبر', body(TL('15 – 30 نوفمبر'))],
  ['yanabee-c-timeline-3@yanabee.local', '20261201', '20270101', P + ' — 1 – 31 ديسمبر', body(TL('1 – 31 ديسمبر'))],
  ['yanabee-c-timeline-4@yanabee.local', '20270101', '20270116', P + ' — 1 – 15 يناير', body(TL('1 – 15 يناير'))],
  ['yanabee-c-timeline-5@yanabee.local', '20270115', '20270125', P + ' — 15 – 24 يناير', body(TL('15 – 24 يناير'))],
  ['yanabee-c-terms-end@yanabee.local', '20270125', '20270126', P + ' — نهاية المسابقة', 'نهاية المسابقة: ' + ROW('نهاية المسابقة')[1]],
  ['yanabee-c-timeline-6@yanabee.local', '20270125', '20270131', P + ' — 25 – 30 يناير', body(TL('25 – 30 يناير'))],
  ['yanabee-c-terms-gala@yanabee.local', '20270131', '20270201', P + ' — حفل الجوائز', 'حفل الجوائز: ' + ROW('حفل الجوائز')[1]],
];
const WK = ROW('المتابعة');

// ------------------------------------------------------------------------------------------------ static
console.log('markup');
{
  const html = fs.readFileSync(path.join(ROOT, 'site/yanabee/competition.html'), 'utf8');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  check('unique ids on competition.html', dup.length === 0, dup.join(','));
  check('assets loaded', ['css/calendar-ics.css', 'js/calendar-ics.js', 'css/ad-maker.css', 'js/ad-maker.js'].every(a => html.includes(a)));
  check('calendar block sits inside #c-timeline after the timeline', /id="c-timeline">[\s\S]*?<\/ol>\s*<div class="ics"/.test(html));
  check('ad-maker panel before the poster tools', html.indexOf('data-ad-maker') < html.indexOf('data-print-poster') && html.indexOf('data-ad-maker') > html.indexOf('id="c-ad"'));
  check('blank spans wrapped once', (html.match(/data-ad-kind>/g) || []).length === 1 && (html.match(/data-ad-org>/g) || []).length === 1 && (html.match(/<bdi data-ad-wa>\[رقم الواتساب\]<\/bdi>/g) || []).length === 1);
  check('c-decisions row shown verbatim', html.includes('اعتماد رابط التسجيل ورقم التواصل') && html.includes('بعد استكمال الموافقات'));
  for (const f of ['js/calendar-ics.js', 'js/ad-maker.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'site/yanabee', f), 'utf8').replace(/\/\/.*$/gm, '');
    check(f + ': classic IIFE, no network APIs or links', /^\(function \(\) \{/m.test(src) && !/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:|wa\.me|\bimport\b|\bexport\b/.test(src));
    check(f + ': every storage access guarded', (src.match(/localStorage\.\w+/g) || []).length === (src.match(/try \{ window\.localStorage/g) || []).length + (src.match(/var s = window\.localStorage/g) || []).length);
  }
}

console.log('no JavaScript');
{
  const { ctx, p } = await open({ js: false, now: null });
  check('calendar panel stays hidden', !(await visible(p, '#ics')));
  check('ad-maker panel stays hidden', !(await visible(p, '#ad-maker')));
  check('poster lead reads as before', (await text(p, '.poster-lead')).startsWith('تعلن جمعية / مدرسة .................. عن فتح باب التسجيل'));
  check('timeline still complete', (await p.$$eval('[data-timeline] .tl-step', l => l.length)) === 7);
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------ calendar
console.log('calendar-ics: list and defaults (visitor date 20 Nov 2026)');
{
  const { ctx, p, errs, net } = await open();
  check('panel revealed', await visible(p, '#ics'));
  const rows = await p.$$eval('#ics .ics-cb', l => l.map(b => [b.value, b.closest('.ics-row').querySelector('b').textContent]));
  check('9 events in date order with stable UIDs', JSON.stringify(rows.map(r => r[0])) === JSON.stringify(EXPECT.map(e => e[0])), rows.map(r => r[0]).join(' '));
  check('labels are the document labels', rows.map(r => r[1]).join('|') === '1 – 14 نوفمبر|بداية المسابقة|15 – 30 نوفمبر|1 – 31 ديسمبر|1 – 15 يناير|15 – 24 يناير|نهاية المسابقة|25 – 30 يناير|حفل الجوائز');
  check('«قبل 1 نوفمبر» is not an event', !rows.some(r => r[1].includes('قبل')));
  check('past events unchecked by default, the rest checked', JSON.stringify(await checked(p)) === JSON.stringify([false, false, true, true, true, true, true, true, true]));
  const past = await p.$$eval('#ics .ics-past', l => l.map(e => !e.hidden));
  check('«انتهى» on ended events only', JSON.stringify(past) === JSON.stringify([true, true, false, false, false, false, false, false, false]));
  check('status counts 7', (await text(p, '[data-ics-status]')) === 'سيضم الملف 7 مواعيد.');
  check('status is aria-live', (await p.getAttribute('[data-ics-status]', 'aria-live')) === 'polite');
  check('note about all-day events', (await text(p, '.ics-note')) === 'المواعيد طوال اليوم؛ الوثيقة لا تذكر ساعات.');
  check('fallback hidden before a download', !(await visible(p, '[data-ics-fb]')));

  console.log('calendar-ics: the file');
  await p.click('[data-ics-all]');
  check('select all -> 9', (await text(p, '[data-ics-status]')) === 'سيضم الملف 9 مواعيد.');
  const { name, raw } = await download(p);
  check('file name', name === 'yanabee-competition.ics');
  check('CRLF line endings only', !/[^\r]\n/.test(raw) && raw.endsWith('\r\n'));
  check('header', raw.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Yanabee//AR\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n') && raw.endsWith('END:VCALENDAR\r\n'));
  const long = raw.split('\r\n').filter(l => Buffer.byteLength(l, 'utf8') > 75);
  check('no physical line over 75 octets', long.length === 0, long[0]);
  check('folding never splits a character', !raw.includes('�') && raw.split('\r\n').slice(1).every(l => l === '' || /^[A-Z ]/.test(l)));
  check('long lines really folded', raw.includes('\r\n '));
  const ev = vevents(raw);
  check('9 VEVENTs (6 timeline + 3 terms)', ev.length === 9 && ev.filter(e => e.UID.includes('c-timeline')).length === 6 && ev.filter(e => e.UID.includes('c-terms')).length === 3);
  let allOk = true;
  EXPECT.forEach(([uid, s, e, sum, desc], i) => {
    const v = ev[i];
    const ok = v && v.UID === uid && v['DTSTART;VALUE=DATE'] === s && v['DTEND;VALUE=DATE'] === e && unesc(v.SUMMARY) === sum && unesc(v.DESCRIPTION) === desc
      && v.TRANSP === 'TRANSPARENT' && /^\d{8}T\d{6}Z$/.test(v.DTSTAMP);
    if (!ok) { allOk = false; console.log('     event', i, JSON.stringify(v)); }
  });
  check('every event: UID, dates, SUMMARY, verbatim DESCRIPTION, DTSTAMP', allOk);
  check('DTEND exclusive: 31 Dec -> 20270101', ev[3]['DTEND;VALUE=DATE'] === '20270101');
  check('no RRULE without a weekday', !raw.includes('RRULE'));
  check('TEXT escaping (\\, ; , newline) is applied', await p.evaluate(() => {
    const ta = document.querySelector('#ics-text'); return !!ta && ta.value.length > 0;
  }) && !/[^\\],/.test(unfold(raw).split('\r\n').filter(l => /^(SUMMARY|DESCRIPTION):/.test(l)).join('')));
  check('fallback offered after the click, closed', await p.evaluate(() => { const d = document.querySelector('[data-ics-fb]'); return !d.hidden && !d.open; }));
  const ta = await p.inputValue('#ics-text');
  check('fallback text = the file (same events; a textarea shows LF)', ta.replace(/DTSTAMP:\S+/g, '') === raw.replace(/\r\n/g, '\n').replace(/DTSTAMP:\S+/g, ''));
  check('download status', (await text(p, '[data-ics-status]')).includes('yanabee-competition.ics'));

  console.log('calendar-ics: weekly meeting');
  await p.selectOption('[data-ics-wd]', '0');
  check('weekly row shown', await visible(p, '[data-ics-wkrow]'));
  check('hint: first Sunday on/after 15 Nov', (await text(p, '[data-ics-wkhint]')) === 'أول لقاء في الملف: الأحد 15 نوفمبر 2026، ثم كل أسبوع حتى 25 يناير 2027.');
  check('status counts 10', (await text(p, '[data-ics-status]')) === 'سيضم الملف 10 مواعيد.');
  let w = vevents((await download(p)).raw).find(e => e.RRULE);
  check('RRULE event (Sunday)', w && w.UID === 'yanabee-c-terms-weekly@yanabee.local' && w['DTSTART;VALUE=DATE'] === '20261115' && w['DTEND;VALUE=DATE'] === '20261116' && w.RRULE === 'FREQ=WEEKLY;UNTIL=20270125', JSON.stringify(w));
  check('weekly SUMMARY/DESCRIPTION verbatim', w && unesc(w.SUMMARY) === P + ' — ' + WK[1] && unesc(w.DESCRIPTION) === WK[0] + ': ' + WK[1]);
  await p.selectOption('[data-ics-wd]', '3');
  w = vevents((await download(p)).raw).find(e => e.RRULE);
  check('Wednesday -> 18 Nov 2026, DTEND +1', w && w['DTSTART;VALUE=DATE'] === '20261118' && w['DTEND;VALUE=DATE'] === '20261119');
  check('hint follows (Wednesday)', (await text(p, '[data-ics-wkhint]')).startsWith('أول لقاء في الملف: الأربعاء 18 نوفمبر 2026'));
  await p.selectOption('[data-ics-wd]', '6');
  w = vevents((await download(p)).raw).find(e => e.RRULE);
  check('Saturday -> 21 Nov 2026', w && w['DTSTART;VALUE=DATE'] === '20261121');
  check('weekday tag on the row', (await text(p, '[data-ics-wkday]')) === 'كل السبت');

  console.log('calendar-ics: selection and storage');
  await p.click('[data-ics-none]');
  check('none + weekday -> 1, still downloadable', (await text(p, '[data-ics-status]')) === 'سيضم الملف موعدًا واحدًا.' && !(await p.isDisabled('[data-ics-dl]')));
  await p.selectOption('[data-ics-wd]', '');
  check('nothing chosen -> buttons disabled', (await text(p, '[data-ics-status]')) === 'لم تحدّد أي موعد بعد.' && await p.isDisabled('[data-ics-dl]') && await p.isDisabled('[data-ics-print]'));
  check('weekly row hidden again', !(await visible(p, '[data-ics-wkrow]')));
  await p.click('[data-ics-all]');
  await p.locator('#ics .ics-cb').nth(3).uncheck();
  await p.selectOption('[data-ics-wd]', '2');
  check('2 selected -> 9 incl. weekly', (await text(p, '[data-ics-status]')) === 'سيضم الملف 9 مواعيد.');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-calendar-ics-v1')));
  check('stored under yanabee-calendar-ics-v1', stored && stored.weekday === 2 && stored.unchecked.join() === 'yanabee-c-timeline-3@yanabee.local' && stored.keep.length === 2, JSON.stringify(stored));
  await p.reload(); await p.waitForTimeout(300);
  check('choices restored after reload', JSON.stringify(await checked(p)) === JSON.stringify([true, true, true, false, true, true, true, true, true]) && (await p.inputValue('[data-ics-wd]')) === '2');

  console.log('calendar-ics: copy fallback and print');
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve(); } }, configurable: true }); });
  await download(p);
  await p.click('[data-ics-fb] summary');
  await p.click('[data-ics-copy]');
  await p.waitForTimeout(100);
  check('copy puts the .ics text (CRLF) on the clipboard', (await p.evaluate(() => window.__clip || '')).startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && (await text(p, '[data-ics-copied]')) === 'نُسخ النص.');
  await p.click('[data-ics-print]');
  check('print: body.print-ics during print', (await p.evaluate(() => window.__printed)).some(c => c.split(' ').includes('print-ics')));
  check('print-ics still on until afterprint', await p.evaluate(() => document.body.classList.contains('print-ics')));
  await p.emulateMedia({ media: 'print' });
  check('print-ics: only the chosen dates', (await display(p, '#ics')) === 'grid' && (await display(p, '#c-about')) === 'none'
    && (await display(p, '#c-timeline .tl')) === 'none' && (await display(p, '#ics .ics-ev:nth-child(4)')) === 'none'
    && (await display(p, '#ics .ics-ev:nth-child(1)')) !== 'none' && (await display(p, '[data-ics-wkrow]')) !== 'none'
    && (await display(p, '.ics-actions')) === 'none');
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes the class', !(await p.evaluate(() => document.body.classList.contains('print-ics'))));
  check('full-page print hides the controls, keeps the timeline', (await display(p, '#ics')) === 'none' && (await display(p, '#c-timeline .tl')) !== 'none' && (await display(p, '#ad-maker')) === 'none');
  await p.emulateMedia({ media: 'screen' });
  check('no console errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' '));
  await ctx.close();
}

console.log('calendar-ics: other dates');
{
  const { ctx, p } = await open({ now: '2026-11-09T09:00:00' });
  check('9 Nov: everything checked, nothing ended', JSON.stringify(await checked(p)) === JSON.stringify(Array(9).fill(true)) && (await p.$$eval('#ics .ics-past', l => l.filter(e => !e.hidden).length)) === 0);
  await ctx.close();
  const b = await open({ now: '2027-02-02T09:00:00' });
  check('2 Feb 2027: all ended, unchecked, button disabled', JSON.stringify(await checked(b.p)) === JSON.stringify(Array(9).fill(false)) && await b.p.isDisabled('[data-ics-dl]'));
  await b.p.locator('#ics .ics-cb').nth(8).check();
  check('an ended event can still be added', (await text(b.p, '[data-ics-status]')) === 'سيضم الملف موعدًا واحدًا.');
  await b.ctx.close();
}

console.log('calendar-ics: escaping and folding (synthetic text injected before the script runs)');
{
  const c2 = await browser.newContext({ acceptDownloads: true });
  const q = await c2.newPage();
  await q.route('**/fonts.g*/**', r => r.abort());
  await q.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return;
      const el = document.getElementById('ics-data');
      const d = JSON.parse(el.textContent);
      d.events[0].summary = 'a,b;c\\d\nE';
      d.events[0].description = 'x'.repeat(74) + 'é' + '😀'.repeat(30) + 'ينابيع'.repeat(20);
      el.textContent = JSON.stringify(d);
    });
  });
  await q.goto(url('competition.html'));
  await q.waitForTimeout(300);
  await q.click('[data-ics-all]');
  const [d] = await Promise.all([q.waitForEvent('download'), q.click('[data-ics-dl]')]);
  const raw = fs.readFileSync(await d.path(), 'utf8');
  check('escaped: \\\\ \\; \\, \\n', raw.includes('SUMMARY:a\\,b\\;c\\\\d\\nE\r\n'));
  const phys = raw.split('\r\n');
  check('folding by octets: 2-, 3- and 4-byte characters never split, <= 75 each', phys.every(l => Buffer.byteLength(l) <= 75) && !raw.includes('�'));
  const ev = vevents(raw)[0];
  check('unfolding restores the long text exactly', ev.DESCRIPTION === 'x'.repeat(74) + 'é' + '😀'.repeat(30) + 'ينابيع'.repeat(20));
  check('first folded line is exactly at the limit', Buffer.byteLength(phys.find(l => l.startsWith('DESCRIPTION:'))) <= 75 && phys[phys.findIndex(l => l.startsWith('DESCRIPTION:')) + 1].startsWith(' '));
  await c2.close();
}

// ------------------------------------------------------------------------------------------------ ad-maker
console.log('ad-maker: live filling');
{
  const { ctx, p, errs, net } = await open();
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve(); } }, configurable: true }); });
  check('panel revealed', await visible(p, '#ad-maker'));
  check('kind options from the document', (await p.$$eval('input[name=adm-kind]', l => l.map(r => r.value))).join('|') === 'جمعية|مدرسة|' && await p.isChecked('input[name=adm-kind][value=""]'));
  check('reminder row', (await text(p, '.ad-maker-note')).includes('اعتماد رابط التسجيل ورقم التواصل') && (await text(p, '.ad-maker-note')).includes('مسؤول التسجيل'));
  await p.click('label.adm-pill:nth-child(2)');
  check('kind -> مدرسة', (await text(p, '[data-ad-kind]')) === 'مدرسة');
  await p.fill('#adm-org', '  النور   الأهلية ');
  check('org trimmed into the poster', (await text(p, '.poster-lead')).startsWith('تعلن مدرسة النور الأهلية عن فتح باب التسجيل'));
  await p.fill('#adm-wa', '+90 ٥٥٥ ab 12-3 (4)');
  check('number cleaned (Arabic digits converted, letters dropped)', (await p.inputValue('#adm-wa')) === '+90 555  12-3 (4)');
  check('number in the poster, isolated LTR', (await text(p, '[data-ad-wa]')) === '+90 555 12-3 (4)' && (await p.getAttribute('[data-ad-wa]', 'dir')) === 'ltr'
    && (await p.evaluate(() => getComputedStyle(document.querySelector('[data-ad-wa]')).unicodeBidi)) === 'isolate');
  await p.fill('#adm-org', '<img src=x onerror=alert(1)>');
  check('org written as text only', (await p.$$('.poster-lead img')).length === 0 && (await text(p, '[data-ad-org]')) === '<img src=x onerror=alert(1)>');
  await p.fill('#adm-org', 'النور الأهلية');
  check('maxlengths', (await p.getAttribute('#adm-org', 'maxlength')) === '80' && (await p.getAttribute('#adm-wa', 'maxlength')) === '20');

  console.log('ad-maker: copy');
  await p.click('[data-ad-copy]');
  await p.waitForTimeout(100);
  const clip = await p.evaluate(() => window.__clip || '');
  const L = clip.split('\n');
  check('starts with the poster header', L[0] === 'إعلان رسمي | إطلاق مبادرة ينابيع' && L[1].startsWith('﴿كَبُرَ مَقْتًا') && L[2] === 'هل أنت مستعد لتحويل القول إلى عمل والقرآن إلى منهج حياة؟');
  check('lead filled', L[3] === 'تعلن مدرسة النور الأهلية عن فتح باب التسجيل والانضمام في المسابقة الأولى لـ «مشروع ينابيع»، والتي تجمع بين بناء القيم والقيادة والعمل الجماعي والأنشطة الرياضية والفكرية.');
  check('number wrapped in LRI…PDI', clip.includes('• للتسجيل والاستفسار: \u2066+90 555 12-3 (4)\u2069'));
  check('no duplicated sub-items', (clip.match(/الحفظ والتسميع/g) || []).length === 1 && (clip.match(/دوري الشطرنج/g) || []).length === 1);
  check('parents and children with label: body', L.includes('• المحور الإيماني والمعرفي:') && L.includes('   ◦ الحفظ والتسميع: اختيار عضوين، عضو أساسي والآخر احتياطي، من الفريق للتسميع المباشر لسورة الصَّف.'));
  check('every c-ad line present', DOC.slice(DOC.findIndex(l => l.startsWith('# c-ad ')) + 1, DOC.findIndex(l => l.startsWith('# c-partner'))).filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('>'))
    .map(l => l.replace(/^\s*- /, '').replace('جمعية / مدرسة ..................', 'مدرسة النور الأهلية').replace('[رقم الواتساب]', '\u2066+90 555 12-3 (4)\u2069'))
    .every(l => clip.includes(l)));
  check('section headings in order', ['شروط وأحكام المشاركة', 'محاور وشروط المسابقة الأولى (سورة الصَّف)', 'الجدول الزمني للمسابقة', 'كيف تسجل فريقك؟'].every((h, i, a) => L.indexOf(h) > (i ? L.indexOf(a[i - 1]) : 3)));
  check('success status, no warning', (await text(p, '[data-ad-status]')) === 'نُسخ النص. الصقه في مجموعة الواتساب.');
  check('status is aria-live', (await p.getAttribute('[data-ad-status]', 'aria-live')) === 'polite');
  await p.fill('#adm-wa', '');
  check('empty number -> placeholder back, no dir', (await text(p, '[data-ad-wa]')) === '[رقم الواتساب]' && (await p.getAttribute('[data-ad-wa]', 'dir')) === null);
  await p.click('[data-ad-copy]'); await p.waitForTimeout(100);
  check('warning when a blank is left', (await text(p, '[data-ad-status]')).includes('تنبيه: ما زال في النص فراغ لم يُملأ.'));
  check('placeholder copied as is', (await p.evaluate(() => window.__clip)).includes('• للتسجيل والاستفسار: [رقم الواتساب]'));
  await p.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true });
    document.execCommand = () => false;
  });
  await p.click('[data-ad-copy]'); await p.waitForTimeout(150);
  check('both copy paths fail -> manual textarea, selected', await visible(p, '[data-ad-manual]') && (await p.inputValue('[data-ad-manual]')).startsWith('إعلان رسمي')
    && await p.evaluate(() => document.activeElement === document.querySelector('[data-ad-manual]')) && (await text(p, '[data-ad-status]')).startsWith('لم يُنسخ تلقائيًا؛ حدّد النص وانسخه.'));
  await p.evaluate(() => { document.execCommand = () => true; });
  await p.click('[data-ad-copy]'); await p.waitForTimeout(150);
  check('execCommand fallback -> success', (await text(p, '[data-ad-status]')).startsWith('نُسخ النص.') && !(await visible(p, '[data-ad-manual]')));

  console.log('ad-maker: storage, print, reset');
  await p.fill('#adm-wa', '0555 111 22 33');
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-ad-maker-v1')));
  check('saved under yanabee-ad-maker-v1', st && st.kind === 'مدرسة' && st.org === 'النور الأهلية' && st.wa === '0555 111 22 33', JSON.stringify(st));
  await p.reload(); await p.waitForTimeout(300);
  check('restored after reload', (await p.inputValue('#adm-org')) === 'النور الأهلية' && (await text(p, '[data-ad-kind]')) === 'مدرسة' && (await text(p, '[data-ad-wa]')) === '0555 111 22 33');
  await p.click('[data-print-poster]');
  check('print poster: body.print-poster during print', (await p.evaluate(() => window.__printed)).some(c => c.split(' ').includes('print-poster')));
  await p.emulateMedia({ media: 'print' });
  check('print poster: panel hidden, poster shows the filled values', (await display(p, '#ad-maker')) === 'none' && (await display(p, '#c-ad .poster')) !== 'none'
    && (await text(p, '.poster-lead')).includes('مدرسة النور الأهلية') && (await p.evaluate(() => getComputedStyle(document.querySelector('[data-ad-org]')).backgroundColor)) === 'rgba(0, 0, 0, 0)');
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes print-poster', !(await p.evaluate(() => document.body.classList.contains('print-poster'))));
  await p.emulateMedia({ media: 'screen' });
  await p.click('[data-ad-reset]');
  check('reset: originals back, radio reset, storage removed', (await text(p, '.poster-lead')).startsWith('تعلن جمعية / مدرسة .................. عن فتح')
    && (await text(p, '[data-ad-wa]')) === '[رقم الواتساب]' && await p.isChecked('input[name=adm-kind][value=""]') && (await p.inputValue('#adm-org')) === ''
    && (await p.evaluate(() => localStorage.getItem('yanabee-ad-maker-v1'))) === null);
  check('no console errors', errs.length === 0, errs.join(' | '));
  check('no network requests', net.length === 0, net.join(' '));
  await ctx.close();
}

console.log('storage blocked');
{
  const { ctx, p, errs } = await open({ blockStorage: true });
  check('storage really throws', await p.evaluate(() => { try { localStorage.getItem('x'); return false; } catch (e) { return true; } }));
  check('calendar works', await visible(p, '#ics') && (await text(p, '[data-ics-status]')) === 'سيضم الملف 7 مواعيد.');
  await p.selectOption('[data-ics-wd]', '1');
  const ev = vevents((await download(p)).raw);
  check('calendar file without storage', ev.length === 8 && ev.some(e => e.RRULE && e['DTSTART;VALUE=DATE'] === '20261116'));
  await p.fill('#adm-org', 'جهة');
  await p.click('[data-ad-reset]');
  check('ad-maker works', (await text(p, '[data-ad-org]')) === '..................' && (await text(p, '[data-ad-status]')) === 'أُعيد النص الأصلي.');
  check('no errors with storage blocked', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('phone 390px');
for (const theme of ['light', 'dark']) {
  const { ctx, p, errs } = await open({ ...PHONE, theme });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${theme}: no horizontal overflow`, ov <= 0, String(ov));
  const inside = await p.evaluate(() => ['#ics', '#ad-maker', '#c-ad .poster'].every(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5; }));
  check(`${theme}: panels inside the viewport`, inside);
  const small = await p.evaluate(() => [...document.querySelectorAll('#ics button, #ics select, #ics .ics-row, #ad-maker button, #ad-maker input:not([type=radio]), #ad-maker .adm-pill span')]
    .filter(e => e.offsetParent).map(e => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44));
  check(`${theme}: touch targets >= 44px`, small.length === 0, JSON.stringify(small));
  const full = await p.evaluate(() => { const b = document.querySelector('[data-ics-dl]').getBoundingClientRect(), w = document.querySelector('.ics-actions').getBoundingClientRect(); return Math.abs(b.width - w.width) < 2; });
  check(`${theme}: download button full width`, full);
  check(`${theme}: no console errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('keyboard');
{
  const { ctx, p } = await open();
  await p.focus('#ics .ics-cb >> nth=2');
  await p.keyboard.press('Space');
  check('space toggles an event', (await checked(p))[2] === false);
  const ring = await p.evaluate(() => getComputedStyle(document.querySelector('#ics .ics-cb:focus-visible').closest('.ics-row')).outlineStyle);
  check('focused event row shows a ring', ring === 'solid');
  await p.focus('input[name=adm-kind] >> nth=0');
  await p.keyboard.press('ArrowLeft');
  check('arrow keys move the kind radio', (await text(p, '[data-ad-kind]')) !== 'جمعية / مدرسة');
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
