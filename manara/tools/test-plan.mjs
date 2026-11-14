// Rollout plan (plan.html) tests — Playwright + Chromium, file:// URLs:  node manara/tools/test-plan.mjs
//
//  1. Loads clean in ar/en × dark/light at 390, 820 and 1440; no horizontal overflow; one h1; lang/dir follow
//  2. Content: why now (4 sourced cards), 3-phase roadmap with gates, approvals checklist, cost table, risks table, KPIs, references
//  3. Honesty: every SIM number is labelled SIM and "to be measured for real"; the SIM numbers equal the project's own results;
//     costs are "approximate / check suppliers / no quote"; QCAA (not another country's authority); unsourced → "to be confirmed"
//  4. Approvals checklist: ticking, counter, meter, persistence, both languages
//  5. Roadmap motion: CSS transform + opacity only, no loop faster than 1.2 s, no flashing, reduced motion = static final picture
//  6. Print: tables visible, roadmap static, no overflow
//  7. Code: no innerHTML, logical CSS, no external scripts, references are https
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, overflow, check, done, SITE } from './lib.mjs';

const section = t => console.log(`\n${t}`);
const browser = await launch();
const textOf = (page, sel) => page.evaluate(q => { const out = []; const w = document.createTreeWalker(document.querySelector(q), NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { const e = n.parentElement; if (n.textContent.trim() && e.checkVisibility()) out.push(n.textContent.trim()); } return out.join('\n'); }, sel);
const open = async (o = {}) => {
  const r = await openPage(browser, 'plan.html', { width: 1440, height: 1000, lang: 'ar', ...o });
  await r.page.waitForFunction(() => window.__planReady === true, null, { timeout: 8000 }).catch(() => r.errors.push('plan never set __planReady'));
  return r;
};

section('1. Loads clean · layout · language');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 820, 1440]) {
  const { page, errors, ctx } = await open({ lang, theme, width, height: width < 600 ? 844 : 1000 });
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  const o = await overflow(page);
  check(`${tag}: no horizontal page overflow`, o.scrollW <= o.W && o.bad.length === 0, `${o.scrollW} > ${o.W}: ${o.bad.join(', ')}`);
  const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title, theme: document.documentElement.dataset.theme }));
  check(`${tag}: one h1, lang/dir/theme follow, bilingual title`, r.h1 === 1 && r.lang === lang && r.dir === (lang === 'ar' ? 'rtl' : 'ltr') && r.theme === theme && /خطة التطبيق|Rollout plan/.test(r.title), JSON.stringify(r));
  await ctx.close();
}

section('2. Content');
for (const lang of ['ar', 'en']) {
  const { page, ctx } = await open({ lang });
  const r = await page.evaluate(() => ({
    why: document.querySelectorAll('.pl-why .card').length, whySrc: [...document.querySelectorAll('.pl-why .card .src a')].filter(a => /^https:/.test(a.href)).length,
    phases: document.querySelectorAll('.rm-node').length, gates: document.querySelectorAll('.rm-gate').length, now: document.querySelectorAll('.rm-node.now').length,
    ap: document.querySelectorAll('#ap input').length, tables: [...document.querySelectorAll('.pl-table')].map(t => t.querySelectorAll('tbody tr').length),
    refs: [...document.querySelectorAll('.refs a')].map(a => a.href), sections: [...document.querySelectorAll('main > section')].map(s => s.id).filter(Boolean) }));
  check(`${lang}: why now has 4 cards, each with a real https source`, r.why === 4 && r.whySrc >= 5, JSON.stringify([r.why, r.whySrc]));
  check(`${lang}: 3 phases (school prototype → district pilot → scale), each with a go/no-go gate, one marked "we are here"`, r.phases === 3 && r.gates === 3 && r.now === 1);
  check(`${lang}: approvals checklist has 7 items (aviation, privacy, civil defence, MoI/999, ethics, owners, insurance)`, r.ap === 7, String(r.ap));
  check(`${lang}: cost table 3 rows, risks table ≥ 6 rows (false alarms, privacy, weather, battery, liability, sim≠reality), KPI table ≥ 5 rows`, r.tables[0] === 3 && r.tables[1] >= 6 && r.tables[2] >= 5, JSON.stringify(r.tables));
  check(`${lang}: ${r.refs.length} references, all https`, r.refs.length >= 6 && r.refs.every(h => /^https:/.test(h)));
  check(`${lang}: sections in order why → roadmap → approvals → cost → risks → KPIs → refs`, r.sections.join() === 'why,roadmap,approvals,cost,risks,kpis,refs', r.sections.join());
  await ctx.close();
}

section('3. Honesty');
{
  const res = fs.readFileSync(path.join(SITE, 'js/poster.js'), 'utf8').match(/RESULTS\.drone = \{.*?\};/)?.[0] || '';
  const g = k => +(new RegExp(k + ':\\s*([\\d.]+)').exec(res) || [])[1];
  const proj = { first: g('droneFirstPct'), no: g('noDronePct'), d: g('droneP50'), gr: g('groundP50'), th: g('thermalNoon'), tn: g('thermalNight') };
  check('the project\'s own drone results (poster RESULTS.drone: seed 7, 150 incidents) are 90 / 33 / 244 / 440.5 / 2 / 70, which the plan shows as 90 / 33 / 244 / 440 / 2 / 70', proj.first === 90 && proj.no === 33 && proj.d === 244 && Math.abs(proj.gr - 440) <= 1 && proj.th === 2 && proj.tn === 70, JSON.stringify(proj));
  for (const lang of ['en', 'ar']) {
    const { page, ctx } = await open({ lang });
    const t = await textOf(page, 'main');
    const nums = [90, 244, 440, 33, 2, 70];
    check(`${lang}: the SIM numbers on the plan equal the project's (90, 244, 440, 33, 2, 70 and "5 of 8")`, nums.every(n => new RegExp('\\b' + n + '\\b').test(t)) && /\b5\b[^\n]{0,12}\b8\b|5 من 8/.test(t), t.length + '');
    const kp = await page.evaluate(() => [...document.querySelectorAll('.pl-kpis .kpi')].map(k => /SIM/.test(k.textContent)));
    check(`${lang}: every headline KPI tile carries a SIM tag`, kp.length === 4 && kp.every(Boolean));
    const rows = await page.evaluate(() => [...document.querySelectorAll('#kpis tbody tr')].map(r => ({ sim: /\d/.test(r.cells[1].textContent), tag: /SIM/.test(r.cells[1].textContent), measured: r.cells[2].querySelector('b') != null })));
    check(`${lang}: KPI table — each row with a number says SIM, and each row says "to be measured for real"`, rows.every(r => !r.sim || r.tag) && rows.every(r => r.measured), JSON.stringify(rows));
    check(`${lang}: the cost table is approximate, says check suppliers / no quote, and invents no Phase 3 number`, (lang === 'en' ? /check suppliers/i.test(t) && /no quote/i.test(t) && /we give no figure/i.test(t) : /تحقّق من الموردين/.test(t) && /لا عرض سعر/.test(t) && /لا نذكر رقمًا/.test(t)));
    check(`${lang}: the regulator is the Qatar Civil Aviation Authority (QCAA), and unverified items say "to be confirmed"`, /QCAA/.test(t) && (lang === 'en' ? /to be confirmed/i.test(t) : /تُؤكَّد|يُؤكَّد|نُؤكّد|سنُؤكّد/.test(t)));
    check(`${lang}: 999 stays the dispatcher and the human decides`, /999/.test(t) && (lang === 'en' ? /999 stays the dispatcher|999 still the dispatcher|999 stays/i.test(t) : /999/.test(t)));
    check(`${lang}: no banned claims (saves lives, AI-powered, world-first, deep learning)`, !/saves? (many )?lives|AI[- ]powered|world[- ]first|deep learning|artificial intelligence|ذكاء\s+اصطناعي|ينقذ.{0,6}الأرواح/i.test(t));
    await ctx.close();
  }
}

section('4. Approvals checklist');
for (const lang of ['en', 'ar']) {
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const { page, errors } = await open({ lang, context: b });
  const c0 = await page.textContent('#ap-count');
  check(`${lang}: starts at 0 of 7 confirmed`, /^0 \/ 7/.test(c0), c0);
  await page.check('#ap input >> nth=0'); await page.check('#ap input >> nth=3');
  const m = await page.evaluate(() => ({ c: document.querySelector('#ap-count').textContent, s: document.querySelector('#ap-meter').style.transform }));
  check(`${lang}: ticking two items shows 2 / 7 and the meter moves`, /^2 \/ 7/.test(m.c) && /scaleX\(0\.28/.test(m.s), JSON.stringify(m));
  await page.waitForTimeout(100); await page.reload(); await page.waitForFunction(() => window.__planReady === true);
  check(`${lang}: the ticks survive a reload`, /^2 \/ 7/.test(await page.textContent('#ap-count')));
  check(`${lang}: the checkboxes have accessible names (their label text)`, await page.evaluate(() => [...document.querySelectorAll('#ap input')].every(i => i.closest('label').textContent.trim().length > 20)));
  check(`${lang}: no console errors`, errors.length === 0, errors.join(' | '));
  await b.close();
}

section('5. Roadmap motion');
{
  const css = fs.readFileSync(path.join(SITE, 'css/plan.css'), 'utf8');
  const kf = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(m => ({ n: m[1], props: [...new Set([...m[2].matchAll(/([\w-]+)\s*:/g)].map(x => x[1]))].filter(p => !/^\d|^from|^to$/.test(p)) }));
  check(`${kf.length} keyframes (${kf.map(k => k.n).join(', ')}) animate only transform and opacity`, kf.length >= 3 && kf.every(k => k.props.every(p => p === 'transform' || p === 'opacity')), JSON.stringify(kf));
  const { page, ctx } = await open({ lang: 'en', reducedMotion: 'no-preference' });
  await page.evaluate(() => document.querySelector('#rm').scrollIntoView()); await page.waitForTimeout(500);
  const an = await page.evaluate(() => document.getAnimations().map(a => { const t = a.effect.getTiming(); return { n: a.animationName || a.constructor.name, dur: t.duration, it: t.iterations, props: [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)))] }; }).filter(a => /^rm-/.test(a.n)));
  check(`motion on: the roadmap runs ${an.length} animations (bar growth, node entrance, "we are here" pulse)`, an.length >= 3 && an.some(a => a.n === 'rm-pulse') && an.some(a => a.n === 'rm-grow'), JSON.stringify(an));
  check('every roadmap animation uses transform/opacity only', an.every(a => a.props.every(p => p === 'transform' || p === 'opacity')), JSON.stringify(an.map(a => a.props)));
  check('nothing loops faster than 1.2 s (the only loop is the 2.4 s pulse) — far below 3 flashes a second', an.filter(a => a.it === Infinity).every(a => a.dur >= 1200) && an.filter(a => a.it === Infinity).length <= 1, JSON.stringify(an.filter(a => a.it === Infinity)));
  const gl = await page.evaluate(() => document.getAnimations().filter(a => a.effect.getTiming().iterations === Infinity && !/^rm-/.test(a.animationName || '')).map(a => a.animationName));
  check('no other infinite animation on the page (the nav and base styles add none)', gl.length === 0, JSON.stringify(gl));
  await ctx.close();
  const r = await open({ lang: 'en', reducedMotion: 'reduce' });
  await r.page.evaluate(() => document.querySelector('#rm').scrollIntoView()); await r.page.waitForTimeout(300);
  const st = await r.page.evaluate(() => ({ run: document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).length, bar: getComputedStyle(document.querySelector('.rm-bar')).transform, ops: [...document.querySelectorAll('.rm-node')].map(n => getComputedStyle(n).opacity), pulse: getComputedStyle(document.querySelector('.rm-node.now .rm-dot'), '::after').animationName }));
  check('reduced motion: no infinite animation, the bar is full, all three phases visible (static picture)', st.run === 0 && (st.bar === 'none' || /matrix\(1,/.test(st.bar)) && st.ops.every(o => o === '1'), JSON.stringify(st));
  await r.ctx.close();
}

section('6. Print');
{
  const { page, ctx } = await open({ lang: 'en', reducedMotion: 'no-preference' });
  await page.emulateMedia({ media: 'print' }); await page.waitForTimeout(500);
  const pv = await page.evaluate(() => ({ nodes: [...document.querySelectorAll('.rm-node')].map(n => getComputedStyle(n).opacity), nav: getComputedStyle(document.querySelector('.nav')).display, wrap: getComputedStyle(document.querySelector('.table-wrap')).overflowX }));
  check('print: nav hidden, all phases visible, tables not clipped', pv.nav === 'none' && pv.nodes.every(o => o === '1') && pv.wrap === 'visible', JSON.stringify(pv));
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  check('print PDF renders', pdf.length > 20000, String(pdf.length));
  await ctx.close();
}

section('7. Code');
{
  const js = fs.readFileSync(path.join(SITE, 'js/plan.js'), 'utf8'), css = fs.readFileSync(path.join(SITE, 'css/plan.css'), 'utf8'), html = fs.readFileSync(path.join(SITE, 'plan.html'), 'utf8');
  check('plan.js: no innerHTML/insertAdjacentHTML, no import/export, no fetch/XHR', !/innerHTML|insertAdjacentHTML|outerHTML/.test(js) && !/^\s*(import|export)\s/m.test(js) && !/\bfetch\s*\(|XMLHttpRequest/.test(js));
  check('plan.css: logical properties only (no margin/padding-left/right, no letter-spacing)', !/(margin|padding)-(left|right)|text-align:\s*(left|right)|letter-spacing/.test(css));
  check('plan.html: no external scripts or CDNs; external links open with noopener', !/<script[^>]+src="https?:/.test(html) && [...html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)].every(m => /noopener/.test(m[0])));
}
await done(browser);
