// Browser test of the pinned teams gallery on the home page (modes, geometry, keyboard, reduced motion, no-JS).
//   node tools/yanabee/test-gallery.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(opts = {}, hash = '') {
  const { viewport = { width: 1440, height: 900 }, ...rest } = opts;
  const ctx = await browser.newContext({ viewport, reducedMotion: 'no-preference', ...rest });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text() + (m.location() && m.location().url || ''))) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ } });
  await p.goto(url('index.html') + hash);
  await p.waitForTimeout(700);
  return { ctx, p, errs };
}
// wait until the gallery has caught up with the scroll position (and stays there)
const settle = async p => {
  let still = 0;
  for (let i = 0; i < 80 && still < 4; i++) {
    await p.waitForTimeout(100);
    const ok = await p.evaluate(() => (window.YanabeeGallery ? window.YanabeeGallery.settled() : true));
    still = ok ? still + 1 : 0;
  }
};
const geo = p => p.evaluate(() => {
  const st = document.querySelector('.tgal-stage').getBoundingClientRect(), c = st.left + st.width / 2;
  return [...document.querySelectorAll('.tg-panel')].map(el => { const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2 - c, w: r.width }; });
});
const pinInfo = p => p.evaluate(() => { const r = document.querySelector('.tgal-pin').getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, st: document.querySelector('.tgal-stage').offsetHeight }; });
const jumpTo = async (p, prog) => { const i = await pinInfo(p); await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), i.top + prog * (i.h - i.st)); await settle(p); };
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

console.log('markup');
{
  const { ctx, p, errs } = await open();
  const m = await p.evaluate(() => ({
    panels: document.querySelectorAll('.tg-panel').length,
    hrefs: [...document.querySelectorAll('.tg-panel .tg-more')].map(a => a.getAttribute('href')),
    nums: [...document.querySelectorAll('.tg-num')].map(e => e.textContent),
    titles: [...document.querySelectorAll('.tg-title')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    segs: document.querySelectorAll('.tg-seg').length,
    tabs: [...document.querySelectorAll('.tg-panel')].map(el => el.querySelectorAll('[role=tab]').length),
    ids: [...document.querySelectorAll('.tg-panel')].map(el => el.id),
  }));
  check('8 panels (7 teams + inclusion)', m.panels === 8, String(m.panels));
  check('panel links go to teams.html#t1..t7 and #s3', JSON.stringify(m.hrefs) === JSON.stringify(['t1', 't2', 't3', 't4', 't5', 't6', 't7', 's3'].map(x => 'teams.html#' + x)), m.hrefs.join(' '));
  check('numerals 01..08', m.nums.join() === '01,02,03,04,05,06,07,08', m.nums.join());
  check('first title is the Quran team, last is inclusion', /القرآن/.test(m.titles[0]) && /الشمول/.test(m.titles[7]), m.titles[0] + ' | ' + m.titles[7]);
  check('rail has 8 segments', m.segs === 8);
  check('every panel has 3 impact tabs', m.tabs.every(n => n === 3), m.tabs.join());
  check('dom order is team order', m.ids.join() === 'g-t1,g-t2,g-t3,g-t4,g-t5,g-t6,g-t7,g-s3', m.ids.join());
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('exactly one of gallery / grid, per viewport');
for (const [w, h, expectGallery] of [[390, 844, false], [999, 800, false], [1000, 800, true], [1280, 800, true], [1440, 900, true], [1920, 1080, true]]) {
  const { ctx, p, errs } = await open({ viewport: { width: w, height: h }, ...(w < 600 ? { isMobile: true, hasTouch: true } : {}) });
  const g = await shown(p, '.tgal'), t = await shown(p, '.team-grid');
  check(`${w}px: ${expectGallery ? 'gallery' : 'grid'} only`, g === expectGallery && t === !expectGallery, `gallery=${g} grid=${t}`);
  if (w === 390 || w === 1440) check(`${w}px: no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));
  check(`${w}px: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('live mode (1440x900)');
for (const theme of ['dark', 'light']) {
  const { ctx, p, errs } = await open({ colorScheme: theme });
  check(`${theme}: JS made the gallery live`, await p.evaluate(() => document.querySelector('.tgal').classList.contains('is-live') && window.YanabeeGallery.mode() === 'live'));
  const pi = await pinInfo(p);
  check(`${theme}: tall scroll track (>= 5 screens)`, pi.h >= 5 * 900 && pi.st === 900, `${pi.h} / ${pi.st}`);
  check(`${theme}: stage is sticky`, await p.evaluate(() => getComputedStyle(document.querySelector('.tgal-stage')).position === 'sticky'));
  await jumpTo(p, 0);
  let g = await geo(p);
  check(`${theme}: panel 1 is centred at the start and is the right-most`, Math.abs(g[0].cx) < 6 && g.every((x, i) => i === 0 || x.cx < g[0].cx), JSON.stringify(g.map(x => Math.round(x.cx))));
  check(`${theme}: counter shows 01, rail marks the first`, await p.evaluate(() => document.querySelector('.tg-seg.is-on') === document.querySelectorAll('.tg-seg')[0] && /translateY\(-?0(\.0)?em\)/.test(document.querySelector('[data-roll]').style.transform)));
  const stuck = await p.evaluate(() => { const s = document.querySelector('.tgal-stage').getBoundingClientRect(); return s.top; });
  check(`${theme}: stage pinned to the top of the screen`, Math.abs(stuck) < 1, String(stuck));
  const active0 = await p.evaluate(() => [...document.querySelectorAll('.tg-panel')].map(x => x.classList.contains('is-active')));
  check(`${theme}: only the first panel is active (text risen)`, active0[0] && active0.filter(Boolean).length === 1, active0.join());
  await p.waitForTimeout(1400); // the lines rise one after another
  const op = await p.evaluate(() => getComputedStyle(document.querySelector('.tg-panel.is-active .tg-work')).opacity + '/' + getComputedStyle(document.querySelectorAll('.tg-panel')[3].querySelector('.tg-work')).opacity);
  check(`${theme}: active copy visible, other copy hidden`, op === '1/0', op);
  await jumpTo(p, 1);
  g = await geo(p);
  check(`${theme}: at the end the last panel is centred and left-most`, Math.abs(g[7].cx) < 6 && g.every((x, i) => i === 7 || x.cx > g[7].cx), JSON.stringify(g.map(x => Math.round(x.cx))));
  const end = await p.evaluate(() => ({
    on: [...document.querySelectorAll('.tg-seg')].findIndex(s => s.classList.contains('is-on')),
    cur: document.querySelector('.tg-seg[aria-current=true]') === document.querySelectorAll('.tg-seg')[7],
    roll: document.querySelector('[data-roll]').style.transform,
    active: [...document.querySelectorAll('.tg-panel')].findIndex(x => x.classList.contains('is-active')),
    f: [...document.querySelectorAll('.tg-seg b')].map(b => (b.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 0])[1]).join(),
  }));
  check(`${theme}: rail + counter show 08`, end.on === 7 && end.cur && /-9\.8em/.test(end.roll) && end.active === 7, JSON.stringify(end));
  check(`${theme}: every rail segment is filled at the end`, end.f.split(',').every(v => parseFloat(v) === 1), end.f);
  await jumpTo(p, 0.5);
  const u = await p.evaluate(() => window.YanabeeGallery.position());
  check(`${theme}: halfway is between panels 4 and 5`, u > 3.4 && u < 3.6, String(u));
  check(`${theme}: no script errors`, errs.length === 0, errs.join(' | '));
  check(`${theme}: no horizontal page overflow`, (await overflow(p)) <= 0);
  await ctx.close();
}

console.log('navigation: rail, keyboard, tabs, hash');
{
  const { ctx, p, errs } = await open();
  await jumpTo(p, 0);
  await p.click('.tg-seg[data-go="4"]');
  await p.waitForTimeout(400);
  await settle(p);
  let g = await geo(p);
  check('clicking rail segment 5 centres panel 5', Math.abs(g[4].cx) < 6, String(Math.round(g[4].cx)));
  check('rail follows (segment 5 current)', await p.evaluate(() => document.querySelectorAll('.tg-seg')[4].getAttribute('aria-current') === 'true'));

  // the peeking previous photo is a button-like target: clicking it travels there
  await jumpTo(p, 2 / 7);
  const peek = await p.evaluate(() => { const r = document.querySelectorAll('.tg-media')[1].getBoundingClientRect(); return { x: Math.min(r.right, innerWidth) - 24, y: r.top + r.height * 0.3 }; });
  await p.mouse.click(peek.x, peek.y);
  await settle(p);
  g = await geo(p);
  check('clicking the neighbouring photo travels to that panel', Math.abs(g[1].cx) < 6, String(Math.round(g[1].cx)));

  await jumpTo(p, 0);
  await p.focus('#g-t1 .tg-more');
  await p.keyboard.press('Tab'); // -> first tab of panel 2 (the rail is not between them)
  await settle(p);
  const where = await p.evaluate(() => { const a = document.activeElement; const pn = a.closest('.tg-panel'); return pn ? pn.id : (a.tagName + '.' + a.className); });
  g = await geo(p);
  check('Tab from panel 1 lands in panel 2', where === 'g-t2', where);
  check('...and panel 2 is brought to the centre', Math.abs(g[1].cx) < 6, String(Math.round(g[1].cx)));
  await p.evaluate(() => document.querySelector('#g-t6 .tg-more').focus());
  await settle(p);
  g = await geo(p);
  check('focusing a link in an off-screen panel (6) centres it', Math.abs(g[5].cx) < 6, String(Math.round(g[5].cx)));
  check('...and the active panel switches', await p.evaluate(() => document.querySelector('.tg-panel.is-active').id === 'g-t6'));
  check('page did not scroll sideways', await p.evaluate(() => scrollX === 0 && document.querySelector('.tgal-viewport').scrollLeft === 0));

  // keyboard on the impact tabs (RTL: ArrowLeft = next)
  await p.focus('#g-t6 [role=tab][aria-selected=true]');
  await p.keyboard.press('ArrowLeft');
  const tabs = await p.evaluate(() => ({ sel: [...document.querySelectorAll('#g-t6 [role=tab]')].map(t => t.getAttribute('aria-selected')).join(), hid: [...document.querySelectorAll('#g-t6 [role=tabpanel]')].map(t => t.hidden).join() }));
  check('impact tabs: arrow key moves selection and swaps the text', tabs.sel === 'false,true,false' && tabs.hid === 'true,false,true', JSON.stringify(tabs));
  // pointer parallax: moving to a corner of the stage shifts the depth layers
  await p.mouse.move(30, 200);
  await p.waitForTimeout(250);
  check('pointer parallax follows the mouse', await p.evaluate(() => parseFloat(document.querySelector('.tgal').dataset.px) < -0.9));
  await p.mouse.move(700, 450);

  // live <-> native when the motion preference changes at run time
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.waitForTimeout(400);
  check('turning reduced motion on drops the pinned track at run time', await p.evaluate(() => window.YanabeeGallery.mode() === 'native' && !document.querySelector('.tgal').classList.contains('is-live')));
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  await p.waitForTimeout(500);
  check('...and turning it off brings the live gallery back', await p.evaluate(() => window.YanabeeGallery.mode() === 'live'));

  check('skip link jumps past the gallery', await (async () => {
    await p.evaluate(() => document.querySelector('.tgal-skip').focus());
    await p.keyboard.press('Enter');
    await p.waitForTimeout(900);
    return p.evaluate(() => document.activeElement.id === 'tgal-end');
  })());
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  const d = await open({}, '#g-t3');
  await settle(d.p);
  const dg = await geo(d.p);
  check('deep link #g-t3 opens with panel 3 centred', Math.abs(dg[2].cx) < 6 && d.errs.length === 0, String(Math.round(dg[2].cx)) + ' ' + d.errs.join(' | '));
  await d.ctx.close();

  const h = await open({}, '#teams');
  check('loads at #teams without errors, live and at panel 1', h.errs.length === 0 && await h.p.evaluate(() => window.YanabeeGallery.mode() === 'live' && window.YanabeeGallery.position() === 0), h.errs.join(' | '));
  await h.ctx.close();

  // reload in the middle of the track: the exact state is restored without easing
  const r = await open();
  await jumpTo(r.p, 0.6);
  await r.p.reload();
  await r.p.waitForTimeout(900);
  const u = await r.p.evaluate(() => window.YanabeeGallery.position());
  const gg = await geo(r.p);
  const near = gg.reduce((b, x, i) => (Math.abs(x.cx) < Math.abs(gg[b].cx) ? i : b), 0);
  check('reload mid-track restores the matching panel', Math.abs(u - Math.round(u)) < 0.6 && Math.abs(gg[near].cx) < 640, `u=${u.toFixed(2)}`);
  await r.ctx.close();
}

console.log('resize: live <-> plain grid');
{
  const { ctx, p, errs } = await open();
  await p.setViewportSize({ width: 900, height: 800 });
  await p.waitForTimeout(500);
  check('narrowing to 900px: gallery off, grid on, no tall track', !(await shown(p, '.tgal')) && await shown(p, '.team-grid') && await p.evaluate(() => window.YanabeeGallery.mode() === 'off' && !document.querySelector('.tgal').classList.contains('is-live')));
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.waitForTimeout(600);
  check('widening again: live gallery back, grid hidden', await p.evaluate(() => window.YanabeeGallery.mode() === 'live') && !(await shown(p, '.team-grid')) && await shown(p, '.tgal'));
  await jumpTo(p, 1);
  const g = await geo(p);
  check('1280px: last panel centred at the end', Math.abs(g[7].cx) < 6, String(Math.round(g[7].cx)));
  await p.setViewportSize({ width: 1280, height: 480 });
  await p.waitForTimeout(500);
  check('short screen (480px tall): native scroller instead of the pinned stage', await p.evaluate(() => window.YanabeeGallery.mode() === 'native' && document.querySelector('.tgal-pin').getBoundingClientRect().height < 1200));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('reduced motion: no pinned track');
{
  const { ctx, p, errs } = await open({ reducedMotion: 'reduce' });
  const m = await p.evaluate(() => ({
    mode: window.YanabeeGallery.mode(), live: document.querySelector('.tgal').classList.contains('is-live'),
    pin: document.querySelector('.tgal-pin').getBoundingClientRect().height, stage: document.querySelector('.tgal-stage').getBoundingClientRect().height,
    sticky: getComputedStyle(document.querySelector('.tgal-stage')).position,
    snap: getComputedStyle(document.querySelector('.tgal-viewport')).scrollSnapType,
    scroll: document.querySelector('.tgal-viewport').scrollWidth > document.querySelector('.tgal-viewport').clientWidth + 100,
    text: getComputedStyle(document.querySelectorAll('.tg-panel')[5].querySelector('.tg-work')).opacity,
  }));
  check('mode is native, not live', m.mode === 'native' && !m.live, JSON.stringify(m));
  check('no tall track, no sticky stage', Math.abs(m.pin - m.stage) < 2 && m.sticky !== 'sticky', `${m.pin}/${m.stage}/${m.sticky}`);
  check('native scroll-snap scroller with all panels', /x/.test(m.snap) && m.scroll, m.snap);
  check('all copy is readable without the rising animation', m.text === '1', m.text);
  check('gallery shown, grid hidden', await shown(p, '.tgal') && !(await shown(p, '.team-grid')));
  await p.evaluate(() => document.querySelector('.tgal').scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.click('.tg-seg[data-go="5"]');
  await p.waitForTimeout(900);
  const c = await geo(p);
  check('rail click scrolls the native scroller to panel 6', Math.abs(c[5].cx) < 40, String(Math.round(c[5].cx)));
  check('rail follows the native scroller', await p.evaluate(() => document.querySelectorAll('.tg-seg')[5].getAttribute('aria-current') === 'true' && /-7(\.0)?em/.test(document.querySelector('[data-roll]').style.transform)));
  check('no script errors', errs.length === 0, errs.join(' | '));
  check('no horizontal page overflow', (await overflow(p)) <= 0);
  await ctx.close();
}

console.log('no JavaScript');
{
  const { ctx, p, errs } = await open({ javaScriptEnabled: false });
  check('1440px: native scroller shown, grid hidden', await shown(p, '.tgal') && !(await shown(p, '.team-grid')));
  const m = await p.evaluate(() => ({
    hud: getComputedStyle(document.querySelector('.tgal-hud')).display,
    tabs: getComputedStyle(document.querySelector('.tg-tabs')).display,
    bodies: [...document.querySelectorAll('.tg-tp')].filter(e => e.getBoundingClientRect().height > 0).length,
    scroll: document.querySelector('.tgal-viewport').scrollWidth > document.querySelector('.tgal-viewport').clientWidth + 100,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  check('JS-only controls (rail, tab list) hidden', m.hud === 'none' && m.tabs === 'none', JSON.stringify(m));
  check('every impact text is shown (24 bodies)', m.bodies === 24, String(m.bodies));
  check('scrolls sideways natively, no page overflow', m.scroll && m.over <= 0, JSON.stringify(m));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('frame cost');
{
  const { ctx, p } = await open();
  const i = await pinInfo(p);
  await p.evaluate(() => { const s = window.YanabeeGallery.stats; s.frames = 0; s.ms = 0; s.max = 0; s.samples.length = 0; });
  for (let k = 0; k < 60; k++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(16); }
  const y = i.top + 0.2 * (i.h - i.st);
  await p.evaluate(v => scrollTo({ top: v, behavior: 'instant' }), y);
  for (let k = 0; k < 90; k++) { await p.mouse.wheel(0, 80); await p.waitForTimeout(16); }
  await settle(p);
  const s = await p.evaluate(() => window.YanabeeGallery.stats);
  const avg = s.ms / Math.max(1, s.frames);
  const sorted = [...s.samples].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0, p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  console.log(`      ${s.frames} frames: median ${med.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms, avg ${avg.toFixed(2)} ms, max ${s.max.toFixed(2)} ms (script time per frame)`);
  check('per-frame script cost stays small (median < 3 ms, p90 < 8 ms)', s.frames > 20 && med < 3 && p90 < 8, `${med.toFixed(2)} / ${p90.toFixed(2)}`);
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} gallery tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
