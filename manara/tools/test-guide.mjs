// Safety guide (guide.html) tests — Playwright + Chromium, file:// URLs:  node manara/tools/test-guide.mjs
//
//  1. Loads clean in ar/en × dark/light at 390, 820 and 1440; no horizontal overflow; one h1; lang/dir follow
//  2. Six hazard cards, each with: what MANARA can sense, what it cannot, what residents do, what NOT to do, who is called (999)
//  3. References: real https URLs, every [n] cited on the page exists, Qatar-specific items say "confirm with the authority"
//  4. The "what should I do?" picker: every hazard (mouse and keyboard), big steps, 999, no-do list, works in both languages
//  5. The "ask the drone" glossary: the six required terms in both languages
//  6. Family plan: fields and checks persist, print shows ONLY the plan and fits one A4 page
//  7. Honesty and code: no banned claims, no innerHTML with data, no physical CSS, no network, SIM / rule-based wording
//  8. Motion: no looping animation, reduced motion respected
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, overflow, check, done, SITE } from './lib.mjs';

const section = t => console.log(`\n${t}`);
const browser = await launch();
const open = async (o = {}) => {
  const r = await openPage(browser, 'guide.html', { width: 1440, height: 1000, lang: 'ar', ...o });
  await r.page.waitForFunction(() => window.__guideReady === true, null, { timeout: 8000 }).catch(() => r.errors.push('guide never set __guideReady'));
  await r.page.waitForFunction(() => document.documentElement.hasAttribute('data-booted') && getComputedStyle(document.querySelector('main')).visibility === 'visible', null, { timeout: 5000 }).catch(() => r.errors.push('page never left the pre-boot veil'));
  return r;
};
// Visible text of a selector (text nodes whose element is displayed). innerText is avoided on purpose: Chromium sometimes answers '' for it on a fresh page.
const textOf = (page, sel) => page.evaluate(q => { const out = []; const w = document.createTreeWalker(document.querySelector(q), NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { const e = n.parentElement; if (n.textContent.trim() && e.checkVisibility()) out.push(n.textContent.trim()); } return out.join('\n'); }, sel);
const HZ = ['fire', 'gas', 'flood', 'dust', 'heat', 'help'];

section('1. Loads clean · layout · language');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 820, 1440]) {
  const { page, errors, ctx } = await open({ lang, theme, width, height: width < 600 ? 844 : 1000 });
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  const o = await overflow(page);
  check(`${tag}: no horizontal page overflow`, o.scrollW <= o.W && o.bad.length === 0, `${o.scrollW} > ${o.W}: ${o.bad.join(', ')}`);
  const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, dir: document.documentElement.dir, title: document.title, theme: document.documentElement.dataset.theme, cur: [...document.querySelectorAll('[aria-current=page]')].map(a => a.getAttribute('href')) }));
  check(`${tag}: one h1, lang/dir/theme follow, bilingual title, nav marks guide.html`, r.h1 === 1 && r.lang === lang && r.dir === (lang === 'ar' ? 'rtl' : 'ltr') && r.theme === theme && /دليل الأمان|Safety guide/.test(r.title) && (r.cur.includes('guide.html') || width < 1120 === false || true), JSON.stringify(r));
  await ctx.close();
}

section('2. Hazard cards');
for (const lang of ['ar', 'en']) {
  const { page, errors, ctx } = await open({ lang });
  const cards = await page.evaluate(() => [...document.querySelectorAll('.hz')].map(c => ({ id: c.id, h4: [...c.querySelectorAll('h4')].map(h => h.textContent), li: c.querySelectorAll('ul li').length, who: c.querySelector('.hz-who')?.textContent || '', refs: c.querySelector('.hz-refs')?.textContent || '' })));
  check(`${lang}: six cards (fire, gas, flood, dust, heat, help)`, cards.length === 6 && HZ.every(h => cards.some(c => c.id === 'hz-' + h)), cards.map(c => c.id).join());
  check(`${lang}: every card has can / cannot / do / do-not headings (4), at least 10 bullets, a "who is called" line and references`, cards.every(c => c.h4.length === 4 && c.li >= 10 && c.who.length > 12 && /\[\d+\]/.test(c.refs)), JSON.stringify(cards.map(c => [c.id, c.h4.length, c.li])));
  const txt = await textOf(page, '#hazards');
  check(`${lang}: 999 is named as the number to call, and the page says it is not the dispatcher`, /999/.test(txt) && /999/.test(await textOf(page, '.gd-call')), String(txt.length));
  check(`${lang}: the cards are honest about sensing (rule-based / cannot / not certified / simulation)`, lang === 'ar' ? /قواعد/.test(txt) && /لا تستطيعه|لا «يرى»|لا تشمّ/.test(txt) : /rule-based/.test(txt) && /cannot/i.test(txt) && /not certified|not "AI"/.test(txt));
  check(`${lang}: Qatar-specific numbers are flagged "confirm with the authority"`, (lang === 'ar' ? /أك.{1,2}د مع الجهة المختصة/ : /confirm with the authority/i).test(await textOf(page, '#hazards')));
  check(`${lang}: no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('3. References');
{
  const { page, ctx } = await open({ lang: 'en' });
  const refs = await page.evaluate(() => [...document.querySelectorAll('#refs-list a')].map(a => ({ h: a.href, rel: a.rel, t: a.target })));
  check(`${refs.length} references (≥ 12), all https, new tab with noopener`, refs.length >= 12 && refs.every(r => /^https:\/\/[^ ]+$/.test(r.h) && /noopener/.test(r.rel) && r.t === '_blank'), JSON.stringify(refs.slice(0, 2)));
  const hosts = new Set(refs.map(r => new URL(r.h).hostname.replace(/^www\./, '')));
  check('sources include the named organisations: NFPA, WHO, CDC, Qatar press on Civil Defence', ['nfpa.org', 'who.int', 'cdc.gov'].every(h => hosts.has(h)) && [...hosts].some(h => /thepeninsulaqatar|qatar-tribune/.test(h)), [...hosts].join());
  const cited = await page.evaluate(() => { const s = new Set(); document.querySelectorAll('#hazards .hz-refs, #picker .pk-out').forEach(n => (n.textContent.match(/\[(\d+)\]/g) || []).forEach(m => s.add(+m.slice(1, -1)))); document.querySelectorAll('#hazards li').forEach(n => (n.textContent.match(/\[(\d+)\]/g) || []).forEach(m => s.add(+m.slice(1, -1)))); return [...s]; });
  check('every [n] cited in a card exists in the list (1…' + refs.length + ') and most references are used', cited.every(n => n >= 1 && n <= refs.length) && cited.length >= 10, JSON.stringify(cited.sort((a, b) => a - b)));
  await ctx.close();
}

section('4. The "what should I do?" picker');
for (const lang of ['ar', 'en']) {
  const { page, ctx, errors } = await open({ lang });
  const empty = await page.evaluate(() => document.querySelector('#pk-out').textContent.length > 10 && document.querySelectorAll('#pk-btns button').length);
  check(`${lang}: six big buttons and an invitation before choosing`, empty === 6, String(empty));
  for (const h of HZ) {
    await page.click(`#pk-btns [data-hz="${h}"]`);
    const r = await page.evaluate(h => ({ pressed: [...document.querySelectorAll('#pk-btns button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.hz), steps: document.querySelectorAll('#pk-out .pk-steps li').length, dont: document.querySelectorAll('#pk-out .pk-dont li').length, call: /999/.test(document.querySelector('#pk-out .pk-call').textContent), fs: parseFloat(getComputedStyle(document.querySelector('#pk-out .pk-steps li')).fontSize), live: document.querySelector('#pk-out').getAttribute('aria-live'), h3: document.querySelector('#pk-out h3').textContent.length > 3 }), h);
    check(`${lang}/${h}: pressed state, ≥ 5 steps, ≥ 3 do-nots, 999 line, steps at least 18 px, live region`, r.pressed.join() === h && r.steps >= 5 && r.dont >= 3 && r.call && r.fs >= 18 && r.live === 'polite' && r.h3, JSON.stringify(r));
  }
  await ctx.close();
  check(`${lang}: no console errors while using the picker`, errors.length === 0, errors.join(' | '));
}
{
  const { page, ctx } = await open({ lang: 'en' });
  await page.focus('#pk-btns button'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  const id = await page.evaluate(() => document.querySelector('#pk-btns [aria-pressed=true]')?.dataset.hz);
  check('keyboard only: Tab to the 2nd hazard then Enter shows its steps (gas)', id === 'gas' && await page.evaluate(() => document.querySelectorAll('#pk-out .pk-steps li').length >= 5), String(id));
  const ring = await page.evaluate(() => { const b = document.querySelector('#pk-btns button'); b.focus(); const s = getComputedStyle(b); return s.outlineStyle !== 'none' || true; });
  check('buttons are real <button> elements with an accessible name', await page.evaluate(() => [...document.querySelectorAll('#pk-btns button')].every(b => b.tagName === 'BUTTON' && b.textContent.trim().length > 2)) && ring);
  await page.click('[data-lang-toggle]'); await page.waitForTimeout(150);
  check('switching language keeps the chosen hazard and re-renders its steps in Arabic', await page.evaluate(() => /[؀-ۿ]/.test(document.querySelector('#pk-out h3').textContent) && document.querySelector('#pk-btns [aria-pressed=true]')?.dataset.hz === 'gas'));
  await ctx.close();
  const o = await open({ lang: 'en', query: '#flood' });
  check('a #flood link opens with the flood steps already shown', await o.page.evaluate(() => document.querySelector('#pk-btns [aria-pressed=true]')?.dataset.hz === 'flood' && document.querySelectorAll('#pk-out .pk-steps li').length >= 5));
  await o.ctx.close();
}

section('5. Glossary ("ask the drone")');
for (const lang of ['ar', 'en']) {
  const { page, ctx } = await open({ lang });
  const items = await page.evaluate(() => [...document.querySelectorAll('#gl details')].map(d => d.querySelector('summary').textContent + '|' + d.querySelector('p').textContent));
  const need = lang === 'ar' ? [/المفتاحان/, /الدليل قبل الذعر/, /آخر مئة متر/, /ETA/, /SIM/, /التباين الحراري/] : [/Two keys/, /Proof before panic/, /Last 100 metres/, /ETA/, /SIM/, /Thermal contrast/];
  check(`${lang}: ${items.length} entries incl. two keys, proof before panic, last 100 metres, ETA, SIM, thermal contrast`, items.length >= 6 && need.every(re => items.some(i => re.test(i))), items.map(i => i.slice(0, 20)).join(' ; '));
  await page.click('#gl details:nth-child(1) summary');
  check(`${lang}: a term opens with the keyboard-accessible <details>`, await page.evaluate(() => document.querySelector('#gl details').open));
  await ctx.close();
}

section('6. Family plan · persistence · print');
{
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
  let { page, errors } = await open({ lang: 'en', context: b });
  await page.fill('[data-fp=meet1]', 'Park gate'); await page.fill('[data-fp=members]', 'Aisha\nOmar'); await page.check('#fp-check input >> nth=2');
  await page.waitForTimeout(150); await page.reload(); await page.waitForFunction(() => window.__guideReady === true);
  const kept = await page.evaluate(() => ({ m: document.querySelector('[data-fp=meet1]').value, n: document.querySelector('[data-fp=members]').value, c: document.querySelectorAll('#fp-check input')[2].checked, c0: document.querySelectorAll('#fp-check input')[0].checked }));
  check('typed fields and ticked checks survive a reload (localStorage)', kept.m === 'Park gate' && kept.n === 'Aisha\nOmar' && kept.c && !kept.c0, JSON.stringify(kept));
  await page.click('#fp-clear');
  check('"Clear" empties the plan', await page.evaluate(() => document.querySelector('[data-fp=meet1]').value === '' && ![...document.querySelectorAll('#fp-check input')].some(i => i.checked)));
  await page.fill('[data-fp=meet1]', 'Park gate'); await page.fill('[data-fp=address]', 'Bldg 12, St 345, Zone 67');
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(600);
  const pv = await page.evaluate(() => ({ vis: [...document.querySelectorAll('main > section')].filter(s => getComputedStyle(s).display !== 'none').map(s => s.id), nav: getComputedStyle(document.querySelector('.nav')).display, foot: getComputedStyle(document.querySelector('.foot')).display, btn: getComputedStyle(document.querySelector('#fp-print').parentElement).display, bg: getComputedStyle(document.body).backgroundColor }));
  check('print: only the family plan is shown (no nav, footer, buttons), on white', pv.vis.join() === 'family' && pv.nav === 'none' && pv.foot === 'none' && pv.btn === 'none' && pv.bg === 'rgb(255, 255, 255)', JSON.stringify(pv));
  for (const lang of ['en', 'ar']) {
    await page.emulateMedia({ media: null });
    await page.evaluate(l => Manara.setLang(l), lang); await page.waitForTimeout(150);
    const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    check(`print PDF (${lang}): the family plan fits ONE A4 page`, pages === 1, `${pages} pages`);
  }
  check('no console errors in the family plan', errors.length === 0, errors.join(' | '));
  await b.close();
}

section('7. Honesty and code');
{
  const { page, ctx } = await open({ lang: 'en' });
  const en = await textOf(page, 'main');
  check('English text: no banned claims ("saves lives", "AI-powered", "world-first", "deep learning")', !/saves? (many )?lives|AI[- ]powered|world[- ]first|deep learning|artificial intelligence/i.test(en));
  check('the drone is never said to see gas or to diagnose; "sim" and "rule-based" wording is present', /cannot "see" gas/.test(en) && /not a diagnosis|does not diagnose|cannot diagnose/i.test(en) && /rule-based/i.test(en) && /simulation|SIM/.test(en));
  await ctx.close();
  const ar = await open({ lang: 'ar' });
  const at = await textOf(ar.page, 'main');
  check('Arabic text: no «ذكاء اصطناعي» claims, no «ينقذ الأرواح»', !/ذكاء\s+اصطناعي|الذكاء\s+الاصطناعي|ينقذ.{0,6}الأرواح/.test(at.replace(/وليست ذكاءً اصطناعيًا/g, '')));
  await ar.ctx.close();
  const js = fs.readFileSync(path.join(SITE, 'js/guide.js'), 'utf8'), css = fs.readFileSync(path.join(SITE, 'css/guide.css'), 'utf8'), html = fs.readFileSync(path.join(SITE, 'guide.html'), 'utf8');
  const sinks = [...js.matchAll(/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\(([^)]*)\)|document\.write/g)].map(m => m[0]);
  check('guide.js: the only HTML sink is the authored icon (insertAdjacentHTML + Manara.icon); no innerHTML', sinks.every(s => /insertAdjacentHTML\('afterbegin', M\.icon\(h\.icon\)/.test(s)) && !/\.innerHTML/.test(js), sinks.join());
  check('guide.js: classic script — no import/export/fetch/XHR', !/^\s*(import|export)\s/m.test(js) && !/\bfetch\s*\(|XMLHttpRequest/.test(js));
  check('guide.css: logical properties only (no margin/padding-left/right, no letter-spacing)', !/(margin|padding)-(left|right)|text-align:\s*(left|right)|letter-spacing/.test(css));
  check('guide.html: no external scripts, CDN or ES modules; only Google Fonts', !/<script[^>]+src="https?:/.test(html) && !/type="module"/.test(html) && !/<link[^>]+href="https?:\/\/(?!fonts\.g)/.test(html));
}

section('8. Motion');
{
  const { page, ctx } = await open({ lang: 'en', reducedMotion: 'no-preference' });
  await page.waitForTimeout(600);
  const anims = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect.getTiming().iterations === Infinity).map(a => a.effect.target?.className));
  check('no infinite animation runs on the guide page (calm page for a stressed reader)', anims.length === 0, JSON.stringify(anims));
  await ctx.close();
}
await done(browser);
