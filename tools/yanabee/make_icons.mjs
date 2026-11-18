// Draws the app icons for the installable site (PWA) from assets/logo.svg. Run once after the logo changes:
//   node tools/yanabee/make_icons.mjs
// Writes assets/icon-192.png, icon-512.png (the drop on the light tile, like icon-180.png for iPhone) and
// icon-maskable-512.png (Android crops it to a circle or a squircle, so the drop stays inside the middle 60%).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSETS = path.join(ROOT, 'site/yanabee/assets');
const svg = fs.readFileSync(path.join(ASSETS, 'logo.svg'), 'utf8');

const tile = (size, drop, bg) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">
<div style="width:${drop}px;height:${drop}px">${svg.replace(/width="48" height="48"/, 'width="100%" height="100%"')}</div></div></body></html>`;

const LIGHT = 'radial-gradient(circle at 30% 20%,#ffffff 0%,#f3f8f7 55%,#e7f1ef 100%)';
const jobs = [
  ['icon-192.png', 192, 120, LIGHT],
  ['icon-512.png', 512, 320, LIGHT],
  ['icon-maskable-512.png', 512, 270, LIGHT],
];

const browser = await pw.chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, drop, bg] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(tile(size, drop, bg));
  await page.screenshot({ path: path.join(ASSETS, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
