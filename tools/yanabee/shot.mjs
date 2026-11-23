// Screenshot + console check for Yanabee pages (Playwright, Chromium, file:// URLs).
//
//   node tools/yanabee/shot.mjs teams.html [options]
//
// Options:
//   --w 390,1440          viewport widths (default 390,1440)
//   --theme light,dark    colour schemes (default light,dark)
//   --sel "#t1"           screenshot one element instead of the page (repeatable)
//   --full                full-page screenshot (clipped to --max-h, default 7000px)
//   --scroll 1200         scroll to y before a viewport screenshot
//   --nofonts             block Google Fonts (faster; fallback fonts)
//   --motion              keep animations (default: prefers-reduced-motion so reveals show)
//   --out DIR             output dir (default: scratchpad/shots)
// Prints the PNG paths plus any console errors / failed requests / horizontal overflow.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright is installed globally in the sandbox; ESM ignores NODE_PATH, so resolve it by hand.
const globalRoot = process.env.NODE_PATH || execSync('npm root -g').toString().trim();
const { chromium } = createRequire(import.meta.url)(path.join(globalRoot, 'playwright'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const page = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')) || 'index.html';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const all = k => args.flatMap((a, i) => (a === '--' + k ? [args[i + 1]] : []));
const widths = opt('w', '390,1440').split(',').map(Number);
const themes = opt('theme', 'light,dark').split(',');
const sels = all('sel');
const full = args.includes('--full');
const maxH = +opt('max-h', 7000);
const scrollY = +opt('scroll', 0);
const out = opt('out', '/tmp/claude-0/-home-user--/c2ce3409-c480-57f1-ac0e-6a458565659b/scratchpad/shots');
fs.mkdirSync(out, { recursive: true });

const url = 'file://' + path.join(ROOT, 'site/yanabee', page);
// Real web fonts through the sandbox proxy (its CA is not in Chromium's store); --nofonts blocks them.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const useFonts = !args.includes('--nofonts');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ...(proxy && useFonts ? { proxy: { server: proxy } } : {}) });
for (const theme of themes) {
  for (const w of widths) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1,
      colorScheme: theme, reducedMotion: args.includes('--motion') ? 'no-preference' : 'reduce',
      hasTouch: w < 600, isMobile: w < 600, ignoreHTTPSErrors: true,
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.location()?.url || '') && !/ERR_FAILED|ERR_ABORTED/.test(m.text())) errs.push('console: ' + m.text()); });
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('requestfailed', r => { const u = r.url(); if (!/fonts\.(googleapis|gstatic)|\/api\//.test(u)) errs.push('requestfailed: ' + u); });
    if (!useFonts) await p.route('**/fonts.g*/**', r => r.abort());
    await p.goto(url + (sels.length ? '' : ''), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts && document.fonts.ready);
    await p.waitForTimeout(400);
    const over = await p.evaluate(() => {
      const W = document.documentElement.clientWidth; const bad = [];
      document.querySelectorAll('body *').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') {
          if (!el.closest('[aria-hidden="true"], .hero-bg, canvas')) bad.push((el.id ? '#' + el.id : el.className || el.tagName) + ` (${Math.round(r.left)}..${Math.round(r.right)})`);
        }
      });
      return { scrollW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 8) };
    });
    const base = `${page.replace('.html', '')}-${w}-${theme}`;
    const shots = [];
    if (sels.length) {
      for (const s of sels) {
        const el = await p.$(s);
        if (!el) { errs.push('selector not found: ' + s); continue; }
        await el.scrollIntoViewIfNeeded();
        const f = path.join(out, `${base}-${s.replace(/[^\w-]/g, '')}.png`);
        await el.screenshot({ path: f }); shots.push(f);
      }
    } else if (full) {
      const h = await p.evaluate(() => document.documentElement.scrollHeight);
      const f = path.join(out, `${base}-full.png`);
      await p.screenshot({ path: f, fullPage: true, clip: { x: 0, y: 0, width: w, height: Math.min(h, maxH) } }); shots.push(f);
    } else {
      if (scrollY) { await p.evaluate(y => scrollTo(0, y), scrollY); await p.waitForTimeout(300); }
      const f = path.join(out, `${base}${scrollY ? '-y' + scrollY : ''}.png`);
      await p.screenshot({ path: f }); shots.push(f);
    }
    console.log(shots.join('\n'));
    if (over.scrollW > over.W + 1) console.log(`  OVERFLOW ${w}px ${theme}: scrollWidth ${over.scrollW} > ${over.W}`, over.bad.join(', '));
    errs.forEach(e => console.log('  ' + e));
    await ctx.close();
  }
}
await browser.close();
