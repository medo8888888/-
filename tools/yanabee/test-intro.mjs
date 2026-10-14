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
  check('hero headline readable ~0.5 s after the reveal', h.length === 5 && h[1] > 0.95, JSON.stringify(h));
  await p.waitForTimeout(400);
  const h2 = await p.evaluate(() => [...document.querySelectorAll('.hero-home .hero-copy>.rv')].map(e => +getComputedStyle(e).opacity));
  check('all five hero items visible after the stagger', h2.length === 5 && h2.every(o => o > 0.97), JSON.stringify(h2));
  await ctx.close();
}
{
  // skipping at any moment: press, key, wheel, touch
  for (const how of ['pointer', 'key', 'wheel']) {
    const { ctx, p } = await open('index.html', '?intro', { times: true });
    await p.waitForTimeout(250 + (how === 'wheel' ? 300 : 0));
    const before = await state(p);
    if (how === 'pointer') { await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.up(); }
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
  const want = hero.split ? '0,110,165,220' : '0,55,110,165,220';
  check('hero entrance: five items, 55 ms apart, 220 ms each', hero.n === 5 && hero.delays.join() === want && hero.durs.every(d => d <= 240 && d >= 200), JSON.stringify(hero));
  check('hero entrance: everything is visible afterwards', hero.shown);
  const calm = await p.evaluate(() => ({
    cue: !!document.querySelector('.scroll-cue'),
    bob: getComputedStyle(document.querySelector('.core-logo')).animationName,
    wipe: getComputedStyle(document.querySelector('.tc-art') || document.body).clipPath,
    tcZoom: parseFloat(getComputedStyle(document.querySelector('.tc-art .ph') || document.body).transitionDuration) || 0,
    river: getComputedStyle(document.querySelector('.river path')).animationName,
    grad: getComputedStyle(document.querySelector('.grad-text')).backgroundClip,
  }));
  check('no scroll-cue, no bobbing logo, no flowing river, no clip-path photo wipe', !calm.cue && calm.bob === 'none' && calm.river === 'none' && (calm.wipe === 'none' || calm.wipe === ''), JSON.stringify(calm));
  check('team photo zoom is 350 ms', Math.abs(calm.tcZoom - 0.35) < 0.02, String(calm.tcZoom));
  check('the headline accent is a solid colour, not a gradient fill', calm.grad !== 'text');
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

/* ============================== quick actions ============================== */
console.log('quick-actions tiles');
for (const [name, opts] of [['1440', {}], ['390', PHONE]]) {
  const { ctx, p, errs } = await open('index.html', '', opts);
  await p.waitForTimeout(800);
  const q = await p.evaluate(() => {
    const g = document.querySelector('.qa');
    const tiles = [...document.querySelectorAll('.qa .qa-tile')];
    const nav = h => { const a = document.querySelector('.nav a[href="' + h + '"]'); return a ? a.textContent.trim().replace(/\s+/g, ' ') : null; };
    return {
      id: g ? g.id : null, inMainSection: !!(g && g.closest('main > section[id]')), isSection: !!(g && g.matches('section')),
      n: tiles.length,
      kinds: tiles.map(t => t.tagName + ':' + (t.getAttribute('href') || (t.hasAttribute('data-open-chat') ? 'chat' : t.hasAttribute('data-open-search') ? 'search' : '?'))),
      labels: tiles.map(t => t.querySelector('.qa-lb').textContent.trim()),
      navLabels: ['teams.html', 'learn.html', 'lab.html', 'quran.html'].map(nav),
      after: !!(document.querySelector('.hero-home').compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING),
      before: !!(g.compareDocumentPosition(document.querySelector('[data-story]')) & Node.DOCUMENT_POSITION_FOLLOWING),
      rects: tiles.map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; }),
      sections: [...document.querySelectorAll('main > section[id]')].map(s => s.id).join(),
    };
  });
  check(`${name}: six tiles in order: teams, learn, lab, quran, assistant, search`, q.n === 6 && q.kinds.join() === 'A:teams.html,A:learn.html,A:lab.html,A:quran.html,BUTTON:chat,BUTTON:search', q.kinds.join());
  check(`${name}: the four page labels are the nav's own labels`, q.labels.slice(0, 4).every((l, i) => q.navLabels[i] === null || q.navLabels[i].includes(l)), JSON.stringify([q.labels, q.navLabels]));
  check(`${name}: a plain row after the hero (no id, not a section)`, !q.id && !q.isSection && !q.inMainSection && q.after && q.before);
  check(`${name}: sections unchanged (no new main > section[id])`, q.sections === 's1,teams,model,s9,initiative', q.sections);
  check(`${name}: every tile is at least 64 px tall and 44 px wide`, q.rects.every(r => r.h >= 64 && r.w >= 44), JSON.stringify(q.rects));
  const cols = new Set(q.rects.map(r => r.x)).size, rows = new Set(q.rects.map(r => r.y)).size;
  if (name === '390') check('390: three columns by two rows', cols === 3 && rows === 2, `${cols}x${rows}`);
  else check('1440: one row of six', cols === 6 && rows === 1, `${cols}x${rows}`);
  check(`${name}: no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // press feedback: a springy scale-down on the `scale` property
  const t0 = await p.$('.qa .qa-tile');
  await t0.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const bb = await t0.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.waitForFunction(el => parseFloat(getComputedStyle(el).scale) < 0.985, t0, { timeout: 2500 }).catch(() => {}); // frames can be slow on a busy machine
  await p.waitForTimeout(150);
  const down = await t0.evaluate(el => ({ s: parseFloat(getComputedStyle(el).scale), dur: getComputedStyle(el).transitionDuration }));
  await p.mouse.move(5, 5); // slide off before releasing: the press is cancelled, nothing navigates
  await p.mouse.up();
  check(`${name}: pressing scales the tile down (about .96)`, down.s > 0.94 && down.s < 0.985, JSON.stringify(down));
  await p.waitForTimeout(500);
  check(`${name}: releasing springs it back`, await t0.evaluate(el => { const v = getComputedStyle(el).scale; return v === 'none' || Math.abs(parseFloat(v) - 1) < 0.005; }));
  await ctx.close();
}
{
  // assistant and search tiles open the real assistant / search
  const { ctx, p, errs } = await open('index.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('.qa').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(400);
  await p.click('.qa [data-open-chat]');
  await p.waitForTimeout(600);
  check('the assistant tile opens the assistant', await p.evaluate(() => !document.querySelector('.chat').hidden));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.click('.qa [data-open-search]');
  await p.waitForTimeout(600);
  check('the search tile opens the search', await p.evaluate(() => !document.querySelector('.search').hidden));
  await p.keyboard.press('Escape');
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // the tile row is a real link row: a click goes to the page
  const { ctx, p } = await open('index.html');
  await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('.qa').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(300);
  await p.evaluate(() => { for (const a of document.querySelectorAll('.qa a')) a.addEventListener('click', e => e.preventDefault()); });
  const hrefs = await p.evaluate(() => [...document.querySelectorAll('.qa a')].map(a => a.getAttribute('href')));
  check('tiles link to teams / learn / lab / quran', hrefs.join() === 'teams.html,learn.html,lab.html,quran.html', hrefs.join());
  await ctx.close();
}

/* ============================== segmented nav ============================== */
console.log('segmented nav');
{
  const { ctx, p, errs } = await open('index.html');
  await p.waitForTimeout(900);
  const info = await p.evaluate(() => {
    const links = [...document.querySelectorAll('.hsn a[data-hsn]')];
    const nav = document.querySelector('.hsn-bar');
    return {
      hrefs: links.map(a => a.getAttribute('href')).join(), ids: [...document.querySelectorAll('main > section[id]')].map(s => s.id).join(),
      labels: links.map(a => a.textContent.trim()),
      heads: links.map(a => (document.getElementById(a.dataset.hsn).querySelector('h2') || {}).textContent || ''),
      aria: links.map(a => a.getAttribute('aria-label') || ''),
      tag: nav.tagName, own: nav.getAttribute('data-seg'), role: nav.getAttribute('role'), id: nav.id || (nav.closest('[data-hsn-wrap]').id || ''),
      isSection: !!nav.closest('section'),
      print: (() => { try { return getComputedStyle(document.querySelector('[data-hsn-wrap]')).display; } catch (e) { return '?'; } })(),
    };
  });
  check('one segment per main > section[id], in order', info.hrefs === info.ids.split(',').map(i => '#' + i).join(), info.hrefs + ' vs ' + info.ids);
  check('labels are the section headings\' own words (never invented)', info.labels.every((l, i) => l && info.heads[i].replace(/\s+/g, ' ').includes(l)), JSON.stringify([info.labels, info.heads]));
  check('the accessible name is the whole heading', info.aria.every((a, i) => a.startsWith(info.labels[i]) && info.heads[i].replace(/\s+/g, ' ').includes(a.split(' ')[0])));
  check('it is a nav of links marked data-seg="own", not a section, no tablist role', info.tag === 'NAV' && info.own === 'own' && !info.role && !info.isSection && !info.id);

  check('hidden over the hero: no bar, no --sticky-top', await p.evaluate(() => { const w = document.querySelector('[data-hsn-wrap]'); return !w.classList.contains('is-on') && getComputedStyle(document.querySelector('.hsn-bar')).visibility === 'hidden' && !document.documentElement.style.getPropertyValue('--sticky-top'); }));
  await jump(p, 's1', 420);
  await p.waitForTimeout(350);
  let b = await bar(p);
  check('still hidden while the first section is further down the page', !b.on && b.vis === 'hidden' && !b.sticky, JSON.stringify(b));
  await jump(p, 's1', 110);
  await p.waitForTimeout(450);
  b = await bar(p);
  check('appears when the first section reaches it', b.on && b.op > 0.98 && b.vis === 'visible', JSON.stringify(b));
  const navH = await p.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;height:var(--nav-h)'; document.body.append(d); const h = d.getBoundingClientRect().height; d.remove(); return h; });
  check('the bar is stuck just under the nav box (nav-h + 20 px on desktop)', b.top >= navH + 6 && b.top <= navH + 30, `bar ${Math.round(b.top)} nav-h ${Math.round(navH)}`);
  check('--sticky-top = bar bottom + 8 px', Math.abs(parseFloat(b.sticky) - (b.bottom + 8)) <= 2, `${b.sticky} vs ${Math.round(b.bottom + 8)}`);
  check('the first segment is current (aria-current="true")', b.cur.join() === 's1');
  check('slide-in is 180 ms, translateY + opacity', await p.evaluate(() => { const cs = getComputedStyle(document.querySelector('.hsn-bar')); return cs.transitionDuration.split(',').slice(0, 2).every(d => Math.abs(parseFloat(d) - 0.18) < 0.01) && /transform/.test(cs.transitionProperty) && /opacity/.test(cs.transitionProperty); }));

  // scroll-spy follows the scroll, the indicator follows the spy
  const ids = ['s1', 'teams', 'model', 's9', 'initiative'];
  const spy = [];
  for (const id of ids) {
    await jump(p, id, 220); // the section's top crosses the 35% line comfortably
    await p.waitForTimeout(450);
    const r = await p.evaluate(id => {
      const cur = [...document.querySelectorAll('.hsn a[aria-current]')].map(a => a.dataset.hsn);
      const a = document.querySelector('.hsn a[data-hsn="' + id + '"]'), ind = document.querySelector('.hsn .seg-ind');
      const ar = a.getBoundingClientRect(), ir = ind.getBoundingClientRect();
      return { cur, dl: Math.round(ir.left - ar.left), dw: Math.round(ir.width - ar.width) };
    }, id);
    spy.push([id, r.cur.join(), r.dl, r.dw]);
  }
  check('scroll-spy highlights the section in view, one at a time', spy.every(([id, cur]) => cur === id), JSON.stringify(spy));
  check('the indicator sits exactly under the current segment', spy.every(([, , dl, dw]) => Math.abs(dl) <= 2 && Math.abs(dw) <= 2), JSON.stringify(spy));

  // the indicator slides (200 ms ease-out), it does not jump
  await jump(p, 's1', 130);
  await p.waitForTimeout(500);
  const slide = await p.evaluate(() => new Promise(res => {
    const ind = document.querySelector('.hsn .seg-ind'), out = [], t0 = performance.now();
    const cs = getComputedStyle(ind);
    const meta = { dur: cs.transitionDuration, prop: cs.transitionProperty };
    document.querySelector('.hsn a[data-hsn="s9"]').click(); // a tap
    const tick = () => { out.push(Math.round(ind.getBoundingClientRect().left)); if (performance.now() - t0 < 420) requestAnimationFrame(tick); else res({ out, meta }); };
    tick();
  }));
  const first = slide.out[0], last = slide.out[slide.out.length - 1];
  const mid = slide.out.filter(x => Math.abs(x - first) > 2 && Math.abs(x - last) > 2).length;
  check('indicator transition is transform + width in 200 ms', /transform/.test(slide.meta.prop) && /width/.test(slide.meta.prop) && slide.meta.dur.split(',').every(d => Math.abs(parseFloat(d) - 0.2) < 0.01), JSON.stringify(slide.meta));
  check('the indicator slides across (frames in between)', first !== last && mid >= 2, JSON.stringify(slide.out));
  await settle(p);

  // a tap smooth-scrolls to the section, landing below the bar, without pushing history
  await jump(p, 's1', 130);
  await p.waitForTimeout(450);
  const hist0 = await p.evaluate(() => history.length);
  await p.click('.hsn a[data-hsn="model"]');
  await sleep(120);
  const midY = await p.evaluate(() => scrollY);
  const endY = await settle(p);
  const land = await p.evaluate(() => ({ top: document.getElementById('model').getBoundingClientRect().top, bar: document.querySelector('.hsn-bar').getBoundingClientRect().bottom, hash: location.hash, h: history.length, cur: [...document.querySelectorAll('.hsn a[aria-current]')].map(a => a.dataset.hsn).join() }));
  check('a tap scrolls there (smoothly, not a jump)', Math.abs(endY - midY) > 30);
  check('and lands the section below the bar and nav', land.top >= land.bar + 4 && land.top <= land.bar + 40, `${Math.round(land.top)} vs bar ${Math.round(land.bar)}`);
  check('without touching the history or the hash', land.h === hist0 && land.hash === '', JSON.stringify(land));
  check('the tapped segment is current when it lands', land.cur === 'model', land.cur);

  // keyboard: Tab to a segment, Enter
  await p.focus('.hsn a[data-hsn="teams"]');
  await p.keyboard.press('Enter');
  await settle(p);
  const kb = await p.evaluate(() => ({ top: document.getElementById('teams').getBoundingClientRect().top, bar: document.querySelector('.hsn-bar').getBoundingClientRect().bottom, ring: getComputedStyle(document.querySelector('.hsn a[data-hsn="teams"]')).outlineStyle, w: parseFloat(getComputedStyle(document.querySelector('.hsn a[data-hsn="teams"]')).outlineWidth) }));
  check('Enter on a focused segment scrolls to its section', kb.top >= kb.bar + 4 && kb.top <= kb.bar + 40, JSON.stringify(kb));
  check('keyboard focus shows a ring', kb.ring !== 'none' && kb.w >= 2, JSON.stringify(kb));

  // the bar goes away again over the hero and --sticky-top is cleaned up
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
  await p.waitForTimeout(450);
  b = await bar(p);
  check('back at the top: bar hidden and --sticky-top removed', !b.on && b.vis === 'hidden' && b.sticky === '', JSON.stringify(b));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // arriving with #section in the URL: the section lands below the bar, not under it
  const { ctx, p } = await open('index.html', '#s9');
  await p.waitForTimeout(1200);
  await settle(p);
  const h = await p.evaluate(() => ({ top: document.getElementById('s9').getBoundingClientRect().top, bar: document.querySelector('.hsn-bar').getBoundingClientRect().bottom, on: document.querySelector('[data-hsn-wrap]').classList.contains('is-on'), cur: [...document.querySelectorAll('.hsn a[aria-current]')].map(a => a.dataset.hsn).join() }));
  check('a #section link lands below the bar and that segment is current', h.on && h.top >= h.bar + 4 && h.top <= h.bar + 40 && h.cur === 's9', JSON.stringify(h));
  await ctx.close();
}
{
  // sticky things stay small, and the page scrolls 1:1 under the wheel
  const { ctx, p } = await open('index.html');
  await p.waitForTimeout(800);
  const steps = [];
  let prev = 0;
  for (let i = 0; i < 8; i++) {
    await p.mouse.wheel(0, 100);
    await p.waitForTimeout(260);
    const y = await p.evaluate(() => Math.round(scrollY));
    steps.push(y - prev); prev = y;
  }
  check('wheel: every step moves the page exactly the wheel distance (no scroll-jacking)', steps.every(d => Math.abs(d - 100) <= 2) && Math.abs(prev - 800) <= 8, steps.join());
  await jump(p, 's1', 110);
  await p.waitForTimeout(400);
  const tall = await p.evaluate(() => [...document.querySelectorAll('.hsn, .hsn-bar, .qa, .qa-tile')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position)).map(e => e.getBoundingClientRect().height / innerHeight));
  check('the home sticky elements are small (under 70% of the viewport)', tall.length > 0 && tall.every(r => r < 0.7), JSON.stringify(tall));
  await ctx.close();
}
{
  // phone: the bar scrolls sideways and keeps the current segment in view; touch scroll is 1:1
  const { ctx, p, errs } = await open('index.html', '', { ...PHONE });
  await p.waitForTimeout(900);
  await jump(p, 's1', 130);
  await p.waitForTimeout(500);
  const m0 = await p.evaluate(() => { const b = document.querySelector('.hsn-bar'); return { sw: b.scrollWidth, cw: b.clientWidth, sl: Math.round(b.scrollLeft), ox: getComputedStyle(b).overflowX }; });
  check('phone: the bar is wider than the screen and scrolls sideways', m0.sw > m0.cw + 40 && /auto|scroll/.test(m0.ox), JSON.stringify(m0));
  const ys0 = await p.evaluate(() => scrollY);
  await jump(p, 'initiative', 220);
  await p.waitForTimeout(600);
  const m1 = await p.evaluate(() => {
    const b = document.querySelector('.hsn-bar'), a = document.querySelector('.hsn a[aria-current]');
    const br = b.getBoundingClientRect(), ar = a.getBoundingClientRect();
    return { cur: a.dataset.hsn, sl: Math.round(b.scrollLeft), inView: ar.left >= br.left - 1 && ar.right <= br.right + 1, sx: scrollX, ow: document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  check('phone: the last segment becomes current and is brought into view by the bar itself', m1.cur === 'initiative' && m1.inView && Math.abs(m1.sl) !== Math.abs(m0.sl), JSON.stringify([m0, m1]));
  check('phone: the page never scrolled sideways', m1.sx === 0 && m1.ow);
  await jump(p, 's1', 130);
  await p.waitForTimeout(600);
  const m2 = await p.evaluate(() => { const b = document.querySelector('.hsn-bar'), a = document.querySelector('.hsn a[aria-current]'); const br = b.getBoundingClientRect(), ar = a.getBoundingClientRect(); return { cur: a.dataset.hsn, inView: ar.left >= br.left - 1 && ar.right <= br.right + 1 }; });
  check('phone: and back to the first one', m2.cur === 's1' && m2.inView, JSON.stringify(m2));
  // tap a visible segment
  // (a real finger taps where the segment is: bring it fully into the bar's own view first, then tap its coordinates)
  const at = await p.evaluate(() => { const b = document.querySelector('.hsn-bar'), a = document.querySelector('.hsn a[data-hsn="teams"]'); const br = b.getBoundingClientRect(); let r = a.getBoundingClientRect(); if (r.left < br.left + 8) b.scrollLeft -= br.left + 8 - r.left; else if (r.right > br.right - 8) b.scrollLeft += r.right - br.right + 8; r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.waitForTimeout(150);
  await p.touchscreen.tap(at.x, at.y);
  await settle(p);
  const tp = await p.evaluate(() => ({ top: document.getElementById('teams').getBoundingClientRect().top, bar: document.querySelector('.hsn-bar').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().bottom }));
  check('phone: a tap lands the section below the bar', tp.top >= tp.bar + 4 && tp.top <= tp.bar + 40, JSON.stringify(tp));
  // touch scroll moves the page exactly the finger distance
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
  await p.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(p);
  const before = await p.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 640 }] });
  for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 640 - i * 30 }] }); await sleep(20); }
  await sleep(150); // a held finger: no fling on release
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(500);
  const moved = (await p.evaluate(() => scrollY)) - before;
  check('touch: the page follows the finger 1:1 (the browser keeps only its 15 px touch slop; no hijack)', moved >= 270 && moved <= 302, String(moved));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ============================== growth phases ============================== */
console.log('growth phases');
const lit = p => p.evaluate(() => [...document.querySelectorAll('.phase')].findIndex(x => x.classList.contains('is-on')));
{
  const { ctx, p, errs } = await open('index.html');
  await p.waitForTimeout(800);
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelector('.phases').scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(700);
  const first = await lit(p);
  const css = await p.evaluate(() => {
    const ph = document.querySelector('.phase'), cs = getComputedStyle(ph);
    const ms = v => v.split(',').map(x => Math.round(parseFloat(x) * 1000));
    return { delay: ms(cs.transitionDelay), dur: ms(cs.transitionDuration), on: getComputedStyle(document.querySelector('.phase.is-on .ph-dot i')).animationName };
  });
  await p.waitForTimeout(10000);
  const later = await lit(p);
  check('idle for 10 s: the highlight does not change by itself', first === 0 && later === 0, `${first} -> ${later}`);
  check('the lit phase has no looping pulse', css.on === 'none', css.on);
  check('phase transitions: no stagger delay, 160-220 ms', css.delay.every(d => d === 0) && Math.max(...css.dur) <= 220 && css.dur.includes(160), JSON.stringify(css));
  // hover and focus move it (the three cards sit side by side on desktop, so scroll position does not)
  const boxes = await p.evaluate(() => [...document.querySelectorAll('.phase')].map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
  await p.mouse.move(boxes[2][0], boxes[2][1]);
  await p.waitForTimeout(250);
  check('pointing at a phase lights it', (await lit(p)) === 2);
  await p.mouse.move(boxes[1][0], boxes[1][1]);
  await p.waitForTimeout(250);
  check('pointing at another moves the highlight', (await lit(p)) === 1);
  await p.mouse.click(boxes[0][0], boxes[0][1]);
  await p.waitForTimeout(250);
  check('a click lights that phase', (await lit(p)) === 0);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // phone: the cards are stacked, the card on the middle line is the lit one
  const { ctx, p } = await open('index.html', '', { ...PHONE });
  await p.waitForTimeout(800);
  const centre = k => p.evaluate(k => { document.documentElement.style.scrollBehavior = 'auto'; const e = document.querySelectorAll('.phase')[k], r = e.getBoundingClientRect(); scrollTo(0, scrollY + r.top + r.height / 2 - innerHeight / 2); }, k);
  const got = [];
  for (const k of [0, 1, 2, 1, 0]) { await centre(k); await p.waitForTimeout(600); got.push(await lit(p)); }
  check('phone: scrolling lights the card on the middle line', got.join() === '0,1,2,1,0', got.join());
  await centre(2);
  await p.waitForTimeout(500);
  check('phone: no art over the section heading (padding above the heading)', await p.evaluate(() => { const w = document.querySelector('.phases-wrap'); return parseFloat(getComputedStyle(w).paddingBlockStart) >= 40; }));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
