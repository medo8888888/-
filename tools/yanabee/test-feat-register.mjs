// Browser test of the register.html feature bundle: «قبل التسجيل: كوّن فرقك ووزّع الأدوار» (team-builder).
//   python3 tools/yanabee/build.py register && node tools/yanabee/test-feat-register.mjs
// Covers: markup (before #c-form, JSON data from the documents, unique ids), no-JS reading, the registration chip on
// 31 Oct / 9 / 14 / 15 Nov 2026, parsing and duplicates, split sizes and the waiting list (5, 8, 9, 10, 14, 15, 22),
// roles, the eight checks with their source lines, moving members, confirmations, shuffle, clear, persistence,
// push into register.js's draft (empty draft, same-team merge, different-team confirm, storage failure),
// storage blocked, print mode, 390px phone (overflow, 44px targets), dark theme, console errors, network.
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const HTML = fs.readFileSync(path.join(ROOT, 'site/yanabee/register.html'), 'utf8');
const DATA = JSON.parse(HTML.match(/<script type="application\/json" id="team-builder-data">([\s\S]*?)<\/script>/)[1]);
const COMP = fs.readFileSync(path.join(ROOT, 'content/yanabee/competition.txt'), 'utf8');
const inDoc = s => COMP.includes(s);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const NOV9 = new Date(2026, 10, 9, 10, 0, 0);
let netBad = [];
async function open(opts = {}) {
  const { date = NOV9, init = null, theme = 'light', hash = '', ...rest } = opts;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', ...rest });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text() + ((m.location() && m.location().url) || ''))) errs.push(m.text()); });
  p.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !/fonts\.(googleapis|gstatic)\.com/.test(u)) netBad.push(u); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(t => { try { localStorage.setItem('yanabee-theme', t); sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* blocked */ } }, theme);
  if (init) await p.addInitScript(init);
  await p.clock.setFixedTime(date);
  await p.goto(url('register.html') + hash);
  await p.waitForTimeout(300);
  return { ctx, p, errs };
}
const names = n => Array.from({ length: n }, (_, i) => `طالب ${i + 1} اسم ثلاثي`);
const split = async (p, list, btn = '[data-tb-split]') => { await p.fill('#tb-names', list.join('\n')); await p.click(btn); await p.waitForTimeout(50); };
const sizes = p => p.$$eval('#team-builder .tb-card', cs => cs.map(c => c.querySelectorAll('.tb-mem > li').length));
const waiting = p => p.$$eval('#team-builder .tb-wait .tb-mem > li b', b => b.map(x => x.textContent));
const members = (p, i) => p.$$eval(`.tb-card[data-i="${i}"] .tb-mem > li .tb-mn b`, b => b.map(x => x.textContent));
const card = i => `.tb-card[data-i="${i}"]`;
const text = (p, s) => p.$eval(s, e => e.textContent.trim());
const role = (p, i, r, v) => p.selectOption(`${card(i)} select[data-r="${r}"]`, v);
const ckState = (p, i, k) => p.$eval(`${card(i)} .tb-ck[data-c="${k}"]`, li => li.dataset.ok);
const whyText = (p, i, k) => p.$eval(`${card(i)} [data-why="${k}"]`, w => (w.hidden ? '' : w.textContent));
const moveTo = async (p, scope, name, to) => {
  const row = p.locator(`${scope} .tb-mem > li`).filter({ has: p.locator('.tb-mn b', { hasText: new RegExp('^' + name + '$') }) });
  await row.locator('select[data-mv]').selectOption(to);
  await row.locator('[data-mvgo]').click();
  await p.waitForTimeout(30);
};
const draft = p => p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-reg-draft') || 'null'));

/* ------------------------------------------------------------------ markup */
console.log('markup and data');
{
  const main = HTML.slice(HTML.indexOf('<main'), HTML.indexOf('</main>'));
  const a = main.indexOf('id="team-builder"'), b = main.indexOf('id="c-form"');
  check('section sits in <main> right before #c-form', a > 0 && b > a && main.slice(a, b).split('<section').length === 2 && main.slice(a, b).includes('</section>'));
  check('css and js load once', (HTML.match(/js\/team-builder\.js/g) || []).length === 1 && (HTML.match(/css\/team-builder\.css/g) || []).length === 1);
  const ids = [...HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  check('ids are unique on register.html', !dup.length, dup.join(','));
  check('data numbers are the documents\' (5–7)', DATA.min === 5 && DATA.max === 7 && inDoc('| عدد الفريق | 5 إلى 7 أعضاء شاملًا قائد الفريق |'));
  const lines = [DATA.reg, DATA.how0.t, DATA.how1.t, DATA.partner0.t, DATA.ruleGrade.t, DATA.oneTeam.t, DATA.law.t, DATA.fee.t, DATA.lblTeam, DATA.lblLeader, ...DATA.nom, DATA.coord, DATA.nameHint,
    DATA.how0.from, DATA.partner0.from, DATA.ruleGrade.from, DATA.oneTeam.from, DATA.law.from, DATA.fee.from];
  const missing = lines.filter(l => !inDoc(l));
  check('every data line is verbatim in competition.txt', !missing.length, missing.join(' | '));
  check('fee line is the document\'s 10 $', DATA.fee.t === 'رسوم الاشتراك المعلنة: 10 $ للفريق الواحد (وليس لكل عضو).');
  const js = fs.readFileSync(path.join(ROOT, 'site/yanabee/js/team-builder.js'), 'utf8');
  check('js: classic IIFE, no network, no modules', /^\s*(\/\/.*\n)*\(function \(\) \{/.test(js) && !/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|^\s*import\s|export\s/m.test(js));
  check('js: every localStorage call is inside try', js.split('\n').filter(l => /localStorage\./.test(l)).every(l => /try\s*\{/.test(l) || /^\s+(localStorage|try)/.test(l)));
}

/* ------------------------------------------------------------------ no JS */
console.log('without JavaScript');
{
  const { ctx, p } = await open({ javaScriptEnabled: false });
  check('no JS: tool hidden, note and document lines visible', await p.evaluate(() => {
    const s = document.getElementById('team-builder');
    return s.querySelector('[data-tb-tool]').hidden && s.querySelector('.tb-nojs').offsetHeight > 0 && s.querySelector('.tb-chip').hidden
      && s.textContent.includes('سارع بالتسجيل وسداد رسوم الاشتراك قبل اكتمال العدد المطلوب') && s.textContent.includes('1 – 14 نوفمبر: تسجيل الفرق');
  }));
  await ctx.close();
}

/* ------------------------------------------------------------------ chip */
console.log('registration chip');
for (const [d, want] of [
  [new Date(2026, 9, 31, 12), 'يبدأ التسجيل 1 نوفمبر 2026'],
  [new Date(2026, 10, 1, 8), 'باقٍ 14 يومًا للتسجيل، منها اليوم (حتى 14 نوفمبر)'],
  [new Date(2026, 10, 9, 10), 'باقٍ 6 أيام للتسجيل، منها اليوم (حتى 14 نوفمبر)'],
  [new Date(2026, 10, 13, 23, 30), 'باقٍ يومان للتسجيل، منها اليوم (حتى 14 نوفمبر)'],
  [new Date(2026, 10, 14, 0, 5), 'اليوم آخر يوم في فترة التسجيل (1 – 14 نوفمبر)'],
  [new Date(2026, 10, 15, 9), 'انتهت فترة التسجيل المعلنة (1 – 14 نوفمبر)'],
]) {
  const { ctx, p, errs } = await open({ date: d });
  const got = await text(p, '[data-tb-chip-t]');
  check(`chip on ${d.toDateString()}`, got === want, got);
  if (+d === +NOV9) {
    const hero = await p.$eval('[data-cs-n]', e => e.textContent);
    check('chip agrees with the hero countdown on 9 Nov (6)', hero === '6' && got.includes('6 '), hero);
    check('the «سارع بالتسجيل» line sits under the chip', await p.evaluate(() => document.querySelector('.tb-when').textContent.includes('سارع بالتسجيل وسداد رسوم الاشتراك قبل اكتمال العدد المطلوب!')));
  }
  check(`chip page has no errors (${d.getDate()})`, !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ split */
console.log('parse, duplicates, split');
{
  const { ctx, p, errs } = await open();
  check('tool shown with JS', await p.evaluate(() => !document.querySelector('[data-tb-tool]').hidden));
  check('parse strips list numbers and bullets', eq(await p.evaluate(() => window.YanabeeTeamBuilder.parse('1. أحمد\n١- سالم\n 3) هدى \n\n- مريم\n•  ليلى  ناصر')), ['أحمد', 'سالم', 'هدى', 'مريم', 'ليلى ناصر']));
  check('normalisation: alef, tashkeel, tatweel, ى, spaces', await p.evaluate(() => {
    const n = window.YanabeeTeamBuilder.norm;
    return n('أحمد  عليّ') === n('احمد علي') && n('مُصطـفى') === n('مصطفي') && n('إسراء') === n('اسراء') && n('آمنة') === n('امنة');
  }));
  const PLAN = { 5: [[5], 0], 8: [[7], 1], 9: [[7], 2], 10: [[5, 5], 0], 14: [[7, 7], 0], 15: [[5, 5, 5], 0], 22: [[6, 6, 5, 5], 0] };
  for (const [n, [sz, w]] of Object.entries(PLAN)) {
    await split(p, names(+n));
    const s = await sizes(p), wl = await waiting(p);
    check(`split ${n} -> ${sz.join('+')}${w ? ' + ' + w + ' waiting' : ''}`, eq(s, sz) && wl.length === w, `${s} / ${wl.length}`);
    const note = await text(p, '[data-tb-note]');
    if (w) {
      check(`split ${n}: message and the document line`, note.includes(`لا يمكن تقسيم ${n} طالبًا إلى فرق من 5 إلى 7 دون بقية.`) && note.includes(DATA.how0.t), note);
      check(`split ${n}: the rest is in «قائمة الانتظار»`, eq(wl, names(+n).slice(7)) && (await text(p, '.tb-wh')).startsWith('قائمة الانتظار'));
    }
    const sum = await text(p, '[data-tb-sum]');
    check(`split ${n}: live summary`, sum === `${sz.length} فرق · 0 جاهزة · ${w} في قائمة الانتظار`, sum);
  }
  check('summary is aria-live', await p.$eval('[data-tb-sum]', e => e.getAttribute('aria-live') === 'polite'));
  await split(p, names(4));
  check('split 4: no team, all 4 waiting', eq(await sizes(p), []) && (await waiting(p)).length === 4);
  await split(p, names(22));
  check('split 22: first team = first 6 names in order', eq(await members(p, 0), names(6)) && eq(await members(p, 3), names(22).slice(17)));
  // duplicates
  await p.fill('#tb-names', ['أحمد علي', 'سالم', 'احمد  عَلي', 'هدى', 'مريم', 'ليلى'].join('\n'));
  await p.waitForTimeout(30);
  const dups = await p.$eval('[data-tb-dups]', e => (e.hidden ? '' : e.textContent));
  check('duplicate lines flagged', dups.includes('مكرر: ميّز الاسمين قبل التقسيم') && dups.includes('1، 3'), dups);
  const before = await sizes(p);
  await p.click('[data-tb-split]');
  check('split blocked while duplicates remain', eq(await sizes(p), before) && (await text(p, '[data-tb-note]')).includes('المكررة'));
  check('textarea marked invalid', await p.$eval('#tb-names', e => e.getAttribute('aria-invalid') === 'true'));
  await p.fill('#tb-names', ['أحمد علي', 'سالم', 'هدى', 'مريم', 'ليلى'].join('\n'));
  check('duplicate flag clears', await p.$eval('[data-tb-dups]', e => e.hidden));
  check('list-changed hint after editing the names', (await text(p, '[data-tb-info]')).includes('تغيّرت القائمة'));
  // 200 limit
  await split(p, names(205));
  check('at most 200 names are taken', (await text(p, '[data-tb-info]')).includes('عدد الأسماء: 200') && (await sizes(p)).reduce((a, b) => a + b, 0) + (await waiting(p)).length === 200);
  check('no errors (split)', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ roles, checks, move */
console.log('roles, checks, moving members');
{
  const { ctx, p, errs } = await open();
  const L = names(10);
  await split(p, L);
  check('leader not picked automatically', (await p.$eval(`${card(0)} select[data-r="leader"]`, s => s.value)) === '' && (await p.$eval(`${card(0)} select[data-r="leader"] option`, o => o.textContent)) === '— اختر القائد —');
  check('every select and input has a label', await p.evaluate(() => [...document.querySelectorAll('#team-builder select, #team-builder input, #team-builder textarea')].every(el => el.labels && el.labels.length && el.labels[0].textContent.trim())));
  const labels = await p.$$eval(`${card(0)} .tb-fl`, l => l.map(x => x.textContent.trim()));
  check('field labels are the form\'s own lines', eq(labels, [DATA.lblTeam, DATA.lblLeader, ...DATA.nom, DATA.coord + ' (اختياري)']), labels.join(' | '));
  check('role options are this team\'s names', eq(await p.$$eval(`${card(1)} select[data-r="rec1"] option`, o => o.slice(1).map(x => x.value)), L.slice(5)));
  const why = await whyText(p, 0, 'leader');
  check('failing «leader» shows the document line', why.includes(DATA.how0.t) && why.includes(DATA.how0.from));
  const gw = await whyText(p, 0, 'grade');
  check('failing grade check shows c-p-partner then c-rules', gw.indexOf(DATA.partner0.t) >= 0 && gw.indexOf(DATA.ruleGrade.t) > gw.indexOf(DATA.partner0.t));
  check('failing fee check shows the 10 $ line', (await whyText(p, 0, 'fee')).includes(DATA.fee.t));
  check('failing law check shows lg10 and links to the league rules', (await whyText(p, 0, 'law')).includes(DATA.law.t) && await p.$eval(`${card(0)} .tb-link`, a => a.getAttribute('href') === 'competition.html#c-league'));
  check('push disabled without a leader', await p.$eval(`${card(0)} [data-push]`, b => b.disabled));
  await role(p, 0, 'leader', L[0]);
  check('push enabled once size is fine and a leader is chosen', await p.$eval(`${card(0)} [data-push]`, b => !b.disabled));
  check('leader check passes and its line hides', (await ckState(p, 0, 'leader')) === '1' && (await whyText(p, 0, 'leader')) === '');
  await role(p, 0, 'rec1', L[1]); await role(p, 0, 'rec2', L[1]);
  check('same reciter twice fails', (await ckState(p, 0, 'rec')) === '0' && (await text(p, `${card(0)} .tb-ck[data-c="rec"]`)).includes('عضو أساسي وعضو احتياطي: اختر عضوين مختلفين'));
  await role(p, 0, 'rec2', L[2]);
  check('two different reciters pass', (await ckState(p, 0, 'rec')) === '1');
  await role(p, 0, 'chess', L[3]);
  let badge = await text(p, `${card(0)} [data-badge]`);
  check('badge lists what is missing', badge.startsWith('ينقصه:') && badge.includes('الرسوم') && badge.includes('اللائحة') && !badge.includes('القائد'), badge);
  check('coordinator is optional (not in the badge)', !badge.includes('التنسيق'));
  for (const k of ['grade', 'fee', 'law']) await p.check(`${card(0)} input[data-ck="${k}"]`);
  badge = await text(p, `${card(0)} [data-badge]`);
  check('all checks pass -> «جاهز للتسجيل»', badge === 'جاهز للتسجيل', badge);
  check('summary counts the ready team', (await text(p, '[data-tb-sum]')) === '2 فرق · 1 جاهزة · 0 في قائمة الانتظار');
  check('role tags on member rows', (await text(p, `${card(0)} .tb-mem > li:first-child .tb-tags`)).includes('القائد'));
  // move the leader to team 2: team 1 drops to 4, its leader is cleared
  await moveTo(p, card(0), L[0], 't1');
  check('move: sizes 4 and 6', eq(await sizes(p), [4, 6]));
  check('move: the moved leader\'s role is cleared', (await p.$eval(`${card(0)} select[data-r="leader"]`, s => s.value)) === '' && (await ckState(p, 0, 'leader')) === '0');
  check('move: size check fails and push is disabled', (await ckState(p, 0, 'size')) === '0' && await p.$eval(`${card(0)} [data-push]`, b => b.disabled));
  check('move: other roles and boxes stay', (await p.$eval(`${card(0)} select[data-r="rec1"]`, s => s.value)) === L[1] && await p.$eval(`${card(0)} input[data-ck="fee"]`, c => c.checked));
  check('move: focus stays in the source card', await p.evaluate(() => !!document.activeElement.closest('.tb-card[data-i="0"]')));
  check('move: announced', (await p.waitForFunction(() => document.querySelector('[data-tb-say]').textContent.includes('نُقل'), null, { timeout: 1000 }).then(() => true, () => false)));
  await moveTo(p, card(1), L[0], 'w');
  check('move to the waiting list', eq(await waiting(p), [L[0]]) && eq(await sizes(p), [4, 5]));
  await moveTo(p, '.tb-wait', L[0], 't0');
  check('move back from the waiting list', eq(await waiting(p), []) && eq(await sizes(p), [5, 5]));
  // a move with no target only focuses the select
  await p.click(`${card(0)} .tb-mem > li:first-child [data-mvgo]`);
  check('«انقل» without a target does nothing', eq(await sizes(p), [5, 5]) && await p.evaluate(() => document.activeElement.matches('select[data-mv]')));
  // confirmations
  const dialogs = [];
  p.once('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await p.click('[data-tb-split]');
  check('re-split after manual edits asks first', dialogs[0] === 'سيُعاد التقسيم وتضيع الأدوار المختارة. متابعة؟', dialogs[0]);
  check('declined: nothing changes', (await p.$eval(`${card(0)} select[data-r="rec1"]`, s => s.value)) === L[1]);
  p.once('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await p.click('[data-tb-shuffle]');
  const s0 = await members(p, 0), s1 = await members(p, 1);
  check('shuffle (accepted): same names, sizes 5+5, roles reset', eq([...s0, ...s1].sort(), [...L].sort()) && eq(await sizes(p), [5, 5]) && (await p.$eval(`${card(0)} select[data-r="rec1"]`, s => s.value)) === '');
  await p.click('[data-tb-split]');
  check('no question when nothing was edited by hand', dialogs.length === 2);
  check('no errors (roles)', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ persistence, clear */
console.log('storage');
{
  const { ctx, p, errs } = await open();
  const L = names(8);
  await split(p, L);
  await role(p, 0, 'leader', L[2]);
  await p.check(`${card(0)} input[data-ck="law"]`);
  await p.fill(`${card(0)} input[data-name]`, 'فريق النور');
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-team-builder-v1')));
  check('saved under yanabee-team-builder-v1', st && st.names.includes(L[0]) && st.teams[0].name === 'فريق النور' && st.roles[0].leader === L[2] && st.checks[0].law === true && eq(st.waiting, [L[7]]));
  await p.reload(); await p.waitForTimeout(300);
  check('restored after reload', (await p.$eval('#tb-names', t => t.value)).includes(L[0]) && (await p.$eval(`${card(0)} input[data-name]`, i => i.value)) === 'فريق النور'
    && (await p.$eval(`${card(0)} select[data-r="leader"]`, s => s.value)) === L[2] && await p.$eval(`${card(0)} input[data-ck="law"]`, c => c.checked) && eq(await waiting(p), [L[7]]));
  check('restored note', (await text(p, '[data-tb-note]')).includes('لا يمكن تقسيم 8 طالبًا'));
  const msgs = [];
  p.once('dialog', d => { msgs.push(d.message()); d.dismiss(); });
  await p.click('[data-tb-clear]');
  check('clear asks first; declined keeps everything', msgs[0] === 'ستُحذف الأسماء من هذا المتصفح. متابعة؟' && eq(await sizes(p), [7]));
  p.once('dialog', d => d.accept());
  await p.click('[data-tb-clear]');
  check('clear: list, cards and storage gone', (await p.$eval('#tb-names', t => t.value)) === '' && eq(await sizes(p), [])
    && (await p.evaluate(() => localStorage.getItem('yanabee-team-builder-v1'))) === null && await p.$eval('[data-tb-bar]', b => b.hidden));
  check('no errors (storage)', !errs.length, errs.join(' | '));
  await ctx.close();
}
{
  const block = () => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
  };
  const { ctx, p, errs } = await open({ init: block });
  await split(p, names(10));
  await role(p, 0, 'leader', names(10)[0]);
  await p.waitForTimeout(500);
  check('storage blocked: the tool still works in memory', eq(await sizes(p), [5, 5]) && (await ckState(p, 0, 'leader')) === '1');
  check('storage blocked: says it cannot save', (await text(p, '[data-tb-saved]')).includes('تعذّر الحفظ'));
  await p.click(`${card(0)} [data-push]`);
  await p.waitForTimeout(200);
  check('storage blocked: push reports failure and does not reload', (await text(p, `${card(0)} [data-push-msg]`)) === 'تعذّر الحفظ في هذا المتصفح؛ انسخ الأسماء إلى الاستمارة يدويًا.' && eq(await sizes(p), [5, 5]));
  check('storage blocked: no page errors', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ push */
console.log('push into the registration form');
{
  const { ctx, p, errs } = await open();
  const L = names(6);
  await split(p, L);
  await p.fill(`${card(0)} input[data-name]`, 'فريق النور');
  await role(p, 0, 'leader', L[3]); await role(p, 0, 'rec1', L[1]); await role(p, 0, 'rec2', L[2]); await role(p, 0, 'chess', L[4]); await role(p, 0, 'coord', L[5]);
  await Promise.all([p.waitForEvent('load'), p.click(`${card(0)} [data-push]`)]);
  await p.waitForTimeout(400);
  const d = await draft(p);
  check('(a) empty draft: written', d && d.f.team === 'فريق النور' && d.f.leader === L[3] && d.f.rec1 === L[1] && d.f.coord === L[5] && d.m[0].n === L[3] && d.m.length === 6);
  check('(a) page reloaded at #c-form', p.url().endsWith('#c-form'));
  const form = await p.evaluate(() => {
    const f = document.querySelector('[data-reg]');
    return { team: f.elements.team.value, leader: f.elements.leader.value, rec1: f.elements.rec1.value, rec2: f.elements.rec2.value, chess: f.elements.chess.value, coord: f.elements.coord.value,
      rows: [...f.querySelectorAll('[data-members] [data-m="n"]')].map(i => i.value) };
  });
  check('(a) register form filled: names, leader first, nominee selects', form.team === 'فريق النور' && form.leader === L[3] && form.rec1 === L[1] && form.rec2 === L[2] && form.chess === L[4] && form.coord === L[5]
    && eq(form.rows, [L[3], L[0], L[1], L[2], L[4], L[5]]), JSON.stringify(form));
  // (b) same team: keep phone, email, pledges and members' age / contact
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('yanabee-reg-draft'));
    d.f.phone = '0912345678'; d.f.email = 'a@b.co'; d.f.pledge0 = true; d.f.idea = 'فكرة';
    d.m = d.m.map((m, i) => ({ n: m.n, a: String(12 + i), c: '09' + i }));
    localStorage.setItem('yanabee-reg-draft', JSON.stringify(d));
  });
  await p.fill(`${card(0)} input[data-name]`, 'فريق  النُّور');
  await role(p, 0, 'chess', L[0]);
  await Promise.all([p.waitForEvent('load'), p.click(`${card(0)} [data-push]`)]);
  await p.waitForTimeout(300);
  const d2 = await draft(p);
  const ages = Object.fromEntries(d2.m.map(m => [m.n, m.a]));
  check('(b) same team (normalised name): merged, phone/email/idea/pledge kept', d2.f.phone === '0912345678' && d2.f.email === 'a@b.co' && d2.f.pledge0 === true && d2.f.idea === 'فكرة' && d2.f.chess === L[0]);
  check('(b) members keep age and contact', ages[L[3]] === '12' && ages[L[0]] === '13' && d2.m.every(m => m.c));
  check('(b) register form shows the kept phone', (await p.$eval('[data-reg] [name="phone"]', i => i.value)) === '0912345678');
  // (c) a different team: confirm
  await p.fill(`${card(0)} input[data-name]`, 'فريق الأمل');
  const msgs = [];
  p.once('dialog', dd => { msgs.push(dd.message()); dd.dismiss(); });
  await p.click(`${card(0)} [data-push]`);
  await p.waitForTimeout(200);
  check('(c) different team asks before replacing', msgs[0] === 'توجد مسودة استمارة لفريق آخر على هذا الجهاز. هل تستبدلها؟');
  check('(c) declined: draft unchanged', (await draft(p)).f.team === 'فريق  النُّور');
  p.once('dialog', dd => dd.accept());
  await Promise.all([p.waitForEvent('load'), p.click(`${card(0)} [data-push]`)]);
  await p.waitForTimeout(300);
  const d3 = await draft(p);
  check('(c) accepted: replaced', d3.f.team === 'فريق الأمل' && !d3.f.phone && d3.m.length === 6);
  // push fails when only the write throws
  await p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'yanabee-reg-draft') throw new Error('quota'); return orig.call(this, k, v); }; });
  await p.fill(`${card(0)} input[data-name]`, 'فريق الأمل');
  await p.click(`${card(0)} [data-push]`);
  await p.waitForTimeout(200);
  check('write throws: message shown, no reload', (await text(p, `${card(0)} [data-push-msg]`)).startsWith('تعذّر الحفظ') && (await p.$eval(`${card(0)} input[data-name]`, i => i.value)) === 'فريق الأمل');
  check('no errors (push)', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ print */
console.log('print');
{
  const { ctx, p, errs } = await open();
  await split(p, names(10));
  await p.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.className); });
  await p.click('[data-tb-print]');
  const during = await p.evaluate(() => window.__printed[0] || '');
  check('print adds body.print-team-builder', during.split(' ').includes('print-team-builder'), during);
  await p.emulateMedia({ media: 'print' });
  const vis = await p.evaluate(() => ({
    form: getComputedStyle(document.getElementById('c-form')).display,
    tool: getComputedStyle(document.querySelector('.tb-tool')).display,
    cards: getComputedStyle(document.querySelector('.tb-cards')).display,
    ctl: getComputedStyle(document.querySelector('.tb-ctl')).display,
    psum: getComputedStyle(document.querySelector('.tb-psum')).display,
    psumText: document.querySelector('.tb-psum').textContent,
    nav: [...document.body.children].filter(e => e.tagName !== 'MAIN' && e.tagName !== 'SCRIPT').every(e => getComputedStyle(e).display === 'none'),
  }));
  check('print mode: only the team cards', vis.form === 'none' && vis.tool === 'none' && vis.cards !== 'none' && vis.ctl === 'none' && vis.psum === 'block' && vis.nav, JSON.stringify(vis));
  check('print copy lists leader, members and roles', vis.psumText.includes(DATA.lblLeader) && vis.psumText.includes('طالب 1 اسم ثلاثي') && vis.psumText.includes(DATA.nom[2]));
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  check('afterprint removes the class', !(await p.evaluate(() => document.body.classList.contains('print-team-builder'))));
  check('no errors (print)', !errs.length, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ phone + dark */
console.log('phone 390px, dark theme');
for (const theme of ['light', 'dark']) {
  const { ctx, p, errs } = await open({ ...PHONE, theme });
  const L = names(22);
  L[3] = 'عبدالرحمن محمد عبدالله الطويل اسمه جدًا جدًا جدًا جدًا';
  await split(p, L);
  await split(p, names(9));
  await split(p, L);
  await p.evaluate(() => document.getElementById('team-builder').scrollIntoView());
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`390px ${theme}: no horizontal overflow`, ov <= 0, String(ov));
  const small = await p.evaluate(() => [...document.querySelectorAll('#team-builder button, #team-builder select, #team-builder .chk, #team-builder .tb-link, #team-builder textarea')]
    .filter(e => e.offsetParent).map(e => [e.className || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44));
  check(`390px ${theme}: touch targets ≥ 44px`, !small.length, JSON.stringify(small.slice(0, 5)));
  const wide = await p.evaluate(() => [...document.querySelectorAll('#team-builder *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).map(e => e.className).slice(0, 5));
  check(`390px ${theme}: nothing sticks out of the screen`, !wide.length, wide.join(','));
  if (theme === 'dark') check('dark: theme on and card uses a dark surface', await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && getComputedStyle(document.querySelector('.tb-card')).backgroundColor !== 'rgb(255, 255, 255)'));
  // keyboard: Tab from the textarea reaches the split button, focus is visible
  await p.focus('#tb-names');
  await p.keyboard.press('Tab');
  check(`390px ${theme}: keyboard order textarea -> split button, visible focus`, await p.evaluate(() => document.activeElement.matches('[data-tb-split]') && getComputedStyle(document.activeElement).outlineStyle !== 'none'));
  check(`390px ${theme}: no errors`, !errs.length, errs.join(' | '));
  await ctx.close();
}

check('no network requests (fonts excluded)', !netBad.length, netBad.slice(0, 3).join(' '));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
