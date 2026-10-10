// Browser test of the sitewide "wow" layer (js/wow.js + css/wow.css): water-drop cursor, water-wipe page transitions,
// word-by-word headlines, wave progress, parallax, optional water sound.
//   node tools/yanabee/test-wow.mjs
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
const PAGES = ['index.html', 'teams.html', 'operations.html', 'quran.html', 'learn.html', 'lab.html', '404.html'];
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

// tiny static server for the http checks (the 404 page uses absolute /yanabee/ URLs; cross-document view transitions need http)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, 'site', decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (!f.startsWith(path.join(ROOT, 'site')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    // like the Worker: the nearest 404.html answers any unknown page URL
    if (/\.html$/.test(f)) { res.writeHead(404, { 'content-type': MIME['.html'] }); fs.createReadStream(path.join(ROOT, 'site/yanabee/404.html')).pipe(res); return; }
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const HTTP = `http://127.0.0.1:${server.address().port}/yanabee/`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(target, opts = {}, init = null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...opts });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* storage blocked */ } }); // home intro (other module) stays out of the way
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::|favicon|404 \(Not Found\)/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(/^https?:/.test(target) ? target : url(target));
  await p.waitForTimeout(900);
  return { ctx, p, errs };
}
const norm = s => s.replace(/\s+/g, ' ').trim();
const covered = p => p.evaluate(() => document.documentElement.classList.contains('wipe-in') || document.documentElement.classList.contains('wipe-out') || !!document.querySelector('.yb-wipe'));
const waitClear = (p, ms = 2500) => p.waitForFunction(() => !document.documentElement.classList.contains('wipe-in') && !document.querySelector('.yb-wipe'), null, { timeout: ms }).then(() => true, () => false);

/* ------------------------------------------------------------------------------------------------ cursor */
console.log('water-drop cursor');
{
  const { ctx, p, errs } = await open('learn.html');
  check('fine pointer: cursor canvas exists, hidden from assistive tech, never catches the pointer',
    await p.evaluate(() => { const c = document.querySelector('canvas.wow-cursor'); return !!c && c.getAttribute('aria-hidden') === 'true' && getComputedStyle(c).pointerEvents === 'none' && getComputedStyle(c).position === 'fixed'; }));
  check('cursor canvas sits above the page but below the overlays', await p.evaluate(() => { const z = +getComputedStyle(document.querySelector('.wow-cursor')).zIndex; return z > 100 && z < 150; }));
  check('the native cursor stays (nothing hides it)', await p.evaluate(() => getComputedStyle(document.body).cursor !== 'none' && getComputedStyle(document.documentElement).cursor !== 'none'));
  check('idle page = no rAF work', await p.evaluate(() => window.YanabeeWow.busy() === 0), String(await p.evaluate(() => window.YanabeeWow.busy())));
  for (let i = 0; i < 24; i++) await p.mouse.move(200 + i * 40, 300 + Math.sin(i / 3) * 90, { steps: 2 });
  await p.waitForTimeout(40);
  const painted = async () => p.evaluate(() => { const c = document.querySelector('.wow-cursor'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 8) n++; return n; });
  check('moving the pointer draws the droplet and its trail', (await painted()) > 40, String(await painted()));
  check('while it moves the loop runs', await p.evaluate(() => window.YanabeeWow.busy() > 0));
  // hover on a button: the follower swells into a ring tinted with the section colour
  const btn = await p.$('.hero .btn, .btn');
  await btn.scrollIntoViewIfNeeded();
  const bb = await btn.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2 - 30, bb.y + bb.height / 2, { steps: 10 });
  await p.waitForTimeout(500);
  const ring = await p.evaluate(({ x, y }) => {
    const c = document.querySelector('.wow-cursor'), k = c.width / innerWidth, g = c.getContext('2d');
    let best = 0;
    for (let a = 0; a < 16; a++) for (let dr = -2; dr <= 2; dr++) {
      const r = (26 + dr) * k, d = g.getImageData(Math.round(x * k + Math.cos(a * 0.4) * r), Math.round(y * k + Math.sin(a * 0.4) * r), 1, 1).data;
      best = Math.max(best, d[3]);
    }
    return best;
  }, { x: bb.x + bb.width / 2 - 30, y: bb.y + bb.height / 2 });
  check('hovering something interactive draws a ring around the pointer', ring > 90, String(ring));
  await p.mouse.down();
  await p.waitForTimeout(110);
  check('pressing splashes droplets (loop wakes up)', await p.evaluate(() => window.YanabeeWow.busy() > 0));
  await p.mouse.up();
  await p.mouse.move(5, 5, { steps: 4 });
  await p.waitForTimeout(2500);
  check('after everything settles the loop stops again', await p.evaluate(() => window.YanabeeWow.busy() === 0), String(await p.evaluate(() => window.YanabeeWow.busy())));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const t = await open('index.html', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  check('touch: no cursor canvas', await t.p.evaluate(() => !document.querySelector('.wow-cursor')));
  check('touch: no script errors', t.errs.length === 0, t.errs.join(' | '));
  await t.ctx.close();
  const r = await open('index.html', { reducedMotion: 'reduce' });
  await r.p.mouse.move(300, 300, { steps: 6 });
  check('reduced motion: no cursor canvas', await r.p.evaluate(() => !document.querySelector('.wow-cursor')));
  check('reduced motion: no wave progress / parallax / split headings', await r.p.evaluate(() => !document.documentElement.classList.contains('wow-prog') && !document.documentElement.classList.contains('wow-par-on') && !document.querySelector('.wow-split, .wow-par, .wow-head')));
  check('reduced motion: nothing runs', await r.p.evaluate(() => window.YanabeeWow.busy() === 0));
  check('reduced motion: no script errors', r.errs.length === 0, r.errs.join(' | '));
  await r.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ wipe */
console.log('water-wipe page transitions (file://)');
{
  const { ctx, p, errs } = await open('index.html');
  const t0 = Date.now();
  await p.click('.links a[href="teams.html"]');
  await p.waitForTimeout(60);
  const st = await p.evaluate(() => ({ key: sessionStorage.getItem('yb-wipe'), overlay: !!document.querySelector('.yb-wipe'), out: document.documentElement.classList.contains('wipe-out'), url: location.href }));
  check('clicking a page link raises the water and stores the point', st.overlay && st.out && !!st.key && /"x":\d+,"y":\d+/.test(st.key) && /teams\.html$/.test(st.url) === false, st.key);
  await p.waitForURL(/teams\.html$/, { timeout: 4000 });
  const ms = Date.now() - t0;
  check('navigation lands on the right page after the cover completes', /teams\.html$/.test(p.url()) && ms > 380 && ms < 2500, ms + ' ms');
  check('the arrival cover goes away within 1.5 s and the page is visible', await waitClear(p, 1500));
  await p.waitForTimeout(400);
  check('no leftovers after arrival (key, classes, overlay)', await p.evaluate(() => sessionStorage.getItem('yb-wipe') === null && !document.querySelector('.yb-wipe') && !/wipe/.test(document.documentElement.className)));
  check('the new page is alive (h1 visible, nav present)', await p.evaluate(() => { const h = document.querySelector('main h1'), r = h.getBoundingClientRect(); return r.width > 0 && getComputedStyle(h).opacity === '1' && !!document.querySelector('.nav'); }));
  // back: whatever the browser does (bfcache or reload) the page must come back uncovered and working
  await p.goBack();
  await p.waitForTimeout(900);
  check('back navigation does not leave a cover', !(await covered(p)) && /index\.html$/.test(p.url()), p.url());
  check('back navigation: key cleared, page responsive', await p.evaluate(() => sessionStorage.getItem('yb-wipe') === null && !!window.YanabeeWow));
  // simulate the bfcache case explicitly: page restored while still covered
  await p.evaluate(() => {
    document.documentElement.classList.add('wipe-in', 'wipe-out');
    const o = document.createElement('div'); o.className = 'yb-wipe go'; document.body.appendChild(o);
    sessionStorage.setItem('yb-wipe', '{"x":1,"y":1}');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  check('pageshow(persisted) uncovers instantly', !(await covered(p)) && await p.evaluate(() => sessionStorage.getItem('yb-wipe') === null));
  // hash links on the page do not wipe
  const hash = await p.evaluate(() => { const a = [...document.querySelectorAll('a[href^="#"]')].find(x => x.getBoundingClientRect().width > 0 && x.getAttribute('href').length > 1); return a ? a.getAttribute('href') : null; });
  if (hash) {
    await p.click(`a[href="${hash}"] >> nth=0`, { force: true }).catch(() => {});
    await p.waitForTimeout(150);
    check('same-page hash links do not wipe', await p.evaluate(() => !document.querySelector('.yb-wipe') && sessionStorage.getItem('yb-wipe') === null && !document.documentElement.classList.contains('wipe-out')));
  } else check('same-page hash links do not wipe', false, 'no hash link found');
  // a link to the current page does not wipe either
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.click('.nav .brand');
  await p.waitForTimeout(150);
  check('link to the current page does not wipe', await p.evaluate(() => !document.querySelector('.yb-wipe') && sessionStorage.getItem('yb-wipe') === null));
  // modifier clicks keep the browser behaviour
  await p.click('.links a[href="operations.html"]', { modifiers: ['Shift'], noWaitAfter: true }).catch(() => {});
  await p.waitForTimeout(150);
  check('modifier click is left alone (no wipe)', await p.evaluate(() => !document.querySelector('.yb-wipe')));
  const pages = ctx.pages();
  for (const pg of pages) if (pg !== p) await pg.close().catch(() => {});
  // keyboard Enter: origin is the element centre
  await p.focus('.links a[href="quran.html"]');
  const c = await p.evaluate(() => { const r = document.querySelector('.links a[href="quran.html"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(60);
  const key = await p.evaluate(() => JSON.parse(sessionStorage.getItem('yb-wipe') || 'null'));
  check('keyboard Enter wipes from the element centre', !!key && Math.abs(key.x - c.x) < 3 && Math.abs(key.y - c.y) < 3, JSON.stringify([key, c]));
  await p.waitForURL(/quran\.html$/, { timeout: 4000 });
  check('keyboard navigation arrives and uncovers', await waitClear(p, 1500));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // a navigation that never happens (blocked) must not leave the page covered
  const { ctx, p, errs } = await open('index.html');
  p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.evaluate(() => addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; }));
  await p.click('.links a[href="teams.html"]');
  await p.waitForTimeout(700);
  check('(blocked navigation) the cover is up while it tries', await p.evaluate(() => !!document.querySelector('.yb-wipe')));
  await p.waitForTimeout(1900);
  check('(blocked navigation) page is uncovered again within ~1.6 s of the click', !(await covered(p)) && await p.evaluate(() => sessionStorage.getItem('yb-wipe') === null));
  // Esc during the wipe uncovers too
  await p.evaluate(() => { window.__noNav = true; });
  await p.click('.links a[href="operations.html"]');
  await p.waitForTimeout(150);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  check('Esc stops the wipe and uncovers', !(await covered(p)));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const t = await open('index.html', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await t.p.tap('.tabbar a[href="teams.html"]');
  await t.p.waitForTimeout(80);
  check('touch: wipe works too', await t.p.evaluate(() => !!document.querySelector('.yb-wipe') && !!sessionStorage.getItem('yb-wipe')));
  await t.p.waitForURL(/teams\.html$/, { timeout: 4000 });
  check('touch: arrives and uncovers', await waitClear(t.p, 1500));
  check('touch: no script errors', t.errs.length === 0, t.errs.join(' | '));
  await t.ctx.close();
  const r = await open('index.html', { reducedMotion: 'reduce' });
  await r.p.evaluate(() => { window.__seen = false; new MutationObserver(() => { if (document.querySelector('.yb-wipe')) window.__seen = true; }).observe(document.body, { childList: true }); });
  const t0 = Date.now();
  await r.p.click('.links a[href="teams.html"]');
  await r.p.waitForURL(/teams\.html$/, { timeout: 4000 });
  check('reduced motion: ordinary, immediate navigation (no wipe)', Date.now() - t0 < 700 && !(await r.p.evaluate(() => sessionStorage.getItem('yb-wipe'))), (Date.now() - t0) + ' ms');
  check('reduced motion: never covered', !(await covered(r.p)));
  await r.ctx.close();
}
console.log('water-wipe page transitions (http, cross-document view transition present)');
{
  const { ctx, p, errs } = await open(HTTP + 'index.html');
  await p.click('.links a[href="learn.html"]');
  await p.waitForURL(/learn\.html$/, { timeout: 5000 });
  check('http: wipe navigates and uncovers', await waitClear(p, 1800));
  await p.waitForTimeout(500);
  check('http: no leftovers', await p.evaluate(() => sessionStorage.getItem('yb-wipe') === null && !/wipe/.test(document.documentElement.className) && !document.querySelector('.yb-wipe')));
  check('http: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  // 404 page: absolute /yanabee/... URLs are internal links too
  const n = await open(HTTP + 'does/not/exist.html');
  check('404 page renders from the nearest 404.html', await n.p.evaluate(() => /الصفحة غير موجودة/.test(document.body.textContent)));
  check('404: wow layer is loaded on it', await n.p.evaluate(() => !!window.YanabeeWow));
  await n.p.click('main a[href$="index.html"]');
  await n.p.waitForTimeout(80);
  check('404: the link to home wipes', await n.p.evaluate(() => !!document.querySelector('.yb-wipe')));
  await n.p.waitForURL(/\/yanabee\/index\.html$/, { timeout: 5000 });
  check('404: lands on the home page and uncovers', await waitClear(n.p, 1800));
  check('404: no script errors', n.errs.length === 0, n.errs.join(' | '));
  await n.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ headlines */
console.log('word-by-word headlines');
for (const pg of PAGES) {
  const raw = fs.readFileSync(path.join(ROOT, 'site/yanabee', pg), 'utf8');
  const { ctx, p, errs } = await open(pg);
  const orig = await p.evaluate(html => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    return [...d.querySelectorAll('main h1, main h2')].map(h => h.textContent.replace(/\s+/g, ' ').trim());
  }, raw);
  const now = await p.evaluate(() => [...document.querySelectorAll('main h1, main h2')].map(h => ({ t: h.textContent.replace(/\s+/g, ' ').trim(), i: h.innerText.replace(/\s+/g, ' ').trim(), split: h.classList.contains('wow-split'), verse: !!h.closest('.verse') })));
  check(`${pg}: every h1/h2 keeps its exact text (${now.length})`, (() => { let j = 0; now.forEach(h => { if (h.t === orig[j]) j++; }); return j === orig.length; })(), JSON.stringify([orig, now.map(h => h.t)]).slice(0, 300)); // (pages may add headings with JS later; the static ones must all be there, in order, unchanged)
  check(`${pg}: innerText (what copy/paste and find-in-page see) is unchanged`, await p.evaluate(() => [...document.querySelectorAll('main h1, main h2')].every(h => h.innerText.replace(/\s+/g, ' ').trim() === h.textContent.replace(/\s+/g, ' ').trim() || h.querySelector('.tm-paren,.q-paren,.op-paren'))));
  check(`${pg}: headings are split into word spans (never letters)`, await p.evaluate(() => {
    const hs = [...document.querySelectorAll('main h1.wow-split, main h2.wow-split')];
    return hs.length > 0 && hs.every(h => [...h.querySelectorAll('.w .wi')].every(w => !/\s/.test(w.textContent.trim()) && w.textContent.trim().length > 0)) && hs.some(h => h.querySelectorAll('.w').length > 1);
  }) || pg === '404.html');
  // scroll through the whole page, then every heading must be fully visible
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 420) { await p.evaluate(v => scrollTo({ top: v, behavior: 'instant' }), y); await p.waitForTimeout(110); }
  await p.waitForTimeout(1800);
  const bad = await p.evaluate(() => [...document.querySelectorAll('main h1, main h2')].filter(h => h.getClientRects().length && !h.closest('[hidden]')).filter(h => {
    if (getComputedStyle(h).opacity !== '1') return true;
    return [...h.querySelectorAll('.wi, .wow-u')].some(w => getComputedStyle(w).opacity !== '1' || (getComputedStyle(w).transform !== 'none' && getComputedStyle(w).transform !== 'matrix(1, 0, 0, 1, 0, 0)') || getComputedStyle(w).filter !== 'none');
  }).map(h => h.textContent.trim().slice(0, 30)));
  check(`${pg}: every h1/h2 ends up visible and settled`, bad.length === 0, bad.join(' | '));
  check(`${pg}: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // mid-animation sanity: a heading below the fold starts hidden and rises when it enters the viewport
  const { ctx, p } = await open('learn.html');
  await p.evaluate(() => { const h = [...document.querySelectorAll('main h2.wow-split')].find(x => x.getBoundingClientRect().top > innerHeight + 300); h.id = h.id || 'wow-probe'; window.__probe = h.id; });
  const before = await p.evaluate(() => { const h = document.getElementById(window.__probe); return { go: h.classList.contains('wow-go'), op: getComputedStyle(h.querySelector('.wi')).opacity }; });
  await p.evaluate(() => document.getElementById(window.__probe).scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.waitForTimeout(60);
  const early = await p.evaluate(() => document.getElementById(window.__probe).classList.contains('wow-go'));
  await p.waitForTimeout(1600);
  const after = await p.evaluate(() => ({ op: getComputedStyle(document.getElementById(window.__probe).querySelector('.wi')).opacity, done: document.getElementById(window.__probe).classList.contains('wow-done') }));
  check('headline below the fold is hidden first, then reveals when scrolled to', !before.go && before.op === '0' && early && after.op === '1', JSON.stringify({ before, early, after }));
  check('mask is dropped once the words have settled (nothing stays clipped)', after.done && await p.evaluate(() => getComputedStyle(document.getElementById(window.__probe).querySelector('.w')).clipPath === 'none'));
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ progress + parallax */
console.log('wave progress + parallax');
{
  const { ctx, p, errs } = await open('index.html');
  check('progress bar got a wave head and the wave mode', await p.evaluate(() => document.documentElement.classList.contains('wow-prog') && !!document.querySelector('.progress > .wow-head[aria-hidden="true"]') && document.querySelector('.progress').getAttribute('aria-hidden') === 'true'));
  const h0 = await p.evaluate(() => document.querySelector('.progress').getBoundingClientRect().height);
  check('progress bar is 4–5px tall', h0 >= 4 && h0 <= 5.1, String(h0));
  await p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight * 0.5, behavior: 'instant' }));
  await p.waitForTimeout(500);
  const pr = await p.evaluate(() => ({ p: parseFloat(document.querySelector('.progress').style.getPropertyValue('--p')), tr: getComputedStyle(document.querySelector('.progress')).transform, on: document.querySelector('.progress').classList.contains('on'), head: document.querySelector('.wow-head').style.transform }));
  check('progress follows the scroll (value, head position, visible head)', pr.p > 0.3 && pr.p < 0.7 && pr.on && /translate3d/.test(pr.head), JSON.stringify(pr));
  check('the wave only flows while scrolling', await p.evaluate(() => document.querySelector('.progress').classList.contains('flow')) && (await p.waitForTimeout(900), await p.evaluate(() => !document.querySelector('.progress').classList.contains('flow'))));
  // parallax
  await p.evaluate(() => { const el = document.querySelector('.b-photo'); el && el.scrollIntoView({ block: 'center', behavior: 'instant' }); });
  await p.waitForTimeout(250);
  await p.evaluate(() => scrollBy({ top: 220, behavior: 'instant' }));
  await p.waitForTimeout(700);
  const par = await p.evaluate(() => ({ on: document.documentElement.classList.contains('wow-par-on'), n: document.querySelectorAll('.wow-par').length, tr: (document.querySelector('.b-photo img.wow-par') || {}).style && document.querySelector('.b-photo img.wow-par').style.translate }));
  check('parallax layers are registered and shifted by scroll', par.on && par.n >= 3 && !!par.tr && par.tr !== '0 0px', JSON.stringify(par));
  await p.waitForTimeout(500);
  check('parallax settles: no rAF work when idle', await p.evaluate(() => window.YanabeeWow.busy() === 0));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ sound */
console.log('water sound');
{
  const init = () => {
    window.__ac = 0;
    const AC = window.AudioContext;
    window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__ac++; window.__lastAC = this; } };
  };
  const { ctx, p, errs } = await open('index.html', {}, init);
  const info = await p.evaluate(() => { const b = document.querySelector('.nav .actions .sound-btn'), s = document.querySelector('.nav .actions .search-btn'); return { has: !!b, tag: b && b.tagName, pressed: b && b.getAttribute('aria-pressed'), label: b && b.getAttribute('aria-label'), title: b && b.title, before: b && s ? !!(b.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) : null, ac: window.__ac }; });
  check('sound button is a real button in .nav .actions, before search', info.has && info.tag === 'BUTTON' && info.before === true, JSON.stringify(info));
  check('it is OFF by default, named «صوت الماء» with a tooltip', info.pressed === 'false' && info.label === 'صوت الماء' && info.title === 'صوت الماء');
  check('no AudioContext exists before a gesture', info.ac === 0);
  check('off = silent', await p.evaluate(() => window.YanabeeWow.sound.play('drop') === false));
  await p.click('.sound-btn');
  const on = await p.evaluate(() => ({ pressed: document.querySelector('.sound-btn').getAttribute('aria-pressed'), ls: localStorage.getItem('yanabee-sound'), ac: window.__ac, vol: window.YanabeeWow.sound.volume, state: window.__lastAC && window.__lastAC.state }));
  check('clicking it toggles aria-pressed and persists to localStorage', on.pressed === 'true' && on.ls === '1');
  check('the AudioContext is created by that gesture, master gain stays low', on.ac === 1 && on.vol > 0 && on.vol <= 0.18, JSON.stringify(on));
  const types = await p.evaluate(() => {
    const out = {};
    ['drop', 'ripple', 'whoosh', 'good', 'bad'].forEach(t => { try { window.dispatchEvent(new CustomEvent('yanabee:sound', { detail: { type: t } })); out[t] = true; } catch (e) { out[t] = String(e); } });
    return out;
  });
  check('yanabee:sound events are accepted for every type', Object.values(types).every(v => v === true), JSON.stringify(types));
  await p.waitForTimeout(150);
  check('a sound really plays when on (play() returns true)', await p.evaluate(async () => { await new Promise(r => setTimeout(r, 120)); return window.YanabeeWow.sound.play('good'); }));
  check('unknown sound types are ignored', await p.evaluate(() => window.YanabeeWow.sound.play('nope') === false));
  check('sound toggle works from the keyboard', await (async () => { await p.focus('.sound-btn'); await p.keyboard.press('Space'); const off = await p.evaluate(() => document.querySelector('.sound-btn').getAttribute('aria-pressed') === 'false' && localStorage.getItem('yanabee-sound') === '0'); await p.keyboard.press('Enter'); return off && await p.evaluate(() => document.querySelector('.sound-btn').getAttribute('aria-pressed') === 'true'); })());
  check('no script errors', errs.length === 0, errs.join(' | '));
  await p.reload();
  await p.waitForTimeout(700);
  const re = await p.evaluate(() => ({ pressed: document.querySelector('.sound-btn').getAttribute('aria-pressed'), ac: window.__ac }));
  check('the setting survives a reload, still no AudioContext before the first gesture', re.pressed === 'true' && re.ac === 0, JSON.stringify(re));
  await p.mouse.click(700, 420);
  await p.waitForTimeout(100);
  check('the first gesture creates the context when sound is on', await p.evaluate(() => window.__ac === 1));
  await ctx.close();
}
{
  // mobile: the button fits the nav
  const t = await open('index.html', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const fit = await t.p.evaluate(() => {
    const bar = document.querySelector('.nav-bar').getBoundingClientRect(), b = document.querySelector('.sound-btn').getBoundingClientRect(), th = document.querySelector('.nav .theme-toggle').getBoundingClientRect(), br = document.querySelector('.nav .brand').getBoundingClientRect();
    return { inside: b.left >= bar.left && b.right <= bar.right, overlapTheme: !(b.right <= th.left || b.left >= th.right), overlapBrand: !(b.right <= br.left || b.left >= br.right), w: b.width };
  });
  check('390px: the sound button fits the nav without overlapping anything', fit.inside && !fit.overlapTheme && !fit.overlapBrand && fit.w >= 40, JSON.stringify(fit));
  await t.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ everything else */
console.log('all pages: errors, overflow, theme toggle');
for (const pg of PAGES) {
  const d = await open(pg);
  await d.p.mouse.move(400, 300, { steps: 5 });
  await d.p.mouse.click(420, 320);
  await d.p.waitForTimeout(200);
  check(`${pg}: no console errors on desktop`, d.errs.length === 0, d.errs.join(' | '));
  await d.ctx.close();
  const m = await open(pg, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ov = await m.p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
  check(`${pg}: no horizontal overflow at 390px`, ov.s <= ov.c + 1, JSON.stringify(ov));
  check(`${pg}: no console errors on mobile`, m.errs.length === 0, m.errs.join(' | '));
  await m.ctx.close();
}
{
  const { ctx, p } = await open('teams.html');
  const before = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click('.nav .theme-toggle');
  await p.waitForTimeout(2000);
  check('the theme toggle (circular view-transition) still works', await p.evaluate(b => document.documentElement.dataset.theme !== b && !document.documentElement.classList.contains('vt-theme'), before));
  check('the wave progress and cursor follow the new theme without errors', await p.evaluate(() => !!document.querySelector('.wow-cursor') && document.documentElement.classList.contains('wow-prog')));
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} wow tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
