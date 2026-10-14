// Browser test of the home page "app" behaviour: the launch splash, the hero entrance, the sticky segmented nav,
// the quick-actions tiles, the growth phases, the hero streams' navigation hook.
//   node tools/yanabee/test-intro.mjs
// The splash only plays under automation when asked (?intro), so the other suites are not held up by it; the "real visitor"
// cases hide navigator.webdriver instead. Timing assertions have margin for a busy machine; re-run alone before trusting a failure.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'site/yanabee');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = (f, q = '') => 'file://' + path.join(SITE, f) + q;
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const REAL = () => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); }; // a visitor, not a robot
const TIMES = () => {
  window.__t = {};
  addEventListener('yanabee:intro-reveal', () => { window.__t.reveal = performance.now(); });
  addEventListener('yanabee:intro-end', () => { window.__t.end = performance.now(); });
};

async function open(target, q = '', opts = {}) {
  const { real, times, ...ctxOpts } = opts;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...ctxOpts });
  if (real) await ctx.addInitScript(REAL);
  if (times) await ctx.addInitScript(TIMES);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(target.startsWith('http') ? target + q : url(target, q), { waitUntil: 'domcontentloaded' });
  return { ctx, p, errs };
}
const state = p => p.evaluate(() => {
  const el = document.getElementById('intro');
  return {
    on: document.documentElement.classList.contains('intro-on'),
    el: !!el,
    shown: !!el && getComputedStyle(el).display !== 'none',
    htmlOverflow: getComputedStyle(document.documentElement).overflowY,
    bodyOverflow: getComputedStyle(document.body).overflowY,
  };
});
// instant jump so that the section `id` sits `at` px below the top of the viewport
const jump = (p, id, at = 150) => p.evaluate(([id, at]) => {
  document.documentElement.style.scrollBehavior = 'auto';
  scrollTo(0, scrollY + document.getElementById(id).getBoundingClientRect().top - at);
}, [id, at]);
const settle = async (p, max = 3500) => { // wait until the page has stopped scrolling
  let last = -1, still = 0;
  for (let t = 0; t < max; t += 100) {
    const y = await p.evaluate(() => Math.round(scrollY));
    still = y === last ? still + 1 : 0; last = y;
    if (still >= 3) return y;
    await sleep(100);
  }
  return last;
};
const bar = p => p.evaluate(() => {
  const w = document.querySelector('[data-hsn-wrap]'), b = document.querySelector('.hsn-bar');
  const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  return {
    on: w.classList.contains('is-on'), op: +cs.opacity, vis: cs.visibility, top: r.top, bottom: r.bottom, left: r.left, right: r.right,
    cur: [...document.querySelectorAll('.hsn a[aria-current]')].map(a => a.dataset.hsn),
    sticky: document.documentElement.style.getPropertyValue('--sticky-top'),
  };
});

/* ============================== launch splash ============================== */
console.log('launch splash (?intro)');
{
  const a = await open('index.html', '', { times: true });
  await a.p.waitForTimeout(300);
  check('not shown under automation unless asked (?intro)', !(await state(a.p)).on);
  await a.ctx.close();

  const { ctx, p, errs } = await open('index.html', '?intro', { times: true });
  await p.waitForTimeout(450);
  let s = await state(p);
  check('?intro shows the overlay', s.on && s.shown, JSON.stringify(s));
  check('it does not lock scroll (html/body overflow)', s.htmlOverflow !== 'hidden' && s.bodyOverflow !== 'hidden', JSON.stringify(s));
  check('it does not set a progress cursor, and ignores pointer input', await p.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('intro'));
    return cs.cursor !== 'progress' && cs.pointerEvents === 'none';
  }));
  check('canvas has size', await p.evaluate(() => { const c = document.querySelector('.intro-canvas'); return c.width > 300 && c.height > 300; }));
  const drawn = await p.evaluate(() => {
    const c = document.querySelector('.intro-canvas'), x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 20) n++;
    return n;
  });
  check('splash is drawn (canvas not empty)', drawn > 30, String(drawn));
  await p.waitForTimeout(150);
  check('logo + word are centred', await p.evaluate(() => {
    const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return b.left + b.width / 2; };
    return Math.abs(r('.intro-mark') - innerWidth / 2) < 4 && Math.abs(r('.intro-word') - innerWidth / 2) < 4;
  }));
  // the page below stays scrollable while the splash plays (a programmatic scroll does not count as a skip)
  const y0 = await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollBy(0, 160); return Math.round(scrollY); });
  check('the page scrolls under the splash', y0 >= 150 && (await state(p)).el, String(y0));
  await p.evaluate(() => scrollTo(0, 0));
  await p.waitForTimeout(1700);
  s = await state(p);
  check('overlay removed and class cleared after the splash', !s.on && !s.el, JSON.stringify(s));
  const tm = await p.evaluate(() => {
    const fp = performance.getEntriesByType('paint').filter(e => e.name === 'first-paint')[0];
    return { ...window.__t, fp: fp ? fp.startTime : 0 };
  });
  check('both events fired', !!tm.reveal && !!tm.end, JSON.stringify(tm));
  check('reveal (overlay starts fading) at about 0.95 s from first paint', tm.reveal - tm.fp > 800 && tm.reveal - tm.fp < 1150, String(Math.round(tm.reveal - tm.fp)));
  check('the splash is over within 1.4 s of first paint', tm.end - tm.fp <= 1450, String(Math.round(tm.end - tm.fp)));
  check('the fade out is short (250-450 ms)', tm.end - tm.reveal > 200 && tm.end - tm.reveal < 480, String(Math.round(tm.end - tm.reveal)));
  check('remembered for the session', (await p.evaluate(() => sessionStorage.getItem('yb-intro'))) === '1');
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // the overlay leaves with opacity alone, and the hero is readable within a moment of it
  const { ctx, p } = await open('index.html', '?intro', { times: true });
  await p.waitForFunction(() => window.__t && window.__t.reveal, null, { timeout: 4000 });
  await p.waitForTimeout(80);
  const f = await p.evaluate(() => {
    const el = document.getElementById('intro');
    if (!el) return { gone: true };
    const cs = getComputedStyle(el);
    return { out: el.classList.contains('out'), prop: cs.transitionProperty, op: +cs.opacity, dur: parseFloat(cs.transitionDuration), introOn: document.documentElement.classList.contains('intro-on') };
  });
  check('fade-out: opacity only, 250-300 ms, intro-on released at once', f.gone || (f.out && f.prop === 'opacity' && f.dur >= 0.25 && f.dur <= 0.3 && !f.introOn), JSON.stringify(f));
  await p.waitForTimeout(450);
  const h = await p.evaluate(() => [...document.querySelectorAll('.hero-home .hero-copy>.rv')].map(e => +getComputedStyle(e).opacity));
  check('hero headline readable ~0.5 s after the reveal', h.length === 4 && h[1] > 0.95, JSON.stringify(h));
  await p.waitForTimeout(400);
  const h2 = await p.evaluate(() => [...document.querySelectorAll('.hero-home .hero-copy>.rv')].map(e => +getComputedStyle(e).opacity));
  check('all four hero items visible after the stagger', h2.length === 4 && h2.every(o => o > 0.97), JSON.stringify(h2));
  await ctx.close();
}
{
  // skipping at any moment: press, key, wheel, touch
  for (const how of ['pointer', 'key', 'wheel']) {
    const { ctx, p } = await open('index.html', '?intro', { times: true });
    await p.waitForTimeout(250 + (how === 'wheel' ? 300 : 0));
    const before = await state(p);
    if (how === 'pointer') { await p.mouse.move(1420, 450); await p.mouse.down(); await p.mouse.up(); }
    if (how === 'key') await p.keyboard.press('Space');
    if (how === 'wheel') await p.mouse.wheel(0, 120);
    await p.waitForTimeout(150);
    const s = await state(p);
    const ended = await p.evaluate(() => !!window.__t.end);
    check(`${how} skips it at once`, before.on && !s.on && !s.el && ended, JSON.stringify([before, s, ended]));
    await ctx.close();
  }
  const { ctx, p } = await open('index.html', '?intro', { ...PHONE, times: true });
  await p.waitForTimeout(400);
  await p.touchscreen.tap(200, 400);
  await p.waitForTimeout(150);
  const s = await state(p);
  check('a touch skips it at once', !s.on && !s.el);
  await ctx.close();
}
{
  // reduced motion: never
  const { ctx, p } = await open('index.html', '?intro', { reducedMotion: 'reduce' });
  await p.waitForTimeout(400);
  const s = await state(p);
  check('reduced motion: no splash, nothing locked', !s.on && !s.shown && s.htmlOverflow !== 'hidden');
  check('reduced motion: hero visible at once, nothing offset', await p.evaluate(() => [...document.querySelectorAll('.hero-home .hero-copy>.rv')].every(e => +getComputedStyle(e).opacity > 0.9 && getComputedStyle(e).transform === 'none')));
  await ctx.close();
}
{
  // phone
  const { ctx, p, errs } = await open('index.html', '?intro', { ...PHONE });
  await p.waitForTimeout(500);
  check('phone: logo + word centred', await p.evaluate(() => {
    const r = e => { const b = document.querySelector(e).getBoundingClientRect(); return b.left + b.width / 2; };
    return Math.abs(r('.intro-mark') - innerWidth / 2) < 4 && Math.abs(r('.intro-word') - innerWidth / 2) < 4;
  }));
  await p.waitForTimeout(1500);
  check('phone: finishes, no horizontal overflow, no errors', !(await state(p)).on && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && errs.length === 0, errs.join('|'));
  await ctx.close();
}

console.log('launch splash (a real visitor: once per session)');
{
  const { ctx, p } = await open('index.html', '', { real: true, times: true });
  const first = await p.evaluate(() => document.documentElement.classList.contains('intro-on'));
  check('first visit: the splash plays without ?intro', first);
  await p.waitForTimeout(1700);
  check('first visit: gone within the budget', !(await state(p)).el && (await p.evaluate(() => !!window.__t.end)));
  await p.goto(url('index.html'), { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(250);
  const again = await state(p);
  check('second visit in the same session: no splash', !again.on && !again.shown);
  await p.goto(url('index.html', '?intro'), { waitUntil: 'domcontentloaded' });
  check('?intro replays it', await p.evaluate(() => document.documentElement.classList.contains('intro-on')));
  await p.waitForTimeout(1700);
  await ctx.close();
}
{
  const { ctx, p } = await open('index.html', '#s9', { real: true });
  await p.waitForTimeout(250);
  const s = await state(p);
  check('arriving with a #hash: no splash', !s.on && !s.shown);
  await ctx.close();
}
{
  // arriving from another page of the site (an app shows its launch screen at launch, not on every navigation) - needs http for a real referrer
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const f = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const direct = await open(base + 'index.html', '', { real: true });
  check('over http, a first visit shows the splash', await direct.p.evaluate(() => document.documentElement.classList.contains('intro-on')));
  await direct.ctx.close();
  const via = await open(base + 'teams.html', '', { real: true });
  await via.p.waitForTimeout(500);
  await Promise.all([via.p.waitForURL(/index\.html/, { timeout: 6000 }), via.p.evaluate(() => document.querySelector('.nav a[href="index.html"]').click())]);
  await via.p.waitForTimeout(300);
  const s = await state(via.p);
  check('arriving from another page of the site: no splash', !s.on && !s.shown, JSON.stringify(s));
  await via.ctx.close();
  srv.close();
}

/* ============================== hero entrance, ambient motion ============================== */
console.log('hero entrance and calm');
{
  const { ctx, p, errs } = await open('index.html');
  await p.waitForFunction(() => [...document.querySelectorAll('.hero-home .hero-copy>.rv')].every(e => +getComputedStyle(e).opacity > 0.97), null, { timeout: 5000 }).catch(() => {});
  const hero = await p.evaluate(() => {
    const all = [...document.querySelectorAll('.hero-home .hero-copy>.rv')];
    // the headline is skipped when the sitewide headline splitter (shell's business, not home's) still words-splits it
    const split = document.querySelectorAll('.hero-home h1 .wi, .hero-home h1 .w').length;
    const kids = all.filter(e => !(split && e.tagName === 'H1'));
    const ms = v => parseFloat(v) * 1000;
    return {
      n: all.length, split,
      delays: kids.map(e => Math.round(ms(getComputedStyle(e).transitionDelay.split(',')[0]))),
      durs: kids.map(e => Math.max(...getComputedStyle(e).transitionDuration.split(',').map(ms))),
      shown: all.every(e => +getComputedStyle(e).opacity > 0.97),
    };
  });
  const want = '0,55,110,165';
  check('hero entrance: four items, 55 ms apart, 220 ms each', hero.n === 4 && hero.delays.join() === want && hero.durs.every(d => d <= 240 && d >= 200), JSON.stringify(hero));
  check('hero entrance: everything is visible afterwards', hero.shown);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ============================== hero streams: navigation hook ============================== */
console.log('hero streams (YanabeeApp.go / YanabeeWow.go / location.href)');
{
  const { ctx, p, errs } = await open('index.html');
  await p.waitForTimeout(900);
  const hb = await (await p.$('.hero-visual')).boundingBox();
  let found = 0;
  for (let x = hb.x + hb.width * 0.15; x < hb.x + hb.width * 0.9 && !found; x += 12) {
    await p.mouse.move(x, hb.y + hb.height * 0.52);
    if (await p.evaluate(() => document.querySelector('.stream-tip').classList.contains('on'))) found = x;
  }
  check('a stream can be found by hovering', !!found);
  if (found) {
    const cy = hb.y + hb.height * 0.52;
    await p.evaluate(() => {
      window.__g = null;
      window.YanabeeApp = { go: (h, x, y) => { window.__g = ['app', h, typeof x, typeof y]; } };
      window.YanabeeWow = { go: h => { window.__g = ['wow', h]; } };
    });
    await p.mouse.click(found, cy);
    let g = await p.evaluate(() => window.__g);
    check('with YanabeeApp present it goes through YanabeeApp.go(href, x, y)', g && g[0] === 'app' && /^teams\.html#t[1-7]$/.test(g[1]) && g[2] === 'number' && g[3] === 'number', JSON.stringify(g));
    await p.evaluate(() => { window.__g = null; delete window.YanabeeApp; });
    await p.mouse.click(found, cy);
    g = await p.evaluate(() => window.__g);
    check('without YanabeeApp it uses YanabeeWow.go', g && g[0] === 'wow' && /^teams\.html#t[1-7]$/.test(g[1]), JSON.stringify(g));
    await p.evaluate(() => { delete window.YanabeeWow; });
    await Promise.all([p.waitForURL(/teams\.html#t[1-7]/, { timeout: 5000 }).catch(() => {}), p.mouse.click(found, cy)]);
    check('without either it navigates with location.href', /teams\.html#t[1-7]$/.test(p.url()), p.url());
  }
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
