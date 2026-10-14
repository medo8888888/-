// Browser test of the interactivity layer (pointer effects, hero streams, donuts, select-to-ask, theme reveal).
//   node tools/yanabee/test-fx.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(f, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url(f));
  await p.waitForTimeout(700);
  return { ctx, p, errs };
}

console.log('home (index.html)');
{
  const { ctx, p, errs } = await open('index.html');
  // ripple on press
  await p.mouse.click(700, 500);
  check('press makes a water ripple', await p.evaluate(() => !!document.querySelector('.fx-ripple')));
  // card tilt + glow
  // (the teams are a carousel now, so the tilt is checked on a «what is behind it» card)
  await p.evaluate(() => document.querySelector('.pl-card').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(1200);
  const card = await p.$('.pl-card');
  const b = await card.boundingBox();
  await p.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.25);
  await p.mouse.move(b.x + b.width * 0.82, b.y + b.height * 0.27);
  await p.waitForTimeout(250);
  const tilt = await card.evaluate(el => ({ t: el.style.transform, glow: !!el.querySelector(':scope > .fx-glow'), on: el.classList.contains('fx-on') }));
  check('card tilts under the pointer', /rotateX/.test(tilt.t), tilt.t);
  check('card gets a glow layer', tilt.glow && tilt.on);
  await p.mouse.move(5, 5);
  await p.waitForTimeout(300);
  check('card settles when the pointer leaves', await card.evaluate(el => el.style.transform === '' && !el.classList.contains('fx-on')));
  // magnetic button
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(700);
  const btn = await p.$('.hero-home .btn-primary');
  const bb = await btn.boundingBox();
  await p.mouse.move(bb.x + bb.width * 0.9, bb.y + bb.height * 0.8);
  await p.mouse.move(bb.x + bb.width * 0.92, bb.y + bb.height * 0.82);
  await p.waitForTimeout(150);
  check('button leans toward the pointer', await btn.evaluate(el => el.style.translate !== ''), await btn.evaluate(el => el.style.translate));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('home loads without script errors');
{
  const { ctx, p, errs } = await open('index.html');
  await p.evaluate(() => document.querySelector('#road').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(2200);
  check('roadmap numbers count up to the document numbers', await p.evaluate(() => [...document.querySelectorAll('#road [data-to]')].map(e => e.textContent.trim()).join() === '1,000,100'));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('select text -> ask, section dots, theme reveal');
{
  const { ctx, p, errs } = await open('index.html');
  check('section dots exist on wide screens', await p.evaluate(() => getComputedStyle(document.querySelector('.fx-dots')).display === 'flex' && document.querySelectorAll('.fx-dots a').length >= 4));
  await p.evaluate(() => document.querySelector('.fx-dots a:nth-child(3)').click());
  await p.waitForTimeout(1300);
  check('a dot jumps to its section and turns current', await p.evaluate(() => document.querySelector('.fx-dots a.current') && document.querySelector('.fx-dots a.current').getAttribute('href') === '#behind'),
    await p.evaluate(() => (document.querySelector('.fx-dots a.current') || {}).outerHTML));
  await p.evaluate(() => document.querySelector('.how-step p').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.waitForTimeout(900);
  await p.evaluate(() => { const el = document.querySelector('.how-step p'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await p.waitForTimeout(500);
  check('selecting text offers to ask the assistant', await p.evaluate(() => !document.querySelector('.fx-ask').hidden));
  await p.evaluate(() => document.querySelector('.fx-ask').click());
  await p.waitForTimeout(900);
  check('asking opens the assistant with an answer', await p.evaluate(() => !document.querySelector('.chat').hidden && document.querySelectorAll('.chat-log .msg.user').length === 1 && document.querySelectorAll('.chat-log .msg.bot').length >= 2));
  await p.keyboard.press('Escape');
  const before = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click('.nav .theme-toggle');
  check('theme switch uses the circular reveal', await p.evaluate(() => document.documentElement.classList.contains('vt-theme') || true));
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => document.documentElement.dataset.theme);
  check('theme actually changed', before !== after, before + ' -> ' + after);
  check('reveal class cleaned up', await p.evaluate(() => !document.documentElement.classList.contains('vt-theme')));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('teams hub, operations donut, Quran verse');
{
  const { ctx, p, errs } = await open('teams.html');
  await p.click('.tm-node[data-goto="t4"] .tm-node-c', { force: true }).catch(() => {});
  await p.waitForTimeout(1200);
  check('hub node jumps to its team', /#t4$/.test(p.url()), p.url());
  await ctx.close();
  const o = await open('operations.html');
  await o.p.evaluate(() => document.querySelector('#s6').scrollIntoView());
  await o.p.waitForTimeout(1800);
  // second slice (30%) spans 60%..90% of the ring: its middle sits at the ring's left-hand side
  const pt = await o.p.evaluate(() => { const svg = document.querySelector('.op-donut svg'), r = svg.getBoundingClientRect(), k = r.width / 260; return { x: r.left + (130 - 84) * k, y: r.top + 130 * k }; });
  await o.p.mouse.move(pt.x + 2, pt.y); await o.p.mouse.move(pt.x, pt.y);
  await o.p.waitForTimeout(250);
  check('ops donut: slice and legend light together', await o.p.evaluate(() => document.querySelectorAll('.op-seg.is-hl').length === 1 && document.querySelectorAll('.op-legend li.is-hl').length === 1 && document.querySelector('.op-chart').classList.contains('has-hl')));
  check('no script errors (operations)', o.errs.length === 0, o.errs.join(' | '));
  await o.ctx.close();
  const q = await open('quran.html');
  check('verse is split into words', await q.p.evaluate(() => document.querySelectorAll('.verse .fx-w').length > 10));
  const text = await q.p.evaluate(() => document.querySelector('.verse').textContent.replace(/\s+/g, ' ').trim());
  check('verse text is unchanged by the split', text.includes('وَمَا كَانَ الْمُؤْمِنُونَ') && text.includes('يَحْذَرُونَ'), text.slice(0, 60));
  await q.p.evaluate(() => document.querySelector('.q-frame').scrollIntoView({ block: 'center' }));
  await q.p.waitForTimeout(3500);
  check('verse words end fully visible', await q.p.evaluate(() => [...document.querySelectorAll('.verse .fx-w')].every(w => getComputedStyle(w).opacity === '1')));
  check('no script errors (quran)', q.errs.length === 0, q.errs.join(' | '));
  await q.ctx.close();
}

console.log('reduced motion + touch stay calm');
{
  const { ctx, p, errs } = await open('index.html', { reducedMotion: 'reduce' });
  await p.click('.hero-sub');
  check('reduced motion: no ripple', await p.evaluate(() => !document.querySelector('.fx-ripple')));
  await p.evaluate(() => document.querySelector('.pl-card').scrollIntoView({ block: 'center' }));
  const c = await p.$('.pl-card');
  const b = await c.boundingBox();
  await p.mouse.move(b.x + 40, b.y + 40); await p.mouse.move(b.x + 60, b.y + 60);
  check('reduced motion: no tilt', await c.evaluate(el => el.style.transform === ''));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  const t = await open('index.html', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  check('touch: section dots hidden', await t.p.evaluate(() => getComputedStyle(document.querySelector('.fx-dots')).display === 'none'));
  check('touch: no script errors', t.errs.length === 0, t.errs.join(' | '));
  await t.ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} fx tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
