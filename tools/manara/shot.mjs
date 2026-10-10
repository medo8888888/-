// Screenshots + console/overflow check for MANARA pages (Playwright, Chromium, file:// URLs).
//
//   node tools/manara/shot.mjs mission.html [options]
//
// Options:
//   --w 390,1440          viewport widths (default 390,1440)
//   --theme dark,light    colour schemes (default dark,light)
//   --lang ar,en          languages (default ar)
//   --full                full-page screenshot (clipped to --max-h, default 6000px)
//   --scroll 1200         scroll to y before a viewport screenshot
//   --wait 600            extra ms to wait before the shot (animations, simulations)
//   --click "#start"      click a selector before the shot (repeatable, in order)
//   --fonts               load Google Fonts through the proxy (default: blocked, fallback fonts)
//   --out DIR             output dir (default: $MANARA_SHOTS or /tmp/manara-shots)
// Prints the PNG paths plus any console errors / failed requests / horizontal overflow.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, EXE, url, overflow } from './lib.mjs';

const args = process.argv.slice(2);
const page = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--')) || 'index.html';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const all = k => args.flatMap((a, i) => (a === '--' + k ? [args[i + 1]] : []));
const widths = opt('w', '390,1440').split(',').map(Number);
const themes = opt('theme', 'dark,light').split(',');
const langs = opt('lang', 'ar').split(',');
const full = args.includes('--full');
const maxH = +opt('max-h', 6000);
const scrollY = +opt('scroll', 0);
const wait = +opt('wait', 400);
const clicks = all('click');
const out = opt('out', process.env.MANARA_SHOTS || '/tmp/manara-shots');
fs.mkdirSync(out, { recursive: true });

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const fonts = args.includes('--fonts');
const browser = await chromium.launch({ executablePath: EXE, ...(proxy && fonts ? { proxy: { server: proxy } } : {}),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
for (const lang of langs) for (const theme of themes) for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1,
    colorScheme: theme, reducedMotion: 'reduce', hasTouch: w < 600, isMobile: w < 600, ignoreHTTPSErrors: true,
  });
  await ctx.addInitScript(([l, t]) => { try { localStorage.setItem('manara-lang', l); localStorage.setItem('manara-theme', t); } catch (e) { /* ignore */ } }, [lang, theme]);
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|ERR_ABORTED|net::/.test(m.text() + (m.location()?.url || ''))) errs.push('console: ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('requestfailed', r => { if (r.url().startsWith('file:')) errs.push('requestfailed: ' + r.url()); });
  if (!fonts) await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto(url(page), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__manaraReady === true, null, { timeout: 5000 }).catch(() => errs.push('core.js never set window.__manaraReady'));
  for (const c of clicks) { try { await p.click(c, { timeout: 3000 }); await p.waitForTimeout(150); } catch (e) { errs.push('click failed: ' + c); } }
  if (scrollY) await p.evaluate(y => window.scrollTo(0, y), scrollY);
  await p.waitForTimeout(wait);
  const over = await overflow(p);
  const f = path.join(out, `${page.replace('.html', '')}-${w}-${theme}-${lang}${full ? '-full' : ''}.png`);
  if (full) {
    const h = Math.min(maxH, await p.evaluate(() => document.documentElement.scrollHeight));
    await p.screenshot({ path: f, clip: { x: 0, y: 0, width: w, height: h }, fullPage: true });
  } else await p.screenshot({ path: f });
  console.log(f);
  if (over.scrollW > over.W) console.log(`  OVERFLOW scrollWidth ${over.scrollW} > ${over.W}: ${over.bad.join(', ')}`);
  errs.forEach(e => console.log('  ' + e));
  await ctx.close();
}
await browser.close();
