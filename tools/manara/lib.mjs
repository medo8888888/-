// Shared helpers for the MANARA («منارة») browser tests and screenshots (Playwright, Chromium, file:// URLs).
//
//   import { launch, openPage, overflow, check, done, url, SITE, ROOT } from './lib.mjs';
//
// Playwright is installed globally in the sandbox; ESM ignores NODE_PATH, so it is resolved by hand.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const globalRoot = process.env.NODE_PATH || execSync('npm root -g').toString().trim();
export const { chromium } = createRequire(import.meta.url)(path.join(globalRoot, 'playwright'));

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SITE = path.join(ROOT, 'site/manara');
export const url = (f, q = '') => pathToFileURL(path.join(SITE, f)).href + q;
export const EXE = '/opt/pw-browsers/chromium';

let passed = 0;
const failures = [];
export const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failures.push(detail ? `${name} — ${detail}` : name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};
export const done = async browser => {
  if (browser) await browser.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
};

// Launch Chromium. A fake camera is wired in so detect.html can be tested without hardware.
export const launch = () => chromium.launch({
  executablePath: EXE,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

// Open a page in a fresh context and collect console errors / page errors / failed local requests.
// Google Fonts are blocked: tests must not depend on the network.
export async function openPage(browser, file, { width = 1280, height = 860, theme = 'dark', lang, query = '', reducedMotion = 'reduce', context } = {}) {
  const ctx = context || await browser.newContext({
    viewport: { width, height }, colorScheme: theme, reducedMotion,
    isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1,
  });
  if (lang) await ctx.addInitScript(l => { try { localStorage.setItem('manara-lang', l); } catch (e) { /* ignore */ } }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|ERR_ABORTED|ERR_INTERNET|ERR_NAME|net::/.test(m.text() + (m.location()?.url || ''))) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => { const u = r.url(); if (u.startsWith('file:')) errors.push('requestfailed: ' + u); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(url(file, query), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__manaraReady === true, null, { timeout: 5000 }).catch(() => errors.push('core.js never set window.__manaraReady'));
  return { ctx, page, errors };
}

// Elements that stick out horizontally (ignores fixed elements, canvases, scroll boxes and aria-hidden decorations).
export const overflow = page => page.evaluate(() => {
  const W = document.documentElement.clientWidth; const bad = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed' &&
        !el.closest('[aria-hidden="true"], .table-wrap, pre, .scroll-x, .menu')) {
      bad.push((el.id ? '#' + el.id : (typeof el.className === 'string' && el.className) || el.tagName) + ` (${Math.round(r.left)}..${Math.round(r.right)})`);
    }
  });
  return { scrollW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 8) };
});
