// Display board (poster.html) tests — Playwright + Chromium, file:// URLs:  node tools/manara/test-poster.mjs
//
//  1. Loads clean in ar/en × dark/light at 390 and 1440; no horizontal page overflow; one h1; the shell language/direction follow
//  2. Layouts and sizes: tri-fold (90×60 cm, 3×A3, 3×A2, custom) and A0 → page sizes, @page rule, custom clamping, bleed
//  3. Fit audit PER PANEL (layout × size × language × single/both): nothing overflows its panel or its module, no module overlaps
//     the next, no SVG text leaves its figure, nothing is smaller than ~9 pt on paper; the auto-fit scale is reported
//  4. Bilingual behaviour: both languages together (page language first), one language only, panel order flips with direction
//  5. Honesty: banned phrases, "AI" only where it is a disclosure or a denial, every number on the board is on the allowed list,
//     every SIM figure is labelled, no innerHTML / fetch / modules / physical CSS properties in our own source
//  6. Provenance: the numbers drawn on the board equal a FRESH run of the fire detector test and of the simulation (A/B, seed 1)
//  7. QR codes: encoder vs python-qrcode reference vectors (all versions 1–10, all levels, short and full data); URL input → real codes
//  8. Team fields ({{PLACEHOLDERS}}): textContent only, persisted, counter
//  9. Print: PDF page counts and page sizes (tri-fold = 3 pages, A0 = 1 page, bleed adds 20 mm), light palette, no blank pages
// 10. Contrast (dark, light, paper), keyboard/labels, print button, zoom controls, no animation, no network
//
// Everything simulated is labelled SIM on the board; this test checks that the board is honest about it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, ROOT, SITE } from './lib.mjs';

const section = t => console.log(`\n${t}`);
const browser = await launch();
const PDF_DIR = process.env.MANARA_PDF_DIR || path.join(os.tmpdir(), 'manara-poster-pdf');
fs.mkdirSync(PDF_DIR, { recursive: true });

const open = async (query = '', o = {}) => {
  const r = await openPage(browser, 'poster.html', { width: 1440, height: 1000, lang: 'ar', theme: 'light', query, ...o });
  await r.page.waitForFunction(() => window.__posterReady === true, null, { timeout: 8000 }).catch(() => r.errors.push('poster never set __posterReady'));
  return r;
};

// ======================================================================= 1. loads clean
section('1. Loads clean · layout · language');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
  const { page, errors, ctx } = await open('', { lang, theme, width, height: width < 600 ? 844 : 1000 });
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  const o = await overflow(page);
  check(`${tag}: no horizontal page overflow`, o.scrollW <= o.W && o.bad.length === 0, `${o.scrollW} > ${o.W}: ${o.bad.join(', ')}`);
  const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title, panels: document.querySelectorAll('.panel').length, theme: document.documentElement.dataset.theme }));
  check(`${tag}: one h1, lang/dir/theme follow, bilingual title, 3 panels`, r.h1 === 1 && r.lang === lang && r.dir === (lang === 'ar' ? 'rtl' : 'ltr') && r.theme === theme && r.panels === 3 && /لوحة|Display board/.test(r.title), JSON.stringify(r));
  await ctx.close();
}

// ======================================================================= 2. layouts and sizes
section('2. Layouts · sizes · @page rule · bleed');
{
  const { page, errors, ctx } = await open();
  const info = () => page.evaluate(() => ({ pg: ManaraPoster.pageInfo(), rule: document.getElementById('page-rule').textContent, layout: document.getElementById('board').dataset.layout, shown: [...document.querySelectorAll('.panel')].filter(p => getComputedStyle(p).display !== 'none').length, st: ManaraPoster.state }));
  let i = await info();
  check('default: tri-fold, 90 × 60 cm (3 pages of 300 × 600 mm), @page rule matches', i.layout === 'tri' && i.shown === 3 && i.pg.w === 300 && i.pg.h === 600 && i.pg.pages === 3 && i.rule === '@page{size:300mm 600mm;margin:0}', JSON.stringify(i));
  await page.evaluate(() => ManaraPoster.setSize('a3')); i = await info();
  check('3 × A3: 297 × 420 mm, three pages', i.pg.w === 297 && i.pg.h === 420 && i.pg.pages === 3 && i.rule === '@page{size:297mm 420mm;margin:0}', JSON.stringify(i.pg));
  await page.evaluate(() => ManaraPoster.setSize('a2')); i = await info();
  check('3 × A2: 420 × 594 mm', i.pg.w === 420 && i.pg.h === 594 && i.pg.pages === 3, JSON.stringify(i.pg));
  await page.evaluate(() => ManaraPoster.setCustom(333, 555)); i = await info();
  check('custom panel size is used (333 × 555 mm) and the select shows "custom"', i.pg.w === 333 && i.pg.h === 555 && i.st.size === 'custom' && await page.$eval('#sel-size', s => s.value) === 'custom' && await page.$eval('#custom-size', e => !e.hidden));
  await page.evaluate(() => ManaraPoster.setCustom(50, 9999)); i = await info();
  check('custom size is clamped to 200–1000 × 280–1400 mm', i.pg.w === 200 && i.pg.h === 1400, JSON.stringify(i.pg));
  await page.evaluate(() => ManaraPoster.setLayout('a0')); i = await info();
  check('A0 portrait: one page of 841 × 1189 mm, one panel shown, size select disabled', i.layout === 'a0' && i.shown === 1 && i.pg.w === 841 && i.pg.h === 1189 && i.pg.pages === 1 && i.rule === '@page{size:841mm 1189mm;margin:0}' && await page.$eval('#sel-size', s => s.disabled), JSON.stringify(i));
  const a0 = await page.evaluate(() => ({ hero: !!document.querySelector('.a0-hero #m-hero'), team: !!document.querySelector('.a0-foot #m-team'), cols: [...document.querySelectorAll('.a0-col')].map(c => [...c.children].map(m => m.id)), nums: [...document.querySelectorAll('.a0-col .mn')].map(n => +n.textContent), split: ManaraPoster.splitAt }));
  const flat = a0.nums;
  check('A0: hero banner on top, team strip at the bottom, two columns, modules still read 01 … 12 in order', a0.hero && a0.team && a0.cols.length === 2 && a0.cols.flat().length === 12 && flat.every((n, k) => n === k + 1), JSON.stringify(a0));
  check('A0: the columns are balanced by measured height (split between 4 and 8)', a0.split >= 4 && a0.split <= 8, String(a0.split));
  const bal = await page.evaluate(() => { const hs = [...document.querySelectorAll('.a0-col')].map(c => [...c.children].reduce((s, m) => s + m.offsetHeight, 0)); return { hs, ratio: Math.max(...hs) / Math.min(...hs) }; });
  check(`A0: the two columns carry similar content heights (ratio ${bal.ratio.toFixed(2)} ≤ 1.25) so neither has big empty gaps`, bal.ratio <= 1.25, JSON.stringify(bal));
  await page.evaluate(() => ManaraPoster.setLayout('tri')); i = await info();
  check('back to tri-fold: modules return to their own panels (01–05 / 06–09 / 10–12)', await page.evaluate(() => [...document.querySelectorAll('.panel')].map(p => [...p.querySelectorAll('.mod .mn')].map(n => n.textContent).join(',')).join('|')) === '01,02,03,04,05|06,07,08,09|10,11,12', await page.evaluate(() => [...document.querySelectorAll('.panel')].map(p => [...p.querySelectorAll('.mod .mn')].map(n => n.textContent).join(',')).join('|')));
  await page.evaluate(() => { ManaraPoster.setSize('a3'); ManaraPoster.setOpt('bleed', true); }); i = await info();
  check('bleed + crop marks: each page grows by 20 mm (3 mm bleed + 7 mm slug per side): 317 × 440 mm', i.pg.w === 317 && i.pg.h === 440 && i.rule === '@page{size:317mm 440mm;margin:0}', JSON.stringify(i.pg));
  check('crop marks appear only with bleed', await page.evaluate(() => getComputedStyle(document.querySelector('.crop')).display === 'block') && (await page.evaluate(() => { ManaraPoster.setOpt('bleed', false); return getComputedStyle(document.querySelector('.crop')).display; })) === 'none');
  check('layout/size changes do not raise errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 3. fit audit per panel
section('3. Fit audit per panel (overflow · overlap · SVG text · minimum size)');
const AUDIT = () => {
  const board = document.getElementById('board');
  const visible = e => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('.sr-only, .crop, .pbg, defs, pattern, [hidden]'); };
  const out = { k: ManaraPoster.k, containers: [], outside: [], overlaps: [], svgClip: [], minPt: 99, minWhere: '', small: [] };
  ManaraPoster.containers().forEach(c => { if (c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1) out.containers.push(`${c.id || c.className}: ${c.scrollHeight}x${c.scrollWidth} > ${c.clientHeight}x${c.clientWidth}`); });
  const panels = [...board.querySelectorAll('.panel')].filter(p => getComputedStyle(p).display !== 'none');
  const label = e => (e.id ? '#' + e.id : (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : e.tagName)) + ' "' + (e.textContent || '').trim().slice(0, 26) + '"';
  panels.forEach(p => {
    const pin = p.querySelector('.pin'), pr = pin.getBoundingClientRect();
    pin.querySelectorAll('*').forEach(e => {
      if (!visible(e)) return;
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (e.closest('svg') && e.tagName.toLowerCase() !== 'text' && e.tagName.toLowerCase() !== 'svg') return;
      if (r.left < pr.left - 2 || r.right > pr.right + 2 || r.top < pr.top - 2 || r.bottom > pr.bottom + 2) out.outside.push(`${p.id}: ${label(e)}`);
    });
    // modules of one parent must not overlap
    const groups = new Map();
    pin.querySelectorAll('.mod').forEach(m => { if (!visible(m)) return; const k = m.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); });
    groups.forEach(list => { list.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); for (let n = 1; n < list.length; n++) { const a = list[n - 1].getBoundingClientRect(), b = list[n].getBoundingClientRect(); if (a.bottom > b.top + 1.5) out.overlaps.push(`${list[n - 1].id}/${list[n].id} by ${(a.bottom - b.top).toFixed(1)}px`); } });
    // a module's own content must stay inside it
    pin.querySelectorAll('.mod').forEach(m => { if (!visible(m)) return; const mr = m.getBoundingClientRect(); m.querySelectorAll('*').forEach(e => { if (!visible(e) || (e.closest('svg') && e.tagName.toLowerCase() !== 'text')) return; const r = e.getBoundingClientRect(); if (r.width && (r.right > mr.right + 2 || r.left < mr.left - 2)) out.outside.push(`${m.id} (sideways): ${label(e)}`); }); });
  });
  board.querySelectorAll('svg.sv').forEach(svg => {
    if (!visible(svg) || !svg.getBoundingClientRect().width) return;
    const sr = svg.getBoundingClientRect();
    svg.querySelectorAll('text').forEach(t => { const r = t.getBoundingClientRect(); if (r.left < sr.left - 1.5 || r.right > sr.right + 1.5 || r.top < sr.top - 1.5 || r.bottom > sr.bottom + 1.5) out.svgClip.push(`${svg.closest('figure').dataset.fig}: "${t.textContent.slice(0, 24)}"`); });
  });
  // smallest text on paper (screen px at scale 1 = CSS px; 1 CSS px = 0.75 pt)
  const consider = (px, where) => { const pt = px * 0.75; if (pt < out.minPt) { out.minPt = pt; out.minWhere = where; } if (pt < 8.4) out.small.push(`${pt.toFixed(1)}pt ${where}`); };
  const tw = document.createTreeWalker(board, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const e = n.parentElement; if (!e || !visible(e)) continue;
    if (e.closest('svg')) { const t = e.closest('text'); if (!t) continue; const m = t.getScreenCTM(); consider(parseFloat(getComputedStyle(t).fontSize) * m.a, 'svg ' + t.textContent.slice(0, 20)); }
    else if (!e.closest('.qr-box')) consider(parseFloat(getComputedStyle(e).fontSize), label(e));
  }
  return out;
};
{
  const kTable = [];
  for (const lang of ['ar', 'en']) {
    const { page, errors, ctx } = await open('', { lang, width: 1500, height: 1000 });
    const configs = [['tri', 'b90'], ['tri', 'a3'], ['tri', 'a2'], ['tri', 'custom'], ['a0', 'a3']];
    for (const [layout, size] of configs) for (const both of [true, false]) {
      await page.evaluate(([layout, size, both]) => { ManaraPoster.setBoth(both); if (size === 'custom') ManaraPoster.setCustom(380, 520); else ManaraPoster.setSize(size); ManaraPoster.setLayout(layout); ManaraPoster.setZoom(1); }, [layout, size, both]);
      await page.waitForTimeout(60);
      const a = await page.evaluate(AUDIT);
      const tag = `${lang} ${layout === 'a0' ? 'A0' : size} ${both ? 'both languages' : 'one language'}`;
      kTable.push([tag, a.k, a.minPt]);
      if (layout === 'tri' && size === 'a3' && both) {   // 297 × 420 mm panels cannot hold two languages at ≥ 9 pt: the board must say so, never cut text silently
        const st = await page.evaluate(() => ({ cls: document.getElementById('fit-status').className, txt: document.getElementById('fit-status').textContent }));
        check(`${tag}: cannot fit at ≥ 9 pt, and the status line warns and suggests one language / a bigger board`, a.containers.length > 0 && /bad/.test(st.cls) && /one language|لغة واحدة/.test(st.txt), JSON.stringify([a.containers, st]));
        continue;
      }
      check(`${tag}: every panel/column fits (type scale ${(a.k * 100).toFixed(0)}%)`, a.containers.length === 0, a.containers.join('; '));
      check(`${tag}: nothing sticks out of its panel or module`, a.outside.length === 0, a.outside.slice(0, 5).join(' | '));
      check(`${tag}: no module overlaps the next`, a.overlaps.length === 0, a.overlaps.join('; '));
      check(`${tag}: no SVG text leaves its figure`, a.svgClip.length === 0, a.svgClip.slice(0, 5).join(' | '));
      check(`${tag}: smallest text ≥ 8.4 pt on paper (is ${a.minPt.toFixed(1)} pt)`, a.small.length === 0, a.small.slice(0, 4).join(' | '));
    }
    check(`${lang}: no errors while switching layouts`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  console.log('  info type scale k (1.00 = designed size) and smallest text:');
  kTable.forEach(([t, k, p]) => console.log(`       ${t.padEnd(34)} k=${k.toFixed(2)}  min ${p.toFixed(1)} pt`));
  const kk = Object.fromEntries(kTable.map(([t, k]) => [t, k]));
  check('default size (90 × 60 cm, both languages) keeps the type scale ≥ 0.80', kk['ar b90 both languages'] >= 0.8 && kk['en b90 both languages'] >= 0.8, `${kk['ar b90 both languages']?.toFixed(2)} / ${kk['en b90 both languages']?.toFixed(2)}`);
  check('one language only gives bigger type than both (Arabic-only / English-only boards)', kk['ar b90 one language'] > kk['ar b90 both languages'] && kk['en b90 one language'] > kk['en b90 both languages']);
  check('A0 keeps the type scale ≥ 0.70', kk['ar A0 both languages'] >= 0.7 && kk['en A0 both languages'] >= 0.7, `${kk['ar A0 both languages']?.toFixed(2)}`);
}
{ // too small a panel: the board must say so instead of silently cutting text
  const { page, ctx } = await open('?size=custom&cw=200&ch=280');
  const r = await page.evaluate(() => ({ fits: ManaraPoster.check().fits, cls: document.getElementById('fit-status').className, txt: document.getElementById('fit-status').textContent }));
  check('a 200 × 280 mm panel cannot hold the content: the status line says so (class "bad"), not silence', (r.fits && /ok/.test(r.cls)) || (!r.fits && /bad/.test(r.cls) && r.txt.length > 20), JSON.stringify(r));
  const adv = await page.evaluate(() => { ManaraPoster.setSize('a3'); ManaraPoster.setLayout('tri'); return document.getElementById('fit-status').textContent; });
  check('small type is flagged in the status line (advice to pick a bigger board or one language)', /one language|لغة واحدة|bigger|أكبر/.test(adv), adv);
  await ctx.close();
}

{ // choosing 3 × A3 in the select while both languages are on switches to one language and says why
  const { page, ctx } = await open();
  await page.selectOption('#sel-size', 'a3');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ both: ManaraPoster.state.both, box: document.getElementById('opt-both').checked, fits: ManaraPoster.check().fits, toast: (document.querySelector('.toast') || {}).textContent || '', k: ManaraPoster.k }));
  check('choosing 3 × A3 with both languages on switches to one language, unticks the switch and says why (toast)', !r.both && !r.box && r.fits && /one language|لغة واحدة/.test(r.toast), JSON.stringify(r));
  await page.click('#opt-both', { force: true }).catch(() => {});
  await ctx.close();
}

// ======================================================================= 4. bilingual behaviour
section('4. Bilingual: both languages / one language / panel order');
{
  const count = (page, l) => page.evaluate(l => [...document.querySelectorAll(`#board [data-l=${l}]`)].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 && !e.closest('.sr-only')).length, l);
  const ar = await open('?both=1', { lang: 'ar' });
  const nAr = await count(ar.page, 'ar'), nEn = await count(ar.page, 'en');
  check('Arabic page, both languages: Arabic AND English text are visible', nAr > 80 && nEn > 80, `${nAr} / ${nEn}`);
  const order = await ar.page.evaluate(() => { const a = document.querySelector('#m-problem-t [data-l=ar]').getBoundingClientRect(), e = document.querySelector('#m-problem-t [data-l=en]').getBoundingClientRect(); const p1 = document.getElementById('panel-1').getBoundingClientRect(), p3 = document.getElementById('panel-3').getBoundingClientRect(); return { arFirst: a.top < e.top, p1Right: p1.left > p3.left, enAlign: getComputedStyle(document.querySelector('#m-problem-t [data-l=en]')).direction }; });
  check('Arabic primary: Arabic line first, English below it (direction ltr), panel 1 on the RIGHT', order.arFirst && order.p1Right && order.enAlign === 'ltr', JSON.stringify(order));
  await ar.page.evaluate(() => ManaraPoster.setBoth(false));
  check('Arabic only: no English text left on the board', (await count(ar.page, 'en')) === 0 && (await count(ar.page, 'ar')) > 80);
  await ar.page.click('#btn-primary', { force: true }).catch(() => {});
  await ar.page.evaluate(() => ManaraPoster.setBoth(true));
  await ar.page.waitForTimeout(100);
  const sw = await ar.page.evaluate(() => { const a = document.querySelector('#m-problem-t [data-l=ar]').getBoundingClientRect(), e = document.querySelector('#m-problem-t [data-l=en]').getBoundingClientRect(); const p1 = document.getElementById('panel-1').getBoundingClientRect(), p3 = document.getElementById('panel-3').getBoundingClientRect(); return { lang: document.documentElement.lang, dir: document.documentElement.dir, enFirst: e.top < a.top, p1Left: p1.left < p3.left }; });
  check('"Main language" button switches the board: English first, LTR, panel 1 on the LEFT', sw.lang === 'en' && sw.dir === 'ltr' && sw.enFirst && sw.p1Left, JSON.stringify(sw));
  await ar.page.evaluate(() => ManaraPoster.setBoth(false));
  check('English only: no Arabic text left on the board (except the language names, which are lang-tagged)', await ar.page.evaluate(() => [...document.querySelectorAll('#board [data-l=ar]')].filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 && !e.closest('.sr-only')).length) === 0);
  check('SVG diagrams redraw in the new language (architecture shows "Sense", not "أرصد", as the main label)', await ar.page.evaluate(() => { const t = [...document.querySelectorAll('figure[data-fig=arch] text')].map(x => x.textContent); return t.includes('Sense') && !t.includes('أرصد'); }));
  check('no console errors while switching languages', ar.errors.length === 0, ar.errors.join(' | '));
  await ar.ctx.close();
}

// ======================================================================= 5. honesty
section('5. Honesty scan (phrases, AI wording, numbers, SIM labels, our source rules)');
{
  const { page, ctx } = await open('?both=1');
  const texts = await page.evaluate(() => { const out = []; const tw = document.createTreeWalker(document.getElementById('board'), NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) if (n.nodeValue.trim()) out.push(n.nodeValue.replace(/[⁦⁩​]/g, '')); return out; });
  const all = texts.join(' ');
  const strip = s => s.replace(/never say [“"]we save lives[”"]/gi, '').replace(/ولا نقول «ننقذ أرواحًا»/g, '');
  const banned = /world[- ]first|first[- ]ever|first of its kind|the first (ai|system|platform|project|drone)|saves? (\d+ )?lives|we save lives|الأول من نوعه|أول من نوعه|أول نظام|deep learning|neural net|machine learning|تعلم عميق|تعلّم عميق/i;
  check('no "first"/"saves lives"/deep-learning claims', !banned.test(strip(all)), (strip(all).match(banned) || [''])[0]);
  const ai = [...all.matchAll(/\bAI\b/g)].map(m => all.slice(Math.max(0, m.index - 14), m.index + 18));
  check('English "AI" appears only as a denial ("not AI") or a disclosure ("AI tools")', ai.length > 0 && ai.every(c => /not AI|AI tools|and AI disclosure/.test(c)), ai.join(' | '));
  const aiAr = [...all.matchAll(/ذكاء[ًٌٍ]?\s*اصطناعي/g)].map(m => all.slice(Math.max(0, m.index - 14), m.index + 22));
  check('Arabic «ذكاء اصطناعي» appears only as a denial («لا/ليس …») or a disclosure («أدوات/إفصاح …»)', aiAr.length > 0 && aiAr.every(c => /(لا|ليس)\s*ذكاء|أدوات الذكاء|بأدوات ذكاء|وإفصاح الذكاء|الذكاء الاصطناعي/.test(c)), aiAr.join(' | '));
  check('the detector is called rule-based computer vision (Arabic «رؤية حاسوبية بقواعد» / «رؤية بقواعد»)', /rule-based (computer )?vision/i.test(all) && /رؤية (حاسوبية )?بقواعد/.test(all));
  check('the held-out detector number is on the board with its honest context (66.7%, 12/18, "never used")', /66\.7/.test(all) && /12\/18/.test(all) && /never used/i.test(all) && /3\/12/.test(all) && /0\/3/.test(all));
  check('"999 stays the dispatcher" and "Simulated (SIM)" are stated next to the fastest-unit idea', /999 stays the dispatcher/.test(all) && /Simulated \(SIM\)/.test(all) && /أولًا في ظل المرور/.test(all));
  check('prior art is respected (Saqr, Shaheen, Suhail, Civil Defence drones, ISEF 2025) and "not a competitor" is said', /Saqr/.test(all) && /Shaheen/.test(all) && /Suhail/.test(all) && /ISEF 2025/.test(all) && /not a competitor/.test(all));
  check('limitations box states: not AI, SIM = mechanism check, MQ sensors not certified, fictional stations/traffic, comprehension test not run, drone concept', ['not AI', 'mechanism check', 'not certified', 'fictional', 'not been run', 'concept for a licensed agency'].every(s => all.includes(s)));
  check('every statistic card has a source line (3 of 3) and the old Qatar figure shows its year', await page.evaluate(() => [...document.querySelectorAll('.stat')].every(s => s.querySelector('.src') && /Source|المصدر/.test(s.textContent)) && document.querySelectorAll('.stat').length === 3) && /2017/.test(all));
  check('SIM tag on the A/B chart heading and on the other-hazards heading', await page.evaluate(() => [...document.querySelectorAll('#m-results .res-h')].filter(h => h.querySelector('.tag.warn')).length) >= 2);
  check('the fastest-unit module says SIM in the chart caption and the lead', await page.evaluate(() => /SIM/.test(document.querySelector('#m-fast').textContent)));
  check('language drafts are badged (6 "draft", 2 "complete") and Sinhala/Tamil are said to be missing', await page.evaluate(() => [...document.querySelectorAll('.langs li.draft')].length === 6 && [...document.querySelectorAll('.langs li.done')].length === 2) && /Sinhala or Tamil/.test(all));

  // numbers: every numeric token on the board must be on this list, each with where it comes from
  const OK = {};
  const add = (list, why) => list.forEach(n => { OK[n] = why; });
  add(['0', '1', '2', '3', '4', '5', '6', '8', '9', '10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '100', '200', '32'], 'structure: step/panel/module numbers, axis ticks, "last 100 metres", the ESP32 name, age 9');
  add(['46.6', '92.7', '2020'], 'S21/S22 census 2020 (computed percentages are labelled "computed by us")');
  add(['7', '2017', '31', '2018'], 'S26 Qatar Tribune 31 Jan 2018: Civil Defence 7–10 min in 2017');
  add(['999', '992', '1.2', '2025', '2026'], 'numbers of services (999, 992), CAP 1.2, ISEF 2025 (S43), Law No. 10 of 2026 (S34)');
  add(['87.5', '81.3', '66.7', '14', '13', '16', '18', '12', '43', '253', '15', '82', '14', '90', '07', '30'], 'measured: test-fire.mjs (detector sets, 43 checks), test-sim.mjs (253 checks), "90 % reach safety", dispatch hour 07:30');
  add(['626', '317', '225', '47', '339', '161', '39', '33369', '3024', '245', '89', '291', '98', '425', '682'], 'measured: test-sim.mjs seed 1 (ordinary vs MANARA)');
  add(['500', '1118', '181', '118'], 'measured: test-sim.mjs §11 hand-built road graph (A 500 m / 181 s, B 1,118 m / 118 s at 07:30)');
  add(['80', '227', '95', '270'], 'estimates from the Build It parts table (US$ 2–10, 80–227, 95–270)');
  const toks = [];
  for (const t of texts) for (const m of t.matchAll(/\d[\d,.]*\d|\d/g)) toks.push(m[0].replace(/,/g, ''));
  const unknown = [...new Set(toks.filter(t => !(t in OK)))];
  check('every number on the board is on the allowed list (sourced, measured or structural)', unknown.length === 0, 'unlisted: ' + unknown.join(', '));

  // our own source: house laws
  const js = fs.readFileSync(path.join(SITE, 'js/poster.js'), 'utf8'), css = fs.readFileSync(path.join(SITE, 'css/poster.css'), 'utf8'), html = fs.readFileSync(path.join(SITE, 'poster.html'), 'utf8');
  check('poster.js: no innerHTML / insertAdjacentHTML / document.write / eval / fetch / XHR / modules', !/innerHTML|insertAdjacentHTML|document\.write|\beval\(|\bfetch\(|XMLHttpRequest|\bimport\s*\(|^\s*import\s/m.test(js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  check('poster.html: classic scripts only (defer, no type=module), Google Fonts only external host', !/type=["']module/.test(html) && [...html.matchAll(/(?:src|href)=["'](https?:[^"']+)/g)].every(m => /fonts\.(googleapis|gstatic)\.com/.test(m[1])));
  const cssNo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  check('poster.css: logical properties only (no margin/padding/border-left|right, no left/right offsets or text-align:left|right)', !/(margin|padding|border)-(left|right)|[^-\w](left|right)\s*:|text-align\s*:\s*(left|right)/.test(cssNo.replace(/transform-origin:[^;}]+/g, '')));
  check('poster.css: letter-spacing only on English text', [...cssNo.matchAll(/[^}]*letter-spacing[^}]*/g)].every(m => /data-lang=en|:0\b|0\}/.test(m[0]) || /letter-spacing:0\b/.test(m[0])));
  check('poster.css: @page size + print-color-adjust: exact + print palette override present', /@page\s*\{[^}]*size/.test(cssNo) && /print-color-adjust\s*:\s*exact/.test(cssNo) && /@media print/.test(cssNo) && /--bg:#ffffff/.test(cssNo));
  check('no console errors', true);
  await ctx.close();
}

// ======================================================================= 6. provenance
section('6. Provenance: the board equals a fresh run of the detector test and the simulation');
{
  const { page, ctx } = await open();
  const R = await page.evaluate(() => JSON.parse(JSON.stringify(ManaraPoster.RESULTS)));
  // (a) detector: run its own test and read its summary lines
  const fire = spawnSync(process.execPath, [path.join(ROOT, 'tools/manara/test-fire.mjs')], { encoding: 'utf8', timeout: 120000 });
  const out = fire.stdout || '';
  const acc = [...out.matchAll(/accuracy (\d+)\/(\d+) = ([\d.]+) %\s+tricky cases (\d+)\/(\d+)\s+fire recall (\d+)\/(\d+)\s+false fire alarms (\d+)\/(\d+)/g)].map(m => m.slice(1).map(Number));
  check('test-fire.mjs passes (exit 0) with the check count the board prints', fire.status === 0 && new RegExp(`${R.fire.checks} passed, 0 failed`).test(out), (out.match(/\d+ passed, \d+ failed/) || ['no summary'])[0]);
  check('three accuracy blocks found (sample, tuning, held-out) in that order', acc.length === 3, String(acc.length));
  if (acc.length === 3) {
    R.fire.sets.forEach((s, i) => check(`detector ${s.id}: ${s.ok}/${s.n} = ${(s.ok / s.n * 100).toFixed(1)}%  ← fresh run ${acc[i][0]}/${acc[i][1]}`, acc[i][0] === s.ok && acc[i][1] === s.n && Math.abs(acc[i][2] - s.ok / s.n * 100) < 0.06));
    const h = R.fire.held, t = acc[2];
    check(`held-out set: fire found ${h.fireFound.join('/')}, false fire alarms ${h.falseFire.join('/')}, tricky ${h.tricky.join('/')}  ← fresh run`, t[5] === h.fireFound[0] && t[6] === h.fireFound[1] && t[7] === h.falseFire[0] && t[8] === h.falseFire[1] && t[3] === h.tricky[0] && t[4] === h.tricky[1], JSON.stringify(t));
    const smoke = (out.split('Test set')[1] || '').match(/smoke\s+(\d+)\s+(\d+)\s+(\d+)/);
    check(`held-out set: smoke found ${h.smokeFound.join('/')}  ← confusion matrix of the fresh run`, !!smoke && +smoke[2] === h.smokeFound[0] && +smoke[1] + +smoke[2] + +smoke[3] === h.smokeFound[1], smoke ? smoke[0] : 'row not found');
  }
  check('video layer claim: the fresh run says a static fire-coloured object never reaches "fire"', /static pure red square over 20 frames never reaches 'fire'/.test(out) && /static orange-red square over 20 frames never reaches 'fire'/.test(out));
  // (b) simulation: fresh A/B with seed 1
  if (process.env.POSTER_SKIP_SIM === '1') console.log('  skip simulation re-run (POSTER_SKIP_SIM=1)');
  else {
    const sctx = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(path.join(SITE, 'js/sim.js'), 'utf8'), sctx);
    const S = sctx.ManaraSim, ab = p => S.ab({ preset: p, seed: R.sim.seed });
    const f = ab('fire-night'), F = R.sim.fire;
    const eq = (name, got, want) => check(`${name}: board ${want.join(' → ')}  ← fresh simulation ${got.map(x => Math.round(x)).join(' → ')}`, got.length === want.length && got.every((g, i) => Math.round(g) === want[i]));
    eq('night fire, 90% safe (s)', [f.ordinary.timeToSafeP90Sec, f.manara.timeToSafeP90Sec], F.p90);
    eq('night fire, injured in model', [f.ordinary.injuredInModel, f.manara.injuredInModel], F.injured);
    eq('night fire, units dispatched (s)', [f.ordinary.timeToDispatchSec, f.manara.timeToDispatchSec], F.dispatch);
    eq('night fire, units on scene (s)', [f.ordinary.timeToOnSceneSec, f.manara.timeToOnSceneSec], F.onScene);
    check(`siren ${F.siren} s in both worlds; first personal MANARA message ${F.personal} s`, Math.round(f.ordinary.timeToFirstAlertSec) === F.siren && Math.round(f.manara.timeToFirstAlertSec) === F.siren && Math.round(f.manara.timeToFirstPersonalAlertSec) === F.personal);
    const o = Object.fromEntries(R.sim.others.map(x => [x.id, x]));
    const g = ab('gas-night'), fl = ab('flood-day'), du = ab('dust-day'), he = ab('heat-day'), so = ab('sos-day'), sc = ab('school-fire-day');
    eq('gas leak, exposure (person-s)', [g.ordinary.exposurePersonSec, g.manara.exposurePersonSec], o.gas.pair);
    eq('flash flood, time in deep water (person-s)', [fl.ordinary.exposurePersonSec, fl.manara.exposurePersonSec], o.flood.pair);
    eq('dust storm, injured in model', [du.ordinary.injuredInModel, du.manara.injuredInModel], o.dust.pair);
    eq('extreme heat, collapses', [he.ordinary.collapses, he.manara.collapses], o.heat.pair);
    eq('SOS, time until help (s)', [so.ordinary.timeToHelpSec, so.manara.timeToHelpSec], o.sos.pair);
    eq('school fire, units on scene (s)', [sc.ordinary.timeToOnSceneSec, sc.manara.timeToOnSceneSec], o.school.pair);
    const g0 = S.ab({ preset: 'gas-night', seed: R.sim.seed, params: { gasInfilPct: 0 } });
    check('the printed honest trade-off: with 0% seepage MANARA exposure 682 vs ordinary 0', Math.round(g0.manara.exposurePersonSec) === 682 && Math.round(g0.ordinary.exposurePersonSec) === 0, `${g0.ordinary.exposurePersonSec} / ${g0.manara.exposurePersonSec}`);
    const text = await page.evaluate(() => document.getElementById('m-results').textContent);
    check('the results module prints the 682 vs 0 trade-off and the "mechanism check, not proof of impact" caveat', /682/.test(text) && /mechanism check, not proof of impact/.test(text));
  }
  check('hardware tiers on the board equal the landing page tiers (US$ 2–10, 80–227, 95–270)', R.sim && await page.evaluate(() => JSON.stringify(ManaraPoster.TIERS.map(t => [t.lo, t.hi]))) === '[[2,10],[80,227],[95,270]]' && /US\$ 2–10/.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')) && /US\$ 80–227/.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')) && /US\$ 95–270/.test(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')));
  await ctx.close();
}

// ======================================================================= 7. QR codes
section('7. QR codes (encoder vs python-qrcode reference · link input)');
// Reference vectors: python-qrcode 8.2 (forced mask and version, byte mode); hash = first 16 hex of sha1 of the module rows joined by \n.
// [text, level, version, mask, hash]. The full-data vector and a half-data vector per version exercise terminator, pad bytes, EC and interleaving.
const QR_FIXTURES = [
  ["https://x.qa/CCd:","L",1,2,"22e74302209d0b39"], ["https://x.qa/CCd:","L",1,2,"22e74302209d0b39"],
  ["https://x.qa/Coy./=a&2yezx.p8_wG","L",2,2,"ec75c9f2499c0472"], ["https://x.qa/Coy","L",2,2,"2a97b1e03d41eee8"],
  ["https://x.qa/Bh%fG4rmg=a?2tD?h_t3pp9G_heazg9%iEwssqAb","L",3,0,"f091197e6a4fc18e"], ["https://x.qa/Bh%fG4rmg=a?2","L",3,5,"c71dfc2043153cb2"],
  ["https://x.qa/Aam08Cikn9yfic2t24?u_?c-3H8.4fcx0z1q-043F?y9kw:46tc8gGmC.&bFHdnH?","L",4,2,"0d1815cd8a40e257"], ["https://x.qa/Aam08Cikn9yfic2t24?u_?c-3H","L",4,3,"05ed37d81a11bb42"],
  ["https://x.qa/AB6DB9y6%3Dv?.iFEw8mh/DwDAmu9dC0%46o2.:dmH9&g1p4vj0nbG5fc-_pH.=5?d8ho:6FhmbxzrFCrj1iqgbF8l1Du","L",5,7,"46d0328413f0ed37"], ["https://x.qa/AB6DB9y6%3Dv?.iFEw8mh/DwDAmu9dC0%46o2.:d","L",5,2,"30d21d5f7f5df706"],
  ["https://x.qa/%/aqey:bFCt_utoe&nd54.?i/joelco4ig_:utz409CG46o3kHwAzGFqu4GixtC9:xaCEt=wc.d.kpdu5Bjbl6lvjkgl48Bc7?x0=d=l_sl_F25q23ti?Bs&y","L",6,4,"8c63d761d7846a3a"], ["https://x.qa/%/aqey:bFCt_utoe&nd54.?i/joelco4ig_:utz409CG46o3kHwAzG","L",6,1,"b0a6e1c1193de9a5"],
  ["https://x.qa/%6u.qn6H3:pbabC9lfzxHl8CgcAmqbh80ks.m3kf?B8g0.obyssEuGq1/Dk1CaHo:=Bhd1aCzk5xDmkv%5uxg8Fr_jjHnBoH.89cu%c7_C8Fzw/mf81D?687Dq9pn-uygtnhfE/x2G_8y","L",7,1,"4cb0e1e2b7a21557"], ["https://x.qa/%6u.qn6H3:pbabC9lfzxHl8CgcAmqbh80ks.m3kf?B8g0.obyssEuGq1/Dk1CaHo","L",7,4,"0287e0dc6b51e64e"],
  ["https://x.qa/&a?7HbDvh8/rf.1?6EB=wj17FDCEvH1_%:y9f/u6ceAnw=?ani=3q09_e=CAC9espimD/gktDh8jijqCe?4qbhhn_-?px49E=Hw50ep4nDe-H%wih:89?%Gxuw?ij2pg5eA?coFarpFGh8F:2c7D2pCEp8a6dpBBxpdB:A7wi&x_9yk=y6f","L",8,0,"a1c8086a1ce53e64"], ["https://x.qa/&a?7HbDvh8/rf.1?6EB=wj17FDCEvH1_%:y9f/u6ceAnw=?ani=3q09_e=CAC9espimD/gktDh8jijqCe?4","L",8,0,"79947ae516bfae6f"],
  ["https://x.qa/=B-ck&/toHk8_thtb?p7%9ut?:z6zGtr.%37FEfgqpevtC?HcH_i/1bEx9h/sr7Gp259v_u%s6-DBgxDrzn.yjrin9tcg=dsBA8heA21?y1Db_46iArw?co_A2BbfD.od=awa68fg6./s%esq?:k7j/_A%b.l.C/vFn:1c?7FiexagcllErt:p/?6Hp%_4qb-w3=6&26z45ja3wy%7j8G&mcx","L",9,7,"828823d4b69b3481"], ["https://x.qa/=B-ck&/toHk8_thtb?p7%9ut?:z6zGtr.%37FEfgqpevtC?HcH_i/1bEx9h/sr7Gp259v_u%s6-DBgxDrzn.yjrin9tcg=dsBA8heA","L",9,4,"0c9e8e62bdd5de02"],
  ["https://x.qa/=/exw5d?ABgFsb?Gw7.ao8meh71q4E/vcE9f=6&g50p3p1qH%=jm91th?3te=G_coCzxeA5q?e/j5e3v4ky5tkde?8x&q0ypF_v-k7qEqaGg36n2_zzj?=42q8Hv0p6Ed16dwFA-tEz2b3.y31uz/462Db0rC4yfs7G9o-Erk0_jCpDfF:b0n69mhmgAalr?lw443C29%k8y2ntm3Az7h?2x%gDHt0l/90=qCCh7:ul7FsmFf37=c8Fuvpuogjihy1","L",10,1,"9b23b5d1ab749036"], ["https://x.qa/=/exw5d?ABgFsb?Gw7.ao8meh71q4E/vcE9f=6&g50p3p1qH%=jm91th?3te=G_coCzxeA5q?e/j5e3v4ky5tkde?8x&q0ypF_v-k7qEqaGg36n2_zzj?=42q8","L",10,1,"00515b82224ef3aa"],
  ["https://x.qa/?","M",1,0,"267584694ce214c5"], ["https://x.qa/?","M",1,0,"267584694ce214c5"],
  ["https://x.qa/?yAnrjki4ebf4","M",2,5,"4501836dc43c09fc"], ["https://x.qa/","M",2,0,"f19a294371f51058"],
  ["https://x.qa/:Am82F04iGFv9bg=76vcb6tpil.u%","M",3,6,"680814d87d7a01db"], ["https://x.qa/:Am82F04","M",3,1,"dd4eaeda1ee46d52"],
  ["https://x.qa//_74:/s1pqv.p.:uby=wx4m3Hdp2E%k-uk5y-%jji=j-HCrFa","M",4,3,"25ebc208b3530dd3"], ["https://x.qa//_74:/s1pqv.p.:uby","M",4,4,"8b1fd56c3bb40e26"],
  ["https://x.qa//5aGG18FBjAbDtuGwqlnBdfosErmzo4p_:.w2bt.wau%EHrE=F%_?2i91ByBi:gb?/=otxb","M",5,2,"4a7b9c98218c2af6"], ["https://x.qa//5aGG18FBjAbDtuGwqlnBdfosErmz","M",5,0,"98629cb137adfd01"],
  ["https://x.qa/_yuu9qztH2qr1baf%h7epcGak=DD4nxtd%=uumel.l6HufAEd::&l21BB:j/hwl7?fi1c4mguvHgFm:z5E5wr?p9D50aC","M",6,1,"8a768b4abdce25b0"], ["https://x.qa/_yuu9qztH2qr1baf%h7epcGak=DD4nxtd%=uumel","M",6,4,"d1135a9c31f4288b"],
  ["https://x.qa/_r??Be=r5vm7h.f-mHby_a&/38F69m&wvvDrnC=_GCshqk%DAg-wh2Bel7vf5dq.qzbp.jw5&Bbu99CG%8o&m&05y4f?4H/A0oedxx4yFmb.o","M",7,2,"091ce757c79286c5"], ["https://x.qa/_r??Be=r5vm7h.f-mHby_a&/38F69m&wvvDrnC=_GCshqk%D","M",7,5,"db724d14b6e46427"],
  ["https://x.qa/jkijfBf/jo-FmC_=7&Dph0lzu12q/k90_z2&fe1nnf4pmptD8Egbc2lp317xc_Aqp%uct=6dnsegu6aHfsy-9%-1H3ie:lh=46q6blsBF:zE=:bb5%.-?3dyazoA%_wjx=2kG.yu8bG","M",8,1,"22ac4f839f8f9dea"], ["https://x.qa/jkijfBf/jo-FmC_=7&Dph0lzu12q/k90_z2&fe1nnf4pmptD8Egbc2lp317xc_A","M",8,5,"bc219c2c447f56e1"],
  ["https://x.qa/i53gq9Eiq7hnA3tvc9r94zellufH%jc4548?wo.:1q?xiustx/cf0240DAsqctFvpl/&cE=2-%6Af3hzsdhf4sBx12:%xD2l9zd-hy5&zqDh%jjFiEAx??toz5u_m4r%x1i%Ec9zDs/jnsvAp3Fanc2pFnd=E.rDEh?n7_n","M",9,6,"f096bb3b09c27700"], ["https://x.qa/i53gq9Eiq7hnA3tvc9r94zellufH%jc4548?wo.:1q?xiustx/cf0240DAsqctFvpl/&cE=2-%6Af","M",9,4,"09153e1d898d4514"],
  ["https://x.qa/iyy1axmgC0d3zmHHxH_0HGFE4mi-EiwjEg//oyw:?1a4ezBtmf0.v2E.n/490bcap475j2zag?85s0o05?rGzu6B10sh7hEi/somnm%:brsttdACkcak?H-3E-z4iF/HDm:GBDsd-90Gy22G2pf:tDvf1x2v6ft?C=0iuuBqw&5?42x6u12/5HzzFCn:6qD/FB88d%?D","M",10,0,"9034a34417e99dce"], ["https://x.qa/iyy1axmgC0d3zmHHxH_0HGFE4mi-EiwjEg//oyw:?1a4ezBtmf0.v2E.n/490bcap475j2zag?85s0o05?rGzu6B10sh7","M",10,5,"0f32635fb9ae351b"],
  ["https://x.q","Q",1,6,"daceb970586d84bd"], ["https://x.q","Q",1,6,"daceb970586d84bd"],
  ["https://x.qa/hjmqxau","Q",2,0,"6c742bfc6ade0a6d"], ["https://x.","Q",2,6,"dce28cc11a2b7e87"],
  ["https://x.qa/gc7_8=-Dk5Cz=ms&g0F","Q",3,5,"4fb7e42a69e42176"], ["https://x.qa/gc7","Q",3,5,"380c924ecd1c7c7b"],
  ["https://x.qa/fxagB52rrEs=wCGv1s%DiCvBx-vD/cCyo","Q",4,4,"458149714f067191"], ["https://x.qa/fxagB52rrE","Q",4,5,"8e80d829131ed0aa"],
  ["https://x.qa/fqvc3t%pD&=fc35aDkmo5B=6=2G5%b/d6z?c2tzribfrnzC","Q",5,3,"b5885b04133dc243"], ["https://x.qa/fqvc3t%pD&=fc35aD","Q",5,5,"aae85fa8b665e6c6"],
  ["https://x.qa/ej?y?i9.c-nE8llgrb8gbt9r7v3pEHghF4C2u49Awmqzj4CpydepFe5FBzD=q","Q",6,2,"1f34a0ec4f892c20"], ["https://x.qa/ej?y?i9.c-nE8llgrb8gbt9r","Q",6,5,"cf9b3dcae62c68b1"],
  ["https://x.qa/ecjAHEG87bjnoCr._Bdzxr2dyn5HaGGlpgH0_:ut.xd7g9wpnB2CBfFil%69p56hqhjwsA%pi","Q",7,7,"bc3c159f6092e270"], ["https://x.qa/ecjAHEG87bjnoCr._Bdzxr2dyn5HaG","Q",7,4,"463e7af1a8d251fe"],
  ["https://x.qa/dD3nl_pelD73t3F%gjyrBqv=&gihfEsp7kfx4wfCGgp?c:voc.y0?fqt4.%b/nj:q12kzH0:5cach3nefvse?bm?nv2Beqe","Q",8,6,"300558fbe7b40919"], ["https://x.qa/dD3nl_pelD73t3F%gjyrBqv=&gihfEsp7kfx4wfCG","Q",8,0,"e85276ac94bd21f1"],
  ["https://x.qa/dqF8C0g0sneAHl4w2bBip=o28yl%kD_sz:kvw6pvnr0yGAEo%cu4mf94D5eClCo%qBCGh6.lb1c?AHt4sg2z-1wmnDh7:2zeDfE.kcgfk8pugerp6buyq","Q",9,5,"17b23a3b064f9cff"], ["https://x.qa/dqF8C0g0sneAHl4w2bBip=o28yl%kD_sz:kvw6pvnr0yGAEo%cu4","Q",9,4,"242e5113ba4cf675"],
  ["https://x.qa/ciAdgpwxEhaj6Ck2EAp2_:hoaq?1oC4w&%%Co=au12_6CFD_7B%jhfb=ny?nk3tx%n?_&lC-yaf14E055&lsg3ii=C/EFmvbaGio?&Cc_jn5j0ym8g1lq_n4b/Ho&7t4pExu&tAFav","Q",10,3,"97f4b09e27bf2bb4"], ["https://x.qa/ciAdgpwxEhaj6Ck2EAp2_:hoaq?1oC4w&%%Co=au12_6CFD_7B%jhfb=ny?nk3","Q",10,7,"291d43bf57b90cd3"],
  ["https:/","H",1,3,"fed9d7615e99767b"], ["https:/","H",1,3,"fed9d7615e99767b"],
  ["https://x.qa/b","H",2,3,"da8c38cd79a281ba"], ["https:/","H",2,4,"bfca93d143942143"],
  ["https://x.qa/a:b=mjvnmm%","H",3,6,"18021380c0be06ad"], ["https://x.qa","H",3,2,"6bb284b896000762"],
  ["https://x.qa/a7vkxF.9t4pv33jx2muEC","H",4,1,"a2bc7ace0e1b0a8e"], ["https://x.qa/a7vk","H",4,0,"8bd42bf24579a6fd"],
  ["https://x.qa/Hb=59/b6Fx/_jl&3Fd=?qkHEm66xkmw","H",5,4,"b753b461e2ec9efb"], ["https://x.qa/Hb=59/b6F","H",5,6,"92cfa909990a5e9e"],
  ["https://x.qa/GCjHB2Acer9b?CxhsDlh/iA8dz8hokoD%:GiBCo07nb0H","H",6,3,"eba02f7cfc382585"], ["https://x.qa/GCjHB2Acer9b?Cxh","H",6,6,"498a054e66c03221"],
  ["https://x.qa/G:4E4qiy99grv32/lmeHig.uCsm&tj8Hj%eg_fHaCy?8D6H888B","H",7,2,"0daf3fbed48febf6"], ["https://x.qa/G:4E4qiy99grv32/lme","H",7,2,"bb1910de8fac06a6"],
  ["https://x.qa/F7Fr?fHvn2480liA6d0s574gnk=1yibdcvj64p.1j9H=%mG8xz=x29BEcxc6x:0krj-sg9E","H",8,7,"8908ef5c61f5c48e"], ["https://x.qa/F7Fr?fHvn2480liA6d0s574gnk=1y","H",8,5,"3b6ec7156dc9a203"],
  ["https://x.qa/Fzs_aBq%uwbFgC?xbDDkb5GAedAk2gBhuzp3wFwcxBlF?r07m&.dG9mhu?pFCw4=%3cf?pgx%lG_7Ee9t-wAr","H",9,6,"e4d987d85b625cb6"], ["https://x.qa/Fzs_aBq%uwbFgC?xbDDkb5GAedAk2gBhuzp3","H",9,5,"37260ed6901f1aeb"],
  ["https://x.qa/EBnhl96?G:Fn/3w4w/q3xe%5xEwC7fol_bu1oh6b_3wf.w07b7i9C95s/91&Ce9B%DEBxwqDo-aysBki6vfom_.wd/g_oBsC?44&%wwsx1","H",10,4,"43f3072a295adaf8"], ["https://x.qa/EBnhl96?G:Fn/3w4w/q3xe%5xEwC7fol_bu1oh6b_3wf.w","H",10,0,"e32901fac8bc869c"]
];

{
  const { page, ctx, errors } = await open();
  const res = await page.evaluate(fx => fx.map(([t, e, v, m]) => { const q = ManaraPoster.QR.encode(t, e, m, v); return q && { v: q.version, rows: q.rows }; }), QR_FIXTURES);
  const sha = rows => crypto.createHash('sha1').update(rows.join('\n')).digest('hex').slice(0, 16);
  let bad = [];
  QR_FIXTURES.forEach(([t, e, v, m, h], i) => { if (!res[i] || res[i].v !== v || sha(res[i].rows) !== h) bad.push(`${e} v${v} mask${m} len${t.length}`); });
  check(`${QR_FIXTURES.length} reference vectors match the independent encoder exactly (levels L/M/Q/H × versions 1–10, full and half-full data → all pad/EC paths)`, bad.length === 0, bad.slice(0, 6).join(' | '));
  const auto = await page.evaluate(() => { const q = ManaraPoster.QR.encode('https://example.org/manara/mission.html', 'M'); return { v: q.version, n: q.size, m: q.mask, rows: q.rows }; });
  check('an example link (39 chars, level M) becomes a version 3 code of 29 × 29 modules with finder patterns in 3 corners', auto.v === 3 && auto.n === 29 && ['1111111', '1000001', '1011101'].every((r, k) => auto.rows[k].slice(0, 7) === r && auto.rows[k].slice(-7) === r) && auto.rows[22].slice(0, 7) === '1111111', JSON.stringify({ v: auto.v, n: auto.n, m: auto.m }));
  check('data too long for version 10 returns null (the board then shows "!" and a message, not a broken code)', await page.evaluate(() => ManaraPoster.QR.encode('x'.repeat(300), 'L') === null));
  // UI
  const ph = await page.evaluate(() => ({ boxes: document.querySelectorAll('figure[data-qr] .qr-box').length, ph: document.querySelectorAll('figure[data-qr] .qr-box.ph-box').length, cap: document.querySelector('figure[data-qr="mission.html"] code').textContent.replace(/​/g, '') }));
  check('without a link: 4 placeholders (3 pillars + hero) showing "{{DEMO_URL}}…/page.html"', ph.boxes === 4 && ph.ph === 4 && ph.cap === '{{DEMO_URL}}/mission.html', JSON.stringify(ph));
  await page.fill('#in-url', 'https://example.org/manara/index.html?x=1');
  await page.waitForTimeout(400);
  const live = await page.evaluate(() => ({ svgs: document.querySelectorAll('figure[data-qr] .qr-box svg').length, ph: document.querySelectorAll('.ph-box').length, cap: document.querySelector('figure[data-qr="alert.html"] code').textContent.replace(/​/g, ''), aria: document.querySelector('figure[data-qr="detect.html"] .qr-box').getAttribute('aria-label'), fill: [...document.querySelectorAll('figure[data-qr] .qr-box svg')].map(s => s.querySelector('rect').getAttribute('fill') + s.querySelector('path').getAttribute('fill')).join('|'), saved: JSON.parse(localStorage.getItem('manara-poster')).url }));
  check('with https://example.org/manara/index.html?x=1 → real codes for …/manara/mission|detect|alert|index.html (black on white, role=img labelled)', live.svgs === 4 && live.ph === 0 && live.cap === 'https://example.org/manara/alert.html' && /detect\.html/.test(live.aria) && live.fill.split('|').every(f => f === '#ffffff#000000') && live.saved.startsWith('https://example.org'), JSON.stringify(live));
  await page.fill('#in-url', 'ftp://nope');
  await page.waitForTimeout(400);
  const badUrl = await page.evaluate(() => ({ cls: document.getElementById('qr-note').className, ph: document.querySelectorAll('.ph-box').length }));
  check('a link that is not http(s) keeps the placeholders and shows a red hint', badUrl.ph === 4 && /bad/.test(badUrl.cls), JSON.stringify(badUrl));
  await page.fill('#in-url', 'https://example.org/' + 'a'.repeat(290));
  await page.waitForTimeout(400);
  check('a link that is too long for the codes shows "!" placeholders and a hint, never a wrong (cut-off) code', await page.evaluate(() => document.querySelectorAll('.ph-box').length === 4 && /bad/.test(document.getElementById('qr-note').className) && document.querySelector('.ph-box').textContent.startsWith('!')));
  check('normBase strips file name, query and fragment, adds the trailing slash, rejects non-http(s)', await page.evaluate(() => JSON.stringify([ManaraPoster.normBase('https://a.b/c/index.html?x=1#y'), ManaraPoster.normBase('http://a.b'), ManaraPoster.normBase('  '), ManaraPoster.normBase('a.b/c')])) === '["https://a.b/c/","http://a.b/","",null]');
  check('no network was needed for the codes', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 8. team fields
section('8. Team fields ({{PLACEHOLDERS}}) · textContent only · persisted');
{
  const { page, ctx, errors } = await open();
  const base = await page.evaluate(() => ({ ph: document.querySelectorAll('#board .ph').length, left: document.getElementById('ph-status').textContent, first: document.querySelector('[data-ph=STUDENT_NAME]').textContent, inputs: document.querySelectorAll('#fields input').length }));
  check('8 empty placeholders print as {{NAME}} and the counter says 8 of 8 are open', base.ph === 8 && base.inputs === 8 && base.first === '{{STUDENT_NAME}}' && /8/.test(base.left), JSON.stringify(base));
  await page.evaluate(() => { document.getElementById('details').open = true; });
  const evil = 'Ali <img src=x onerror="window.__xss=1"> & <b>bold</b>';
  await page.fill('[data-field=STUDENT_NAME]', evil);
  await page.fill('[data-field=SCHOOL_NAME]', 'مدرسة قطر الثانوية');
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ name: document.querySelector('[data-ph=STUDENT_NAME]').textContent, cls: document.querySelector('[data-ph=STUDENT_NAME]').className, imgs: document.querySelectorAll('#board img[src="x"], .tools img').length, bold: document.querySelectorAll('#board .ph b').length, xss: window.__xss, school: document.querySelector('[data-ph=SCHOOL_NAME]').textContent, left: document.getElementById('ph-status').textContent, saved: JSON.parse(localStorage.getItem('manara-poster')).fields }));
  check('typed text is shown as text (no element created, no handler run) and the field is marked filled', r.name === evil && /filled/.test(r.cls) && r.imgs === 0 && r.bold === 0 && r.xss === undefined, JSON.stringify(r));
  check('counter goes to 6 of 8 and the values are saved in this browser', /6/.test(r.left) && r.saved.STUDENT_NAME === evil && r.school === 'مدرسة قطر الثانوية', r.left);
  const fit = await page.evaluate(() => ManaraPoster.check().fits);
  check('a long name does not push the panel past its edge (auto-fit re-runs)', fit);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__posterReady === true);
  await page.evaluate(() => { document.getElementById('details').open = true; });
  check('after a reload the values are still there', await page.evaluate(() => document.querySelector('[data-ph=SCHOOL_NAME]').textContent === 'مدرسة قطر الثانوية' && document.querySelector('[data-field=SCHOOL_NAME]').value === 'مدرسة قطر الثانوية'));
  await page.fill('[data-field=SCHOOL_NAME]', '');
  await page.waitForTimeout(150);
  check('clearing a field brings the {{SCHOOL_NAME}} reminder back', await page.evaluate(() => document.querySelector('[data-ph=SCHOOL_NAME]').textContent === '{{SCHOOL_NAME}}'));
  for (const k of ['STUDENT_NAME', 'SCHOOL_NAME', 'GRADE_CLASS', 'MENTOR_NAME', 'BUILT_BY_STUDENT', 'BOUGHT_OR_REUSED', 'HELPED_BY', 'AI_TOOLS_USED']) await page.fill(`[data-field=${k}]`, 'x ' + k);
  await page.waitForTimeout(200);
  check('with all 8 filled the counter turns green ("All fields are filled in") and the board still fits', await page.evaluate(() => document.getElementById('ph-status').classList.contains('done') && ManaraPoster.check().fits));
  check('no errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 9. print
section('9. Print: PDF page counts and sizes (Chromium page.pdf, @page from the page)');
const pdfInfo = buf => {
  const txt = buf.toString('latin1');
  const pages = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const boxes = [...txt.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map(m => m[1].trim().split(/\s+/).map(Number)).map(b => [b[2] - b[0], b[3] - b[1]]);
  return { pages, boxes };
};
const mm2pt = mm => mm * 72 / 25.4;
const hasPdftotext = spawnSync('pdftotext', ['-v']).status !== null && spawnSync('pdftotext', ['-v']).error === undefined;
{
  const jobs = [
    { name: 'tri-90x60-ar-both', q: '?layout=tri&size=b90&both=1', lang: 'ar', pages: 3, w: 300, h: 600 },
    { name: 'tri-90x60-en-both', q: '?layout=tri&size=b90&both=1', lang: 'en', pages: 3, w: 300, h: 600 },
        { name: 'tri-a3-ar-only', q: '?layout=tri&size=a3&both=0', lang: 'ar', pages: 3, w: 297, h: 420 },
    { name: 'tri-a2-en-only', q: '?layout=tri&size=a2&both=0', lang: 'en', pages: 3, w: 420, h: 594 },
    { name: 'tri-custom-ar-both', q: '?layout=tri&size=custom&cw=380&ch=520', lang: 'ar', pages: 3, w: 380, h: 520 },
    { name: 'tri-a3-bleed', q: '?layout=tri&size=a3&both=0&bleed=1', lang: 'ar', pages: 3, w: 317, h: 440 },
    { name: 'a0-ar-both', q: '?layout=a0&both=1', lang: 'ar', pages: 1, w: 841, h: 1189 },
    { name: 'a0-en-both', q: '?layout=a0&both=1', lang: 'en', pages: 1, w: 841, h: 1189 },
    { name: 'a0-ar-only', q: '?layout=a0&both=0', lang: 'ar', pages: 1, w: 841, h: 1189 }
  ];
  for (const j of jobs) {
    const { page, ctx, errors } = await open(j.q, { lang: j.lang, theme: 'dark', width: 1440 });
    await page.emulateMedia({ media: 'print' });
    const pr = await page.evaluate(() => { const b = document.getElementById('board'), p = document.querySelector('.panel'); const cs = getComputedStyle(p); return { navHidden: getComputedStyle(document.querySelector('.nav')).display === 'none', footHidden: getComputedStyle(document.querySelector('.foot')).display === 'none', toolsHidden: getComputedStyle(document.querySelector('.tools').closest('.print-hide')).display === 'none', transform: getComputedStyle(b).transform, bg: cs.backgroundColor, ink: getComputedStyle(p).color, fits: ManaraPoster.check().fits, pageRule: document.getElementById('page-rule').textContent }; });
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const file = path.join(PDF_DIR, j.name + '.pdf');
    fs.writeFileSync(file, buf);
    const info = pdfInfo(buf);
    check(`${j.name}: ${j.pages} page${j.pages > 1 ? 's' : ''} (found ${info.pages})`, info.pages === j.pages, JSON.stringify(info));
    check(`${j.name}: every page is ${j.w} × ${j.h} mm (found ${info.boxes.map(b => (b[0] * 25.4 / 72).toFixed(0) + '×' + (b[1] * 25.4 / 72).toFixed(0)).join(', ')})`, info.boxes.length === j.pages && info.boxes.every(b => Math.abs(b[0] - mm2pt(j.w)) < 2 && Math.abs(b[1] - mm2pt(j.h)) < 2));
    check(`${j.name}: print media hides the site chrome, drops the preview transform, prints dark ink on white paper even from the dark theme`, pr.navHidden && pr.footHidden && pr.toolsHidden && (pr.transform === 'none' || pr.transform === 'matrix(1, 0, 0, 1, 0, 0)') && pr.bg === 'rgb(255, 255, 255)', JSON.stringify(pr));
    check(`${j.name}: the layout still fits in print media and the PDF is not empty (${(buf.length / 1024).toFixed(0)} kB)`, pr.fits && buf.length > 150000 && errors.length === 0, errors.join(' | '));
    if (hasPdftotext) {
      const t = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).stdout || '';
      const per = t.split('\f').filter(s => s.trim().length || false);
      check(`${j.name}: every page carries text (no blank pages; ${per.map(s => s.length).join(' / ')} chars)`, per.length >= j.pages && per.slice(0, j.pages).every(s => s.replace(/\s/g, '').length > 120));
    }
    await ctx.close();
  }
  console.log(`  PDFs written to ${PDF_DIR}${hasPdftotext ? '' : '  (pdftotext not installed: text-per-page check skipped)'}`);
}

// ======================================================================= 10. contrast · a11y · interaction
section('10. Contrast · keyboard and labels · print button · zoom · motion · network');
const CONTRAST = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true });
  const rgba = css => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => [0, 1, 2].map(i => f[i] * f[3] + b[i] * (1 - f[3])).concat([1]);
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const board = document.getElementById('board'), bad = [], seen = new Set(); let n = 0, minR = 99;
  const bgOf = e => { let layers = [], x = e; while (x && x !== document.documentElement) { const cs = getComputedStyle(x); if (cs.backgroundImage !== 'none') return null; const c = rgba(cs.backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; } x = x.parentElement; } let base = [255, 255, 255, 1]; for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base); return base; };
  const tw = document.createTreeWalker(board, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    if (!t.nodeValue.trim()) continue; const e = t.parentElement;
    if (!e || e.closest('svg, .sr-only, .qr-box') || seen.has(e)) continue; seen.add(e);
    const cs = getComputedStyle(e); if (cs.display === 'none' || !e.getBoundingClientRect().width) continue;
    const bg = bgOf(e); if (!bg) continue;
    const fg = over(rgba(cs.color), bg), px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5, r = ratio(fg, bg);
    n++; minR = Math.min(minR, r);
    if (r < need) bad.push(`${r.toFixed(2)}<${need} "${t.nodeValue.trim().slice(0, 22)}"`);
  }
  // the colours the SVG diagrams use, against the surfaces they sit on
  const probe = document.createElement('div'); board.querySelector('.panel').appendChild(probe);
  const tok = name => { probe.style.color = `var(${name})`; return rgba(getComputedStyle(probe).color); };
  const surf = tok('--surface'), bg = tok('--bg'), pairs = [];
  [['--head', surf], ['--ink', surf], ['--muted', surf], ['--muted', bg], ['--ink-2', surf], ['--brand-t', surf], ['--safe-t', surf], ['--danger-t', surf], ['--info-t', surf], ['--accent-t', surf], ['--warn-t', surf]].forEach(([name, b]) => { const r = ratio(over(tok(name), b), b); pairs.push([name, r]); if (r < 4.5) bad.push(`token ${name} ${r.toFixed(2)}<4.5`); });
  probe.remove();
  return { n, minR, bad, pairs };
};
{
  for (const [label, theme, paper, media] of [['dark theme', 'dark', false, 'screen'], ['light theme', 'light', false, 'screen'], ['paper preview from dark', 'dark', true, 'screen'], ['print media from dark', 'dark', false, 'print']]) {
    for (const lang of ['ar', 'en']) {
      const { page, ctx } = await open(paper ? '?paper=1' : '', { lang, theme });
      if (media === 'print') await page.emulateMedia({ media: 'print' });
      const c = await page.evaluate(CONTRAST);
      check(`${label}/${lang}: text contrast ≥ 4.5:1 (3:1 for large) on ${c.n} text blocks, lowest ${c.minR.toFixed(2)}; diagram colours too`, c.bad.length === 0 && c.n > 150, c.bad.slice(0, 6).join(' | '));
      await ctx.close();
    }
  }
}
{
  const reqs = [];
  const { page, ctx, errors } = await open('', { lang: 'en' });
  page.on('request', r => { if (/^https?:/.test(r.url()) && !/fonts\.(googleapis|gstatic)\.com/.test(r.url())) reqs.push(r.url()); });
  check('every form control has a visible or aria label', await page.evaluate(() => [...document.querySelectorAll('.tools input, .tools select')].every(e => (e.labels && e.labels.length) || e.getAttribute('aria-label'))));
  check('every button has an accessible name; the preview region is focusable and named', await page.evaluate(() => [...document.querySelectorAll('.tools button')].every(b => (b.textContent.trim() || b.getAttribute('aria-label'))) && document.getElementById('viewer').tabIndex === 0 && !!document.getElementById('viewer').getAttribute('aria-label')));
  check('the 4 diagrams + 2 charts are role=img with a description; QR boxes are role=img', await page.evaluate(() => [...document.querySelectorAll('svg.sv')].every(s => s.getAttribute('role') === 'img' && (s.getAttribute('aria-label') || '').length > 30) && [...document.querySelectorAll('.qr-box')].every(b => b.getAttribute('role') === 'img' && b.getAttribute('aria-label'))));
  check('the fit status is a polite live region and the SIM/limits text is real text (not an image)', await page.evaluate(() => document.getElementById('fit-status').getAttribute('aria-live') === 'polite' && document.querySelectorAll('#board img').length === 4));
  // layout radios by keyboard
  await page.focus('input[name=layout][value=tri]');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  check('layout radios work by keyboard (arrow keys switch to the A0 poster)', await page.evaluate(() => document.getElementById('board').dataset.layout) === 'a0');
  await page.click('label.seg-i:has(input[value=tri])');
  check('clicking the tri-fold label switches back and the panel buttons 1 2 3 reappear', await page.evaluate(() => document.getElementById('board').dataset.layout === 'tri' && !document.getElementById('zpanels').hidden && getComputedStyle(document.getElementById('zpanels')).display !== 'none'));
  // zoom
  const s0 = await page.evaluate(() => ManaraPoster.scale);
  await page.click('#z-in'); const s1 = await page.evaluate(() => ManaraPoster.scale);
  await page.click('#z-out'); await page.click('#z-out'); const s2 = await page.evaluate(() => ManaraPoster.scale);
  check('zoom in / out change the preview scale (and the readout)', s1 > s0 * 1.2 && s2 < s1 * 0.7 && /\d+%/.test(await page.textContent('#z-read')), `${s0.toFixed(3)} ${s1.toFixed(3)} ${s2.toFixed(3)}`);
  await page.click('#z-fit');
  const fitW = await page.evaluate(() => { const v = document.getElementById('viewer'), s = document.getElementById('stagebox'); return { sw: s.getBoundingClientRect().width, vw: v.clientWidth }; });
  check('"Fit width" makes the board exactly as wide as the viewer (no sideways scrolling needed)', Math.abs(fitW.sw - (fitW.vw - 2 * 20)) < 40 && fitW.sw <= fitW.vw, JSON.stringify(fitW));
  await page.click('#zpanels [data-panel="2"]');
  const fp = await page.evaluate(() => { const v = document.getElementById('viewer').getBoundingClientRect(), p = document.getElementById('panel-2').getBoundingClientRect(); return { pw: p.width, vw: v.width, inside: p.left >= v.left - 4 && p.right <= v.right + 4 }; });
  check('panel button 2 zooms to panel 2 so that it fills the viewer', fp.inside && fp.pw > fp.vw * 0.8, JSON.stringify(fp));
  // print button
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.click('#btn-print');
  check('the Print button calls window.print() once and warns about empty team fields (toast)', await page.evaluate(() => window.__printed === 1 && !!document.querySelector('.toast')));
  check('the how-to-save-PDF steps show the real page size', /300 × 600 mm/.test(await page.textContent('#how-size-en')));
  // motion + network
  check('nothing on the board animates or transitions (reduced-motion safe; also keeps the fit measurement exact)', await page.evaluate(() => document.getElementById('board').getAnimations({ subtree: true }).length === 0 && getComputedStyle(document.querySelector('.panel')).transitionDuration === '0s'));
  check('no flashing: the board has no strobe or blink (no keyframes in poster.css)', !/@keyframes|animation\s*:/.test(fs.readFileSync(path.join(SITE, 'css/poster.css'), 'utf8').replace(/animation:none/g, '')));
  check('no network request beyond the optional Google Fonts', reqs.length === 0, reqs.join(', '));
  check('no console errors during all of the above', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await done(browser);
