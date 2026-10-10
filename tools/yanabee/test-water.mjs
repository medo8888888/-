// Browser test of the home-hero water surface (js/water.js): WebGL path, 2D fallback, reduced motion, phone.
//   node tools/yanabee/test-water.mjs
// Headless Chromium gets WebGL through SwiftShader (software), so the shader path is exercised for real, only
// slowly. When a machine has no WebGL at all the WebGL section asserts the 2D fallback instead and says so.
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// water: the debug knobs read by water.js ({ gl: 'auto' | 'force' | 'off', guard: bool }); `pre` runs before the page scripts
async function open(ctxOpts = {}, water = {}, pre = null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...ctxOpts });
  await ctx.addInitScript(w => { window.YANABEE_WATER = w; try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ } }, water);
  if (pre) await ctx.addInitScript(pre);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url('index.html'));
  return { ctx, p, errs };
}
const waterOn = (p, ms = 15000) => p.waitForFunction(() => document.documentElement.classList.contains('water-on'), null, { timeout: ms }).then(() => true, () => false);
const Y = (p, fn, arg) => p.evaluate(fn, arg);
const heroBox = p => p.evaluate(() => { const r = document.querySelector('.hero-home').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const spread = a => (a && a.length ? Math.max(...a) - Math.min(...a) : 0);
const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

console.log('water: WebGL surface behind the home hero');
{
  const { ctx, p, errs } = await open({ colorScheme: 'dark' }, { gl: 'force', guard: false });
  check('markup: an aria-hidden canvas[data-water] sits in the hero', await Y(p, () => { const c = document.querySelector('.hero-home canvas.water[data-water]'); return !!c && c.getAttribute('aria-hidden') === 'true'; }));
  check('html.water-on appears once the first frame has rendered', await waterOn(p));
  const mode = await Y(p, () => window.YanabeeWater && window.YanabeeWater.mode);
  const gl = mode === 'webgl';
  if (!gl) console.log(`  note: WebGL is unavailable in this browser (mode "${mode}") - asserting the 2D fallback instead`);
  check('a renderer is running (webgl, or 2d when WebGL is missing)', mode === 'webgl' || mode === '2d', String(mode));
  const geo = await Y(p, () => {
    const c = document.querySelector('canvas[data-water]'), h = document.querySelector('.hero-home'), cs = getComputedStyle(c);
    const cr = c.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const copy = document.querySelector('.hero-copy').getBoundingClientRect();
    const top = document.elementFromPoint(copy.left + copy.width / 2, copy.top + 20);
    return { pos: cs.position, pe: cs.pointerEvents, z: cs.zIndex, dw: Math.abs(cr.width - hr.width), dh: Math.abs(cr.height - hr.height), mask: cs.maskImage || cs.webkitMaskImage, notCanvas: top !== c };
  });
  check('canvas covers the hero, behind everything, ignores the pointer', geo.pos === 'absolute' && geo.pe === 'none' && +geo.z < 0 && geo.dw < 1.5 && geo.dh < 1.5 && geo.notCanvas, JSON.stringify(geo));
  check('canvas bottom edge fades into the page (mask)', /gradient/.test(geo.mask || ''), String(geo.mask));
  check('the flat gradient and blobs hand over to the water', await p.waitForFunction(() => { const cs = getComputedStyle(document.querySelector('.hero-home .hero-bg')); return cs.opacity === '0' || cs.visibility === 'hidden'; }, null, { timeout: 15000 }).then(() => true, () => false) === gl);

  // the canvas holds a picture
  const grid = await Y(p, () => window.YanabeeWater.probe(24, 14));
  check('canvas is not blank (luma spread across the grid)', !!grid && spread(grid) >= 12 && mean(grid) > 3, grid ? `spread ${spread(grid)} mean ${mean(grid).toFixed(1)}` : 'no data');

  // a drop changes pixels around it and nowhere else
  const d = await Y(p, () => {
    const W = window.YanabeeWater; W.pause(); W.clear();
    const c = document.querySelector('canvas[data-water]'), r = c.getBoundingClientRect();
    const x = r.left + r.width * 0.3, y = r.top + r.height * 0.45;
    const ok = W.drop(x, y, 1);
    const t = W.now() + 0.9;
    const withDrop = W.probe(24, 14, t);
    W.clear();
    const without = W.probe(24, 14, t);
    return { ok, withDrop, without, W: c.clientWidth, H: c.clientHeight, x: r.width * 0.3, y: r.height * 0.45 };
  });
  const near = [], far = [];
  for (let j = 0; j < 14; j++) for (let i = 0; i < 24; i++) {
    const cx = (i + 0.5) / 24 * d.W, cy = (j + 0.5) / 14 * d.H, dist = Math.hypot(cx - d.x, cy - d.y);
    const diff = Math.abs(d.withDrop[j * 24 + i] - d.without[j * 24 + i]);
    if (dist < 330) near.push(diff); else if (dist > 760) far.push(diff);
  }
  check('YanabeeWater.drop() returns true and a ripple changes the pixels around it', d.ok === true && mean(near) > 3, `near ${mean(near).toFixed(1)}`);
  check('... and leaves distant water untouched', mean(far) < 1.5 && mean(near) > 2 * mean(far) + 1, `far ${mean(far).toFixed(2)}`);

  // yanabee:drop (client coordinates) from other modules
  const ev = await Y(p, () => {
    const W = window.YanabeeWater; W.clear();
    const before = W.active;
    window.dispatchEvent(new CustomEvent('yanabee:drop', { detail: { x: 500, y: 300, strength: 0.9 } }));
    const after = W.active;
    window.dispatchEvent(new CustomEvent('yanabee:drop', { detail: { x: 'bad' } })); // ignored, no throw
    return { before, after, after2: W.active };
  });
  check('the yanabee:drop event spawns ripples (and ignores junk)', ev.before === 0 && ev.after >= 1 && ev.after2 === ev.after, JSON.stringify(ev));

  // pause / resume
  check('pause() stops the loop', await Y(p, () => { window.YanabeeWater.pause(); return window.YanabeeWater.running === false; }));
  const f0 = await Y(p, () => window.YanabeeWater.frames);
  await p.waitForTimeout(900);
  check('... no frames while paused', await Y(p, () => window.YanabeeWater.frames) === f0);
  await Y(p, () => window.YanabeeWater.resume());
  check('resume() restarts it', await p.waitForFunction(f => window.YanabeeWater.running && window.YanabeeWater.frames > f, f0, { timeout: 20000 }).then(() => true, () => false));

  // pointer: wake while moving, big ripple + echo on press
  const hb = await heroBox(p);
  await Y(p, () => window.YanabeeWater.clear());
  const sx = hb.x + hb.w * 0.2, sy = hb.y + 140;
  await p.mouse.move(sx, sy);
  for (let i = 1; i <= 14; i++) { await p.mouse.move(sx + i * 70, sy + Math.sin(i / 2) * 40); await p.waitForTimeout(45); }
  const wake = await Y(p, () => window.YanabeeWater.active);
  check('moving the pointer over the hero spawns a wake of ripples', wake >= 3, String(wake));
  await Y(p, () => window.YanabeeWater.clear());
  await p.mouse.move(hb.x + 90, hb.y + 140);
  await p.mouse.down(); await p.mouse.up();
  const press = await Y(p, () => window.YanabeeWater.active);
  check('pressing makes a big ripple plus its ring echo', press >= 2, String(press));

  // paused while the hero is off-screen, alive again when it comes back
  await Y(p, () => window.scrollTo({ top: 5000, behavior: 'instant' }));
  check('scrolled away: the loop stops', await p.waitForFunction(() => window.YanabeeWater.running === false, null, { timeout: 8000 }).then(() => true, () => false));
  const f1 = await Y(p, () => window.YanabeeWater.frames);
  await p.waitForTimeout(800);
  check('... and renders no frames', await Y(p, () => window.YanabeeWater.frames) === f1);
  await Y(p, () => window.scrollTo({ top: 0, behavior: 'instant' }));
  check('scrolled back: it runs again', await p.waitForFunction(f => window.YanabeeWater.running && window.YanabeeWater.frames > f, f1, { timeout: 20000 }).then(() => true, () => false));

  // background tab
  await Y(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('hidden tab: the loop stops', await Y(p, () => window.YanabeeWater.running === false));
  await Y(p, () => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  check('visible tab: it runs again', await Y(p, () => window.YanabeeWater.running === true));

  // theme: refreshes from the tokens right away
  const darkMean = mean(await Y(p, () => window.YanabeeWater.probe(16, 9)));
  await Y(p, () => window.YanabeeTheme.set('light'));
  await p.waitForTimeout(300);
  const lightMean = mean(await Y(p, () => window.YanabeeWater.probe(16, 9)));
  check('theme change re-colours the water (light is brighter than dark)', lightMean > darkMean + 30, `${darkMean.toFixed(0)} -> ${lightMean.toFixed(0)}`);
  await Y(p, () => window.YanabeeTheme.set('dark'));

  // context loss / restore
  if (gl) {
    await Y(p, () => { const g = document.querySelector('canvas[data-water]').getContext('webgl'); window.__lose = g.getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
    check('WebGL context lost: the loop stops', await p.waitForFunction(() => window.YanabeeWater.running === false, null, { timeout: 8000 }).then(() => true, () => false));
    await Y(p, () => window.__lose.restoreContext());
    check('context restored: it comes back and draws', await p.waitForFunction(() => { const W = window.YanabeeWater, a = W.running && W.probe(8, 5); return !!a && Math.max(...a) - Math.min(...a) >= 5; }, null, { timeout: 25000 }).then(() => true, () => false));
  }
  check('no script errors (WebGL scene)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('water: default (auto) choice of renderer');
{
  const { ctx, p, errs } = await open({}, { guard: false });
  check('water-on appears with no debug options', await waterOn(p));
  const r = await Y(p, () => ({ mode: window.YanabeeWater.mode, soft: window.YanabeeWater.software }));
  // a software rasteriser (SwiftShader in headless CI) gets the light 2D version; a real GPU gets WebGL
  check(`renderer choice: ${r.soft ? 'software WebGL detected -> 2d' : 'hardware WebGL -> webgl (or 2d when it is missing)'}`, r.soft ? r.mode === '2d' : (r.mode === 'webgl' || r.mode === '2d'), JSON.stringify(r));
  check('no script errors (auto)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('water: 2D fallback when WebGL is off');
{
  const { ctx, p, errs } = await open({}, { gl: 'off', guard: false });
  check('water-on + water-2d appear', await waterOn(p) && await Y(p, () => document.documentElement.classList.contains('water-2d')));
  check('mode is 2d', await Y(p, () => window.YanabeeWater.mode) === '2d');
  check('the page gradient and blobs stay (rings are an overlay)', await Y(p, () => getComputedStyle(document.querySelector('.hero-home .hero-bg')).opacity !== '0'));
  await Y(p, () => { const W = window.YanabeeWater; W.pause(); W.clear(); const r = document.querySelector('canvas[data-water]').getBoundingClientRect(); W.drop(r.left + r.width * 0.3, r.top + r.height * 0.4, 1); });
  const g = await Y(p, () => window.YanabeeWater.probe(24, 14, window.YanabeeWater.now() + 0.7));
  check('a ripple draws visible rings on the 2d canvas', spread(g) >= 8, `spread ${spread(g)}`);
  await Y(p, () => window.YanabeeWater.resume());
  const hb = await heroBox(p);
  await p.mouse.move(hb.x + 120, hb.y + 150);
  await p.mouse.move(hb.x + 420, hb.y + 190, { steps: 6 });
  check('pointer wake works in 2d too', await Y(p, () => window.YanabeeWater.active) >= 1);
  check('no script errors (2D fallback)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('water: reduced motion = one frozen frame');
{
  const { ctx, p, errs } = await open({ reducedMotion: 'reduce' }, {}); // default choice: even a software rasteriser draws the one frozen frame
  check('water-on appears (static frame drawn)', await waterOn(p));
  check('mode is static, no loop running', await Y(p, () => window.YanabeeWater.mode === 'static' && window.YanabeeWater.running === false));
  await p.waitForTimeout(900);
  check('no frames are rendered over time', await Y(p, () => window.YanabeeWater.frames) === 0);
  const frozen = await Y(p, () => window.YanabeeWater.active);
  const hb = await heroBox(p);
  await p.mouse.move(hb.x + 200, hb.y + 160); await p.mouse.move(hb.x + 600, hb.y + 300, { steps: 8 });
  await p.mouse.down(); await p.mouse.up();
  const dropped = await Y(p, () => window.YanabeeWater.drop(400, 300, 1));
  check('the pointer, presses and drops do nothing', dropped === false && await Y(p, () => window.YanabeeWater.active) === frozen, `${frozen} -> ${await Y(p, () => window.YanabeeWater.active)}`);
  check('a few frozen ripples are drawn', frozen >= 4, String(frozen));
  const g = await Y(p, () => window.YanabeeWater.probe(24, 14));
  const g2 = await Y(p, () => window.YanabeeWater.probe(24, 14));
  check('the static frame is a real picture and identical every time', !!g && spread(g) >= 12 && JSON.stringify(g) === JSON.stringify(g2), g ? `spread ${spread(g)}` : 'no data');
  check('no script errors (reduced motion)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('water: phone (390px)');
{
  const { ctx, p, errs } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { gl: 'force', guard: false });
  check('water-on appears on a phone', await waterOn(p));
  const m = await Y(p, () => {
    const c = document.querySelector('canvas[data-water]');
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, canvasW: c.getBoundingClientRect().width, bufW: c.width, dpr: devicePixelRatio, px: c.width * c.height };
  });
  check('no horizontal overflow', m.sw <= m.cw + 1 && m.canvasW <= m.cw + 1, JSON.stringify(m));
  check('the drawing buffer stays cheap (dpr capped, pixel budget)', m.bufW <= Math.round(m.cw * 1.5) + 2 && m.px <= 1.1e6, JSON.stringify(m));
  await Y(p, () => window.YanabeeWater.clear());
  const hb = await heroBox(p);
  // a real touch pointerdown on the hero (dispatched, so it cannot land on a link or a spring)
  await Y(p, hb => { document.querySelector('.hero-home').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: hb.x + 120, clientY: hb.y + 120 })); }, hb);
  check('a touch press makes a ripple plus echo', await Y(p, () => window.YanabeeWater.active) >= 2);
  check('no script errors (phone)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('water: performance guard steps down, then gives up');
{
  // the page is kept busy ~100ms per frame, like a very slow GPU
  const busy = () => { const f = () => { const t = performance.now(); while (performance.now() - t < 100); requestAnimationFrame(f); }; requestAnimationFrame(f); };
  const { ctx, p, errs } = await open({}, { gl: 'force', guard: true }, busy);
  await waterOn(p, 20000);
  let maxLevel = 0;
  const t0 = Date.now();
  let off = false;
  while (Date.now() - t0 < 90000) {
    const s = await Y(p, () => ({ lvl: window.YanabeeWater.level, mode: window.YanabeeWater.mode }));
    maxLevel = Math.max(maxLevel, s.lvl);
    if (s.mode === 'off') { off = true; break; }
    await p.waitForTimeout(400);
  }
  check('it lowered the render scale step by step', maxLevel >= 1, `max level ${maxLevel}`);
  check('and finally gave up: water-on removed, canvas hidden', off && await Y(p, () => !document.documentElement.classList.contains('water-on') && document.querySelector('canvas[data-water]').hidden), `off=${off}`);
  check('no script errors (guard)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} water tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
