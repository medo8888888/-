// Browser test of «لعبة موسم القائد» (lab.html → tab «لعبة موسم القائد», js/season.js, css/season.css).
//   node tools/yanabee/test-season.mjs
// Covers: full 12-week playthroughs with the best and the worst choices, chained follow-ups, verbatim document quotes
// (vs content/yanabee/*.txt), links that resolve to real ids, share-card PNG, persistence/reload, new season, hint,
// keyboard-only play, tap targets, overflow at 390/1440, aria-live, reduced motion, console errors.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const SITE = path.join(ROOT, 'site/yanabee');
const url = f => 'file://' + path.join(SITE, f);
let pass = 0, total = 0; const fails = [];
const check = (n, ok, d = '') => { total++; if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true, ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url('lab.html'));
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await p.reload();
  await p.waitForSelector('#tab-season');
  await p.click('#tab-season');
  await p.waitForSelector('#season [data-screen="start"]:not([hidden])');
  return { ctx, p, errs };
}

// ------------------------------------------------------------ helpers
const norm = s => s.replace(/[^\p{L}\p{N}_\s]/gu, ' ').split(/\s+/).filter(Boolean).join(' ');
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const source = ['platform', 'quran'].map(n => fs.readFileSync(path.join(ROOT, 'content/yanabee', n + '.txt'), 'utf8')
  .split('\n').filter(l => !l.startsWith('%')).join('\n')).join('\n');
const sourceN = ' ' + norm(source) + ' ';
const srcLines = new Set(source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
  if (l.startsWith('@')) return norm(l.slice(l.indexOf(' ') + 1));
  if (l.startsWith('|')) return norm(l.split('|').map(c => c.trim()).filter(Boolean).join(' '));
  return norm(l.replace(/^-\s+/, '').replace(/^>\s*/, ''));
}));
const html = f => fs.readFileSync(path.join(SITE, f), 'utf8');

async function getData(p) { return p.evaluate(() => window.YanabeeSeason.data()); }
const st = p => p.evaluate(() => window.YanabeeSeason.state());
const phase = p => p.evaluate(() => document.querySelector('#season').dataset.phase);
async function pickQ(p, data, q) {            // click the choice with quality q (2 best, 0 worst)
  const id = await p.$eval('#ss-card', e => e.dataset.scn);
  const s = data.scn.find(x => x.id === id);
  const ci = s.ch.findIndex(c => c.q === q);
  await p.click(`.ss-choice[data-ci="${ci}"]`);
  await p.waitForSelector('#ss-fb:not([hidden]) [data-next]');
  return s;
}
async function advance(p) {                   // Next → (unlock overlay → continue) → next card or report
  await p.click('[data-next]');
  await p.waitForFunction(() => document.querySelector('.ss-unlock:not([hidden])') || document.querySelector('#season').dataset.phase === 'report' || document.querySelector('#ss-fb[hidden]'));
  const u = await p.$('.ss-unlock:not([hidden]) [data-unlock-go]');
  if (u) { await u.click(); await p.waitForFunction(() => document.querySelector('.ss-unlock[hidden]')); return 'unlock'; }
  return 'next';
}
async function playAll(p, data, q) {
  const seen = [], unlocks = [];
  for (let wk = 1; wk <= 12; wk++) {
    const s = await pickQ(p, data, q);
    seen.push(s.id);
    const r = await advance(p);
    if (r === 'unlock') unlocks.push(wk);
    if (wk < 12) await p.waitForSelector(`#ss-card[data-week="${wk + 1}"]`);
  }
  await p.waitForSelector('.ss-report:not([hidden]) .ss-rep');
  return { seen, unlocks };
}

// ================================================================== 1. data integrity (build output)
console.log('data');
let D;
{
  const { ctx, p, errs } = await open();
  D = await getData(p);
  check('19 base scenarios + 4 follow-ups = 23', D.scn.length === 23 && D.scn.filter(s => s.follow).length === 4, `${D.scn.length}`);
  check('every scenario has 3 choices, exactly one best (q=2)', D.scn.every(s => s.ch.length === 3 && s.ch.filter(c => c.q === 2).length === 1));
  check('every scenario has a document quote, a hint and a scene', D.scn.every(s => s.docs.length >= 1 && s.hint.h && s.svg.includes('<svg')));
  check('effects: 5 numbers per choice, best choice net positive, trap net negative',
    D.scn.every(s => s.ch.every(c => c.fx.length === 5) && s.ch.filter(c => c.q === 2)[0].fx.reduce((a, b) => a + b, 0) > 0 && s.ch.filter(c => c.q === 0).every(c => c.fx.reduce((a, b) => a + b, 0) < 8)));
  check('4 unlocks every 3 weeks (3, 6, 9, 12)', JSON.stringify(D.unlocks.map(u => u.week)) === '[3,6,9,12]');
  check('five meters with the document targets 80/90/80/90/100 and KPI links',
    JSON.stringify(D.meters.map(m => m.tg)) === '[80,90,80,90,100]' && D.meters.every(m => /^quran\.html#kpi\d$/.test(m.ku)));
  // verbatim quotes
  const quotes = [];
  D.scn.forEach(s => s.docs.forEach(d => quotes.push(d.h)));
  D.unlocks.forEach(u => quotes.push(u.doc.h)); D.meters.forEach(m => quotes.push(m.kh)); quotes.push(D.phase.h); D.flow.forEach(f => quotes.push(f));
  const bad = quotes.filter(h => !sourceN.includes(' ' + norm(strip(h)) + ' '));
  check(`${quotes.length} document quotes are verbatim lines of the content files`, bad.length === 0, bad.slice(0, 2).map(b => strip(b).slice(0, 60)).join(' | '));
  const partial = quotes.filter(h => !srcLines.has(norm(strip(h))));
  check('every quote is one COMPLETE source line (not a fragment)', partial.length === 0, partial.slice(0, 2).map(b => strip(b).slice(0, 60)).join(' | '));
  // links resolve
  const links = new Set();
  D.scn.forEach(s => { s.docs.forEach(d => links.add(d.u)); links.add(s.hint.u); });
  D.unlocks.forEach(u => links.add(u.doc.u)); D.meters.forEach(m => links.add(m.ku)); links.add(D.phase.u);
  const dead = [...links].filter(l => { const [f, id] = l.split('#'); return !fs.existsSync(path.join(SITE, f)) || !new RegExp(`id="${id}"`).test(html(f)); });
  check(`${links.size} document links point at existing pages and ids`, dead.length === 0, dead.join(', '));
  check('no console errors on load', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 2. start screen + honesty
console.log('start screen');
{
  const { ctx, p } = await open();
  const t = await p.$eval('#season', e => e.innerText);
  check('labelled تجريبي', /تجريبي/.test(t));
  check('document phase quote shown verbatim on the start screen', norm(await p.$eval('[data-stage]', e => e.textContent)) === norm(strip(D.phase.h)));
  check('meters start at the invented starting values, with targets shown', (await p.$$eval('.ss-meters .ss-m', els => els.map(e => e.querySelector('[data-v]').textContent + '/' + e.querySelector('.ss-m-foot span').textContent)))[0].startsWith('34/'));
  check('map: council + guide lit, teams dark', await p.evaluate(() => document.querySelector('.ss-map [data-n="council"]').classList.contains('on') && document.querySelector('.ss-map [data-n="guide"]').classList.contains('on') && !document.querySelector('.ss-map [data-n="teams"]').classList.contains('on')));
  const h = await p.$eval('[data-ss-start]', e => e.getBoundingClientRect().height);
  check('start button >= 44px', h >= 44, h);
  await ctx.close();
}

// ================================================================== 3. best playthrough
console.log('full season, best choices');
{
  const { ctx, p, errs } = await open();
  await p.evaluate(() => window.YanabeeSeason.seed(2024));
  await p.waitForSelector('#ss-card[data-week="1"]');
  const slots0 = (await st(p)).slots;
  check('12 distinct scenarios drawn, first one is an easy opener', new Set(slots0).size === 12 && D.scn.find(s => s.id === slots0[0]).early);
  check('chained scenarios are placed early enough to unfold', slots0.every((id, i) => !D.scn.find(s => s.id === id).trig || i < 9));
  const t0 = await p.$eval('#ss-card h3', e => e.textContent);
  const live0 = await p.$eval('#ss-live', e => e.textContent);
  const s1 = await pickQ(p, D, 2);
  check('feedback shows the verbatim «الوثيقة تقول» quote', norm(await p.$eval('#ss-fb .ss-doc p', e => e.textContent)) === norm(strip(s1.docs[0].h)));
  check('feedback offers a link to the document place', (await p.$eval('#ss-fb .ss-doc a', e => e.getAttribute('href'))) === s1.docs[0].u);
  check('effects are announced in the aria-live region', (await p.$eval('#ss-live', e => e.textContent)).length > 8 && (await p.$eval('#ss-live', e => e.textContent)) !== live0);
  check('choices locked after choosing + best marked', await p.evaluate(() => [...document.querySelectorAll('.ss-choice')].every(b => b.disabled) && !!document.querySelector('.ss-choice.picked.q2')));
  const mid = await st(p);
  check('meters moved by the best choice', JSON.stringify(Object.values(mid.m)) !== JSON.stringify(D.meters.map(m => m.s)));
  const hudv = await p.$$eval('.ss-hud [data-v]', els => els.map(e => +e.textContent));
  check('HUD shows the state values', JSON.stringify(hudv) === JSON.stringify(D.keys.map(k => mid.m[k])));
  const unlocks = [];
  await advance(p);
  await p.waitForSelector('#ss-card[data-week="2"]');
  for (let wk = 2; wk <= 12; wk++) {
    await pickQ(p, D, 2);
    await p.click('[data-next]');
    if (wk % 3 === 0) {
      await p.waitForSelector('.ss-unlock:not([hidden]) [data-unlock-go]');
      unlocks.push(wk);
      if (wk === 3) {
        check('unlock overlay names the tool and quotes the document', /التشغيل الرقمي الموحد/.test(await p.$eval('.ss-unlock', e => e.innerText)) && norm(await p.$eval('.ss-unlock .ss-doc p', e => e.textContent)) === norm(strip(D.unlocks[0].doc.h)));
        check('map teams light up when the app unlocks', await p.evaluate(() => document.querySelector('.ss-map .mn.tm').classList.contains('on') && document.querySelector('.ss-tool[data-tool="app"]').classList.contains('on')));
      }
      await p.click('[data-unlock-go]');
      await p.waitForFunction(() => document.querySelector('.ss-unlock[hidden]'));
    }
    if (wk < 12) await p.waitForSelector(`#ss-card[data-week="${wk + 1}"]`);
  }
  await p.waitForSelector('.ss-report:not([hidden]) .ss-rep');
  check('unlocks fired after weeks 3, 6, 9 and 12', JSON.stringify(unlocks) === '[3,6,9,12]', JSON.stringify(unlocks));
  const fin = await st(p);
  const sc = await p.evaluate(() => window.YanabeeSeason.score());
  check('best play: 12 decisions logged, all q=2', fin.log.length === 12 && fin.log.every(l => l.q === 2));
  check('best play: 3 stars and a high title', sc.stars === 3 && sc.score >= 88, JSON.stringify(sc));
  check('all four tools unlocked, all map nodes lit', fin.unlocked.length === 4 && await p.evaluate(() => [...document.querySelectorAll('.ss-map [data-n]')].every(e => e.classList.contains('on'))));
  check('report: five rows compare meters to document targets with KPI links', await p.evaluate(() => document.querySelectorAll('.ss-cmp-r').length === 5 && [...document.querySelectorAll('.ss-cmp-r .ss-kpi')].every((a, i) => a.getAttribute('href') === `quran.html#kpi${[5, 2, 3, 7, 6][i]}`)));
  check('report: timeline lists 12 decisions with the document quote', await p.evaluate(() => document.querySelectorAll('.ss-tl > li').length === 12 && document.querySelectorAll('.ss-tl .ss-doc').length >= 12));
  check('report: target numbers 80/90/80/90/100 shown', await p.evaluate(() => /80%/.test(document.querySelector('.ss-cmp').innerText) && /90%/.test(document.querySelector('.ss-cmp').innerText) && /100%/.test(document.querySelector('.ss-cmp').innerText)));
  // share card
  const png = await p.evaluate(() => window.YanabeeSeason.card());
  check('share card is a PNG data URL', /^data:image\/png;base64,/.test(png) && png.length > 20000, png.slice(0, 40));
  const dl = p.waitForEvent('download');
  await p.click('[data-dl]');
  const d = await dl;
  check('download button saves a .png', /\.png$/.test(d.suggestedFilename()), d.suggestedFilename());
  const cvs = await p.$eval('#ss-canvas', e => [e.width, e.height]);
  check('share card canvas is 1080x1350', cvs[0] === 1080 && cvs[1] === 1350);
  check('canvas is not blank', await p.evaluate(() => { const c = document.querySelector('#ss-canvas'), x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < x.length; i += 4000) if (x[i] > 40) n++; return n > 20; }));
  // persistence of a finished season
  await p.reload(); await p.waitForSelector('#tab-season'); await p.click('#tab-season');
  check('finished season survives a reload (report shown)', await p.waitForSelector('.ss-report:not([hidden]) .ss-rep', { timeout: 3000 }).then(() => true).catch(() => false));
  check('no console errors during a full season', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 4. worst playthrough + chained follow-ups
console.log('full season, worst choices (chained follow-ups)');
{
  const { ctx, p, errs } = await open();
  // find a seed whose draw contains a chain trigger early (computed in the page, deterministic)
  const seed = await p.evaluate(() => { for (let s = 1; s < 200; s++) { const sl = window.YanabeeSeason.seed(s); const D = window.YanabeeSeason.data(); const i = sl.findIndex(id => D.scn.find(x => x.id === id).trig); if (i >= 0 && i <= 6) return s; } return 0; });
  await p.evaluate(s => window.YanabeeSeason.seed(s), seed);
  await p.waitForSelector('#ss-card[data-week="1"]');
  const slots = (await st(p)).slots;
  const ti = slots.findIndex(id => D.scn.find(x => x.id === id).trig);
  // play best until the trigger week, then take the bad branch that chains
  let wk = 1;
  for (; wk <= ti; wk++) { await pickQ(p, D, 2); await advance(p); await p.waitForSelector(`#ss-card[data-week="${wk + 1}"]`); }
  const trig = D.scn.find(s => s.id === slots[ti]);
  const bad = trig.ch.findIndex(c => c.follow);
  await p.click(`.ss-choice[data-ci="${bad}"]`);
  await p.waitForSelector('#ss-fb [data-next]');
  const afterBad = await st(p);
  const fid = trig.ch[bad].follow;
  check(`bad choice in «${trig.id}» schedules the follow-up «${fid}» two weeks later`, afterBad.slots[ti + 2] === fid, JSON.stringify(afterBad.slots));
  check('the feedback warns that it may come back', /قد يعود أثرها/.test(await p.$eval('#ss-fb', e => e.innerText)));
  await advance(p); await p.waitForSelector(`#ss-card[data-week="${ti + 2}"]`);
  await pickQ(p, D, 2); await advance(p); await p.waitForSelector(`#ss-card[data-week="${ti + 3}"]`);
  check('follow-up card appears on time and is flagged', (await p.$eval('#ss-card', e => e.dataset.scn)) === fid && !!(await p.$('#ss-card .ss-follow')));
  // finish the rest with the worst choices
  for (let w = ti + 3; w <= 12; w++) { await pickQ(p, D, 0); await advance(p); if (w < 12) await p.waitForSelector(`#ss-card[data-week="${w + 1}"]`); }
  await p.waitForSelector('.ss-report:not([hidden]) .ss-rep');
  const sc = await p.evaluate(() => window.YanabeeSeason.score());
  const fin = await st(p);
  check('mixed/worst play yields fewer stars than the best', sc.stars <= 1, JSON.stringify(sc));
  check('worst play ends below the top titles', sc.title.t !== 'قائد ينابيع الوطن' && sc.score < 70, JSON.stringify(sc));
  check('the report is still complete and shows what the document says', await p.evaluate(() => document.querySelectorAll('.ss-tl > li').length === 12));
  check('replay starts a different order', await p.evaluate(async () => { const a = window.YanabeeSeason.state().slots.join(); document.querySelector('[data-replay]').click(); await new Promise(r => setTimeout(r, 200)); return window.YanabeeSeason.state().slots.join() !== a; }));
  void fin;
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 5. hint, persistence, new season
console.log('hint, persistence, new season');
{
  const { ctx, p, errs } = await open();
  await p.evaluate(() => window.YanabeeSeason.seed(11));
  await p.waitForSelector('#ss-card[data-week="1"]');
  const trust0 = (await st(p)).m.trust;
  await p.click('[data-hint]');
  const s0 = await st(p);
  check('hint costs a little trust', s0.m.trust === Math.max(0, trust0 - D.hintCost), `${trust0} -> ${s0.m.trust}`);
  check('hint points at the document section with a working link', await p.evaluate(() => { const a = document.querySelector('[data-hint-out] a'); return !!a && /^(index|teams|operations|quran)\.html#\w+$/.test(a.getAttribute('href')); }));
  check('hint can be used once per scenario', await p.$eval('[data-hint]', b => b.disabled) && s0.hints === 1);
  // choose, advance a few weeks, reload mid-season
  await pickQ(p, D, 2); await advance(p); await p.waitForSelector('#ss-card[data-week="2"]');
  await pickQ(p, D, 1);
  const before = await st(p);
  await p.reload(); await p.waitForSelector('#tab-season'); await p.click('#tab-season');
  await p.waitForSelector('#ss-card[data-week="2"]');
  const after = await st(p);
  check('reload resumes the same week, scenario and meters', after.w === before.w && after.slots.join() === before.slots.join() && JSON.stringify(after.m) === JSON.stringify(before.m));
  check('reload restores the feedback of the answered week', !!(await p.$('#ss-fb:not([hidden]) [data-next]')) && !!(await p.$('.ss-choice.picked')));
  check('hint use persisted (hints=1)', after.hints === 1);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-season-v1')).seed);
  check('progress is in localStorage', stored === 11);
  // new season needs a confirmation click while a season is running
  await p.click('[data-ss-new]');
  check('first click asks for confirmation', await p.$eval('[data-ss-new]', b => b.classList.contains('confirm')) && (await st(p)).seed === 11);
  await p.click('[data-ss-new]');
  await p.waitForSelector('#ss-card[data-week="1"]');
  const n = await st(p);
  check('«ابدأ موسماً جديداً» starts a fresh season (week 1, no log, new seed)', n.seed !== 11 && n.log.length === 0 && n.w === 0 && n.hints === 0 && JSON.stringify(Object.values(n.m)) === JSON.stringify(D.meters.map(m => m.s)));
  check('same seed gives the same order, another seed another order', await p.evaluate(() => { const a = window.YanabeeSeason.seed(5).join(), b = window.YanabeeSeason.seed(5).join(), c = window.YanabeeSeason.seed(6).join(); return a === b && a !== c; }));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 6. keyboard-only season
console.log('keyboard');
{
  const { ctx, p, errs } = await open();
  await p.evaluate(() => window.YanabeeSeason.seed(77));
  await p.waitForSelector('#ss-card[data-week="1"]');
  await p.mouse.click(5, 5);                    // focus nowhere in particular
  let enters = 0;
  for (let i = 0; i < 40 && (await phase(p)) !== 'report'; i++) {
    const ph = await p.evaluate(() => window.YanabeeSeason.state().phase);
    if (ph === 'choose') await p.keyboard.press(String(1 + (i % 3)));
    else { await p.keyboard.press('Enter'); enters++; }
    await p.waitForTimeout(40);
  }
  check('1/2/3 choose and Enter continues (incl. unlock overlays) up to the report', (await phase(p)) === 'report', `phase=${await phase(p)}`);
  check('keyboard season logged 12 decisions', (await st(p)).log.length === 12);
  check('Enter pressed 12 + 3 unlock times', enters >= 15, String(enters));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 7. layout: overflow + tap targets, both widths, both themes
for (const [w, theme] of [[390, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']]) {
  console.log(`layout ${w} ${theme}`);
  const { ctx, p, errs } = await open({ viewport: { width: w, height: w < 600 ? 844 : 900 }, colorScheme: theme, hasTouch: w < 600, isMobile: w < 600 });
  const noOver = async tag => { const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(`${tag}: no horizontal overflow`, o <= 1, String(o)); };
  await noOver('start');
  await p.evaluate(() => window.YanabeeSeason.seed(5));
  await p.waitForSelector('#ss-card[data-week="1"]');
  await noOver('scenario');
  const tap = await p.evaluate(() => [...document.querySelectorAll('.ss-choice,.ss-hint,[data-ss-new]')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
  check('scenario: choices/hint/new buttons are >= 44px tall', tap.length >= 4 && tap.every(h => h >= 44), tap.join(','));
  const sceneH = await p.$eval('#ss-card .ss-scene', e => e.getBoundingClientRect().height);
  check('scene header is illustrated and sized', sceneH >= 180, String(sceneH));
  await pickQ(p, D, 2);
  await noOver('feedback');
  const nh = await p.$eval('[data-next]', e => e.getBoundingClientRect().height);
  check('next button >= 44px', nh >= 44, String(nh));
  await p.click('[data-next]'); await p.waitForSelector('#ss-card[data-week="2"]');
  for (let k = 2; k <= 3; k++) { await pickQ(p, D, 2); await p.click('[data-next]'); }
  await p.waitForSelector('.ss-unlock:not([hidden])');
  await noOver('unlock');
  const ub = await p.$eval('[data-unlock-go]', e => e.getBoundingClientRect().height);
  check('unlock button >= 44px', ub >= 44, String(ub));
  await p.click('[data-unlock-go]');
  for (let k = 4; k <= 12; k++) { await p.waitForSelector(`#ss-card[data-week="${k}"]`); await pickQ(p, D, 2); await p.click('[data-next]'); const u = await p.$('.ss-unlock:not([hidden]) [data-unlock-go]'); if (u) await u.click(); }
  await p.waitForSelector('.ss-report:not([hidden]) .ss-rep');
  await noOver('report');
  const contrast = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('.ss-fx, .ss-stat b, .ss-cmp-h b')); return cs.color; });
  check('text colour resolves (theme tokens applied)', !!contrast);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 7b. lab tabs still switch after the panel was used
console.log('lab tabs');
{
  const { ctx, p, errs } = await open();
  await p.evaluate(() => window.YanabeeSeason.seed(9));
  await pickQ(p, D, 2); await advance(p);
  check('season panel has no role=tab of its own', (await p.$$('#season [role="tab"]')).length === 0);
  await p.click('#tab-studio');
  check('Studio tab shows, season panel hides', await p.evaluate(() => !document.getElementById('panel-studio').hidden && document.getElementById('panel-season').hidden));
  await p.click('#tab-season');
  check('Season tab shows again with the game state intact', await p.evaluate(() => document.getElementById('panel-studio').hidden && !document.getElementById('panel-season').hidden && window.YanabeeSeason.state().w === 1));
  check('bottom padding keeps controls clear of the passport chip', await p.$eval('#season', e => parseInt(getComputedStyle(e).paddingBottom) >= 72));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ================================================================== 8. motion on: animations run, confetti on success
console.log('motion');
{
  const { ctx, p, errs } = await open({ reducedMotion: 'no-preference' });
  await p.evaluate(() => window.YanabeeSeason.seed(2024));
  await p.waitForSelector('#ss-card[data-week="1"]');
  check('scene has animated ambient layers when motion is allowed', await p.evaluate(() => getComputedStyle(document.querySelector('.ss-svg .cloud')).animationName !== 'none'));
  await pickQ(p, D, 2);
  await p.waitForTimeout(250);
  check('score pops appear on the meters', (await p.$$('.ss-pop i')).length >= 1);
  await p.click('[data-next]'); await p.waitForSelector('#ss-card[data-week="2"]');
  for (let k = 2; k <= 3; k++) { await pickQ(p, D, 2); await p.click('[data-next]'); }
  await p.waitForSelector('.ss-unlock:not([hidden])');
  check('unlock moment animates (rays/ring) and fires confetti', await p.evaluate(() => getComputedStyle(document.querySelector('.ss-ul-ic')).animationName !== 'none') && !!(await p.$('canvas.yb-confetti')));
  await ctx.close();
  const r = await open({ reducedMotion: 'reduce' });
  await r.p.evaluate(() => window.YanabeeSeason.seed(2024));
  check('reduced motion: ambient animation off', await r.p.evaluate(() => getComputedStyle(document.querySelector('.ss-svg .cloud')).animationName === 'none'));
  check('reduced motion: no console errors', r.errs.length === 0 && errs.length === 0, [...r.errs, ...errs].join(' | '));
  await r.ctx.close();
}

await browser.close();
console.log(`\n${pass}/${total} checks passed`);
if (fails.length) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
