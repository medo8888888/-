// Evidence Lab (detect.html) tests — Playwright + Chromium, file:// URLs, fake camera:  node tools/manara/test-detect.mjs
//
//  1. Core (headless, in the page): scenes × pipeline — flame → FIRE; red shirt / car / scarf / LED / torch / wall / 10 Hz lamp never FIRE;
//     fire video on a phone: vision says FIRE, the thermal veto holds it at SUSPECT; thermal hotspot test; formulas; split; Wilson
//  2. Page loads clean in ar/en × dark/light; tabs (ARIA + keyboard); no horizontal overflow at 390 and 1440 on every tab
//  3. LIVE: flame → FIRE → two keys → Approve sends the 'detection' bus message; shirt/lamp never FIRE; veto on/off; photosensitivity gate;
//     reduced-motion paused start; camera (fake device, denied, none); picture + video upload; Web Serial mock
//  4. FOOL ME: a trial adds a scoreboard row (localStorage) and the CSV export works
//  5. DECOY LAB: ablation table with held-out numbers, ROC canvas, split, honest reference numbers equal test-fire.mjs output, CSV
//  6. SENSOR LAB: the one-key / two-key / human ladder for gas, flood, heat, dust, SOS
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, url, ROOT, SITE } from './lib.mjs';

const browser = await launch();
const section = t => console.log(`\n${t}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ready = page => page.waitForFunction(() => window.__detectReady === true, null, { timeout: 8000 });
const open = async (opts = {}) => { const o = await openPage(browser, 'detect.html', { reducedMotion: 'no-preference', width: 1280, height: 900, lang: 'en', ...opts }); await ready(o.page); return o; };
const newCtx = (opts = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference', ...opts });
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(120); } return false; };
const stateOf = page => page.$eval('#live-verdict', e => e.getAttribute('data-state'));
const lampStates = page => page.$$eval('#live-lamps li', els => els.map(e => e.getAttribute('data-state')));
async function waitState(page, want, ms = 9000, prefix = 'live') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await page.$eval(`#${prefix}-verdict`, e => e.getAttribute('data-state')); if (s === want) return true; await sleep(120); }
  return false;
}
async function sampleStates(page, ms, every = 100, prefix = 'live') {
  const seen = new Set(); const t0 = Date.now();
  while (Date.now() - t0 < ms) { seen.add(await page.$eval(`#${prefix}-verdict`, e => e.getAttribute('data-state'))); await sleep(every); }
  return seen;
}
const setRange = (page, sel, v) => page.$eval(sel, (el, val) => { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);

// ======================================================================= 1. core, headless inside the page
section('1. Core — scenes through the C1…C6 pipeline (headless, deterministic)');
{
  const { page, errors } = await open();
  const run = (id, seconds, o = {}) => page.evaluate(([id, seconds, o]) => {
    const L = window.ManaraLab, sc = L.makeScene(id, o.w || 160, o.h || 120, o.seed || 1, o.opt), p = L.createPipeline(o.pipe || {});
    const n = Math.round(seconds * L.FPS), st = [], vis = []; let firstFire = -1, approve = false;
    for (let k = 0; k < n; k++) {
      const grid = o.thermal === 'none' ? null : L.thermalGrid(o.thermal === 'cold' ? [] : sc.heat(k), k, 1);
      const out = p.push({ data: sc.frame(k), width: sc.w, height: sc.h }, k * 1000 / L.FPS, grid);
      st.push(out.state); vis.push(out.visionState); if (out.state === 'fire' && firstFire < 0) firstFire = k; if (out.canApprove) approve = true;
    }
    return { st, vis, firstFire, approve, last: st[st.length - 1] };
  }, [id, seconds, o]);
  const fl = await run('flame', 6);
  check('flame scene reaches FIRE', fl.firstFire >= 0, `first FIRE at frame ${fl.firstFire}`);
  check('FIRE comes within 3 s (45 frames at 15 fps)', fl.firstFire >= 0 && fl.firstFire < 45);
  check('flame: vision + thermal = two keys → approval possible', fl.approve);
  check('flame stays FIRE once confirmed', fl.st.slice(fl.firstFire).every(s => s === 'fire'));
  for (const id of ['shirt', 'car', 'scarf', 'led', 'flashlight', 'wall', 'flicker']) {
    for (const seed of [1, 2]) {
      const r = await run(id, 8, { seed, opt: id === 'flicker' ? { hz: 10 } : undefined });
      check(`${id} (seed ${seed}) never reaches FIRE over 8 s`, !r.st.includes('fire') && !r.vis.includes('fire'), `states ${[...new Set(r.st)].join(',')}`);
    }
  }
  const ph = await run('phonefire', 8);
  check('fire video on a phone: vision reaches FIRE …', ph.vis.includes('fire'));
  check('… but the thermal veto keeps the verdict out of FIRE', !ph.st.includes('fire') && ph.st.includes('suspect'));
  check('… and approval is impossible (one key only)', !ph.approve);
  const phOff = await run('phonefire', 8, { pipe: { veto: false } });
  check('veto off: camera-only FIRE shows, yet approval stays impossible', phOff.st.includes('fire') && !phOff.approve);
  const noTh = await run('flame', 6, { thermal: 'none' });
  check('no thermal data: FIRE (camera only) but never approvable', noTh.st.includes('fire') && !noTh.approve);
  const coldFlame = await run('flame', 6, { thermal: 'cold' });
  check('real flame seen through "glass" (cold thermal) is held at SUSPECT, never cleared', !coldFlame.st.includes('fire') && coldFlame.st.slice(30).every(s => s === 'suspect'));
  const layers = await page.evaluate(() => {
    const L = window.ManaraLab, sc = L.makeScene('shirt', 160, 120, 1), p = L.createPipeline({}); let o;
    for (let k = 0; k < 40; k++) o = p.push({ data: sc.frame(k), width: 160, height: 120 }, k * 1000 / 15, L.thermalGrid(sc.heat(k), k, 1));
    return { shape: o.layers[3].v, engine: o.engine.state };
  });
  check('layers are separable: sliding shirt is stopped by shape/texture, not by luck', layers.shape < 0.5, `shape ${layers.shape.toFixed(2)}, engine alone says ${layers.engine}`);

  section('1b. Thermal hotspot test (absolute + contextual), formulas, split, statistics');
  const th = await page.evaluate(() => {
    const L = window.ManaraLab, out = {};
    const g = (blobs, amb) => L.thermalGrid(blobs, 3, 1, amb);
    out.fire = L.hotspotTest(g([{ x: .5, y: .5, peak: 150, sigma: 1.6 }])).hot;
    out.mug = L.hotspotTest(g([{ x: .5, y: .5, peak: 65, sigma: 1.9 }])).hot;
    out.warm56 = L.hotspotTest(g([{ x: .5, y: .5, peak: 56, sigma: 1.9 }])).hot;
    out.cold = L.hotspotTest(g([])).hot;
    const hotRoom = new Float32Array(768).fill(60); out.hotRoom = L.hotspotTest(hotRoom).hot;
    out.sunWall = L.hotspotTest(g([{ x: .5, y: .5, peak: 59, sigma: 9 }], 40)).hot;
    return out;
  });
  check('hotspot: a flame (150 °C) is HOT', th.fire === true);
  check('hotspot: a hot mug (65 °C) is HOT (vision must decide)', th.mug === true);
  check('hotspot: 56 °C is below the absolute limit', th.warm56 === false);
  check('hotspot: a cold room is not hot', th.cold === false);
  check('hotspot: a uniformly 60 °C room fails the contextual test', th.hotRoom === false);
  const fm = await page.evaluate(() => {
    const L = window.ManaraLab;
    return { hi1: L.heatIndexC((90 - 32) * 5 / 9, 70) * 9 / 5 + 32, hi2: L.heatIndexC((96 - 32) * 5 / 9, 65) * 9 / 5 + 32, tw: L.stullWetBulb(40, 40), shade: L.wbgtEstimate(40, 40, 0), sun: L.wbgtEstimate(40, 40, 15),
      ban: [L.inBanWindow('2026-07-15', 13), L.inBanWindow('2026-09-16', 13), L.inBanWindow('2026-09-15', 10.5), L.inBanWindow('2026-07-15', 15.5), L.inBanWindow('2026-12-01', 12)], w: L.wilson(8, 10) };
  });
  check('NWS heat index reproduces the chart: 90 °F/70 % → 106, 96 °F/65 % → 121', Math.round(fm.hi1) === 106 && Math.round(fm.hi2) === 121, `${fm.hi1.toFixed(1)} / ${fm.hi2.toFixed(1)}`);
  check('Stull wet bulb at 40 °C / 40 % ≈ 28.6 °C', Math.abs(fm.tw - 28.6) < 0.1, fm.tw.toFixed(2));
  check('WBGT estimate 40 °C/40 %: ≈ 32.0 in shade, ≈ 35.0 with ΔTg = 15', Math.abs(fm.shade - 32.0) < 0.1 && Math.abs(fm.sun - 35.0) < 0.1, `${fm.shade.toFixed(2)} / ${fm.sun.toFixed(2)}`);
  check('Qatar midday-ban window: 10:00–15:30, 1 June–15 Sept', fm.ban.join() === 'true,false,true,false,false', fm.ban.join());
  check('Wilson interval for 8/10 ≈ 0.49–0.94', Math.abs(fm.w[0] - 0.490) < 0.01 && Math.abs(fm.w[1] - 0.943) < 0.01, fm.w.map(v => v.toFixed(3)).join('–'));
  const sp = await page.evaluate(() => {
    const L = window.ManaraLab, ids = a => Array.from({ length: a }, (_, i) => 'x' + i), strata = [ids(6), ids(2).map(s => 's' + s), ids(8).map(s => 'n' + s)];
    const a = L.splitIds(strata, 2026), b = L.splitIds(strata, 2026), c = L.splitIds(strata, 7);
    return { same: JSON.stringify(a) === JSON.stringify(b), diff: JSON.stringify(a) !== JSON.stringify(c), held: strata.map(s => s.filter(i => a[i] === 'held').length), n: strata.map(s => s.length) };
  });
  check('split: same seed → identical split; another seed → different', sp.same && sp.diff);
  check('split: stratified (every class has tuned-on and held-out members)', sp.held.every((h, i) => h >= 1 && h < sp.n[i]), `held ${sp.held} of ${sp.n}`);
  check('page core ran with no console errors', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

// ======================================================================= 2. loads clean, tabs, overflow
section('2. Page loads clean (ar/en × dark/light), tabs, overflow at 390 and 1440');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) {
  const { page, errors } = await open({ lang, theme, width: 1280 });
  const info = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, theme: document.documentElement.dataset.theme, title: document.title,
    tabs: [...document.querySelectorAll('[role=tab]')].map(t => [t.id, t.getAttribute('aria-selected'), t.getAttribute('aria-controls')]), list: !!document.querySelector('[role=tablist]'),
    visiblePanels: [...document.querySelectorAll('[role=tabpanel]')].filter(p => !p.hidden).map(p => p.id), view: document.getElementById('live-view').width }));
  check(`${lang}/${theme}: loads clean, dir and theme applied`, errors.length === 0 && info.dir === (lang === 'ar' ? 'rtl' : 'ltr') && info.theme === theme && info.lang === lang, errors.join(' | '));
  check(`${lang}/${theme}: 4 ARIA tabs, one selected, one visible panel`, info.list && info.tabs.length === 4 && info.tabs.filter(t => t[1] === 'true').length === 1 && info.visiblePanels.join() === 'p-live');
  if (theme === 'dark') check(`${lang}: the title follows the language`, lang === 'ar' ? /مختبر الأدلة/.test(info.title) : /Evidence Lab/.test(info.title), info.title);
  await page.context().close();
}
{
  const { page } = await open();
  await page.focus('#t-live'); await page.keyboard.press('ArrowRight');
  const afterRight = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('End'); const afterEnd = await page.evaluate(() => [document.activeElement.id, document.getElementById('p-sensor').hidden]);
  check('keyboard: arrow keys move between tabs (LTR: → = next)', afterRight === 't-fool', afterRight);
  check('keyboard: End jumps to the last tab and shows its panel', afterEnd[0] === 't-sensor' && afterEnd[1] === false, afterEnd.join());
  await page.context().close();
}
for (const [lang, theme, w] of [['ar', 'dark', 390], ['en', 'light', 390], ['ar', 'light', 1440], ['en', 'dark', 1440]]) {
  const { page, errors } = await open({ lang, theme, width: w, height: w < 600 ? 844 : 900 });
  const bad = [];
  for (const t of ['live', 'fool', 'decoy', 'sensor']) {
    await page.click('#t-' + t);
    if (t === 'decoy') await page.waitForFunction(() => window.__decoyDone === true, null, { timeout: 60000 }); else await page.waitForTimeout(700);
    if (t === 'sensor') for (const h of ['flood', 'heat', 'dust', 'sos', 'gas']) { await page.click('#sl-chip-' + h); await page.waitForTimeout(300); const o = await overflow(page); if (o.scrollW > o.W + 1 || o.bad.length) bad.push(`${t}/${h} ${o.scrollW}>${o.W} ${o.bad.join(' ')}`); }
    const o = await overflow(page); if (o.scrollW > o.W + 1 || o.bad.length) bad.push(`${t} ${o.scrollW}>${o.W} ${o.bad.join(' ')}`);
  }
  await page.evaluate(() => { document.getElementById('drawer').open = true; }); await page.waitForTimeout(200);
  const od = await overflow(page); if (od.scrollW > od.W + 1 || od.bad.length) bad.push(`drawer ${od.scrollW}>${od.W} ${od.bad.join(' ')}`);
  check(`${lang}/${theme} ${w}px: no horizontal overflow on any tab or in the drawer`, bad.length === 0, bad.join(' | '));
  check(`${lang}/${theme} ${w}px: no console errors while visiting every tab`, errors.length === 0, errors.join(' | '));
  await page.context().close();
}

// ======================================================================= 3. LIVE
section('3. LIVE — flame → FIRE → two keys → Approve → "detection" message');
{
  const ctx = await newCtx();
  const { page, errors } = await open({ context: ctx });
  const other = await ctx.newPage();                                   // a second MANARA tab, to check that the bus delivers the message
  await other.goto(url('index.html')); await other.waitForFunction(() => window.__manaraReady === true);
  await other.evaluate(() => { window.__msgs = []; window.Manara.link.on(m => window.__msgs.push(m)); });
  await page.bringToFront();
  check('the flame scene starts by itself (zero setup)', await page.evaluate(() => ManaraEvidence.live.stage.st.kind === 'scene' && ManaraEvidence.live.stage.st.playing));
  check('flame → FIRE within 9 s', await waitState(page, 'fire', 9000));
  await sleep(1200);
  const ls = await lampStates(page);
  check('lamps C1–C5 lit and C6 lit (thermal hot)', ls.join() === 'on,on,on,on,on,on', ls.join());
  const keys = await page.evaluate(() => ['k-vision', 'k-thermal', 'k-human'].map(k => document.getElementById('live-' + k).getAttribute('data-on')));
  check('keys: vision ✓, thermal ✓, human ✗ — ladder CONFIRMED', keys.join() === '1,1,0' && await page.$eval('#live-ladder', e => e.getAttribute('data-level')) === 'confirmed', keys.join());
  check('Approve is enabled only with two keys', await page.$eval('#live-approve', e => !e.disabled));
  const perf = await page.evaluate(() => [document.getElementById('live-fps').textContent, document.getElementById('live-ms').textContent]);
  check('fps and ms/frame are shown', /\d/.test(perf[0]) && /\d/.test(perf[1]), perf.join(' / '));
  const blank = await page.evaluate(() => { const c = document.getElementById('live-view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 97) s.add(d[i] >> 4); return s.size; });
  check('the video canvas shows a picture (not blank)', blank > 4, `${blank} tones`);
  await page.click('#live-approve'); await sleep(500);
  const msg = await page.evaluate(() => JSON.parse(localStorage.getItem('manara-last-detection') || 'null'));
  check('Approve sends a "detection" message (type, source, state, confidence, ratios)', msg && msg.type === 'detection' && msg.source === 'video' && msg.state === 'fire' && msg.confidence > 0.5 && msg.fireRatio > 0 && typeof msg.smokeRatio === 'number', JSON.stringify(msg && { ...msg, snapshot: undefined }));
  check('the message carries a JPEG snapshot of at most 40 kB', msg && /^data:image\/jpeg;base64,/.test(msg.snapshot || '') && (msg.snapshot.length - 23) * 3 / 4 <= 40000, msg && msg.snapshot ? `${Math.round((msg.snapshot.length - 23) * 3 / 4 / 1000)} kB` : 'no snapshot');
  check('the human key lights and the ladder reaches PUBLIC ALERT', await page.$eval('#live-k-human', e => e.getAttribute('data-on')) === '1' && await page.$eval('#live-ladder', e => e.getAttribute('data-level')) === 'alert');
  await sleep(600);
  const got = await other.evaluate(() => window.__msgs.filter(m => m.type === 'detection').map(m => m.state));
  check('another MANARA tab receives the message over Manara.link', got.includes('fire'), `received ${JSON.stringify(got)}`);
  await page.click('#live-stand'); await sleep(300);
  const msg2 = await page.evaluate(() => JSON.parse(localStorage.getItem('manara-last-detection')));
  check('Stand down sends a "clear" detection', msg2.state === 'clear' && await page.$eval('#live-k-human', e => e.getAttribute('data-on')) === '0');
  check('the log records the state changes', (await page.$$eval('#live-log li', l => l.length)) >= 2);
  check('LIVE ran without console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

section('3b. LIVE — decoys never reach FIRE; vision says fire, thermal says no');
{
  const { page, errors } = await open();
  await page.click('#live-sc-shirt');
  const seen = await sampleStates(page, 6000);
  check('red shirt sweeping across: never FIRE (6 s sampled)', !seen.has('fire'), [...seen].join());
  check('the shirt is stopped for a stated reason (not just "no colour")', /slides|moves|flicker|smooth/i.test(await page.$eval('#live-why', e => e.textContent)) || seen.has('clear'));
  await page.click('#live-sc-flicker'); await sleep(300);
  check('10 Hz lamp: a photosensitivity warning appears first and the scene waits', await page.$eval('#live-warn', e => !e.hidden) && await page.evaluate(() => ManaraEvidence.live.stage.st.sceneId !== 'flicker'));
  await page.click('#live-warn-ok'); await sleep(300);
  check('after "Start anyway" the lamp scene runs', await page.evaluate(() => ManaraEvidence.live.stage.st.sceneId === 'flicker' && ManaraEvidence.live.stage.st.playing));
  const seenL = await sampleStates(page, 6000);
  check('10 Hz flickering lamp: never FIRE (6 s sampled)', !seenL.has('fire'), [...seenL].join());
  await page.click('#live-sc-phonefire');
  check('fire video on a phone: lamps C1–C5 lit, C6 says VETO …', await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 9000) { const l = await lampStates(page); if (l.join() === 'on,on,on,on,on,veto') return true; await sleep(150); } return false; })());
  check('… the verdict stays SUSPECT and says "thermal veto"', await stateOf(page) === 'suspect' && /veto|نقض/i.test(await page.$eval('#live-vstate', e => e.textContent)));
  check('… Approve stays disabled (vision alone is never a public alert)', await page.$eval('#live-approve', e => e.disabled));
  await page.click('#live-sc-smoke');
  check('drifting smoke scene → SMOKE state (grey haze that drifts and softens)', await waitState(page, 'smoke', 9000));
  check('smoke: one key only (vision) — SUSPECT ladder, Approve disabled, never FIRE', await page.$eval('#live-approve', e => e.disabled) && (await page.$eval('#live-ladder', e => e.getAttribute('data-level'))) === 'suspect' && !(await sampleStates(page, 1500)).has('fire'));
  await page.click('#live-sc-flame'); await waitState(page, 'fire', 9000); await sleep(800);
  await page.selectOption('#live-th-mode', 'cold');
  check('flame with a cold thermal camera → SUSPECT + veto (glass hides heat; never auto-cleared)', await waitState(page, 'suspect', 4000) && (await lampStates(page))[5] === 'veto');
  await page.uncheck('#live-veto');
  check('veto switched off → camera-only FIRE …', await waitState(page, 'fire', 4000));
  check('… still not approvable, and says so', await page.$eval('#live-approve', e => e.disabled) && /camera only|كاميرا فقط/i.test(await page.$eval('#live-vstate', e => e.textContent)));
  await page.check('#live-veto'); await page.selectOption('#live-th-mode', 'auto');
  check('veto back on, thermal auto → FIRE confirmed again (Approve enabled)', await waitFor(async () => await stateOf(page) === 'fire' && await page.$eval('#live-approve', e => !e.disabled), 8000));
  await page.selectOption('#live-th-mode', 'off'); await sleep(900);
  check('no thermal data → C6 shows "no thermal data" (N/A) and the verdict is camera-only', (await lampStates(page))[5] === 'na');
  await setRange(page, '#live-tau', 55); await setRange(page, '#live-tau', 25);
  check('τ slider updates its label and the detector keeps running', await page.$eval('#live-tau-v', e => e.textContent) === '25');
  await page.click('#live-conf-up'); await page.click('#live-conf-up');
  check('confirm-frames stepper works', await page.$eval('#live-conf', e => e.value) === '10');
  check('no console errors in the decoy checks', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

section('3c. LIVE — reduced motion: paused start, no flashing, honest');
{
  const { page, errors } = await open({ reducedMotion: 'reduce' });
  const st0 = await page.evaluate(() => ({ playing: ManaraEvidence.live.stage.st.playing, cover: !document.getElementById('live-cover').hidden, frames: ManaraEvidence.live.stage.st.frames, state: document.getElementById('live-verdict').dataset.state }));
  await sleep(1500);
  const st1 = await page.evaluate(() => ManaraEvidence.live.stage.st.frames);
  check('reduced motion: the stage starts paused with a Play cover and a computed frame', !st0.playing && st0.cover && st0.state === 'fire', JSON.stringify(st0));
  check('reduced motion: no frames advance until the user presses Play', st1 === st0.frames, `${st0.frames} → ${st1}`);
  await page.click('#live-sc-flicker'); await sleep(500);
  check('reduced motion: the flashing lamp needs no scary gate — it is analysed hidden', await page.$eval('#live-warn', e => e.hidden) && await page.evaluate(() => ManaraEvidence.live.stage.st.hidden));
  check('reduced motion: the page says the display is frozen', /reduced-motion|تقليل الحركة/.test(await page.$eval('#live-srcnote', e => e.textContent)));
  const shots = []; for (let i = 0; i < 8; i++) { shots.push(await page.evaluate(() => { const c = document.getElementById('live-view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 53) h = (h * 31 + d[i]) | 0; return h; })); await sleep(170); }
  check('reduced motion: the displayed lamp picture never flashes (8 samples identical)', new Set(shots).size === 1, shots.join());
  check('reduced motion: the analysis still runs (frames advance, lamps respond)', await page.evaluate(() => ManaraEvidence.live.stage.st.frames > 5));
  check('reduced motion: no console errors', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

section('3d. LIVE — camera (fake device), permission denied, no camera, picture and video upload');
{
  const { page, errors } = await open();
  await page.click('#live-cam');
  check('camera: the fake device starts', await page.waitForFunction(() => ManaraEvidence.live.stage.st.kind === 'camera' && ManaraEvidence.live.stage.st.frames > 10, null, { timeout: 8000 }).then(() => true, () => false));
  await sleep(1500);
  const cam = await page.evaluate(() => { const c = document.getElementById('live-view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 101) s.add((d[i] >> 5) + ',' + (d[i + 1] >> 5)); return { tones: s.size, fps: document.getElementById('live-fps').textContent, note: document.getElementById('live-srcnote').textContent, w: c.width, h: c.height }; });
  check('camera: picture on canvas, fps measured, detector size ≤ 320 px wide', cam.tones > 2 && /\d/.test(cam.fps) && cam.w <= 320, JSON.stringify(cam));
  check('camera: a camera trial never crashes the page', errors.length === 0, errors.join(' | '));
  await page.context().close();
  for (const [name, init, expect] of [
    ['permission denied', `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no','NotAllowedError'));`, /denied|رُفض/i],
    ['no camera on the device', `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('none','NotFoundError'));`, /No camera|لا توجد كاميرا/i],
    ['no mediaDevices API at all', `Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });`, /No camera|لا توجد كاميرا/i]]) {
    const ctx = await newCtx(); await ctx.addInitScript(init);
    const { page: p2, errors: e2 } = await open({ context: ctx });
    await p2.click('#live-cam'); await sleep(600);
    const r = await p2.evaluate(() => ({ note: document.getElementById('live-srcnote').textContent, kind: document.getElementById('live-srcnote').getAttribute('data-kind'), src: ManaraEvidence.live.stage.st.kind, playing: ManaraEvidence.live.stage.st.playing }));
    check(`camera ${name}: a clear message and the built-in scene keeps running`, expect.test(r.note) && r.kind === 'error' && r.src === 'scene' && r.playing, JSON.stringify(r));
    check(`camera ${name}: no console errors`, e2.length === 0, e2.join(' | '));
    await ctx.close();
  }
  const { page: p3, errors: e3 } = await open();
  await p3.setInputFiles('#live-file', path.join(SITE, 'assets/samples/fire-1.jpg')); await sleep(900);
  const im = await p3.evaluate(() => ({ kind: ManaraEvidence.live.stage.st.kind, lamps: [...document.querySelectorAll('#live-lamps li')].map(l => l.dataset.state), why: document.getElementById('live-why').textContent, state: document.getElementById('live-verdict').dataset.state, playDisabled: document.getElementById('live-play').disabled }));
  check('picture upload: only C1 and C4 exist, C2/C3/C5/C6 say N/A', im.kind === 'image' && im.lamps[1] === 'na' && im.lamps[2] === 'na' && im.lamps[4] === 'na' && im.lamps[5] === 'na' && im.lamps[0] === 'on', im.lamps.join());
  check('a still picture can be at most SUSPECT, and says why', im.state === 'suspect' && /still|ثابتة/i.test(im.why), `${im.state}: ${im.why}`);
  const b64 = await p3.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'), rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' }), ch = []; rec.ondataavailable = e => ch.push(e.data); rec.start(); let i = 0;
    const t = setInterval(() => { g.fillStyle = '#202830'; g.fillRect(0, 0, 320, 240); g.fillStyle = `rgb(255,${120 + 60 * Math.sin(i / 2)},30)`; g.beginPath(); g.arc(160 + 30 * Math.sin(i / 3), 140, 36 + 6 * Math.sin(i), 0, 7); g.fill(); i++; }, 66);
    await new Promise(r => setTimeout(r, 1800)); clearInterval(t); const stopped = new Promise(r => { rec.onstop = r; }); rec.stop(); await stopped;
    const buf = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = ''; for (let k = 0; k < buf.length; k += 8192) s += String.fromCharCode.apply(null, buf.subarray(k, k + 8192)); return btoa(s);
  });
  const vf = path.join(os.tmpdir(), `manara-test-${process.pid}.webm`); fs.writeFileSync(vf, Buffer.from(b64, 'base64'));
  await p3.setInputFiles('#live-file', vf);
  check('video upload: the file plays and frames are analysed', await p3.waitForFunction(() => ManaraEvidence.live.stage.st.kind === 'video' && ManaraEvidence.live.stage.st.frames > 6, null, { timeout: 9000 }).then(() => true, () => false));
  check('video upload: a fire-coloured blob with a cold thermal camera is never a confirmed FIRE', !(await sampleStates(p3, 2500)).has('fire'));
  fs.unlinkSync(vf);
  check('uploads: no console errors', e3.length === 0, e3.join(' | '));
  await p3.context().close();
}

section('3e. LIVE — Web Serial (mocked twin board), protocol v1');
{
  const ctx = await newCtx();
  await ctx.addInitScript(() => {
    window.__ser = { hot: true }; const enc = new TextEncoder();
    const grid = hot => { const t = new Array(768).fill(272); if (hot) for (let y = 9; y < 12; y++) for (let x = 19; x < 22; x++) t[y * 32 + x] = 880; return t; };
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort: async () => ({ open: async () => {}, close: async () => {}, readable: { getReader() {
      return { cancel: async () => {}, read: () => new Promise(res => setTimeout(() => res({ done: false, value: enc.encode(JSON.stringify({ v: 1, type: 'grid', w: 32, h: 24, t10: grid(window.__ser.hot) }) + '\n' + JSON.stringify({ v: 1, type: 'frame', ms: 1, thermal: { tmax: window.__ser.hot ? 88 : 27.5, tmean: 27.2 } }) + '\n') }), 120)) };
    } } }) } });
  });
  const { page, errors } = await open({ context: ctx });
  check('Web Serial UI is offered when the API exists', await page.$eval('#live-ser-row', e => !e.hidden));
  await page.click('#live-ser'); await sleep(900);
  const r = await page.evaluate(() => ({ mode: document.getElementById('live-th-mode').value, src: document.getElementById('live-th-src').textContent, st: document.getElementById('live-ser-st').textContent, verdict: document.getElementById('live-th-verdict').textContent }));
  check('connecting switches the thermal source to LIVE and parses the grid frames', r.mode === 'live' && /LIVE/.test(r.src) && /connected|موصول/i.test(r.st), JSON.stringify(r));
  check('live board with a hotspot + flame on screen → CONFIRMED FIRE', await waitState(page, 'fire', 9000) && await page.$eval('#live-approve', e => !e.disabled));
  await page.evaluate(() => { window.__ser.hot = false; });
  check('live board goes cold → thermal veto → SUSPECT', await waitState(page, 'suspect', 6000) && (await lampStates(page))[5] === 'veto');
  check('Web Serial: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  const ctx2 = await newCtx(); await ctx2.addInitScript(() => { Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined }); });
  const { page: p2 } = await open({ context: ctx2 });
  check('Web Serial is hidden when the browser does not offer it', await p2.$eval('#live-ser-row', e => e.hidden) && await p2.$$eval('#live-th-mode option', o => !o.some(x => x.value === 'live')));
  await p2.context().close();
}

// ======================================================================= 4. FOOL ME IF YOU CAN
section('4. FOOL ME IF YOU CAN — trials, scoreboard, CSV');
{
  const ctx = await newCtx();
  const { page, errors } = await open({ context: ctx });
  await page.click('#t-fool'); await sleep(500);
  check('booth trials are labelled as separate from the lab trials', /booth|الجناح/i.test(await page.$eval('#p-fool .trial .tag', e => e.textContent)));
  const items = await page.$$eval('#fool-showed option', o => o.map(x => x.value));
  check('the decoy list has scarf, flashlight, LED lamp, fire video on a phone, orange wall', ['scarf', 'flashlight', 'led', 'phonefire', 'wall'].every(v => items.includes(v)), items.join());
  await page.selectOption('#fool-dur', '3'); await page.selectOption('#fool-showed', 'phonefire');
  check('choosing what you show switches to the matching code scene', await page.evaluate(() => ManaraEvidence.fool.stage.st.sceneId === 'phonefire'));
  await page.click('#fool-run'); await sleep(500);
  check('a trial shows a progress bar and disables the button', await page.$eval('#fool-prog', e => !e.hidden) && await page.$eval('#fool-run', e => e.disabled));
  await page.waitForSelector('#fool-result:not([hidden]) .res-col', { timeout: 9000 });
  const res = await page.$$eval('#fool-result .res-col', c => c.map(x => [x.className, x.textContent]));
  check('result: colour-only is fooled, the full C1–C6 pipeline is not', /bad/.test(res[0][0]) && /good/.test(res[1][0]), JSON.stringify(res));
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('manara-booth-trials') || '[]'));
  check('the attempt is stored (what I showed, C1-only vs full, thermal source)', rows.length === 1 && rows[0].showed === 'phonefire' && rows[0].c1 === true && rows[0].peak !== 'fire' && rows[0].veto === true && rows[0].thSrc === 'SIM' && rows[0].decoy === true, JSON.stringify(rows[0]));
  await page.selectOption('#fool-showed', 'flame'); await page.click('#fool-run');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('manara-booth-trials') || '[]').length === 2, null, { timeout: 9000 });
  const rows2 = await page.evaluate(() => JSON.parse(localStorage.getItem('manara-booth-trials')));
  check('the real-flame control is detected and counted as a detection, not a fooling', rows2[1].decoy === false && rows2[1].peak === 'fire' && rows2[1].fooledFull === false);
  const kpis = await page.$$eval('#fool-kpis .kpi b', b => b.map(x => x.textContent));
  check('scoreboard KPIs update (2 trials, 1/1 colour-only fooled, 0/1 full fooled, control 1/1)', kpis[0] === '2' && kpis[1] === '1/1' && kpis[2] === '0/1' && kpis[3] === '1/1', kpis.join());
  check('scoreboard table lists what was shown', (await page.$$eval('#fool-table tbody tr', r => r.length)) === 2);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fool-csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split('\n');
  check('CSV export: header + one row per trial, expected columns', csv.length === 3 && csv[0].startsWith('time_utc,showed,is_decoy,source,thermal_mode,thermal_source,colour_only_alarm,peak_state_full') && /phonefire,true,code-scene/.test(csv[1]), csv.slice(0, 2).join(' // '));
  await page.reload(); await ready(page); await page.click('#t-fool');
  check('the scoreboard survives a reload (localStorage)', (await page.$$eval('#fool-kpis .kpi b', b => b[0].textContent)) === '2');
  await page.click('#fool-clear'); check('"Clear scoreboard" needs a second press to confirm', (await page.evaluate(() => JSON.parse(localStorage.getItem('manara-booth-trials')).length)) === 2);
  await page.click('#fool-clear'); check('… then it clears', (await page.evaluate(() => JSON.parse(localStorage.getItem('manara-booth-trials')).length)) === 0);
  check('FOOL ME: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{ // localStorage blocked: the page must still work
  const ctx = await newCtx(); await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
  const { page, errors } = await open({ context: ctx });
  await page.click('#t-fool'); await page.selectOption('#fool-dur', '3'); await page.click('#fool-run');
  await page.waitForSelector('#fool-result:not([hidden]) .res-col', { timeout: 9000 });
  check('with localStorage blocked the trial still runs and shows its result', true);
  check('… without console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 5. DECOY LAB
section('5. DECOY LAB — ablation, held-out numbers, ROC, split, honest reference');
{
  const ctx = await newCtx(); const { page, errors } = await open({ context: ctx, width: 1280 });
  await page.click('#t-decoy'); const t0 = Date.now();
  await page.waitForFunction(() => window.__decoyDone === true, null, { timeout: 70000 });
  console.log(`  info benchmark finished in ${((Date.now() - t0) / 1000).toFixed(1)} s (foreground)`);
  const rows = await page.$$eval('#dl-abl tbody tr', trs => trs.map(tr => [tr.querySelector('th').textContent, ...[...tr.querySelectorAll('td')].map(td => td.textContent.trim())]));
  check('ablation table: six rows C1, +C2 … +C6', rows.length === 6 && /C1/.test(rows[0][0]) && /C6/.test(rows[5][0]), rows.map(r => r[0]).join(' | '));
  check('held-out cells show k/n counts with a confidence interval', rows.every(r => /^\d+\/\d+/.test(r[1]) && /^\d+\/\d+/.test(r[2])) && /CI/.test(rows[0][1]), rows[0].join(' | '));
  check('held-out numbers are in bold', (await page.$$eval('#dl-abl tbody td b.mono', b => b.length)) >= 10);
  check('for still photos only the defined layers have numbers (others say N/A for this stimulus)', rows[1][3].includes('N/A') && rows[2][3].includes('N/A') && rows[4][3].includes('N/A') && rows[5][3].includes('N/A') && /^\d+\/\d+/.test(rows[0][3]) && /^\d+\/\d+/.test(rows[3][3]), rows.map(r => r[3].slice(0, 12)).join(' | '));
  const rate = s => { const m = /^(\d+)\/(\d+)/.exec(s); return m ? +m[1] / +m[2] : NaN; };
  check('colour-only false alarms ≥ full-stack false alarms (layers help)', rate(rows[0][2]) >= rate(rows[5][2]) && rate(rows[0][2]) > rate(rows[5][2]), `${rows[0][2].slice(0, 6)} → ${rows[5][2].slice(0, 6)}`);
  check('full stack: detection stays at 100 % on the held-out clips', rate(rows[5][1]) === 1, rows[5][1]);
  const kp = await page.$$eval('#dl-kpis .kpi b', b => b.map(x => x.textContent));
  check('KPIs: τ*, held-out detection, held-out false alarms (full), held-out false alarms (colour only)', /^τ\* = \d+$/.test(kp[0]) && kp.slice(1).every(k => /^\d+\/\d+$/.test(k)), kp.join());
  const chips = await page.$$eval('#dl-split .chip', c => c.map(x => [x.textContent.trim(), x.classList.contains('held')]));
  const nHeld = chips.filter(c => c[1]).length;
  check('41 inputs are listed, ~30 % held-out, each clearly marked tuned-on / held-out', chips.length === 41 && nHeld >= 10 && nHeld <= 16, `${chips.length} inputs, ${nHeld} held-out`);
  const heldIds = chips.filter(c => c[1]).map(c => c[0]).join();
  const roc = await page.evaluate(() => { const c = document.getElementById('dl-roc'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 53) s.add((d[i] >> 5) + '' + (d[i + 1] >> 5) + (d[i + 2] >> 5)); return { tones: s.size, w: c.width }; });
  check('ROC-style τ-sweep canvas is drawn', roc.tones > 5, JSON.stringify(roc));
  check('the same data is available as a table (7 τ values)', (await page.$$eval('#dl-roc-table tbody tr', r => r.length)) === 7);
  check('16 photos are shown with their verdict and tuned/held-out mark', (await page.$$eval('#dl-photos .ph', p => p.length)) === 16 && (await page.$$eval('#dl-photos img', i => i.every(x => x.complete && x.naturalWidth > 0))));
  await page.fill('#dl-seed', '7'); await page.click('#dl-resplit'); await sleep(300);
  const heldIds2 = (await page.$$eval('#dl-split .chip.held', c => c.map(x => x.textContent.trim()))).join();
  check('another seed gives another split (the numbers move — small-sample honesty)', heldIds2 !== heldIds);
  await page.fill('#dl-seed', '2026'); await page.click('#dl-resplit'); await sleep(200);
  check('seed 2026 reproduces the first split exactly', (await page.$$eval('#dl-split .chip.held', c => c.map(x => x.textContent.trim()))).join() === heldIds);
  await page.check('#dl-tuned'); await sleep(200);
  check('"also show tuned-on numbers" adds the optimistic lines (marked tuned-on)', (await page.$$eval('#dl-abl .tuned', t => t.length)) >= 6);
  await page.uncheck('#dl-tuned');
  // reference numbers must equal the engine's own test output
  const out = execFileSync('node', [path.join(ROOT, 'tools/manara/test-fire.mjs')], { maxBuffer: 64 << 20 }).toString();
  const accs = [...out.matchAll(/accuracy (\d+)\/(\d+) = ([\d.]+) %.*?fire recall (\d+)\/(\d+)\s+false fire alarms (\d+)\/(\d+)/g)], last = accs[accs.length - 1];
  const cms = [...out.matchAll(/\n\s+smoke\s+(\d+)\s+(\d+)\s+(\d+)/g)], cm = cms[cms.length - 1];
  const refText = await page.$eval('.dl-ref', e => e.textContent.replace(/\s+/g, ' '));
  const expected = last && cm ? [`${last[1]}/${last[2]} = ${last[3]}%`, `${last[4]}/${last[5]}`, `${last[6]}/${last[7]}`, `${cm[2]}/${+cm[1] + +cm[2] + +cm[3]}`] : [];
  check('honest reference on the page equals the numbers printed by test-fire.mjs (never drifts)', expected.length === 4 && expected.every(x => refText.includes(x)), `expected ${expected.join(' · ')} in "${refText.slice(0, 220)}…"`);
  check('the reference says the 16 photos were seen during tuning (optimistic)', /optimistic|متفائلة/.test(refText));
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv-in')]);
  const c1 = fs.readFileSync(await d1.path(), 'utf8').trim().split('\n');
  check('CSV (every input): header + 41 rows with split and stage columns', c1.length === 42 && c1[0].includes('split') && c1[0].includes('plus_c6_thermal_veto') && c1.some(l => l.includes(',held-out,')), `${c1.length} lines`);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#dl-csv-abl')]);
  const c2 = fs.readFileSync(await d2.path(), 'utf8').trim().split('\n');
  check('CSV (ablation): held-out and tuned-on rows for six stacks', c2.length === 13 && c2.slice(1).some(l => l.startsWith('held-out,')) && c2.some(l => l.includes('N/A')), `${c2.length} lines`);
  check('DECOY LAB: no console errors', errors.length === 0, errors.join(' | '));
  // language switch re-renders the tables
  await page.evaluate(() => window.Manara.setLang('ar')); await sleep(400);
  check('switching to Arabic re-renders the lab in Arabic', /الاستئصال|الاكتشاف/.test(await page.$eval('#dl-abl', e => e.textContent)));
  await ctx.close();
}

// ======================================================================= 6. SENSOR LAB
section('6. SENSOR LAB — one key = SUSPECT, two keys = CONFIRMED, human = PUBLIC ALERT');
{
  const ctx = await newCtx(); const { page, errors } = await open({ context: ctx, width: 1280 });
  await page.click('#t-sensor'); await sleep(300);
  const tick = n => page.evaluate(n => { for (let i = 0; i < n; i++) ManaraEvidence.sensor.tick(); }, n);
  const level = () => page.$eval('#sl-ladder', e => e.getAttribute('data-level'));
  const keysOn = () => page.evaluate(() => ['sl-k1', 'sl-k2', 'sl-human'].map(id => document.getElementById(id).getAttribute('data-on')).join(''));
  const pick = async h => { await page.click('#sl-chip-' + h); await sleep(100); };
  // GAS
  await pick('gas'); await tick(20);
  check('gas: quiet at the start (CLEAR)', await level() === 'clear', await level());
  check('gas: five hazards offered (gas, flood, heat, dust, SOS)', (await page.$$eval('#sl-haz .chip', c => c.length)) === 5);
  await page.click('#sl-c-puff'); await tick(3);
  check('gas: a sanitiser puff lights key 1 only → SUSPECT (cross-sensitivity does not confirm)', await keysOn() === '100' && await level() === 'suspect', `${await keysOn()} ${await level()}`);
  check('gas: Approve is disabled with one key', await page.$eval('#sl-approve', e => e.disabled));
  await tick(25);
  await page.click('#sl-c-on'); await tick(40);
  check('gas: a real leak lights both independent keys → CONFIRMED', await level() === 'confirmed' && (await keysOn()).startsWith('11'), `${await keysOn()} ${await level()}`);
  check('gas: the thresholds table highlights the chosen gas', await page.$eval('#sl-thresh tr.hi', e => /LPG|البترول/.test(e.textContent)));
  await page.click('#sl-approve'); check('gas: the human key turns CONFIRMED into PUBLIC ALERT', await level() === 'alert' && await keysOn() === '111');
  await page.click('#sl-stand'); await page.click('#sl-reset'); await page.click('#sl-c-cold'); await tick(8);
  check('gas: a cold restart (warm-up) can light key 1 but never confirms', await level() !== 'confirmed' && await level() !== 'alert', await level());
  await page.selectOption('#sl-c-gas', 'h2s'); check('gas: switching to H₂S shows the H₂S row (warn 10 / danger 20 / critical 100 ppm)', await page.$eval('#sl-thresh tr.hi', e => /10/.test(e.textContent) && /100/.test(e.textContent) && /S47/.test(e.textContent)));
  // FLOOD
  await pick('flood'); await tick(5);
  check('flood: starts CLEAR', await level() === 'clear');
  await page.check('#sl-c-qmd'); await tick(2);
  check('flood: an official rain warning alone is key 2 only → SUSPECT', await keysOn() === '010' && await level() === 'suspect', `${await keysOn()} ${await level()}`);
  await setRange(page, '#sl-c-rain', 0.6); await tick(60);
  check('flood: rising water + the warning → CONFIRMED', await level() === 'confirmed', await level());
  await page.click('#sl-approve'); check('flood: Approve → PUBLIC ALERT', await level() === 'alert');
  await page.click('#sl-reset'); await page.uncheck('#sl-c-qmd'); await setRange(page, '#sl-c-rain', 0); await tick(3);
  await setRange(page, '#sl-c-temp', 45); await tick(10);
  check('flood: the speed-of-sound error at 45 °C is shown and bends the reading (negative error %)', parseFloat(await page.$$eval('#sl-readings .kpi b', b => b[2].textContent)) < -4);
  // HEAT
  await pick('heat'); await tick(5);
  check('heat: starts CLEAR (cool morning, outside the ban window)', await level() === 'clear', await keysOn());
  await setRange(page, '#sl-c-T', 44); await setRange(page, '#sl-c-rh', 55); await tick(10);
  check('heat: a hot, humid reading lights key 1 (WBGT estimate over the limit) → SUSPECT', await keysOn() === '100' && await level() === 'suspect', `${await keysOn()} ${await level()}`);
  await page.fill('#sl-c-date', '2026-07-15'); await setRange(page, '#sl-c-hour', 13); await tick(1);
  check('heat: inside 10:00–15:30 and 1 June–15 Sept the calendar key (key 2) lights → CONFIRMED', await keysOn() === '110' && await level() === 'confirmed', `${await keysOn()} ${await level()}`);
  check('heat: the WBGT readout says "estimate"', /estimate|تقدير/i.test(await page.$$eval('#sl-readings .kpi span', s => s.map(x => x.textContent).join(' '))));
  await page.click('#sl-approve'); check('heat: the supervisor approves → WORKER ALERT', await level() === 'alert');
  // DUST
  await pick('dust'); await tick(15);
  check('dust: starts CLEAR', await level() === 'clear', await level());
  await setRange(page, '#sl-c-storm', 0.6); await tick(25);
  check('dust: a storm lights PM10 and visibility → CONFIRMED, the sensor saturates (≥ 500)', await level() === 'confirmed' && /saturated|مشبع/i.test(await page.$$eval('#sl-readings .kpi b', b => b[2].textContent)), await level());
  // SOS
  await pick('sos'); await tick(3);
  check('sos: starts CLEAR', await level() === 'clear');
  await page.click('#sl-c-press'); await tick(2);
  check('sos: pressing the button is key 1 → SUSPECT', await keysOn() === '100' && await level() === 'suspect');
  await tick(31);
  check('sos: no answer to the check-in call within 30 s is key 2 → CONFIRMED', await level() === 'confirmed', `${await keysOn()} ${await level()}`);
  check('sos: the human step is the dispatcher, and the alert is a package for the control room', /dispatcher|المُرسِل/i.test(await page.$eval('#sl-approve', e => e.textContent)));
  await page.click('#sl-c-ok'); await tick(2);
  check('sos: answering the call ("I am OK") returns to CLEAR', await level() === 'clear', await level());
  await page.click('#sl-c-fall'); await tick(16);
  check('sos: a fall above the calibrated peak + 15 s stillness is key 1', (await keysOn())[0] === '1' && await level() === 'suspect', `${await keysOn()} ${await level()}`);
  // every hazard: thresholds table, limits note, chart drawn
  for (const h of ['gas', 'flood', 'heat', 'dust', 'sos']) {
    await pick(h); await tick(3);
    const r = await page.evaluate(() => { const c = document.getElementById('sl-chart'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 61) s.add((d[i] >> 5) + '' + (d[i + 1] >> 5)); return { tones: s.size, rows: document.querySelectorAll('#sl-thresh tbody tr').length, limit: document.getElementById('sl-limit').textContent.length, sim: !!document.querySelector('#sl-body .tag.cool') }; });
    check(`${h}: chart drawn, thresholds with source and basis, a limitations note, labelled SIM`, r.tones > 3 && r.rows >= 3 && r.limit > 80 && r.sim, JSON.stringify(r));
  }
  check('thresholds show source ids and a basis tag (cited / derived / student-set)', await page.evaluate(() => { const t = document.getElementById('sl-thresh').textContent; return /S\d\d/.test(t) && /cited|مستشهد/.test(t) && /student-set|يضبطه/.test(t); }));
  check('SENSOR LAB: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await done(browser);
