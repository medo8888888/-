// The installable app (PWA): manifest, icons, sw.js, offline.html, _headers (tools/yanabee/build_pwa.py) and
// js/pwa.js (install on Android, the iPhone how-to, offline notice, update toast).
//   python3 tools/yanabee/build.py && node tools/yanabee/test-pwa.mjs
// The browser part runs against a local server that behaves like Cloudflare Pages ("/teams.html" redirects to
// "/teams", "/" is index.html), and a second one with plain file names. Supabase is a fake host; the checks prove
// the worker never answers or saves it, nor /api/.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'site/yanabee');
const req = createRequire(import.meta.url);
let pw;
try { pw = req('playwright'); } catch (e) { pw = req(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium, devices } = pw;
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const section = t => console.log('\n' + t);
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const pngSize = f => { const b = fs.readFileSync(path.join(SITE, f)); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

/* ================================================================ 1. the built files */
section('manifest, icons, headers');
const man = JSON.parse(read('manifest.webmanifest'));
check('manifest: Arabic, right to left, standalone', man.lang === 'ar' && man.dir === 'rtl' && man.display === 'standalone' && /ينابيع/.test(man.name) && man.short_name === 'ينابيع');
check('manifest: start_url and scope are relative (works at the domain root and under /yanabee/)', !/^\/|^https?:/.test(man.start_url) && man.scope === './' && man.id === './');
check('manifest: start page exists', fs.existsSync(path.join(SITE, man.start_url.split('?')[0])));
const icon = s => man.icons.find(i => i.sizes === s && i.purpose === 'any');
check('icons 192 and 512 exist at their stated size', [['192x192', 192], ['512x512', 512]].every(([s, n]) => { const i = icon(s); const d = i && pngSize(i.src); return d && d[0] === n && d[1] === n; }));
const mask = man.icons.find(i => i.purpose === 'maskable');
check('a maskable 512 icon for Android (round and squircle masks)', mask && (pngSize(mask.src) || [])[0] === 512);
check('shortcuts: لوحتي, لوحة البطولة, سجّل فريقك, all to existing pages', man.shortcuts.length === 3 && man.shortcuts.every(s => fs.existsSync(path.join(SITE, s.url))) && man.shortcuts[0].url === 'account.html');
check('theme and background colors set', /^#[0-9a-f]{6}$/i.test(man.theme_color) && /^#[0-9a-f]{6}$/i.test(man.background_color));
const hd = read('_headers');
check('_headers: sw.js and the manifest are never kept stale', /\/sw\.js\n\s+Cache-Control: no-cache/.test(hd) && /\/manifest\.webmanifest\n\s+Content-Type: application\/manifest\+json/.test(hd));

section('every page is installable');
const pages = fs.readdirSync(SITE).filter(f => f.endsWith('.html'));
// 404.html uses absolute /yanabee/ paths (make_zip.sh turns them into /)
const lacking = pages.filter(f => { const h = read(f); return !(/<link rel="manifest" href="(\/yanabee\/)?manifest\.webmanifest">/.test(h) && /apple-touch-icon/.test(h) && /apple-mobile-web-app-capable/.test(h)
  && /<meta name="theme-color"[^>]*prefers-color-scheme: dark/.test(h) && /<script src="(\/yanabee\/)?js\/pwa\.js" defer>/.test(h) && /css\/pwa\.css/.test(h)); });
check(`all ${pages.length} pages: manifest, iPhone tags, theme color for light and dark, pwa.js and pwa.css`, pages.length >= 14 && !lacking.length, lacking.join());
check('the menu sheet carries the (hidden) install button', /data-pwa-install hidden/.test(read('index.html')));
check('offline.html exists, says so in Arabic, with «أعد المحاولة»', /لا يوجد اتصال بالإنترنت/.test(read('offline.html')) && /data-pwa-retry/.test(read('offline.html')));

section('sw.js');
const sw = read('sw.js');
try { new vm.Script(sw); check('sw.js parses', true); } catch (e) { check('sw.js parses', false, e.message); }
const version = (sw.match(/^const VERSION = '([0-9a-z]+)';/m) || [])[1];
const core = JSON.parse((sw.match(/^const CORE = (\[.*\]);$/m) || [])[1] || '[]');
check('a version from the files\' hash', /^[0-9a-f]{12}$/.test(version || ''));
check('core pages are saved on install (home, account, board, rules, register, offline)', ['index.html', 'account.html', 'tournament.html', 'competition.html', 'register.html', 'offline.html'].every(f => core.includes(f)));
check('every saved file exists and is a site file (no other host, no /api/)', core.length > 20 && core.every(f => fs.existsSync(path.join(SITE, f)) && !/^https?:|^\/|api\//.test(f)));
check('the styles and scripts of the core pages are saved with them', ['css/base.css', 'css/account.css', 'js/account.js', 'js/yb-api.js', 'js/pwa.js', 'css/pwa.css', 'js/tournament.js'].every(f => core.includes(f)));
check('photos are not saved up front (they are saved when seen)', !core.some(f => /photos\//.test(f)));
check('the worker only answers GET requests to this site', /req\.method !== 'GET'\) return/.test(sw) && /url\.origin !== self\.location\.origin \|\| !inScope\(url\)\) return/.test(sw) && /\\\/api\\\//.test(sw));

section('js/pwa.js hygiene');
const pj = read('js/pwa.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check('no innerHTML, eval, console or network call of its own', !/innerHTML|insertAdjacentHTML|\beval\(|new Function|\bconsole\.|\bfetch\(|XMLHttpRequest/.test(pj));
check('one storage key only (yanabee-pwa)', (pj.match(/localStorage\.setItem\(/g) || []).length === 1 && /STORE = 'yanabee-pwa'/.test(read('js/pwa.js')));

section('make_zip stamps the shipped version');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ybz-'));
  try {
    execFileSync('bash', [path.join(ROOT, 'tools/yanabee/make_zip.sh'), path.join(tmp, 'site.zip'), tmp], { stdio: 'pipe' });
    const zsw = fs.readFileSync(path.join(tmp, 'site/sw.js'), 'utf8');
    const zv = (zsw.match(/^const VERSION = '([0-9a-z]+)';/m) || [])[1];
    check('the zip\'s sw.js has its own version (the live config is part of it)', /^z[0-9a-f]{12}$/.test(zv || '') && zv !== version);
    check('the zip carries the manifest, the worker, offline.html and _headers', ['manifest.webmanifest', 'sw.js', 'offline.html', '_headers', 'assets/icon-maskable-512.png'].every(f => fs.existsSync(path.join(tmp, 'site', f))));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/* ================================================================ 2. the browser */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serve(pretty) {
  const st = { bump: 0, hits: [] };
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    st.hits.push(p);
    if (p.startsWith('api/')) { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true}'); return; }
    if (pretty && p.endsWith('.html')) { r.writeHead(308, { location: '/' + (p === 'index.html' ? '' : p.slice(0, -5)) + u.search }); r.end(); return; }
    if (p === '') p = 'index.html';
    else if (pretty && !path.extname(p)) p += '.html';
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(path.join(SITE, '404.html'))); return; }
    let body = fs.readFileSync(f);
    if (p === 'sw.js' && st.bump) body = Buffer.from(body.toString().replace(/^const VERSION = '([^']+)';/m, `const VERSION = '$1b${st.bump}';`));
    r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    r.end(body);
  });
  return new Promise(res => srv.listen(0, '127.0.0.1', () => res({ srv, st, origin: `http://127.0.0.1:${srv.address().port}` })));
}

const browser = await chromium.launch();
const errors = [];
async function ctxFor(origin, { sw = true, phone = false, ua = null, standalone = false, dark = false } = {}) {
  const base = phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 900 } };
  if (ua) Object.assign(base, { userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ctx = await browser.newContext({ ...base, colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: 'allow' });
  await ctx.route(/fonts\.g(oogleapis|static)\.com/, r => r.abort());
  await ctx.route('https://fake.supabase.test/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"secret":"x"}' }));
  if (sw) await ctx.addInitScript(() => { window.YB_PWA_TEST = true; });
  if (standalone) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  ctx.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  return ctx;
}
const ready = p => p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
const controlled = p => p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).then(() => true).catch(() => false);
const cacheKeys = p => p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname); return out; });

for (const pretty of [true, false]) {
  const { srv, st, origin } = await serve(pretty);
  const label = pretty ? 'Cloudflare-style addresses (/teams.html -> /teams)' : 'plain file names';
  section(`service worker, ${label}`);
  const ctx = await ctxFor(origin);
  const p = await ctx.newPage();
  await p.goto(origin + '/index.html');
  check('registers and activates', await ready(p));
  await p.reload();
  check('the page is controlled after a reload', await controlled(p));
  const keys = await cacheKeys(p);
  const pagesCache = Object.keys(keys).find(k => k === 'yb-pages-' + version);
  check('the pages store is named after the version', !!pagesCache, Object.keys(keys).join());
  const saved = (keys[pagesCache] || []).map(x => x.replace(/^\//, ''));
  check('core pages are saved under their file names', ['index.html', 'account.html', 'tournament.html', 'offline.html', 'js/account.js', 'css/base.css'].every(f => saved.includes(f)), saved.slice(0, 8).join());
  // online, a page outside the core is saved once it is opened
  await p.goto(origin + '/method.html');
  await p.waitForLoadState('load');
  await p.waitForTimeout(300);
  // Supabase and /api/ are fetched, then checked absent from every store
  await p.evaluate(async () => { await fetch('https://fake.supabase.test/rest/v1/rpc/yb_my_prefs', { method: 'POST' }).catch(() => {}); await fetch('https://fake.supabase.test/storage/v1/object/x.jpg').catch(() => {}); await fetch('api/health').catch(() => {}); });
  const all = Object.values(await cacheKeys(p)).flat();
  check('nothing from Supabase (data, photos) or /api/ is ever saved', !all.some(u => /supabase|\/api\//.test(u)) && !Object.keys(await cacheKeys(p)).some(k => !/^yb-(pages|media)-/.test(k)));
  check('a page opened online is saved for later (method.html)', all.some(u => /method\.html$/.test(u)));
  // offline
  await ctx.setOffline(true);
  await p.goto(origin + (pretty ? '/' : '/index.html'));
  check('offline: the home page opens from the saved copy', /ينابيع/.test(await p.title()) && await p.locator('header.nav').count() === 1);
  await p.goto(origin + '/tournament.html');
  check('offline: the tournament board page opens', /البطولة/.test(await p.title()));
  await p.goto(origin + '/method.html');
  check('offline: a page seen before opens', /منهجية|المنهجية|السلوك/.test(await p.title() + await p.locator('h1').first().innerText()));
  await p.goto(origin + '/teams.html');
  check('offline: an unsaved page shows «لا يوجد اتصال بالإنترنت» with «أعد المحاولة»', /لا يوجد اتصال بالإنترنت/.test(await p.locator('h1').innerText()) && await p.locator('[data-pwa-retry]').isVisible());
  await p.waitForSelector('[data-pwa-saved]:not([hidden]) a', { timeout: 4000 }).catch(() => {});
  const savedLinks = await p.locator('[data-pwa-saved] a').allInnerTexts();
  check('offline page lists the pages saved on this phone', savedLinks.some(t => /الرئيسية/.test(t)) && savedLinks.length >= 3, savedLinks.join('|'));
  check('offline notice is shown', await p.locator('.pwa-net.on').isVisible() && /لا يوجد اتصال/.test(await p.locator('.pwa-net').innerText()));
  await ctx.setOffline(false);
  await p.waitForSelector('.pwa-net.ok', { timeout: 3000 }).catch(() => {});
  check('back online: «عاد الاتصال.»', /عاد الاتصال/.test(await p.locator('.pwa-net').innerText().catch(() => '')));

  if (pretty) {
    section('an upload replaces the app: «حدّث»');
    await p.goto(origin + '/index.html');
    await controlled(p);
    st.bump = 1;
    await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await p.waitForSelector('.pwa-toast.on [data-pwa-reload]', { timeout: 8000 }).catch(() => {});
    check('the open page offers «وصلت نسخة جديدة من ينابيع.» with «حدّث»', /وصلت نسخة جديدة/.test(await p.locator('.pwa-toast').innerText().catch(() => '')));
    await Promise.all([p.waitForEvent('load'), p.locator('[data-pwa-reload]').click()]);
    const after = Object.keys(await cacheKeys(p));
    check('after «حدّث»: only the new version\'s stores remain', after.length >= 1 && after.every(k => k.endsWith(version + 'b1')), after.join());
    check('no update toast on a fresh load', !(await p.locator('.pwa-toast').count()));
  }
  await ctx.close();
  srv.close();
}

const { srv, origin } = await serve(true);
section('automated browsers keep the plain site unless a test asks (no worker)');
{
  const ctx = await ctxFor(origin, { sw: false });
  const p = await ctx.newPage();
  await p.goto(origin + '/index.html');
  await p.waitForTimeout(500);
  check('no service worker registered', (await p.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))) === 0);
  await ctx.close();
}

section('Android: the install offer');
{
  const ctx = await ctxFor(origin, { sw: false, phone: true });
  const p = await ctx.newPage();
  await p.goto(origin + '/index.html');
  check('nothing to install before the browser offers it', (await p.evaluate(() => window.YBPWA.state())) === 'none' && await p.locator('[data-pwa-install]').first().isHidden());
  await p.goto(origin + '/teams.html');                                  // the second page view
  const offer = () => p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); return e.defaultPrevented; });
  check('the browser\'s own mini-bar is held back (our button offers it)', await offer());
  check('state «prompt»', (await p.evaluate(() => window.YBPWA.state())) === 'prompt');
  check('the banner shows on the second page view, above the tab bar', await p.locator('.pwa-banner').isVisible() && /ثبّت ينابيع على هاتفك/.test(await p.locator('.pwa-banner').innerText()));
  const bb = await p.locator('.pwa-banner').boundingBox(), tb = await p.locator('.tabbar').boundingBox();
  check('the banner does not cover the tab bar', bb && tb && bb.y + bb.height <= tb.y + 1, JSON.stringify([bb, tb]));
  check('390px: no sideways scroll with the banner', (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await p.locator('.pwa-banner [data-pwa-install]').click();
  check('«ثبّت» opens the browser\'s install prompt', (await p.evaluate(() => window.__prompted)) === 1);
  check('a used offer is gone (the browser allows one prompt)', (await p.evaluate(() => window.YBPWA.state())) === 'none' && !(await p.locator('.pwa-banner').count()));
  await offer();
  await p.locator('[data-open-sheet]').last().click();
  check('the menu sheet shows «ثبّت ينابيع على هاتفك»', await p.locator('.sheet-row [data-pwa-install]').isVisible());
  await p.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  check('after installing: «تم تثبيت ينابيع» and no install buttons', /تم تثبيت ينابيع/.test(await p.locator('.pwa-toast').innerText()) && await p.locator('.sheet-row [data-pwa-install]').isHidden() && (await p.evaluate(() => window.YBPWA.state())) === 'installed');
  // «لاحقًا» is remembered
  const p2 = await ctx.newPage();
  await p2.goto(origin + '/index.html');
  await p2.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await p2.locator('[data-pwa-later]').click();
  check('«لاحقًا» hides the banner', !(await p2.locator('.pwa-banner').count()));
  await p2.reload();
  await p2.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  check('…and it stays hidden for three weeks (the menu button still works)', !(await p2.locator('.pwa-banner').count()) && (await p2.evaluate(() => window.YBPWA.state())) === 'prompt');
  await ctx.close();
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
section('iPhone: the «إضافة إلى الشاشة الرئيسية» how-to');
{
  const ctx = await ctxFor(origin, { sw: false, ua: IPHONE });
  const p = await ctx.newPage();
  await p.goto(origin + '/index.html');
  check('state «ios» and the menu button is shown', (await p.evaluate(() => window.YBPWA.state())) === 'ios' && (await p.locator('.sheet-row [data-pwa-install]').getAttribute('hidden')) === null);
  check('no banner on the first page view', !(await p.locator('.pwa-banner').count()));
  await p.goto(origin + '/competition.html');
  check('the banner on the second page view', await p.locator('.pwa-banner').isVisible());
  await p.locator('.pwa-banner [data-pwa-install]').click();
  const dlg = p.locator('.pwa-sheet [role=dialog]');
  check('«ثبّت» opens the how-to: a modal dialog with a heading', await dlg.isVisible() && (await dlg.getAttribute('aria-modal')) === 'true' && /أضف ينابيع إلى شاشتك الرئيسية/.test(await dlg.locator('h2').innerText()));
  const steps = await dlg.locator('.pwa-step').allInnerTexts();
  check('three steps: Share, «إضافة إلى الشاشة الرئيسية», «إضافة»', steps.length === 3 && /المشاركة/.test(steps[0]) && /إضافة إلى الشاشة الرئيسية/.test(steps[1]) && /إضافة/.test(steps[2]));
  check('the steps show the Share and Add icons', (await dlg.locator('.pwa-key svg').count()) === 3);
  check('focus moves into the dialog', await p.evaluate(() => !!document.activeElement.closest('.pwa-sheet')));
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  check('Tab stays inside the dialog', await p.evaluate(() => !!document.activeElement.closest('.pwa-sheet')));
  await p.keyboard.press('Escape');
  check('Esc closes it and focus returns to «ثبّت»', !(await p.locator('.pwa-sheet').count()) && await p.evaluate(() => !!document.activeElement.closest('.pwa-banner')));
  await p.locator('.pwa-banner [data-pwa-install]').click();
  check('in Safari itself there is no «open in Safari» note', !(await p.locator('.pwa-note').count()));
  await p.keyboard.press('Escape');
  await p.locator('.pwa-banner [data-pwa-install]').click();
  await p.locator('.pwa-ok').click();
  check('«فهمت» closes it', !(await p.locator('.pwa-sheet').count()));
  check('390px: no sideways scroll', (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await ctx.close();
  const c2 = await ctxFor(origin, { sw: false, ua: IPHONE_CHROME });
  const q = await c2.newPage();
  await q.goto(origin + '/index.html');
  await q.evaluate(() => window.YBPWA.install());
  check('Chrome on iPhone: the how-to adds «افتح الموقع في Safari» if the option is missing', /Safari/.test(await q.locator('.pwa-note').innerText()));
  await c2.close();
  const c3 = await ctxFor(origin, { sw: false, ua: IPHONE, standalone: true, dark: true });
  const r = await c3.newPage();
  await r.goto(origin + '/index.html'); await r.goto(origin + '/teams.html');
  check('opened from the home screen: html.is-app, state «installed», no banner, no buttons',
    await r.evaluate(() => document.documentElement.classList.contains('is-app')) && (await r.evaluate(() => window.YBPWA.state())) === 'installed' && !(await r.locator('.pwa-banner').count()) && await r.locator('.sheet-row [data-pwa-install]').isHidden());
  await r.goto(origin + '/' + man.start_url);
  check('the app\'s start page stays the home page for someone not signed in', /\/(index\.html)?\?source=app$|\/\?source=app$/.test(r.url()) || /index/.test(r.url()), r.url());
  await r.evaluate(() => localStorage.setItem('yanabee-session-v1', '{"x":1}'));
  await r.goto(origin + '/' + man.start_url);
  await r.waitForURL(/account/, { timeout: 5000 }).catch(() => {});
  check('…and opens the dashboard for someone signed in', /account/.test(r.url()), r.url());
  await r.evaluate(() => localStorage.removeItem('yanabee-session-v1'));
  await c3.close();
}
srv.close();
await browser.close();

section('console');
check('no uncaught error in any page', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
