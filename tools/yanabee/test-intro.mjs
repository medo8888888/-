// Browser test of the opening scene on the home page.
//   node tools/yanabee/test-intro.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = (f, q = '') => 'file://' + path.join(ROOT, 'site/yanabee', f) + q;
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(q, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url('index.html', q), { waitUntil: 'domcontentloaded' });
  return { ctx, p, errs };
}
const state = p => p.evaluate(() => ({
  on: document.documentElement.classList.contains('intro-on'),
  el: !!document.getElementById('intro'),
  vis: !!document.getElementById('intro') && getComputedStyle(document.getElementById('intro')).display !== 'none',
  overflow: getComputedStyle(document.documentElement).overflow,
}));

console.log('opening scene');
{
  // automation alone does not trigger it (keeps the other suites fast) ...
  const a = await open('');
  await a.p.waitForTimeout(300);
  check('not shown under automation unless asked (?intro)', !(await state(a.p)).on);
  await a.ctx.close();

  // ... but ?intro plays it
  const { ctx, p, errs } = await open('?intro');
  await p.waitForTimeout(500);
  let s = await state(p);
  check('?intro shows the overlay and locks scroll', s.on && s.vis && s.overflow === 'hidden', JSON.stringify(s));
  check('canvas has size', await p.evaluate(() => { const c = document.querySelector('.intro-canvas'); return c.width > 300 && c.height > 300; }));
  await p.waitForTimeout(1500);
  const splash = await p.evaluate(() => {
    const c = document.querySelector('.intro-canvas'), x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 20) n++;
    return n;
  });
  check('splash is drawn (canvas not empty)', splash > 30, String(splash));
  check('logo + word are centred', await p.evaluate(() => {
    const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return b.left + b.width / 2; };
    return Math.abs(r('.intro-mark') - innerWidth / 2) < 4 && Math.abs(r('.intro-word') - innerWidth / 2) < 4;
  }));
  await p.waitForTimeout(3000);
  s = await state(p);
  check('overlay removed and class cleared after the scene', !s.on && !s.el, JSON.stringify(s));
  check('scroll unlocked', s.overflow !== 'hidden', s.overflow);
  check('hero is visible afterwards', await p.evaluate(() => { const h = document.querySelector('.hero-home h1'); return +getComputedStyle(h).opacity > 0.95; }));
  check('no console errors', errs.length === 0, errs.join(' | '));
  const seen = await p.evaluate(() => sessionStorage.getItem('yb-intro'));
  check('remembered for the session', seen === '1');
  await ctx.close();
}
{
  // skipping with a key press ends it early
  const { ctx, p } = await open('?intro');
  await p.waitForTimeout(600);
  await p.keyboard.press('Space');
  await p.waitForTimeout(1900);
  const s = await state(p);
  check('a key press skips ahead', !s.on && !s.el, JSON.stringify(s));
  await ctx.close();
}
{
  // reduced motion: never
  const { ctx, p } = await open('?intro', { reducedMotion: 'reduce' });
  await p.waitForTimeout(400);
  const s = await state(p);
  check('reduced motion: no scene, nothing locked', !s.on && s.overflow !== 'hidden');
  check('reduced motion: hero visible at once', await p.evaluate(() => +getComputedStyle(document.querySelector('.hero-home h1')).opacity > 0.9));
  await ctx.close();
}
{
  // phone
  const { ctx, p, errs } = await open('?intro', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await p.waitForTimeout(2000);
  check('phone: logo + word centred', await p.evaluate(() => {
    const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return b.left + b.width / 2; };
    return Math.abs(r('.intro-mark') - innerWidth / 2) < 4 && Math.abs(r('.intro-word') - innerWidth / 2) < 4;
  }));
  await p.waitForTimeout(3000);
  check('phone: finishes, no horizontal overflow, no errors', !(await state(p)).on && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && errs.length === 0, errs.join('|'));
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
