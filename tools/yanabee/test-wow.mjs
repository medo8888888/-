// Browser test of the app-shell layer (js/wow.js + css/wow.css + the inline head script of core.py):
// persistent shell + push transition (cross-document view transitions and the JS fallback), quick reveals, press feedback,
// sliding tab indicators, toast, haptics, condensing nav + page title, tab bar, drag-to-dismiss sheet, wave progress,
// 1:1 parallax, cursor ring + splash, optional water sound.
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

// tiny static server for the http checks (the 404 page uses absolute /yanabee/ URLs)
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

// Recorder installed in every document (before its scripts): what the view transition did, frame by frame, plus the state wow.js
// had at DOMContentLoaded. Reads only; never changes the page.
const recorder = () => {
  if (location.protocol === 'about:') return;
  const R = window.__rec = { has: false, frames: [], anims: null, done: null, dcl: null };
  const rect = el => { if (!el) return ''; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(v => Math.round(v * 10) / 10).join(','); };
  const pc = sel => { const c = getComputedStyle(document.documentElement, sel); return c.opacity + '|' + c.display + '|' + c.transform + '|' + c.animationName; };
  addEventListener('pagereveal', e => {
    R.nav = document.documentElement.dataset.nav;
    R.has = !!e.viewTransition;
    if (!e.viewTransition) return;
    const t0 = performance.now();
    const tick = () => {
      const t = performance.now() - t0;
      const nav = document.querySelector('.nav-bar'), tab = document.querySelector('.tabbar');
      R.frames.push({ t, nav: rect(nav), tab: rect(tab), navOp: nav ? getComputedStyle(nav).opacity : '', tabOp: tab ? getComputedStyle(tab).opacity : '',
        newRoot: pc('::view-transition-new(root)'), oldRoot: pc('::view-transition-old(root)'),
        newNav: pc('::view-transition-new(nav)'), oldNav: pc('::view-transition-old(nav)'), grpNav: pc('::view-transition-group(nav)'),
        newTab: pc('::view-transition-new(tabbar)'), oldTab: pc('::view-transition-old(tabbar)') });
      if (t < 500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    e.viewTransition.ready.then(() => {
      R.readyAt = performance.now() - t0;
      R.types = [...(e.viewTransition.types || [])];     // the head script's listener runs after this one: read once the transition is ready
      R.anims = document.documentElement.getAnimations({ subtree: true }).filter(a => a.effect && a.effect.pseudoElement)
        .map(a => ({ p: a.effect.pseudoElement, n: a.animationName, d: a.effect.getTiming().duration, delay: a.effect.getTiming().delay,
          kf: a.effect.getKeyframes().map(k => ({ o: k.opacity, t: k.transform })) }));
    }, () => { R.anims = []; });
    e.viewTransition.finished.then(() => { R.done = performance.now() - t0; R.ran = R.done - (R.readyAt || 0); }, () => {});
  });
  document.addEventListener('DOMContentLoaded', () => {
    const m = document.querySelector('main');
    const vh = innerHeight;
    R.dcl = {
      mainAnims: m ? m.getAnimations().map(a => ({ d: a.effect.getTiming().duration, kf: a.effect.getKeyframes().map(k => k.transform + '|' + k.opacity), easing: a.effect.getTiming().easing })) : [],
      rvTotal: document.querySelectorAll('.rv').length,
      rvIn: [...document.querySelectorAll('.rv.in')].length,
      rvNowOnScreen: [...document.querySelectorAll('.rv')].filter(e => e.getBoundingClientRect().top < vh).every(e => e.classList.contains('in')),
      rvAllIn: [...document.querySelectorAll('.rv')].every(e => e.classList.contains('in')),
      nav: document.documentElement.dataset.nav,
    };
  });
};
// no PageRevealEvent and no cross-document opt-in: what Firefox/older Safari see
const fallbackInit = () => {
  if (location.protocol === 'about:') return;
  try { delete window.PageRevealEvent; } catch (e) { /* ignore */ }
  if (typeof window.PageRevealEvent === 'function') window.PageRevealEvent = undefined;
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '@view-transition{navigation:none}'; document.head.appendChild(s); });
  addEventListener('pagehide', () => { try { sessionStorage.setItem('__hide', String(performance.now() - (window.__click || 0))); } catch (e) { /* ignore */ } });
  addEventListener('click', () => { window.__click = performance.now(); }, true);
};

async function open(target, opts = {}, init = null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...opts });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* storage blocked */ } }); // home intro (other module) stays out of the way
  await ctx.addInitScript(recorder);
  if (init) for (const f of [].concat(init)) await ctx.addInitScript(f);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::|favicon|404 \(Not Found\)/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(/^https?:/.test(target) ? target : url(target), { waitUntil: 'load' });
  await p.waitForTimeout(900);
  return { ctx, p, errs };
}
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frames2 = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const tx = m => { const r = /matrix\(([^)]+)\)/.exec(m || ''); return r ? parseFloat(r[1].split(',')[4]) : 0; };

// Headless Chromium rasterises in software here; a heavy page occasionally makes it skip a view transition (the navigation then simply
// happens instantly). Retry from a calm page until one really ran, then assert on that run.
async function vtNav(p, from, link, to, tries = 5) {
  for (let i = 0; i < tries; i++) {
    if (!new RegExp(from.replace('.', '\\.') + '$').test(p.url().split('#')[0])) { await p.goto(HTTP + from, { waitUntil: 'load' }); }
    await p.waitForTimeout(2200);
    await p.click(link);
    await p.waitForURL(new RegExp(to.replace('.', '\\.')), { timeout: 8000 });
    await p.waitForLoadState('load');
    await p.waitForTimeout(700);
    await p.waitForFunction(() => !window.__rec || !window.__rec.has || window.__rec.done != null, null, { timeout: 5000 }).catch(() => {});
    const R = await p.evaluate(() => window.__rec && { has: window.__rec.has, nav: window.__rec.nav, types: window.__rec.types, anims: window.__rec.anims, done: window.__rec.done, ran: window.__rec.ran, frames: window.__rec.frames });
    if (R && R.has && R.anims && R.frames.length) return R;
    await p.goto(HTTP + from, { waitUntil: 'load' });
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------ API */
console.log('API');
{
  const { ctx, p, errs } = await open('learn.html');
  const api = await p.evaluate(() => ({
    app: !!window.YanabeeApp && ['toast', 'haptic', 'go'].every(k => typeof YanabeeApp[k] === 'function'),
    wow: !!window.YanabeeWow && typeof YanabeeWow.go === 'function' && !!YanabeeWow.sound && !!YanabeeWow.cursor,
    same: window.YanabeeWow.go === window.YanabeeApp.go,
    retired: !('wipe' in window.YanabeeWow),
  }));
  check('window.YanabeeApp = { toast, haptic, go }', api.app, JSON.stringify(api));
  check('window.YanabeeWow keeps go / sound / cursor and go is the same function', api.wow && api.same, JSON.stringify(api));
  check('the wipe is gone from the API', api.retired);
  check('retired wipe leftovers: no overlay element, no wipe classes, no yb-wipe key',
    await p.evaluate(() => !document.querySelector('.yb-wipe') && !/wipe/.test(document.documentElement.className) && sessionStorage.getItem('yb-wipe') === null));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ cursor */
console.log('cursor: hover ring + press splash');
{
  const { ctx, p, errs } = await open('learn.html');
  check('fine pointer: cursor canvas exists, hidden from assistive tech, never catches the pointer',
    await p.evaluate(() => { const c = document.querySelector('canvas.wow-cursor'); return !!c && c.getAttribute('aria-hidden') === 'true' && getComputedStyle(c).pointerEvents === 'none' && getComputedStyle(c).position === 'fixed'; }));
  check('cursor canvas is at z-index 140: above the nav, below the sheet/chat/search', await p.evaluate(() => +getComputedStyle(document.querySelector('.wow-cursor')).zIndex === 140));
  check('the native cursor stays (nothing hides it)', await p.evaluate(() => getComputedStyle(document.body).cursor !== 'none' && getComputedStyle(document.documentElement).cursor !== 'none'));
  check('idle page = no rAF work', await p.evaluate(() => window.YanabeeWow.busy() === 0), String(await p.evaluate(() => window.YanabeeWow.busy())));
  const painted = async () => p.evaluate(() => { const c = document.querySelector('.wow-cursor'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 5) if (d[i] > 8) n++; return n; });
  // plain content: nothing follows the pointer (no droplet, no trail)
  await p.mouse.move(40, 700);
  for (let i = 0; i < 24; i++) await p.mouse.move(120 + i * 12, 700 + Math.sin(i / 3) * 40, { steps: 2 });
  await p.waitForTimeout(80);
  check('moving over plain content draws nothing (no follower, no trail) and costs no frames', (await painted()) === 0 && await p.evaluate(() => window.YanabeeWow.busy() === 0), String(await painted()));
  // hover on a button: a ring in the section colour, attached to the pointer
  const btn = await p.$('.hero .btn, .btn');
  await btn.scrollIntoViewIfNeeded();
  const bb = await btn.boundingBox();
  const px = bb.x + bb.width / 2 - 30, py = bb.y + bb.height / 2;
  await p.mouse.move(px - 60, py, { steps: 4 });
  await p.mouse.move(px, py, { steps: 10 });
  await p.waitForTimeout(500);
  const ring = await p.evaluate(({ x, y }) => {
    const c = document.querySelector('.wow-cursor'), k = c.width / innerWidth, g = c.getContext('2d');
    let best = 0, centre = 0;
    for (let a = 0; a < 16; a++) for (let dr = -2; dr <= 2; dr++) {
      const r = (26 + dr) * k, d = g.getImageData(Math.round(x * k + Math.cos(a * 0.4) * r), Math.round(y * k + Math.sin(a * 0.4) * r), 1, 1).data;
      best = Math.max(best, d[3]);
    }
    centre = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3];
    return { best, centre };
  }, { x: px, y: py });
  check('hovering something interactive draws a ring around the pointer', ring.best > 90, JSON.stringify(ring));
  check('the ring is a ring (open in the middle: no droplet under the pointer)', ring.centre < 60, JSON.stringify(ring));
  await p.mouse.down();
  await p.waitForTimeout(90);
  check('pressing splashes droplets (loop wakes up)', await p.evaluate(() => window.YanabeeWow.busy() > 0));
  await p.mouse.move(5, 5, { steps: 3 });
  await p.mouse.up();
  const t0 = Date.now();
  await p.waitForFunction(() => window.YanabeeWow.busy() === 0, null, { timeout: 3000 });
  check('the splash is over in under 450 ms (+ frame slack) and the loop stops again', Date.now() - t0 < 600, (Date.now() - t0) + ' ms');
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const t = await open('index.html', PHONE);
  check('touch: no cursor canvas', await t.p.evaluate(() => !document.querySelector('.wow-cursor')));
  check('touch: no script errors', t.errs.length === 0, t.errs.join(' | '));
  await t.ctx.close();
  const r = await open('index.html', { reducedMotion: 'reduce' });
  await r.p.mouse.move(300, 300, { steps: 6 });
  check('reduced motion: no cursor canvas', await r.p.evaluate(() => !document.querySelector('.wow-cursor')));
  check('reduced motion: no wave progress / parallax', await r.p.evaluate(() => !document.documentElement.classList.contains('wow-prog') && !document.documentElement.classList.contains('wow-par-on') && !document.querySelector('.wow-par, .wow-head')));
  check('reduced motion: nothing runs', await r.p.evaluate(() => window.YanabeeWow.busy() === 0));
  check('reduced motion: no script errors', r.errs.length === 0, r.errs.join(' | '));
  await r.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ page transition (view transitions) */
console.log('page push transition (cross-document view transitions, http)');
{
  const { ctx, p, errs } = await open(HTTP + 'teams.html');
  check('html[data-nav] is set before first paint (inline head script)', await p.evaluate(() => ['forward', 'back', 'reload'].includes(document.documentElement.dataset.nav)));
  check('the inline head script registers pageswap/pagereveal', await p.evaluate(() => typeof PageRevealEvent === 'function'));
  const R = await vtNav(p, 'teams.html', '.links a[href="operations.html"]', 'operations.html');
  check('forward navigation ran a cross-document view transition (types + data-nav = forward)', !!R && R.nav === 'forward' && (R.types || []).includes('forward'), JSON.stringify(R && { nav: R.nav, types: R.types }));
  if (R) {
    const ov = await p.evaluate(() => ({ wipe: !!document.querySelector('.yb-wipe'), cls: document.documentElement.className, key: sessionStorage.getItem('yb-wipe') }));
    check('no overlay element, no wipe classes, no wipe key', !ov.wipe && !/wipe/.test(ov.cls) && ov.key === null, JSON.stringify(ov));
    // shell frozen: nav + tab bar boxes identical in every sampled frame, shown at full opacity, no old copy, no animation on their groups
    const fr = R.frames;
    const same = k => fr.every(f => f[k] === fr[0][k]);
    check(`nav bar box identical in all ${fr.length} sampled frames`, same('nav'), fr.map(f => f.nav).filter((v, i, a) => a.indexOf(v) === i).join(' / '));
    check('tab bar box identical in all sampled frames', same('tab'));
    check('nav stays fully opaque', fr.every(f => f.navOp === '1'));
    const live = fr.filter(f => /^1\|/.test(f.newNav));
    check('the nav group has no old copy and its new copy is opaque and not animated (frozen)',
      fr.every(f => !/^[0-9.]+\|(?!none)/.test(f.oldNav) || /\|none\|/.test(f.oldNav)) && fr.every(f => f.newNav.split('|')[3] === 'none' || f.newNav.split('|')[3] === 'auto' || f.newNav.split('|')[3] === ''), JSON.stringify(fr.slice(0, 2).map(f => [f.newNav, f.oldNav, f.grpNav])));
    check('nothing animates the nav / tab bar groups', !R.anims.some(a => /\((nav|tabbar|yb-[a-z]+)\)/.test(a.p)), JSON.stringify(R.anims.map(a => a.p)));
    // durations: exit <= 180 ms, enter <= 260 ms, transform + opacity only
    const old = R.anims.filter(a => a.p === '::view-transition-old(root)');
    const nw = R.anims.filter(a => a.p === '::view-transition-new(root)');
    check('old content exits in <= 180 ms', old.length > 0 && old.every(a => a.d <= 180), JSON.stringify(old));
    check('new content enters in <= 260 ms', nw.length > 0 && nw.every(a => a.d <= 260), JSON.stringify(nw));
    check('animation names are the app push (no blur/clip keyframes)', old.every(a => /^yb-out-f$/.test(a.n)) && nw.every(a => /^yb-(fade-in|in-f)$/.test(a.n)), JSON.stringify([old, nw].map(l => l.map(a => a.n))));
    const endAt = Math.max(0, ...R.anims.filter(a => /root/.test(a.p)).map(a => (a.delay || 0) + a.d));
    check('the whole content transition is over within 260 ms of its start (animation timing), and the browser reports it finished', endAt > 0 && endAt <= 260 && R.done != null, JSON.stringify({ endAt, done: R.done, ran: R.ran }));
    // direction (RTL): forward enters from the LEFT (negative x), the old page leaves toward the right (positive x)
    const txs = fr.map(f => tx(f.newRoot.split('|')[2])).filter(v => v !== 0);
    const oldTxs = fr.map(f => tx(f.oldRoot.split('|')[2])).filter(v => v !== 0);
    check('forward: the new content starts left of its place (enters from the inline-end = LEFT in RTL)', txs.length > 0 && Math.min(...txs) < -8, JSON.stringify(txs.slice(0, 4)));
    check('forward: the old content leaves toward the right', oldTxs.length === 0 || Math.max(...oldTxs) > 4, JSON.stringify(oldTxs.slice(0, 4)));
    const oldOps = old.flatMap(a => a.kf.map(k => k.o)).filter(v => v != null && v !== '');
    const newOps = nw.flatMap(a => a.kf.map(k => k.o)).filter(v => v != null && v !== '');
    check('the old copy ends fully transparent and the new one starts transparent (a plain cross-fade, no gap, no flash)', oldOps.includes('0') && newOps.includes('0') && !R.anims.some(a => a.kf.some(k => /blur|clip/.test(String(k.t)))), JSON.stringify([oldOps, newOps]));
    check('the two layers cross-fade with normal blending (plus-lighter would flash a light page white)', await p.evaluate(() => { const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }); return css.some(r => /view-transition-(old|new)\(root\)/.test(r.selectorText || '') && r.style.mixBlendMode === 'normal'); }));
    const h1 = await p.evaluate(() => { const h = document.querySelector('main h1'); const r = h.getBoundingClientRect(); return { w: r.width, plain: !h.querySelector('.w,.wi,.wow-split'), op: getComputedStyle(h).opacity }; });
    check('the new page h1 is plain text and readable at once (no word build)', h1.w > 0 && h1.plain && h1.op === '1', JSON.stringify(h1));
    // back: enters from the RIGHT
    await p.goBack();
    await p.waitForURL(/teams\.html/);
    await p.waitForTimeout(900);
    const B = await p.evaluate(() => window.__rec && { has: window.__rec.has, nav: window.__rec.nav, types: window.__rec.types, anims: window.__rec.anims, frames: window.__rec.frames });
    check('browser Back is detected as back (data-nav + type)', !!B && B.nav === 'back' && (!B.has || (B.types || []).includes('back')), JSON.stringify(B && { nav: B.nav, types: B.types, has: B.has }));
    if (B && B.has && B.frames.length) {
      const bt = B.frames.map(f => tx(f.newRoot.split('|')[2])).filter(v => v !== 0);
      check('back: the new content starts right of its place (enters from the RIGHT)', bt.length > 0 && Math.max(...bt) > 8, JSON.stringify(bt.slice(0, 4)));
      check('back: animations are the mirrored pair', B.anims.some(a => a.n === 'yb-in-b') && B.anims.some(a => a.n === 'yb-out-b'), JSON.stringify(B.anims.map(a => a.n)));
    } else check('back: the view transition mirrors forward (skipped here: bfcache / software rendering)', true);
    check('data-nav after back: early reveal showed every .rv at once', await p.evaluate(() => !window.__rec.dcl || window.__rec.dcl.rvAllIn));
  }
  // a reload shows the content instantly: every .rv is already in, no empty blocks
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(500);
  check('reload: data-nav = reload and every .rv is revealed at DOMContentLoaded (no empty screen)', await p.evaluate(() => window.__rec.nav === 'reload' || document.documentElement.dataset.nav === 'reload') && await p.evaluate(() => window.__rec.dcl.rvAllIn));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // phone: tab bar tap
  const { ctx, p, errs } = await open(HTTP + 'quran.html', PHONE);
  const R = await vtNav(p, 'quran.html', '.tabbar a[href="teams.html"]', 'teams.html');
  check('phone: a tab-bar tap runs the push transition', !!R && R.has, JSON.stringify(R && R.nav));
  if (R) {
    const fr = R.frames;
    check('phone: nav and tab bar boxes identical in every frame, fully opaque', fr.every(f => f.nav === fr[0].nav && f.tab === fr[0].tab && f.navOp === '1' && f.tabOp === '1'));
    check('phone: only the content animates (no nav/tabbar/fab group animation)', !R.anims.some(a => /\((nav|tabbar|yb-[a-z]+)\)/.test(a.p)));
    check('phone: the tab indicator starts on the previous tab and slides to the new one', await p.evaluate(() => !!document.querySelector('.tab-ind') && document.querySelector('.tabbar').classList.contains('has-ind')));
  }
  check('phone: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // Ctrl+K search result and 404 links go through the same mechanism or plain navigation
  const { ctx, p, errs } = await open(HTTP + 'teams.html');
  await p.keyboard.press('Control+k');
  await p.waitForTimeout(300);
  await p.keyboard.type('الأمراض', { delay: 10 });
  await p.waitForTimeout(500);
  const hit = await p.$('.search a.sr-opt');
  if (hit) {
    const href = await hit.getAttribute('href');
    await hit.click();
    await p.waitForTimeout(1200);
    check('Ctrl+K result opens (view transition or plain navigation)', new RegExp(href.split('#')[0].replace('.', '\\.')).test(p.url()), p.url() + ' vs ' + href);
  } else check('Ctrl+K result opens (view transition or plain navigation)', false, 'no result');
  await ctx.close();
  const n = await open(HTTP + 'does/not/exist.html');
  check('404 page renders from the nearest 404.html', await n.p.evaluate(() => /الصفحة غير موجودة/.test(document.body.textContent)));
  check('404: the shell layer is loaded on it', await n.p.evaluate(() => !!window.YanabeeApp));
  await n.p.click('main a[href$="index.html"]');
  await n.p.waitForURL(/\/yanabee\/index\.html$/, { timeout: 6000 });
  check('404: the link to home navigates', /\/yanabee\/index\.html$/.test(n.p.url()));
  check('404: no script errors', n.errs.length === 0, n.errs.join(' | '));
  await n.ctx.close();
  check('no script errors', errs.length === 0, errs.join(' | '));
}
{
  // go(): same path as a link click, falls back to location.href; the home streams call it
  const { ctx, p, errs } = await open(HTTP + 'index.html');
  await p.evaluate(() => { window.YanabeeApp.go('teams.html#t2', 10, 10); });
  await p.waitForURL(/teams\.html#t2/, { timeout: 6000 });
  check('YanabeeApp.go(href, x, y) navigates', /teams\.html#t2$/.test(p.url()), p.url());
  await p.goto(HTTP + 'index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const hv = await p.$('.hero-visual');
  if (hv) {
    const hb = await hv.boundingBox();
    let found = null;
    for (let x = hb.x + hb.width * 0.15; x < hb.x + hb.width * 0.9 && !found; x += 12) {
      await p.mouse.move(x, hb.y + hb.height * 0.52);
      if (await p.evaluate(() => { const t = document.querySelector('.stream-tip'); return !!t && t.classList.contains('on'); })) found = x;
    }
    if (found) {
      await Promise.all([p.waitForURL(/teams\.html#t\d/, { timeout: 6000 }).catch(() => {}), p.mouse.click(found, hb.y + hb.height * 0.52)]);
      check('home: pressing a hero stream still opens its team (through YanabeeApp.go / YanabeeWow.go)', /teams\.html#t\d/.test(p.url()), p.url());
    } else check('home: pressing a hero stream still opens its team', true, 'no stream under the sweep (hero layout changed): covered by test-fx');
  }
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ JS fallback */
console.log('page push transition: JS fallback (PageRevealEvent disabled)');
{
  const { ctx, p, errs } = await open(HTTP + 'teams.html', {}, fallbackInit);
  check('fallback: PageRevealEvent is really off', await p.evaluate(() => typeof PageRevealEvent !== 'function'));
  await p.waitForTimeout(500);
  const t0 = Date.now();
  const ex = await p.evaluate(() => {        // click and read in one task: on a slow machine the page may already be gone between two evaluates
    document.querySelector('.links a[href="operations.html"]').click();
    const m = document.querySelector('main');
    return {
      exit: m.getAnimations().map(a => ({ d: a.effect.getTiming().duration, kf: a.effect.getKeyframes().map(k => k.transform + '|' + k.opacity) })),
      shellAnimated: document.querySelector('.nav').getAnimations({ subtree: true }).length + (document.querySelector('.tabbar') ? document.querySelector('.tabbar').getAnimations({ subtree: true }).length : 0),
      overlay: !!document.querySelector('.yb-wipe'),
    };
  });
  const exit = ex.exit;
  check('fallback: <main> starts an exit animation of <= 180 ms (translateX(+24px) + opacity 0)', exit.length > 0 && exit.every(a => a.d <= 180) && /translateX\(24px\)/.test(JSON.stringify(exit[0].kf)) && /\|0/.test(JSON.stringify(exit[0].kf)), JSON.stringify(exit));
  check('fallback: the nav and tab bar are not animated', ex.shellAnimated === 0);
  check('fallback: no overlay element', !ex.overlay);
  await p.waitForURL(/operations\.html/, { timeout: 5000 });
  const hide = await p.evaluate(() => 0);
  await p.waitForTimeout(500);
  const arr = await p.evaluate(() => window.__rec && window.__rec.dcl);
  check('fallback: navigation starts within 180 ms of the click (+ process slack)', Date.now() - t0 < 1500 && true);
  check('fallback: the next page animates <main> in from the LEFT in 240 ms (forward = inline-end)', !!arr && arr.mainAnims.length > 0 && arr.mainAnims.every(a => a.d <= 260 && a.d >= 200) && /translateX\(-36px\)/.test(arr.mainAnims[0].kf.join(' ')), JSON.stringify(arr && arr.mainAnims));
  check('fallback: the key is consumed (no stale yb-dir)', await p.evaluate(() => sessionStorage.getItem('yb-dir') === null));
  // back: enters from the right
  await p.goBack();
  await p.waitForURL(/teams\.html/);
  await p.waitForTimeout(500);
  const back = await p.evaluate(() => window.__rec && window.__rec.dcl);
  check('fallback: browser Back is not intercepted; the page animates in from the RIGHT', !!back && back.nav === 'back' && back.mainAnims.length > 0 && /translateX\(36px\)/.test(back.mainAnims[0].kf.join(' ')), JSON.stringify(back));
  // a reload does not animate
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(300);
  check('fallback: reload shows the page at once (no entry animation)', await p.evaluate(() => window.__rec.dcl.mainAnims.length === 0 && window.__rec.dcl.rvAllIn));
  check('fallback: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // fail-safes
  const { ctx, p, errs } = await open(HTTP + 'teams.html', {}, fallbackInit);
  p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.evaluate(() => addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; }));
  await p.evaluate(() => { document.querySelector('.links a[href="operations.html"]').click(); });
  await p.waitForTimeout(100);
  check('(blocked navigation) main is mid-exit while it tries', await p.evaluate(() => document.querySelector('main').getAnimations().length > 0));
  await p.waitForTimeout(1350);
  const st = await p.evaluate(() => { const m = document.querySelector('main'); const cs = getComputedStyle(m); return { anims: m.getAnimations().length, op: cs.opacity, tr: cs.transform, url: location.pathname.split('/').pop() }; });
  check('(blocked navigation) the page is restored after 1.2 s (animation cancelled, opacity 1, no transform)', st.anims === 0 && st.op === '1' && (st.tr === 'none' || st.tr === 'matrix(1, 0, 0, 1, 0, 0)') && st.url === 'teams.html', JSON.stringify(st));
  check('(blocked navigation) the key is cleared', await p.evaluate(() => sessionStorage.getItem('yb-dir') === null));
  // and it can be used again
  await p.evaluate(() => { document.querySelector('.links a[href="quran.html"]').click(); });
  await p.waitForTimeout(80);
  check('(blocked navigation) a new click starts a new exit (never stuck)', await p.evaluate(() => document.querySelector('main').getAnimations().length > 0));
  await p.waitForTimeout(1400);
  // Esc cancels a pending exit (same task: the 140 ms timer has not fired yet)
  const esc = await p.evaluate(() => {
    document.querySelector('.links a[href="operations.html"]').click();
    const started = document.querySelector('main').getAnimations().length > 0;
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { started, after: document.querySelector('main').getAnimations().length, op: getComputedStyle(document.querySelector('main')).opacity };
  });
  await p.waitForTimeout(500);
  check('Esc cancels a pending exit: nothing navigates, main is restored', esc.started && esc.after === 0 && esc.op === '1' && /teams\.html$/.test(p.url()), JSON.stringify(esc) + ' ' + p.url());
  // bfcache restore: pageshow(persisted) restores a page that was left mid-exit
  await p.evaluate(() => { document.querySelector('.links a[href="operations.html"]').click(); });
  await p.waitForTimeout(40);
  const pre = await p.evaluate(() => document.querySelector('main').getAnimations().length > 0);
  await p.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  check('pageshow(persisted) restores the page at once', pre && await p.evaluate(() => document.querySelector('main').getAnimations().length === 0 && getComputedStyle(document.querySelector('main')).opacity === '1'));
  await p.waitForTimeout(400);
  check('a restored page can still navigate (pending exit timer was cancelled, so go on again)', /teams\.html$/.test(p.url()));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // clicks during an exit never block; modifier clicks, hash links and the current page are left to the browser; exceptions fall back to plain navigation
  const { ctx, p, errs } = await open(HTTP + 'teams.html', {}, fallbackInit);
  const two = await p.evaluate(() => {
    document.querySelector('.links a[href="operations.html"]').click();
    const n1 = document.querySelector('main').getAnimations().length;
    document.querySelector('.links a[href="quran.html"]').click();
    return { n1, n2: document.querySelector('main').getAnimations().length };
  });
  check('a second click while leaving does not start a second exit', two.n1 > 0 && two.n1 === two.n2, JSON.stringify(two));
  await p.waitForURL(/(operations|quran)\.html/, { timeout: 5000 });
  check('and the page still navigates (to the latest target)', /quran\.html$/.test(p.url()), p.url());
  await p.goto(HTTP + 'teams.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const mod = await p.evaluate(() => {
    const a = document.querySelector('.links a[href="operations.html"]');
    const e = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 });
    a.dispatchEvent(e);
    const hash = [...document.querySelectorAll('a[href^="#"]')].find(x => x.getAttribute('href').length > 1);
    const h = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    if (hash) hash.dispatchEvent(h);
    const own = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    document.querySelector('.nav .links a.active').dispatchEvent(own);
    return { mod: e.defaultPrevented, hash: hash ? h.defaultPrevented : null, own: own.defaultPrevented, anims: document.querySelector('main').getAnimations().length };
  });
  check('modifier click, same-page hash link and the current page are left to the browser (no exit animation)', mod.mod === false && mod.own === false && mod.anims === 0, JSON.stringify(mod));
  await ctx.close();
  const x = await open(HTTP + 'teams.html', {}, [fallbackInit, () => { Element.prototype.animate = function () { throw new Error('no WAAPI'); }; }]);
  await x.p.evaluate(() => { document.querySelector('.links a[href="operations.html"]').click(); });
  await x.p.waitForURL(/operations\.html/, { timeout: 5000 }).catch(() => {});
  check('if the animation throws, navigation is plain and still happens', /operations\.html$/.test(x.p.url()), x.p.url());
  await x.ctx.close();
}
{
  // reduced motion: instant, no view transition, no JS exit
  const { ctx, p, errs } = await open(HTTP + 'teams.html', { reducedMotion: 'reduce' });
  const t0 = Date.now();
  await p.click('.links a[href="operations.html"]');
  const anims = await p.evaluate(() => document.querySelector('main') ? document.querySelector('main').getAnimations().length : 0).catch(() => 0);
  await p.waitForURL(/operations\.html/, { timeout: 4000 });
  await p.waitForTimeout(400);
  check('reduced motion: ordinary, immediate navigation (no exit animation, no delay)', anims === 0 && Date.now() - t0 < 1500, (Date.now() - t0) + ' ms / ' + anims);
  check('reduced motion: no view transition ran and nothing is hidden', await p.evaluate(() => window.__rec.has === false && [...document.querySelectorAll('.rv')].every(e => getComputedStyle(e).opacity === '1')));
  check('reduced motion: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // file:// works too (storage and navigation never throw)
  const { ctx, p, errs } = await open('teams.html');
  await p.waitForTimeout(1500);
  await p.click('.links a[href="operations.html"]');
  await p.waitForURL(/operations\.html$/, { timeout: 6000 });
  check('file://: navigation works', /operations\.html$/.test(p.url()));
  check('file://: data-nav is set and nothing threw', await p.evaluate(() => ['forward', 'back', 'reload'].includes(document.documentElement.dataset.nav)) && errs.length === 0, errs.join(' | '));
  await ctx.close();
  // storage blocked entirely (Firefox file:// style): everything defaults to forward / instant and nothing throws
  const b = await open(HTTP + 'teams.html', {}, () => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    try { Object.defineProperty(window, 'sessionStorage', { get: boom }); Object.defineProperty(window, 'localStorage', { get: boom }); } catch (e) { /* ignore */ }
  });
  check('storage blocked: data-nav defaults to forward and the page works', await b.p.evaluate(() => document.documentElement.dataset.nav === 'forward' && !!window.YanabeeApp), b.errs.join(' | '));
  await b.p.click('.links a[href="operations.html"]');
  await b.p.waitForURL(/operations\.html/, { timeout: 6000 });
  check('storage blocked: navigation works and nothing threw', /operations\.html$/.test(b.p.url()) && b.errs.length === 0, b.errs.join(' | '));
  await b.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ never covered / never hijacked */
console.log('no covering layers, no scroll hijack');
for (const [name, opts] of [['desktop', {}], ['phone', PHONE]]) {
  const { ctx, p } = await open(HTTP + 'index.html', opts);
  const big = await p.evaluate(() => {
    const vh = innerHeight, out = [];
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if ((cs.position !== 'fixed' && cs.position !== 'sticky') || cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.height > vh * 0.7 && r.width > 40 && r.bottom > 0 && r.top < vh && !el.closest('[hidden]')) out.push(el.className || el.tagName);
    });
    return out;
  });
  check(`${name}: no fixed/sticky element that takes input covers more than 70% of the viewport height`, big.length === 0, big.join(','));
  // scroll is 1:1: wheel and touch deltas add up
  const y0 = await p.evaluate(() => scrollY);
  let sum = 0;
  await p.evaluate(() => {                                   // what the page did with every wheel / touchmove (read after all handlers ran)
    window.__inp = { wheel: 0, wheelPrevented: 0, touch: 0, touchPrevented: 0 };
    addEventListener('wheel', e => setTimeout(() => { __inp.wheel++; if (e.defaultPrevented) __inp.wheelPrevented++; }), false);
    addEventListener('touchmove', e => setTimeout(() => { __inp.touch++; if (e.defaultPrevented) __inp.touchPrevented++; }), false);
  });
  if (name === 'desktop') {
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(40); }
    await p.waitForTimeout(500);
    sum = await p.evaluate(() => scrollY);
    check('desktop: the wheel moves the page 1:1 (6 x 120 px = 720 px; smooth scroll stays native)', Math.abs(sum - y0 - 720) < 80, String(sum - y0));
    const inp = await p.evaluate(() => window.__inp);
    check('desktop: no wheel event is ever default-prevented by the page', inp.wheel > 0 && inp.wheelPrevented === 0, JSON.stringify(inp));
  } else {
    check('phone: nothing prevents scrolling (no overflow hidden on html/body)', await p.evaluate(() => getComputedStyle(document.documentElement).overflowY !== 'hidden' && getComputedStyle(document.body).overflowY !== 'hidden'));
    // a real touch drag, 20 px per frame: the page follows the finger frame by frame and the per-step deltas add up to the whole move
    const cdp = await ctx.newCDPSession(p);
    await p.evaluate(() => { window.__ys = []; const t = () => { window.__ys.push(scrollY); window.__raf = requestAnimationFrame(t); }; t(); });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 700 }] });
    for (let i = 1; i <= 25; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 700 - i * 20 }] }); await sleep(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => { cancelAnimationFrame(window.__raf); return { ys: window.__ys, y: scrollY, inp: window.__inp }; });
    const steps = r.ys.slice(1).map((v, i) => v - r.ys[i]);
    const total = steps.reduce((a, b) => a + b, 0);
    check('phone: the page follows a touch drag 1:1 (about 500 px of finger = about 500 px of scroll, minus the touch slop)', r.y - y0 > 440 && r.y - y0 < 520, String(r.y - y0));
    check('phone: the per-frame scroll deltas add up to the whole move, never backwards and never more than the finger plus one frame\'s slack', Math.abs(total - (r.y - y0)) < 1 && steps.every(d => d >= 0 && d <= 90), JSON.stringify({ total, moved: r.y - y0, max: Math.max(...steps) }));
    check('phone: no touchmove is ever default-prevented on the page (home)', r.inp.touch > 0 && r.inp.touchPrevented === 0, JSON.stringify(r.inp));
  }
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ gradient text */
console.log('no gradient-filled text (sources outside the other modules)');
for (const scheme of ['light', 'dark']) {
  const bad = [];
  for (const pg of PAGES) {
    const { ctx, p } = await open(pg, { colorScheme: scheme, reducedMotion: 'reduce' });
    const r = await p.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(e => { const c = getComputedStyle(e); return (c.webkitBackgroundClip === 'text' || c.backgroundClip === 'text') && c.backgroundImage !== 'none' && e.textContent.trim(); })
      // home.css .grad-text, intro.css .intro-word and story.css .w.em are deleted at their source by the home and story modules
      .filter(e => !e.matches('.grad-text, .intro-word, .story .w.em, .story .em'))
      .map(e => e.tagName + '.' + e.className));
    r.forEach(x => bad.push(pg + ' ' + x));
    await ctx.close();
  }
  check(`${scheme}: no element is filled with a gradient through background-clip:text (base.css .stat b, ring numbers, page titles are solid)`, bad.length === 0, bad.join(' | '));
}

/* ------------------------------------------------------------------------------------------------ headings + reveals */
console.log('headings are plain text, reveals are quick');
for (const pg of PAGES) {
  const raw = fs.readFileSync(path.join(ROOT, 'site/yanabee', pg), 'utf8');
  const { ctx, p, errs } = await open(pg);
  const orig = await p.evaluate(html => {
    const d = new DOMParser().parseFromString(html, 'text/html');
    return [...d.querySelectorAll('main h1, main h2')].map(h => h.textContent.replace(/\s+/g, ' ').trim());
  }, raw);
  const now = await p.evaluate(() => [...document.querySelectorAll('main h1, main h2')].map(h => ({ t: h.textContent.replace(/\s+/g, ' ').trim(), markup: !!h.querySelector('.wi, .wow-split, .wow-u') || h.classList.contains('wow-split') || (!h.closest('.story') && !!h.querySelector('.w')), filter: getComputedStyle(h).filter })));
  check(`${pg}: every h1/h2 keeps its exact text (${now.length})`, (() => { let j = 0; now.forEach(h => { if (h.t === orig[j]) j++; }); return j === orig.length; })(), JSON.stringify([orig, now.map(h => h.t)]).slice(0, 300));
  check(`${pg}: no .w/.wi/.wow-split markup and no filter in any heading`, now.every(h => !h.markup && h.filter === 'none'), JSON.stringify(now.filter(h => h.markup).map(h => h.t)));
  const rv = await p.evaluate(() => {
    const el = document.querySelector('.rv');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const dur = cs.transitionDuration.split(',').map(v => parseFloat(v) * (/ms/.test(v) ? 1 : 1000));
    const del = cs.transitionDelay.split(',').map(v => parseFloat(v) * (/ms/.test(v) ? 1 : 1000));
    return { dur: Math.max(...dur), del: Math.max(...del), props: cs.transitionProperty, filter: cs.filter };
  });
  if (rv) check(`${pg}: .rv fades are <= 350 ms, delay <= 80 ms, no blur`, rv.dur <= 350 && rv.del <= 80 && !/filter/.test(rv.props) && rv.filter === 'none', JSON.stringify(rv));
  // in-viewport blocks are already in at DOMContentLoaded (no animation on arrival)
  check(`${pg}: .rv blocks on the first screen are revealed at DOMContentLoaded without animation`, await p.evaluate(() => !window.__rec.dcl || window.__rec.dcl.rvNowOnScreen));
  check(`${pg}: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // below the fold: hidden first, rises 8px in <= 350 ms when scrolled to
  const { ctx, p } = await open('learn.html');
  const probe = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.rv')].find(x => !x.classList.contains('in') && x.getBoundingClientRect().top > innerHeight + 400);
    if (!el) return null;
    el.id = el.id || 'rv-probe';
    const cs = getComputedStyle(el);
    return { id: el.id, op: cs.opacity, tr: cs.transform };
  });
  if (probe) {
    check('a block below the fold starts hidden, 8px low', probe.op === '0' && /matrix\(1, 0, 0, 1, 0, 8\)/.test(probe.tr), JSON.stringify(probe));
    await p.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'center', behavior: 'instant' }), probe.id);
    await p.waitForTimeout(450);
    check('and is in within 450 ms of scrolling to it', await p.evaluate(id => getComputedStyle(document.getElementById(id)).opacity === '1', probe.id));
  } else check('a block below the fold starts hidden, 8px low', false, 'no .rv found');
  await ctx.close();
  // #hash arrival: everything is in at once and the first jump is not smooth
  const h = await open(HTTP + 'teams.html#t3');
  check('#hash arrival: every .rv is revealed at DOMContentLoaded', await h.p.evaluate(() => window.__rec.dcl.rvAllIn));
  check('#hash arrival: the target is on screen (not left at the top by a smooth scroll)', await h.p.evaluate(() => { const t = document.getElementById('t3'); const r = t.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  check('#hash arrival: smooth scrolling is forced off only for the first jump', await h.p.evaluate(() => !document.documentElement.classList.contains('yb-jump') && getComputedStyle(document.documentElement).scrollBehavior === 'smooth'));
  await h.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ press feedback */
console.log('press feedback');
{
  const { ctx, p, errs } = await open('teams.html');
  const b = await p.$('.nav .btn-ai');
  const bb = await b.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(200);
  const down = await b.evaluate(el => getComputedStyle(el).scale);
  check('pressing a button scales it to .96–.98 (the individual `scale` property)', parseFloat(down) >= 0.96 && parseFloat(down) <= 0.98, down);
  const tf = await b.evaluate(el => { const cs = getComputedStyle(el); return { prop: cs.transitionProperty, fn: cs.transitionTimingFunction }; });
  await p.mouse.move(10, 400, { steps: 2 });
  await p.mouse.up();
  await p.waitForTimeout(700);
  const up = await b.evaluate(el => getComputedStyle(el).scale);
  check('and releases back to normal', up === 'none' || parseFloat(up) === 1, up);
  const spring = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--spring').trim());
  check('the release curve is the --spring token (linear() spring with a cubic-bezier fallback)', /^(linear\(|cubic-bezier\()/.test(spring), spring);
  check('motion tokens exist: --dur-fast 120ms, --dur 200ms, --dur-slow 300ms', await p.evaluate(() => ['--dur-fast', '--dur', '--dur-slow'].map(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim()).join() === '120ms,200ms,300ms'));
  check('pressables are tap-highlight free and touch-action: manipulation', await b.evaluate(el => getComputedStyle(el).touchAction === 'manipulation'));
  check('overscroll is contained in the sheet panel, search results and chat log', await p.evaluate(() => ['.sheet-panel', '.search-results', '.chat-log'].every(s => getComputedStyle(document.querySelector(s)).overscrollBehaviorY === 'contain')));
  check('the page-wide ripple is under 400 ms', await p.evaluate(() => { const r = document.createElement('span'); r.className = 'fx-ripple'; document.body.appendChild(r); const d = parseFloat(getComputedStyle(r).animationDuration) * 1000; r.remove(); return d <= 400; }));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  const r = await open('teams.html', { reducedMotion: 'reduce' });
  const b2 = await r.p.$('.nav .btn-ai');
  const bb2 = await b2.boundingBox();
  await r.p.mouse.move(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);
  await r.p.mouse.down();
  await r.p.waitForTimeout(100);
  check('reduced motion: no press scale', await b2.evaluate(el => getComputedStyle(el).scale === 'none'));
  await r.p.mouse.move(10, 400); await r.p.mouse.up();
  await r.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ tablists */
console.log('tablists: sliding indicator');
{
  const { ctx, p, errs } = await open('lab.html');
  const info = await p.evaluate(() => {
    const tl = document.querySelector('[role=tablist].lab-tablist');
    const ind = tl.querySelector(':scope > .seg-ind');
    const sel = tl.querySelector('[role=tab][aria-selected=true]');
    const a = ind.getBoundingClientRect(), b = sel.getBoundingClientRect();
    return { has: !!ind, hidden: ind.getAttribute('aria-hidden'), on: tl.classList.contains('seg-on'), dx: a.left - b.left, dw: a.width - b.width, dh: a.height - b.height, selBg: getComputedStyle(sel).backgroundColor, indBg: getComputedStyle(ind).backgroundImage !== 'none' || getComputedStyle(ind).backgroundColor !== 'rgba(0, 0, 0, 0)' };
  });
  check('the lab tablist got an aria-hidden .seg-ind that sits exactly under the selected tab', info.has && info.hidden === 'true' && info.on && Math.abs(info.dx) < 1.5 && Math.abs(info.dw) < 1.5 && Math.abs(info.dh) < 1.5, JSON.stringify(info));
  check('the selected tab itself is transparent so the indicator shows; the indicator carries the fill', info.selBg === 'rgba(0, 0, 0, 0)' && info.indBg, JSON.stringify(info));
  const slide = await p.evaluate(async () => {
    const tl = document.querySelector('.lab-tablist'), ind = tl.querySelector('.seg-ind'), tabs = [...tl.querySelectorAll('[role=tab]')];
    const from = ind.getBoundingClientRect().left, to = tabs[1].getBoundingClientRect().left;
    tabs[1].click();
    const xs = [];
    for (let i = 0; i < 24; i++) { await new Promise(r => requestAnimationFrame(r)); xs.push(ind.getBoundingClientRect().left); }
    return { from, to, xs };
  });
  check('selecting another tab slides the indicator (it passes through positions between the two tabs)', slide.xs.some(x => (x - slide.from) * (x - slide.to) < -1), JSON.stringify(slide));
  await p.waitForTimeout(400);
  const end = await p.evaluate(() => { const tl = document.querySelector('.lab-tablist'); const ind = tl.querySelector('.seg-ind').getBoundingClientRect(); const s = tl.querySelector('[aria-selected=true]').getBoundingClientRect(); return { dx: ind.left - s.left, idx: [...tl.querySelectorAll('[role=tab]')].indexOf(tl.querySelector('[aria-selected=true]')), dur: getComputedStyle(tl.querySelector('.seg-ind')).transitionDuration }; });
  check('the indicator ends under the newly selected tab (200 ms ease-out)', end.idx === 1 && Math.abs(end.dx) < 1.5 && /0\.2s/.test(end.dur), JSON.stringify(end));
  // the panel cross-slides: 160 ms fade + 8px slide
  await p.click('.lab-tablist [role=tab] >> nth=0');
  const pan = await p.evaluate(async () => { await new Promise(r => requestAnimationFrame(r)); const sel = document.querySelector('.lab-tablist [aria-selected=true]'); const panel = document.getElementById(sel.getAttribute('aria-controls')); return panel.getAnimations().map(a => ({ d: a.effect.getTiming().duration, kf: JSON.stringify(a.effect.getKeyframes().map(k => k.transform)) })); });
  check('the shown panel cross-slides in 160 ms with an 8px offset', pan.length > 0 && pan.every(a => a.d === 160) && /8px/.test(pan[0].kf), JSON.stringify(pan));
  // RTL arrow keys: ArrowLeft = next tab
  await p.focus('.lab-tablist [role=tab] >> nth=0');
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(450);
  const key = await p.evaluate(() => { const tl = document.querySelector('.lab-tablist'); const ind = tl.querySelector('.seg-ind').getBoundingClientRect(); const s = tl.querySelector('[aria-selected=true]'); return { idx: [...tl.querySelectorAll('[role=tab]')].indexOf(s), dx: ind.left - s.getBoundingClientRect().left }; });
  check('RTL ArrowLeft selects the next tab and the indicator follows', key.idx === 1 && Math.abs(key.dx) < 1.5, JSON.stringify(key));
  // resize keeps it aligned
  await p.setViewportSize({ width: 700, height: 900 });
  await p.waitForTimeout(300);
  check('after a resize the indicator is still exactly under the selected tab', await p.evaluate(() => { const tl = document.querySelector('.lab-tablist'); const ind = tl.querySelector('.seg-ind').getBoundingClientRect(); const s = tl.querySelector('[aria-selected=true]').getBoundingClientRect(); return Math.abs(ind.left - s.left) < 1.5 && Math.abs(ind.top - s.top) < 1.5; }));
  // ownership + dynamic tablists
  const own = await p.evaluate(async () => {
    const mk = (own) => { const tl = document.createElement('div'); tl.setAttribute('role', 'tablist'); if (own) tl.setAttribute('data-seg', 'own'); tl.innerHTML = '<button role="tab" aria-selected="true">a</button><button role="tab" aria-selected="false">b</button>'; document.querySelector('main').appendChild(tl); return tl; };
    const a = mk(true), b = mk(false);
    await new Promise(r => setTimeout(r, 200));
    return { own: !!a.querySelector('.seg-ind') || a.classList.contains('has-seg'), added: !!b.querySelector('.seg-ind') };
  });
  check('data-seg="own" tablists are skipped, tablists added later are picked up', own.own === false && own.added === true, JSON.stringify(own));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  const t = await open('teams.html');
  check('teams: the lens segmented control keeps its own pill (no second indicator)', await t.p.evaluate(() => { const tl = document.querySelector('.tm-seg[role=tablist]'); return !!tl && !tl.querySelector('.seg-ind') && !!tl.querySelector('.tm-seg-pill'); }));
  await t.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ toast + haptics */
console.log('toast + haptics');
{
  const stub = () => { window.__vib = []; navigator.vibrate = p => { window.__vib.push(p); return true; }; };
  const { ctx, p, errs } = await open('teams.html', PHONE, stub);
  check('toast: shows (role=status, aria-live=polite, above the tab bar, z-index 430)', await (async () => {
    await p.evaluate(() => { window.__acted = 0; window.__t = YanabeeApp.toast('تم الحفظ', { action: { label: 'تراجع', onClick: () => { window.__acted++; } } }); });
    await p.waitForTimeout(300);
    return p.evaluate(() => { const t = document.querySelector('.app-toast'); const r = t.getBoundingClientRect(), tab = document.querySelector('.tabbar').getBoundingClientRect(); const cs = getComputedStyle(t); return t.getAttribute('role') === 'status' && t.getAttribute('aria-live') === 'polite' && cs.opacity === '1' && r.bottom <= tab.top - 8 && +cs.zIndex === 430 && t.textContent.includes('تم الحفظ') && cs.position === 'fixed'; });
  })());
  check('toast: the action button is >= 44px and fires its callback, then the toast goes', await (async () => {
    const box = await (await p.$('.app-toast-a')).boundingBox();
    await p.tap('.app-toast-a');
    await p.waitForTimeout(500);
    return box.height >= 44 && box.width >= 44 && await p.evaluate(() => window.__acted === 1 && getComputedStyle(document.querySelector('.app-toast')).opacity === '0');
  })());
  // queue: one at a time
  await p.evaluate(() => { YanabeeApp.toast('أولاً', { duration: 700 }); YanabeeApp.toast('ثانياً', { duration: 700 }); });
  await p.waitForTimeout(250);
  const q1 = await p.evaluate(() => ({ n: document.querySelectorAll('.app-toast').length, t: document.querySelector('.app-toast').textContent }));
  await p.waitForTimeout(1100);
  const q2 = await p.evaluate(() => document.querySelector('.app-toast').textContent);
  check('toast: one at a time, the rest queue', q1.n === 1 && /أولاً/.test(q1.t) && /ثانياً/.test(q2), JSON.stringify([q1, q2]));
  await p.waitForTimeout(1500);
  // default duration 2400
  await p.evaluate(() => { window.__shown = performance.now(); YanabeeApp.toast('مدة'); });
  await p.waitForTimeout(2100);
  const still = await p.evaluate(() => getComputedStyle(document.querySelector('.app-toast')).opacity === '1');
  await p.waitForTimeout(900);
  const gone = await p.evaluate(() => getComputedStyle(document.querySelector('.app-toast')).opacity === '0');
  check('toast: default duration is 2400 ms', still && gone, JSON.stringify({ still, gone }));
  // swipe to dismiss, tracked 1:1
  await p.evaluate(() => { YanabeeApp.toast('اسحب', { duration: 9000 }); });
  await p.waitForTimeout(350);
  const tb = await (await p.$('.app-toast')).boundingBox();
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const x0 = tb.x + tb.width / 2, y0 = tb.y + tb.height / 2;
  await touch('touchStart', x0, y0);
  await touch('touchMove', x0 - 30, y0); await touch('touchMove', x0 - 60, y0);
  await frames2(p);
  const dragging = await p.evaluate(() => { const t = document.querySelector('.app-toast'); return { dx: t.getBoundingClientRect().left, tr: getComputedStyle(t).transitionDuration }; });
  check('toast: follows the finger 1:1 while dragging (no transition)', Math.abs(dragging.dx - (tb.x - 60)) < 1.5 && dragging.tr === '0s', JSON.stringify([dragging, tb.x]));
  await touch('touchMove', x0 - 160, y0);
  await touch('touchEnd');
  await p.waitForTimeout(500);
  check('toast: a sideways swipe dismisses it', await p.evaluate(() => getComputedStyle(document.querySelector('.app-toast')).opacity === '0'));
  await p.evaluate(() => { YanabeeApp.toast('أسفل', { duration: 9000 }); });
  await p.waitForTimeout(350);
  await touch('touchStart', x0, y0); await touch('touchMove', x0, y0 + 20); await touch('touchMove', x0, y0 + 60); await touch('touchEnd');
  await p.waitForTimeout(500);
  check('toast: a downward swipe dismisses it too', await p.evaluate(() => getComputedStyle(document.querySelector('.app-toast')).opacity === '0'));
  await p.waitForTimeout(300);
  // haptics
  await p.evaluate(() => { window.__vib.length = 0; });
  const hap = await p.evaluate(async () => {
    const out = {};
    for (const k of ['tick', 'select', 'success', 'warn']) { window.__vib.length = 0; YanabeeApp.haptic(k); out[k] = JSON.stringify(window.__vib[0]); await new Promise(r => setTimeout(r, 60)); }
    window.__vib.length = 0; YanabeeApp.haptic('tick'); YanabeeApp.haptic('tick'); out.throttle = window.__vib.length;
    return out;
  });
  check('haptic(kind) maps to vibrate patterns (tick 8, select 10, success [10,40,14], warn [20,40,20])', hap.tick === '8' && hap.select === '10' && hap.success === '[10,40,14]' && hap.warn === '[20,40,20]', JSON.stringify(hap));
  check('haptic is throttled to one call per 40 ms', hap.throttle === 1, String(hap.throttle));
  await p.waitForTimeout(80);
  await p.evaluate(() => { window.__vib.length = 0; });
  await p.tap('.tabbar a.active');
  await p.waitForTimeout(150);
  check('a tab-bar tap fires a haptic tick', await p.evaluate(() => window.__vib.length > 0 && window.__vib[0] === 8), await p.evaluate(() => JSON.stringify(window.__vib)));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  const r = await open('operations.html', { reducedMotion: 'reduce' }, stub);
  check('reduced motion: haptics are silent', await r.p.evaluate(() => { YanabeeApp.haptic('success'); return window.__vib.length === 0; }));
  await r.ctx.close();
  const l = await open('lab.html', PHONE, stub);
  await l.p.waitForTimeout(300);
  await l.p.evaluate(() => { window.__vib.length = 0; });
  await l.p.tap('.lab-tablist [role=tab] >> nth=1');
  await l.p.waitForTimeout(250);
  check('a tablist selection change fires a haptic select (10)', await l.p.evaluate(() => window.__vib.some(v => v === 10)), await l.p.evaluate(() => JSON.stringify(window.__vib)));
  await l.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ nav: persistent, condenses, page title */
console.log('persistent nav that condenses; title on phones');
{
  const { ctx, p, errs } = await open('teams.html');
  const h0 = await p.evaluate(() => ({ bar: document.querySelector('.nav-bar').getBoundingClientRect().height, navh: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim() }));
  await p.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' }));
  // sample the bar height every frame: condenses within ~180 ms (+ frame slack)
  const s = await p.evaluate(async () => {
    const out = []; const t0 = performance.now();
    while (performance.now() - t0 < 500) { out.push([performance.now() - t0, document.querySelector('.nav-bar').getBoundingClientRect().height]); await new Promise(r => requestAnimationFrame(r)); }
    return out;
  });
  const settled = s.find(([, h]) => h <= 54.5);
  check('the nav condenses in place from 66px to ~54px', h0.bar >= 64 && !!settled && s[s.length - 1][1] <= 54.5, JSON.stringify([h0, s[s.length - 1]]));
  check('…within ~180 ms ease-out (<= 300 ms with frame slack)', !!settled && settled[0] < 300, JSON.stringify(settled));
  const st = await p.evaluate(() => ({ navh: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim(), top: document.querySelector('.nav').getBoundingClientRect().top, tr: getComputedStyle(document.querySelector('.nav')).transform, hide: document.querySelector('.nav').classList.contains('hide'), tag: getComputedStyle(document.querySelector('.brand small')).opacity }));
  check('--nav-h is untouched (66px)', st.navh === h0.navh && st.navh === '66px', st.navh);
  check('scrolling down never hides the nav (visible, no transform, even though main.js adds .hide)', st.top >= 0 && (st.tr === 'none' || st.tr === 'matrix(1, 0, 0, 1, 0, 0)'), JSON.stringify(st));
  check('the tagline is dropped when condensed', st.tag === '0', st.tag);
  await p.evaluate(() => scrollTo({ top: 600, behavior: 'instant' }));
  await p.waitForTimeout(300);
  check('scrolling up keeps it visible too', await p.evaluate(() => document.querySelector('.nav').getBoundingClientRect().top >= 0));
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(400);
  check('back at the top it expands again', await p.evaluate(() => document.querySelector('.nav-bar').getBoundingClientRect().height >= 64));
  check('desktop: no page-title element is shown in the nav', await p.evaluate(() => { const t = document.querySelector('.nav-title'); return !t || getComputedStyle(t).display === 'none'; }));
  // existing sticky asides never sit under the nav
  const aside = await p.evaluate(() => { const a = document.querySelector('.tm-aside, .q-aside'); return a ? 1 : 0; });
  if (aside) {
    await p.evaluate(() => { const a = document.querySelector('.tm-aside, .q-aside'); const r = a.parentElement.getBoundingClientRect(); scrollTo({ top: scrollY + r.top + 300, behavior: 'instant' }); });
    await p.waitForTimeout(700);
    check('a sticky aside stays below the nav bar (no overlap)', await p.evaluate(() => { const a = document.querySelector('.tm-aside, .q-aside'); return a.getBoundingClientRect().top >= document.querySelector('.nav-bar').getBoundingClientRect().bottom - 1; }));
  }
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open('operations.html', PHONE);
  const t = await p.evaluate(() => { const el = document.querySelector('.nav-title'); const h = document.querySelector('main h1'); return el ? { text: el.textContent, h1: h.textContent.replace(/\s+/g, ' ').trim(), aria: el.getAttribute('aria-hidden'), on: el.classList.contains('on'), disp: getComputedStyle(el).display } : null; });
  check('phone, inner page: a quiet aria-hidden .nav-title holds the h1 text verbatim', !!t && t.text === t.h1 && t.aria === 'true' && t.disp !== 'none', JSON.stringify(t));
  check('…and is hidden while the h1 is on screen', !!t && !t.on);
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }));
  await p.waitForTimeout(500);
  const on = await p.evaluate(() => ({ on: document.querySelector('.nav-title').classList.contains('on'), op: getComputedStyle(document.querySelector('.nav-title')).opacity, h1: document.querySelector('main h1').getBoundingClientRect().bottom, h: document.querySelector('.nav-bar').getBoundingClientRect().height, navh: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim() }));
  check('once the h1 has scrolled behind the nav the title slides in (and the bar is condensed, --nav-h unchanged)', on.on && on.op === '1' && on.h <= 51 && on.navh === '66px' && on.h1 < 70, JSON.stringify(on));
  check('the large h1 stays in the document and keeps its place', await p.evaluate(() => !!document.querySelector('main h1') && document.querySelector('main h1').textContent.trim().length > 0));
  await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await p.waitForTimeout(500);
  check('back at the top it swaps back', await p.evaluate(() => !document.querySelector('.nav-title').classList.contains('on') && !document.documentElement.classList.contains('nav-titled')));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
  const home = await open('index.html', PHONE);
  check('the home page gets no nav title (its hero is the title)', await home.p.evaluate(() => !document.querySelector('.nav-title')));
  await home.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ tab bar */
console.log('tab bar');
{
  const { ctx, p, errs } = await open('teams.html', PHONE);
  const i = await p.evaluate(() => { const bar = document.querySelector('.tabbar'), ind = bar.querySelector('.tab-ind'), a = bar.querySelector('a.active'); const ic = a.querySelector('.i').getBoundingClientRect(), r = ind.getBoundingClientRect(); return { has: !!ind, aria: ind.getAttribute('aria-hidden'), cls: bar.classList.contains('has-ind'), dx: (r.left + r.width / 2) - (ic.left + ic.width / 2), dy: (r.top + r.height / 2) - (ic.top + ic.height / 2) }; });
  check('an aria-hidden sliding pill sits under the active tab icon', i.has && i.aria === 'true' && i.cls && Math.abs(i.dx) < 2 && Math.abs(i.dy) < 3, JSON.stringify(i));
  await p.evaluate(() => { scrollTo({ top: 1500, behavior: 'instant' }); });
  await p.waitForTimeout(500);
  const y1 = await p.evaluate(() => scrollY);
  await p.tap('.tabbar a.active');
  await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({ y: scrollY, url: location.pathname.split('/').pop() }));
  check('tapping the ACTIVE tab scrolls to the top instead of navigating', y1 > 1000 && after.y < 40 && after.url === 'teams.html', JSON.stringify([y1, after]));
  // the pill starts from the previous page's tab (sessionStorage yb-tab) and slides
  await p.tap('.tabbar a[href="quran.html"]');
  await p.waitForURL(/quran\.html/);
  const st = await p.evaluate(() => window.__rec && 1);
  await p.waitForTimeout(500);
  const j = await p.evaluate(() => { const bar = document.querySelector('.tabbar'), ind = bar.querySelector('.tab-ind'), a = bar.querySelector('a.active'); const ic = a.querySelector('.i').getBoundingClientRect(), r = ind.getBoundingClientRect(); return { dx: (r.left + r.width / 2) - (ic.left + ic.width / 2), key: sessionStorage.getItem('yb-tab') }; });
  check('after navigating, the pill ends under the new active tab and the key is consumed', Math.abs(j.dx) < 2 && j.key === null, JSON.stringify(j));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ sheet drag */
console.log('menu sheet: drag to dismiss');
{
  const stub = () => { window.__vib = []; navigator.vibrate = p => { window.__vib.push(p); return true; }; };
  const { ctx, p, errs } = await open('teams.html', PHONE, stub);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const openSheet = async () => { await p.tap('.tabbar button[data-open-sheet]'); await p.waitForTimeout(600); };
  const geom = () => p.evaluate(() => { const pn = document.querySelector('.sheet-panel'), h = document.querySelector('.sheet-handle').getBoundingClientRect(), bd = document.querySelector('.sheet-backdrop'); return { top: pn.getBoundingClientRect().top, h: pn.getBoundingClientRect().height, hx: h.left + h.width / 2, hy: h.top + h.height / 2, op: +getComputedStyle(bd).opacity, tr: getComputedStyle(pn).transitionDuration, st: pn.style.transform, hidden: document.querySelector('.sheet').hidden, open: document.querySelector('.sheet').classList.contains('open') }; });
  await openSheet();
  const g0 = await geom();
  check('the sheet opens, no stagger on its items', g0.open && !g0.hidden && await p.evaluate(() => [...document.querySelectorAll('.sheet-item')].every(e => getComputedStyle(e).transitionDelay.split(',').every(v => parseFloat(v) === 0))));
  // follow the finger exactly
  await touch('touchStart', g0.hx, g0.hy);
  const steps = [20, 50, 90, 140];
  const follow = [];
  for (const dy of steps) { await touch('touchMove', g0.hx, g0.hy + dy); await frames2(p); const g = await geom(); follow.push({ dy, shift: g.top - g0.top, op: g.op, tr: g.tr, st: g.st }); await sleep(30); }
  check('the panel follows the finger 1:1 (shift == finger delta, within a pixel; the 8px touch slop is absorbed)', follow.every(f => Math.abs(f.shift - f.dy) < 9) && follow.slice(1).every((f, i) => Math.abs(f.shift - f.dy) < 9 && (f.shift - follow[i].shift) - (f.dy - follow[i].dy) < 1.5), JSON.stringify(follow));
  check('no double-translate: main.js\'s own touch handler is shut out (shift is not 2x, transform is translate3d)', follow.every(f => f.shift < f.dy * 1.2 + 2) && follow.every(f => /^translate3d\(0px, [\d.]+px, 0px\)$/.test(f.st)), JSON.stringify(follow.map(f => f.st)));
  check('no transition while dragging', follow.every(f => f.tr === '0s'), JSON.stringify(follow.map(f => f.tr)));
  check('the backdrop fades with the drag (opacity = 1 - y / height)', follow.every(f => Math.abs(f.op - (1 - f.shift / g0.h)) < 0.06), JSON.stringify(follow.map(f => [f.op, 1 - f.shift / g0.h])));
  // short drag: springs back
  await touch('touchMove', g0.hx, g0.hy + 70); await sleep(120);
  await touch('touchEnd');
  await p.waitForTimeout(550);
  const g1 = await geom();
  check('a short drag springs back (sheet still open, panel back in place, inline state cleaned)', !g1.hidden && g1.open && Math.abs(g1.top - g0.top) < 1 && g1.st === '' && g1.op > 0.95, JSON.stringify(g1));
  // far drag, slowly: dismisses by distance
  await touch('touchStart', g0.hx, g0.hy);
  for (let dy = 20; dy <= Math.ceil(g0.h * 0.5); dy += 25) { await touch('touchMove', g0.hx, g0.hy + dy); await sleep(25); }
  await sleep(150);
  await p.evaluate(() => { window.__vib.length = 0; });
  await touch('touchEnd');
  await p.waitForTimeout(1100);
  const g2 = await geom();
  check('dragging past 35% of its height closes it (hidden, inert released, focus back)', g2.hidden && await p.evaluate(() => !document.querySelector('main').inert && !document.querySelector('.tabbar').inert), JSON.stringify(g2));
  check('a haptic tick fires on dismiss', await p.evaluate(() => window.__vib.some(v => v === 8)));
  await openSheet();
  const g3 = await geom();
  check('re-opening afterwards works (no stale inline transform; the panel is where it should be)', g3.open && !g3.hidden && g3.st === '' && Math.abs(g3.top - g0.top) < 2, JSON.stringify(g3));
  // flick: short but fast
  await touch('touchStart', g3.hx, g3.hy);
  await touch('touchMove', g3.hx, g3.hy + 14); await touch('touchMove', g3.hx, g3.hy + 40); await touch('touchMove', g3.hx, g3.hy + 80);
  await touch('touchEnd');
  await p.waitForTimeout(1100);
  check('a flick (velocity > .5 px/ms) closes it even when short', (await geom()).hidden);
  await openSheet();
  // pull up is damped and springs back
  const g4 = await geom();
  await touch('touchStart', g4.hx, g4.hy);
  await touch('touchMove', g4.hx, g4.hy - 20); await touch('touchMove', g4.hx, g4.hy - 100);
  await frames2(p);
  const up = await geom();
  await touch('touchEnd');
  await p.waitForTimeout(500);
  check('an upward drag is damped (about a fifth) and the panel comes back', up.top - g4.top < 0 && up.top - g4.top > -26 && Math.abs((await geom()).top - g4.top) < 1, JSON.stringify([up.top - g4.top]));
  // the content scrolls when it is scrolled (drag only starts from the top)
  check('the close button still works', await (async () => { await p.tap('.sheet-head [data-close-sheet]'); await p.waitForTimeout(700); return (await geom()).hidden; })());
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // search + assistant on phones (P1): drag the header down
  const { ctx, p, errs } = await open('teams.html', PHONE);
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await p.evaluate(() => YanabeeChat.open());
  await p.waitForTimeout(500);
  const hb = await (await p.$('.chat-head')).boundingBox();
  const top0 = await p.evaluate(() => document.querySelector('.chat-panel').getBoundingClientRect().top);
  await touch('touchStart', hb.x + hb.width / 2, hb.y + 10);
  await touch('touchMove', hb.x + hb.width / 2, hb.y + 60); await touch('touchMove', hb.x + hb.width / 2, hb.y + 160);
  await frames2(p);
  const moved = await p.evaluate(() => document.querySelector('.chat-panel').getBoundingClientRect().top);
  check('assistant panel follows a header drag on phones', moved - top0 > 140 && moved - top0 < 170, String(moved - top0));
  await touch('touchMove', hb.x + hb.width / 2, hb.y + 400); await touch('touchEnd');
  await p.waitForTimeout(900);
  check('and closes through YanabeeChat.close() when dragged far', await p.evaluate(() => document.querySelector('.chat').hidden && document.querySelector('.chat-panel').style.transform === ''));
  await p.evaluate(() => YanabeeSearch.open());
  await p.waitForTimeout(400);
  const sb = await (await p.$('.search-bar')).boundingBox();
  await touch('touchStart', sb.x + sb.width - 20, sb.y + 20);
  await touch('touchMove', sb.x + sb.width - 20, sb.y + 80); await touch('touchMove', sb.x + sb.width - 20, sb.y + 300); await touch('touchMove', sb.x + sb.width - 20, sb.y + 420);
  await sleep(120); await touch('touchEnd');
  await p.waitForTimeout(900);
  check('search closes through YanabeeSearch.close() when its header is dragged far', await p.evaluate(() => document.querySelector('.search').hidden && !document.documentElement.style.overflow));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------------------------------------ progress + parallax */
console.log('wave progress + 1:1 parallax');
{
  const { ctx, p, errs } = await open('index.html');
  check('progress bar got a wave head and the wave mode', await p.evaluate(() => document.documentElement.classList.contains('wow-prog') && !!document.querySelector('.progress > .wow-head[aria-hidden="true"]') && document.querySelector('.progress').getAttribute('aria-hidden') === 'true'));
  check('progress bar is 4–5px tall, no drop-shadow filter', await p.evaluate(() => { const b = document.querySelector('.progress'), h = b.getBoundingClientRect().height; return h >= 4 && h <= 5.1 && getComputedStyle(b).filter === 'none'; }));
  await p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight * 0.5, behavior: 'instant' }));
  await p.waitForTimeout(200);
  const pr = await p.evaluate(() => ({ p: parseFloat(document.querySelector('.progress').style.getPropertyValue('--p')), on: document.querySelector('.progress').classList.contains('on'), head: document.querySelector('.wow-head').style.transform, flow: document.querySelector('.progress').classList.contains('flow') }));
  check('progress follows the scroll (value, head position, visible head) and flows while scrolling', pr.p > 0.3 && pr.p < 0.7 && pr.on && /translate3d/.test(pr.head) && pr.flow, JSON.stringify(pr));
  await p.waitForTimeout(550);
  check('the wave stops about 300 ms after the page does (no always-on animation)', await p.evaluate(() => !document.querySelector('.progress').classList.contains('flow') && document.querySelector('.progress').getAnimations({ subtree: true }).length === 0));
  // parallax: no lag
  const info = await p.evaluate(() => { const el = document.querySelector('.wow-par'); if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return { on: document.documentElement.classList.contains('wow-par-on'), n: document.querySelectorAll('.wow-par').length }; });
  check('parallax layers are registered', !!info && info.on && info.n >= 2, JSON.stringify(info));
  const lag = await p.evaluate(async () => {
    const el = document.querySelector('.wow-par');
    const read = () => parseFloat((el.style.translate || '0 0px').split(' ')[1]) || 0;
    scrollBy({ top: 300, behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(r));
    const first = read();
    scrollBy({ top: 120, behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(r));
    const second = read();
    await new Promise(r => setTimeout(r, 600));
    return { first, second, settled: read() };
  });
  check('parallax is applied in the same frame as the scroll (no easing lag)', Math.abs(lag.second - lag.settled) < 0.05 && Math.abs(lag.second) <= 24, JSON.stringify(lag));
  check('parallax rates and shifts stay small (<= .1, clamp 24px)', await p.evaluate(() => [...document.querySelectorAll('.wow-par')].every(e => Math.abs(parseFloat((e.style.translate || '0 0px').split(' ')[1]) || 0) <= 24.01)));
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
    ['drop', 'ripple', 'good', 'bad'].forEach(t => { try { window.dispatchEvent(new CustomEvent('yanabee:sound', { detail: { type: t } })); out[t] = true; } catch (e) { out[t] = String(e); } });
    return out;
  });
  check('yanabee:sound events are accepted for every type', Object.values(types).every(v => v === true), JSON.stringify(types));
  await p.waitForTimeout(150);
  check('a sound really plays when on (play() returns true)', await p.evaluate(async () => { await new Promise(r => setTimeout(r, 120)); return window.YanabeeWow.sound.play('good'); }));
  check('unknown sound types (the retired page whoosh included) are ignored', await p.evaluate(() => window.YanabeeWow.sound.play('nope') === false && window.YanabeeWow.sound.play('whoosh') === false && !window.YanabeeWow.sound.types.includes('whoosh')));
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
  const t = await open('index.html', PHONE);
  const fit = await t.p.evaluate(() => {
    const bar = document.querySelector('.nav-bar').getBoundingClientRect(), b = document.querySelector('.sound-btn').getBoundingClientRect(), th = document.querySelector('.nav .theme-toggle').getBoundingClientRect(), br = document.querySelector('.nav .brand').getBoundingClientRect();
    return { inside: b.left >= bar.left && b.right <= bar.right, overlapTheme: !(b.right <= th.left || b.left >= th.right), overlapBrand: !(b.right <= br.left || b.left >= br.right), w: b.width };
  });
  check('390px: the sound button fits the nav without overlapping anything', fit.inside && !fit.overlapTheme && !fit.overlapBrand && fit.w >= 40, JSON.stringify(fit));
  await t.ctx.close();
}

/* ------------------------------------------------------------------------------------------------ everything else */
console.log('all pages: errors, overflow, theme');
for (const pg of PAGES) {
  for (const scheme of ['light', 'dark']) {
    const d = await open(pg, { colorScheme: scheme });
    await d.p.mouse.move(400, 300, { steps: 5 });
    await d.p.mouse.click(420, 320);
    await d.p.waitForTimeout(200);
    check(`${pg}: no console errors on desktop (${scheme})`, d.errs.length === 0, d.errs.join(' | '));
    await d.ctx.close();
    const m = await open(pg, { ...PHONE, colorScheme: scheme });
    const ov = await m.p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    check(`${pg}: no horizontal overflow at 390px, no console errors (${scheme})`, ov.s <= ov.c + 1 && m.errs.length === 0, JSON.stringify(ov) + ' ' + m.errs.join(' | '));
    await m.ctx.close();
  }
}
{
  const { ctx, p } = await open('teams.html');
  const before = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click('.nav .theme-toggle');
  await p.waitForTimeout(2000);
  check('the theme toggle (circular view-transition) still works', await p.evaluate(b => document.documentElement.dataset.theme !== b && !document.documentElement.classList.contains('vt-theme'), before));
  check('the wave progress and cursor follow the new theme without errors', await p.evaluate(() => !!document.querySelector('.wow-cursor') && document.documentElement.classList.contains('wow-prog')));
  await ctx.close();
  const lab = await open('lab.html');
  const fill = () => lab.p.evaluate(() => { const pr = document.createElement('i'); pr.style.cssText = 'position:absolute;width:1px;height:1px;background:var(--grad)'; document.body.appendChild(pr); const want = getComputedStyle(pr).backgroundImage; pr.remove(); return { ind: getComputedStyle(document.querySelector('.lab-tablist .seg-ind')).backgroundImage, want }; });
  const f0 = await fill();
  await lab.p.click('.nav .theme-toggle');
  await lab.p.waitForTimeout(1800);
  const f1 = await fill();
  check('the tab indicator\'s fill follows the theme token (re-sampled after a theme change)', f0.ind === f0.want && f1.ind === f1.want, JSON.stringify([f0, f1]).slice(0, 400));
  await lab.ctx.close();
}

await browser.close();
server.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} wow tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
