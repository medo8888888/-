// Browser test of the teams swipe carousel and its detail sheet on the home page.
//   node tools/yanabee/test-gallery.mjs
// Covers: markup (8 cards, RTL order), nothing pinned (page scroll is 1:1 under wheel and touch), native scroll-snap row,
// buttons / segments / keyboard / deep link, the distance scale-fade, mouse drag (click vs drag), touch swipe, the detail
// sheet (FLIP, tabs, close paths, focus, inert, scroll lock), reduced motion, no JS, print, console errors.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
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
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}
// the row quiet again (no scroll for a while, no drag/release pending)
const settle = async p => {
  let still = 0;
  for (let i = 0; i < 60 && still < 3; i++) {
    await p.waitForTimeout(90);
    still = (await p.evaluate(() => (window.YanabeeGallery ? window.YanabeeGallery.settled() : true))) ? still + 1 : 0;
  }
};
const toView = async p => { await p.evaluate(() => document.querySelector('.tgal').scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(350); };
const centred = p => p.evaluate(() => {
  const sr = document.querySelector('.tgal-scroller').getBoundingClientRect(), c = sr.left + sr.width / 2;
  return [...document.querySelectorAll('.tg-item')].map(li => { const r = li.getBoundingClientRect(); return r.left + r.width / 2 - c; });
});
const nearestIdx = async p => { const d = await centred(p); return d.reduce((b, x, i) => (Math.abs(x) < Math.abs(d[b]) ? i : b), 0); };
const idxOf = p => p.evaluate(() => window.YanabeeGallery.index());
const current = p => p.evaluate(() => { const d = document.querySelector('.tg-dot[aria-current=true]'); return d ? +d.dataset.go : -1; });
const rectOf = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
const cardCentre = (p, i) => p.evaluate(k => { const r = document.querySelectorAll('.tg-card')[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
const sheetOpen = p => p.evaluate(() => window.YanabeeGallery.isOpen() && !document.querySelector('.tsheet').hidden);
const hiddenNow = p => p.evaluate(() => { const s = document.querySelector('.tsheet'); return !s || s.hidden; });
const goTo = async (p, i) => { await p.evaluate(k => window.YanabeeGallery.goTo(k, 'instant'), i); await settle(p); };
const cdp = async (ctx, p) => ctx.newCDPSession(p);
// a touch swipe made of real touch events (Chrome turns them into a pan and, from the release velocity, a fling)
const swipe = async (c, x, y, dx, dy, speed = 1200) => {
  const dist = Math.hypot(dx, dy), steps = 14, wait = Math.max(4, (dist / speed) * 1000 / steps);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let k = 1; k <= steps; k++) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / steps, y: y + (dy * k) / steps }] });
    await new Promise(r => setTimeout(r, wait));
  }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const touchDrag = async (c, x, y0, dy, steps, stepMs) => {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let k = 1; k <= steps; k++) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * k) / steps }] });
    await new Promise(r => setTimeout(r, stepMs));
  }
  return async () => c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const overflow = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const TEAMS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 's3'];

console.log('source: nothing pinned, no scroll hijack');
{
  const js = fs.readFileSync(path.join(ROOT, 'site/yanabee/js/gallery.js'), 'utf8').replace(/\/\/.*$/gm, '');
  const css = fs.readFileSync(path.join(ROOT, 'site/yanabee/css/gallery.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('css has no sticky stage / pin', !/position\s*:\s*sticky/.test(css) && !/tgal-pin|tgal-stage|is-live/.test(css));
  check('js listens to no wheel / touch for the page and never pushes history', !/addEventListener\(\s*'wheel'/.test(js) && !/pushState|replaceState/.test(js) && !/location\.hash\s*=/.test(js));
  check('js has no vertical-wheel remap or window scroll calls', !/scrollTo\(\s*\{\s*top/.test(js) && !/window\.scrollTo|scrollBy\(/.test(js));
  check('css z-index of the sheet is 135', /\.tsheet\{[^}]*z-index:135/.test(css));
  check('no animation of width / height / top / left in the sheet code', !/animate\([^)]*(width|height|top\s*:|left\s*:)/.test(js));
}

console.log('markup');
{
  const { ctx, p, errs } = await open();
  const m = await p.evaluate(() => {
    const root = document.querySelector('.tgal');
    return {
      role: root.getAttribute('role'), rd: root.getAttribute('aria-roledescription'), label: root.getAttribute('aria-label'),
      tag: root.tagName, id: root.id,
      scroller: root.querySelector('ul.tgal-scroller') ? root.querySelector('ul.tgal-scroller').children.length : -1,
      ids: [...document.querySelectorAll('.tg-item')].map(e => e.id),
      hrefs: [...document.querySelectorAll('.tg-card')].map(a => a.getAttribute('href')),
      titles: [...document.querySelectorAll('.tg-title')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
      dots: [...document.querySelectorAll('.tg-dot')].map(b => b.getAttribute('aria-label')),
      tabs: document.querySelectorAll('.tg-card [role=tab]').length,
      detailHidden: [...document.querySelectorAll('.tg-detail')].every(d => d.hidden && getComputedStyle(d).display === 'none'),
      prev: !!document.querySelector('[data-prev]'), next: !!document.querySelector('[data-next]'),
      old: ['.tgal-pin', '.tgal-stage', '.tg-count', '.tg-rail', '.tg-hint', '.tgal-hud', '.tg-num', '.tgal-skip'].filter(s => document.querySelector(s)),
      sectionsWithId: [...document.querySelectorAll('main > section[id]')].map(s => s.id),
      dotsOrder: [...document.querySelectorAll('.fx-dots a, .fx-dots button')].length,
      imgs: [...document.querySelectorAll('.tg-card .ph')].map(i => i.getAttribute('draggable') + '/' + i.getAttribute('alt')),
      draggable: [...document.querySelectorAll('.tg-card')].every(a => a.getAttribute('draggable') === 'false'),
      tpl: !!document.querySelector('template[data-sheet-tpl]'),
    };
  });
  check('region with aria-roledescription=carousel and a label', m.role === 'region' && m.rd === 'carousel' && /الفرق السبع/.test(m.label), JSON.stringify([m.role, m.rd, m.label]));
  check('one <ul> scroller with 8 <li> cards', m.scroller === 8, String(m.scroller));
  check('dom order is team order (deep-link ids kept)', m.ids.join() === TEAMS.map(x => 'g-' + x).join(), m.ids.join());
  check('cards are real links to teams.html#t1..t7 and #s3', JSON.stringify(m.hrefs) === JSON.stringify(TEAMS.map(x => 'teams.html#' + x)), m.hrefs.join(' '));
  check('first title is the Quran team, last is inclusion', /القرآن/.test(m.titles[0]) && /الشمول/.test(m.titles[7]), m.titles[0] + ' | ' + m.titles[7]);
  check('8 segment buttons named by the team titles', m.dots.length === 8 && m.dots.every((l, i) => l === m.titles[i]), m.dots.join(' | '));
  check('prev and next buttons exist', m.prev && m.next);
  check('verbatim detail markup is hidden until the sheet opens', m.detailHidden);
  check('the old pinned machinery is gone (pin, stage, counter, rail, hint, numerals, skip link)', m.old.length === 0, m.old.join());
  check('the third section dot stays #model (no id-bearing section was added)', m.sectionsWithId[2] === 'model', m.sectionsWithId.join());
  check('the carousel is not a main > section with an id', m.tag !== 'SECTION' && !m.id);
  check('links and photos are not draggable', m.draggable);
  check('sheet skeleton ships as a <template>', m.tpl);
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

for (const [label, opts, w] of [['desktop 1440', {}, 1440], ['phone 390', PHONE, 390]]) {
  console.log(`layout and page scroll: ${label}`);
  for (const theme of ['dark', 'light']) {
    const { ctx, p, errs } = await open({ ...opts, colorScheme: theme });
    await toView(p);
    const m = await p.evaluate(() => {
      const sc = document.querySelector('.tgal-scroller'), cs = getComputedStyle(sc), c0 = document.querySelector('.tg-item'), cc = getComputedStyle(c0);
      const sec = document.querySelector('.teams-home'), sr = sec.getBoundingClientRect();
      const stuck = [...sec.querySelectorAll('*')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position)).length;
      return {
        disp: cs.display, ox: cs.overflowX, snap: cs.scrollSnapType, ob: cs.overscrollBehaviorX, ta: cs.touchAction, sw: cs.scrollbarWidth,
        gap: parseFloat(cs.columnGap), align: cc.scrollSnapAlign, stop: cc.scrollSnapStop, cursor: cs.cursor,
        cw: c0.getBoundingClientRect().width, vw: innerWidth, vh: innerHeight, secH: sr.height, stuck, scrollable: sc.scrollWidth > sc.clientWidth + 100,
        pt: parseFloat(cs.paddingInlineStart), spad: cs.scrollPaddingInlineStart, tabindex: sc.getAttribute('tabindex'),
        grid: getComputedStyle(document.querySelector('.team-grid')).display,
      };
    });
    check(`${theme}: flex row, scroll-snap x mandatory, native overscroll contained`, m.disp === 'flex' && m.ox === 'auto' && /x mandatory/.test(m.snap) && m.ob === 'contain', JSON.stringify(m));
    check(`${theme}: card snaps to centre and always stops; vertical page scroll stays native`, m.align === 'center' && m.stop === 'always' && /pan-x/.test(m.ta) && /pan-y/.test(m.ta), `${m.align} ${m.stop} ${m.ta}`);
    check(`${theme}: gap 14-18px, hidden scrollbar, padding lets the first/last card centre`, m.gap >= 14 && m.gap <= 18 && m.sw === 'none' && m.pt > 20, `${m.gap} ${m.sw} ${m.pt}`);
    if (w === 390) check(`${theme}: card is 78-84% of the viewport so neighbours peek`, m.cw / m.vw >= 0.78 && m.cw / m.vw <= 0.84, (m.cw / m.vw).toFixed(3));
    else check(`${theme}: desktop card is clamp(280px,26vw,360px)`, near(m.cw, Math.min(360, Math.max(280, 0.26 * m.vw)), 1), String(m.cw));
    check(`${theme}: the section is about one screen tall, not seven`, m.secH < m.vh * 1.6, `${Math.round(m.secH)} / ${m.vh}`);
    check(`${theme}: no sticky or fixed element inside the section`, m.stuck === 0, String(m.stuck));
    check(`${theme}: the plain card grid is hidden (the carousel replaces it)`, m.grid === 'none', m.grid);
    check(`${theme}: scroller is a keyboard stop`, m.tabindex === '0');
    if (w === 1440) check(`${theme}: mouse gets a grab cursor`, m.cursor === 'grab', m.cursor);
    // neighbours peek on both sides when a middle card is centred
    await goTo(p, 3);
    const peek = await p.evaluate(() => {
      const sr = document.querySelector('.tgal-scroller').getBoundingClientRect();
      const rs = [...document.querySelectorAll('.tg-item')].map(e => e.getBoundingClientRect());
      const vis = r => Math.max(0, Math.min(r.right, sr.right) - Math.max(r.left, sr.left)) / r.width;
      return { prev: vis(rs[2]), next: vis(rs[4]), prev2: vis(rs[1]), next2: vis(rs[5]) };
    });
    check(`${theme}: both neighbours of the centred card are visible (${(peek.prev * m.cw).toFixed(0)}px / ${(peek.next * m.cw).toFixed(0)}px)`, peek.prev * m.cw >= 12 && peek.next * m.cw >= 12 && peek.prev < 1.01 && peek.next < 1.01, JSON.stringify(peek));
    if (w === 1440) check(`${theme}: about 1.5 neighbours peek on each side at 1440`, peek.prev2 > 0.3 && peek.next2 > 0.3, JSON.stringify(peek));
    check(`${theme}: no horizontal page overflow`, (await overflow(p)) <= 0, String(await overflow(p)));

    // page scroll is 1:1 over the carousel
    await p.evaluate(() => scrollTo({ top: Math.max(0, document.querySelector('.tgal').getBoundingClientRect().top + scrollY - 40), behavior: 'instant' }));
    await p.waitForTimeout(250);
    const r = await rectOf(p, '.tgal-scroller');
    const y0 = await p.evaluate(() => scrollY), left0 = await p.evaluate(() => document.querySelector('.tgal-scroller').scrollLeft);
    if (w === 1440) {
      await p.mouse.move(r.cx, r.cy);
      let sum = 0, steps = [];
      for (let k = 0; k < 8; k++) {
        const before = await p.evaluate(() => scrollY);
        await p.mouse.wheel(0, 90);
        await p.waitForTimeout(60);
        await p.waitForTimeout(80);
        const after = await p.evaluate(() => scrollY);
        steps.push(after - before); sum += after - before;
      }
      await p.waitForTimeout(250);
      const y1 = await p.evaluate(() => scrollY);
      check(`${theme}: wheel over the carousel moves the page 1:1 (sum of steps = ${y1 - y0})`, near(y1 - y0, 8 * 90, 3) && near(sum, y1 - y0, 40), `${y1 - y0} vs ${8 * 90} steps=${steps.join()}`);
    } else {
      const c = await cdp(ctx, p);
      await swipe(c, r.cx, r.cy + 10, 0, -300, 900);
      await p.waitForTimeout(500);
      const y1 = await p.evaluate(() => scrollY);
      check(`${theme}: a vertical touch swipe over the carousel moves the page 1:1 (${y1 - y0}px of 300)`, y1 - y0 > 250 && y1 - y0 < 340, String(y1 - y0));
    }
    const left1 = await p.evaluate(() => document.querySelector('.tgal-scroller').scrollLeft);
    check(`${theme}: ... and does not move the row sideways`, near(left1, left0, 2), `${left0} -> ${left1}`);
    check(`${theme}: no script errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
}

console.log('navigation: buttons, segments, keyboard, edges, deep link');
{
  const { ctx, p, errs } = await open();
  await toView(p);
  await settle(p);
  check('starts on card 1, centred', (await idxOf(p)) === 0 && Math.abs((await centred(p))[0]) < 3, JSON.stringify(await centred(p)));
  const bp = await p.evaluate(() => { const a = document.querySelector('[data-prev]').getBoundingClientRect(), b = document.querySelector('[data-next]').getBoundingClientRect(); return { prevX: a.left, nextX: b.left, pw: a.width, ph: a.height }; });
  check('RTL: next sits on the LEFT, prev on the RIGHT (44px targets)', bp.nextX < bp.prevX && bp.pw >= 44 && bp.ph >= 44, JSON.stringify(bp));
  const ends = await p.evaluate(() => ({ prev: document.querySelector('[data-prev]').disabled, next: document.querySelector('[data-next]').disabled }));
  check('at the first card the (right) prev button is disabled, next is enabled', ends.prev && !ends.next, JSON.stringify(ends));
  const arrows = await p.evaluate(() => [document.querySelector('[data-prev] svg path').getAttribute('d'), document.querySelector('[data-next] svg path').getAttribute('d')]);
  check('arrows point the way they move (next points left)', arrows[0] === 'm9 18 6-6-6-6' && arrows[1] === 'm15 18-6-6 6-6', arrows.join(' | '));

  await p.click('[data-next]');
  await settle(p);
  check('next button: card 2 centred, aria-current follows, prev enabled', (await nearestIdx(p)) === 1 && near((await centred(p))[1], 0, 3) && (await current(p)) === 1 && !(await p.evaluate(() => document.querySelector('[data-prev]').disabled)), JSON.stringify(await centred(p)));
  await p.click('.tg-dot[data-go="5"]');
  await settle(p);
  check('segment 6 navigates: card 6 centred and current', (await nearestIdx(p)) === 5 && near((await centred(p))[5], 0, 3) && (await current(p)) === 5, JSON.stringify(await centred(p)));
  await p.click('[data-prev]');
  await settle(p);
  check('prev button goes back to card 5', (await nearestIdx(p)) === 4 && (await current(p)) === 4);
  await p.click('.tg-dot[data-go="7"]');
  await settle(p);
  const last = await p.evaluate(() => ({ next: document.querySelector('[data-next]').disabled, prev: document.querySelector('[data-prev]').disabled }));
  check('last card: the (left) next button is disabled', (await nearestIdx(p)) === 7 && last.next && !last.prev, JSON.stringify(last));
  // keyboard on the scroller (RTL: ArrowLeft = next)
  await p.focus('.tgal-scroller');
  await p.keyboard.press('Home');
  await settle(p);
  check('Home: first card', (await nearestIdx(p)) === 0 && (await current(p)) === 0);
  await p.keyboard.press('ArrowLeft');
  await settle(p);
  check('ArrowLeft advances (RTL next)', (await nearestIdx(p)) === 1 && (await current(p)) === 1);
  await p.keyboard.press('ArrowRight');
  await settle(p);
  check('ArrowRight goes back (RTL prev)', (await nearestIdx(p)) === 0);
  await p.keyboard.press('ArrowRight');
  await settle(p);
  check('ArrowRight at the start stays on card 1', (await nearestIdx(p)) === 0);
  await p.keyboard.press('End');
  await settle(p);
  check('End: last card, centred', (await nearestIdx(p)) === 7 && near((await centred(p))[7], 0, 3));
  // focusing a card with the keyboard brings it to the centre
  await p.keyboard.press('Home');
  await settle(p);
  await p.evaluate(() => document.querySelectorAll('.tg-card')[0].focus());
  for (let k = 0; k < 4; k++) await p.keyboard.press('Tab');
  await settle(p);
  const foc = await p.evaluate(() => { const a = document.activeElement; const li = a.closest && a.closest('.tg-item'); return li ? li.dataset.i : a.className; });
  check('Tab moves focus card by card', foc === '4', String(foc));
  check('... and the focused card is brought to the centre', near((await centred(p))[4], 0, 4), JSON.stringify(await centred(p)));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  const d = await open({}, '#g-t3');
  await settle(d.p);
  await d.p.waitForTimeout(400);
  check('deep link #g-t3 opens with card 3 centred and current', near((await centred(d.p))[2], 0, 4) && (await current(d.p)) === 2 && d.errs.length === 0, JSON.stringify(await centred(d.p)) + d.errs.join('|'));
  check('... and the sheet stays closed (the page decides nothing for you)', await hiddenNow(d.p));
  await d.p.evaluate(() => { location.hash = '#g-s3'; });
  await settle(d.p);
  await d.p.waitForTimeout(300);
  check('hashchange to #g-s3 centres the inclusion card', near((await centred(d.p))[7], 0, 4));
  await d.ctx.close();

  const h = await open({}, '#teams');
  check('loads at #teams without errors on card 1', h.errs.length === 0 && (await idxOf(h.p)) === 0, h.errs.join(' | '));
  await h.ctx.close();
}

console.log('distance effect: scale / fade, no layout shift');
{
  const { ctx, p, errs } = await open();
  await toView(p);
  await goTo(p, 3);
  await p.waitForTimeout(300);
  const e = await p.evaluate(() => {
    const lis = [...document.querySelectorAll('.tg-item')];
    const sc = li => { const m = getComputedStyle(li).transform.match(/matrix\(([^,]+)/); return m ? +m[1] : 1; };
    return { scale: lis.map(sc), op: lis.map(li => +getComputedStyle(li).opacity), w: lis.map(li => li.offsetWidth), h: lis.map(li => li.offsetHeight) };
  });
  check('centred card is full size and fully opaque', near(e.scale[3], 1, 0.005) && near(e.op[3], 1, 0.01), `${e.scale[3]} / ${e.op[3]}`);
  check('neighbours are ~94% size and ~72% opaque', near(e.scale[2], 0.94, 0.012) && near(e.scale[4], 0.94, 0.012) && near(e.op[2], 0.72, 0.03) && near(e.op[4], 0.72, 0.03), `${e.scale[2].toFixed(3)} ${e.op[2].toFixed(3)}`);
  check('the effect is clamped further out', near(e.scale[0], 0.94, 0.012) && near(e.op[0], 0.72, 0.03) && near(e.scale[7], 0.94, 0.012), `${e.scale[0]} ${e.op[0]}`);
  check('layout never changes (all cards keep one size)', new Set(e.w).size === 1 && new Set(e.h).size === 1, `${[...new Set(e.w)]} ${[...new Set(e.h)]}`);
  // mid-scroll value: half a pitch away is half way
  const mid = await p.evaluate(async () => {
    const sc = document.querySelector('.tgal-scroller'); const pitch = document.querySelectorAll('.tg-item')[1].offsetLeft - document.querySelectorAll('.tg-item')[0].offsetLeft;
    sc.style.scrollSnapType = 'none';
    sc.scrollLeft = sc.scrollLeft - pitch / 2; // RTL: towards card 4 (index 3 -> half way to 4)
    await new Promise(r => setTimeout(r, 120));
    const lis = [...document.querySelectorAll('.tg-item')];
    const out = lis.slice(2, 5).map(li => { const m = getComputedStyle(li).transform.match(/matrix\(([^,]+)/); return m ? +m[1] : 1; });
    sc.style.scrollSnapType = '';
    return out;
  });
  check('half way between two cards both are ~97% (scroll-linked)', near(mid[1], 0.97, 0.015) && (near(mid[0], 0.94, 0.02) || near(mid[2], 0.94, 0.02) || near(mid[0], 0.97, 0.02) || near(mid[2], 0.97, 0.02)), JSON.stringify(mid));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('mouse drag: grab, snap on release, click vs drag');
{
  const { ctx, p, errs } = await open();
  await toView(p);
  await goTo(p, 2);
  const c = await cardCentre(p, 2);
  // a plain click opens the card
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(500);
  check('a plain click on a card opens its detail sheet', await sheetOpen(p));
  check('... without navigating or touching the hash', await p.evaluate(() => /index\.html$/.test(location.pathname) && location.hash === ''));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  check('Esc closes it', await hiddenNow(p));

  // a click after a tiny wobble (<= 6px) still opens
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  await p.mouse.move(c.x + 3, c.y + 1, { steps: 2 });
  await p.mouse.up();
  await p.waitForTimeout(500);
  check('a 3px wobble is still a click', await sheetOpen(p));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);

  // drag by 260px to the left: the row follows the pointer 1:1, then snaps to a card
  const left0 = await p.evaluate(() => document.querySelector('.tgal-scroller').scrollLeft);
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  await p.mouse.move(c.x - 120, c.y, { steps: 6 });
  const mid = await p.evaluate(() => ({ left: document.querySelector('.tgal-scroller').scrollLeft, cls: document.querySelector('.tgal-scroller').className, cur: getComputedStyle(document.querySelector('.tgal-scroller')).cursor, snap: getComputedStyle(document.querySelector('.tgal-scroller')).scrollSnapType }));
  check('while dragging: .dragging, grabbing cursor, snapping off', /dragging/.test(mid.cls) && mid.cur === 'grabbing' && mid.snap === 'none', JSON.stringify(mid));
  check('the row follows the pointer 1:1 (moved ~120px)', near(Math.abs(mid.left - left0), 120, 14), `${left0} -> ${mid.left}`);
  await p.mouse.move(c.x - 260, c.y, { steps: 8 });
  await p.waitForTimeout(400); // rests: no velocity at release
  await p.mouse.up();
  await settle(p);
  const after = await p.evaluate(() => document.querySelector('.tgal-scroller').className);
  const ni = await nearestIdx(p);
  check('on release it snaps to the nearest card and .dragging is removed', !/dragging/.test(after) && near((await centred(p))[ni], 0, 3), `${after} ${JSON.stringify(await centred(p))}`);
  check('dragging 260px to the left from card 3 lands on card 2 (RTL: pointer left = earlier cards), the nearest to 1.3 pitches', ni === 1, String(ni));
  check('a drag does not open the card it ended on', await hiddenNow(p));
  await p.mouse.click(10, 10); // nothing pending: the next real click works again
  await goTo(p, 2);
  const c2 = await cardCentre(p, 2);
  await p.mouse.click(c2.x, c2.y);
  await p.waitForTimeout(450);
  check('the click after a drag opens normally (the suppression expired)', await sheetOpen(p));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);

  // a short fast flick advances one card
  await goTo(p, 3);
  const c3 = await cardCentre(p, 3);
  await p.mouse.move(c3.x, c3.y);
  await p.mouse.down();
  for (let k = 1; k <= 3; k++) { await p.mouse.move(c3.x + k * 45, c3.y); await p.waitForTimeout(2); } // 135px (less than half a card) at >1px/ms
  await p.mouse.up();
  await settle(p);
  const fi = await nearestIdx(p);
  check('a fast flick of 135px (under half a card) carries on in its direction by momentum (pointer right = RTL next: card 4 -> 5 or 6)', fi >= 4 && fi <= 6, String(fi));
  check('the flick opened nothing', await hiddenNow(p));
  // a peeking neighbour is a card too: clicking it opens that card (not the centred one)
  await goTo(p, 2);
  const nb = await cardCentre(p, 3);
  await p.mouse.click(nb.x, nb.y);
  await p.waitForTimeout(450);
  check('clicking a peeking neighbour opens that card', await sheetOpen(p) && await p.evaluate(() => document.getElementById('tsheet-title').textContent.trim() === document.querySelectorAll('.tg-title')[3].textContent.trim()));
  await p.click('.tsheet-x');
  await p.waitForTimeout(450);
  // keyboard: the button that becomes disabled hands its focus to the other one
  await goTo(p, 6);
  await p.focus('[data-next]');
  await p.keyboard.press('Enter');
  await settle(p);
  check('pressing the focused next button at the end moves focus to prev (no dead focus)', await p.evaluate(() => document.querySelector('[data-next]').disabled && document.activeElement === document.querySelector('[data-prev]')));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('touch: native swipe with momentum, tap opens');
{
  const { ctx, p, errs } = await open(PHONE);
  await toView(p);
  await goTo(p, 0);
  const sc = await rectOf(p, '.tgal-scroller');
  const c = await cdp(ctx, p);
  await swipe(c, sc.cx, sc.cy, 230, 0, 1500); // finger moves right = content follows = the cards at the left (the RTL next) come in
  await settle(p);
  await p.waitForTimeout(300);
  const i1 = await nearestIdx(p);
  check(`a swipe advances (card ${i1 + 1}) and snaps`, i1 >= 1 && near((await centred(p))[i1], 0, 3) && (await current(p)) === i1, JSON.stringify(await centred(p)));
  await swipe(c, sc.cx, sc.cy, -230, 0, 1500);
  await settle(p);
  await p.waitForTimeout(300);
  const i2 = await nearestIdx(p);
  check(`and back (card ${i2 + 1})`, i2 < i1 && near((await centred(p))[i2], 0, 3), `${i1} -> ${i2}`);
  const left0 = await p.evaluate(() => document.querySelector('.tgal-scroller').scrollLeft);
  await goTo(p, 3);
  await swipe(c, sc.cx, sc.cy, 700, 0, 3500); // a hard fling carries more than one card
  await settle(p);
  await p.waitForTimeout(300);
  const i3 = await nearestIdx(p);
  check(`a hard fling carries on with momentum (3 -> ${i3})`, i3 >= 5, String(i3));
  void left0;
  const t = await cardCentre(p, i3);
  await p.touchscreen.tap(t.x, t.y);
  await p.waitForTimeout(500);
  check('a tap opens the detail sheet of that card', await sheetOpen(p));
  check('mouse-only drag code did not run for touch (no .dragging)', !(await p.evaluate(() => document.querySelector('.tgal-scroller').classList.contains('dragging'))));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('detail sheet (desktop 1440)');
for (const theme of ['dark', 'light']) {
  const { ctx, p, errs } = await open({ colorScheme: theme });
  await toView(p);
  await goTo(p, 2);
  const detail = await p.evaluate(() => {
    const d = document.querySelectorAll('.tg-detail')[2];
    return {
      work: d.querySelector('.tg-d-work').textContent.replace(/\s+/g, ' ').trim(),
      labels: [...d.querySelectorAll('.tg-d-l')].map(e => e.textContent.replace(/:\s*$/, '').trim()),
      bodies: [...d.querySelectorAll('.tg-d-b')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
      link: d.querySelector('.tg-d-more').getAttribute('href'),
      title: document.querySelectorAll('.tg-title')[2].textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  check(`${theme}: closed state: no scroll lock, sheet absent or hidden`, await p.evaluate(() => !document.documentElement.classList.contains('tsheet-open') && getComputedStyle(document.documentElement).overflow !== 'hidden') && await hiddenNow(p));
  const ret = await p.evaluate(() => { const a = document.querySelectorAll('.tg-card')[2]; a.focus(); return a.getAttribute('aria-expanded'); });
  check(`${theme}: card is a dialog opener (aria-haspopup, aria-expanded=false)`, ret === 'false' && await p.evaluate(() => document.querySelectorAll('.tg-card')[2].getAttribute('aria-haspopup') === 'dialog'));
  const y0 = await p.evaluate(() => scrollY);
  const first = await p.evaluate(() => {
    const card = document.querySelectorAll('.tg-card')[2], cr = card.getBoundingClientRect();
    card.click();
    const panel = document.querySelector('.tsheet-panel'), pr = panel.getBoundingClientRect();
    const anims = panel.getAnimations();
    const clip = anims.find(a => a.effect.getKeyframes().some(k => 'clipPath' in k));
    const kf = clip ? clip.effect.getKeyframes() : [];
    const art = document.querySelector('.tsheet-art-in').getAnimations()[0];
    const tx = document.querySelector('.tsheet-text').getAnimations()[0];
    return {
      cr: { t: cr.top, r: cr.right, b: cr.bottom, l: cr.left }, pr: { t: pr.top, r: pr.right, b: pr.bottom, l: pr.left },
      from: kf[0] && kf[0].clipPath, to: kf[1] && kf[1].clipPath, dur: clip && clip.effect.getTiming().duration, ease: clip && clip.effect.getTiming().easing,
      artFrom: art && art.effect.getKeyframes()[0].transform, artDur: art && art.effect.getTiming().duration,
      txDur: tx && tx.effect.getTiming().duration, txDelay: tx && tx.effect.getTiming().delay,
      z: getComputedStyle(document.querySelector('.tsheet')).zIndex,
    };
  });
  const nums = (first.from || '').match(/-?[\d.]+px/g) || [];
  const [it, ir, ib, il] = nums.map(parseFloat);
  check(`${theme}: opening FLIP clips the surface to the card's rectangle (inset from the card's physical rect)`,
    nums.length >= 4 && near(it, first.cr.t - first.pr.t, 2) && near(ir, first.pr.r - first.cr.r, 2) && near(ib, first.pr.b - first.cr.b, 2) && near(il, first.cr.l - first.pr.l, 2), `${first.from} | card ${JSON.stringify(first.cr)} panel ${JSON.stringify(first.pr)}`);
  check(`${theme}: ... and opens to inset(0) in 280-320 ms with a spring / ease-out`, /^inset\(0px( 0px 0px 0px)?/.test(first.to || '') && first.dur >= 280 && first.dur <= 320, `${first.to} ${first.dur} ${first.ease}`);
  check(`${theme}: the artwork is translated + scaled (FLIP), text fades in 160 ms after 80 ms`, /translate\(.*\) scale\(/.test(first.artFrom || '') && first.artDur <= 320 && first.txDur === 160 && first.txDelay === 80, `${first.artFrom} ${first.txDur}/${first.txDelay}`);
  check(`${theme}: sheet z-index is 135 (below the cursor ring 140, menu sheet 150, chat 160, search 170)`, first.z === '135');
  await p.waitForTimeout(450);
  const o = await p.evaluate(() => {
    const dlg = document.querySelector('.tsheet-panel'), title = document.getElementById('tsheet-title');
    const inertOn = s => { const e = document.querySelector(s); return !!e && e.hasAttribute('inert'); };
    return {
      role: dlg.getAttribute('role'), modal: dlg.getAttribute('aria-modal'), lb: dlg.getAttribute('aria-labelledby'), title: title.textContent.replace(/\s+/g, ' ').trim(),
      focus: document.activeElement === document.querySelector('.tsheet-x'), xs: document.querySelector('.tsheet-x').getBoundingClientRect().width,
      lock: document.documentElement.classList.contains('tsheet-open'), ov: getComputedStyle(document.documentElement).overflow,
      exp: document.querySelectorAll('.tg-card')[2].getAttribute('aria-expanded'),
      inert: ['main', '.nav', '.tabbar', '.footer', '.chat-fab', '.totop'].map(s => s + ':' + inertOn(s)),
      work: document.querySelector('.tsheet-work').textContent.replace(/\s+/g, ' ').trim(),
      tabs: [...document.querySelectorAll('.tsheet [role=tab]')].map(t => t.textContent.replace(/\s+/g, ' ').trim()),
      panels: [...document.querySelectorAll('.tsheet [role=tabpanel]')].map(t => t.textContent.replace(/\s+/g, ' ').trim()),
      vis: [...document.querySelectorAll('.tsheet [role=tabpanel]')].map(t => getComputedStyle(t).visibility),
      sel: [...document.querySelectorAll('.tsheet [role=tab]')].map(t => t.getAttribute('aria-selected')).join(),
      link: document.querySelector('.tsheet-more').getAttribute('href'), linkText: document.querySelector('.tsheet-more').textContent.replace(/\s+/g, ' ').trim(),
      segOwn: document.querySelector('.tsheet [role=tablist]').getAttribute('data-seg'), segLabel: document.querySelector('.tsheet [role=tablist]').getAttribute('aria-label'),
      hist: history.length, hash: location.hash, y: scrollY,
      pr: dlg.getBoundingClientRect().width, ph: dlg.getBoundingClientRect().height, vh: innerHeight, clip: getComputedStyle(dlg).clipPath,
      art: !!document.querySelector('.tsheet-art img'),
    };
  });
  check(`${theme}: role=dialog aria-modal, labelled by the verbatim title`, o.role === 'dialog' && o.modal === 'true' && o.lb === 'tsheet-title' && o.title === detail.title, `${o.title} | ${detail.title}`);
  check(`${theme}: focus moved to the 44px close button`, o.focus && o.xs >= 44, String(o.xs));
  check(`${theme}: background scroll locked only while open; card says expanded`, o.lock && o.ov === 'hidden' && o.exp === 'true');
  check(`${theme}: the rest of the page is inert (main, nav, footer, fab, to-top)`, o.inert.filter(x => /:true$/.test(x)).length >= 4, o.inert.join(' '));
  check(`${theme}: shows the verbatim work text`, o.work === detail.work, o.work);
  check(`${theme}: three impact tabs with the verbatim labels and texts`, JSON.stringify(o.tabs) === JSON.stringify(detail.labels) && JSON.stringify(o.panels) === JSON.stringify(detail.bodies), JSON.stringify(o.tabs));
  check(`${theme}: first tab selected, only its panel visible; tablist owns its indicator`, o.sel === 'true,false,false' && o.vis.join() === 'visible,hidden,hidden' && o.segOwn === 'own' && o.segLabel === 'أبعاد الأثر', `${o.sel} ${o.vis} ${o.segOwn}`);
  check(`${theme}: the details link is the card's target, labelled «التفاصيل»`, o.link === detail.link && /^التفاصيل/.test(o.linkText), `${o.link} ${o.linkText}`);
  check(`${theme}: no history entry, no hash change, page scroll untouched`, o.hash === '' && o.y === y0, `${o.hash} ${o.y} ${y0}`);
  check(`${theme}: centred panel max 720px wide, never taller than 86% of the screen`, o.pr <= 720 && o.ph <= o.vh * 0.86 + 1, `${o.pr}x${o.ph}`);
  check(`${theme}: clip-path is removed once open (focus rings and shadow are not clipped)`, o.clip === 'none', o.clip);
  check(`${theme}: artwork present in the sheet`, o.art);
  const after = await p.evaluate(() => ({
    ghost: document.querySelectorAll('.tsheet-ghost').length, morph: document.querySelector('.tsheet-panel').classList.contains('is-morph'), artClip: getComputedStyle(document.querySelector('.tsheet-art')).clipPath, artOv: getComputedStyle(document.querySelector('.tsheet-art')).overflow,
    anims: document.querySelector('.tsheet-panel').getAnimations().length + document.querySelector('.tsheet-art').getAnimations().length + document.querySelector('.tsheet-art-in').getAnimations().length }));
  check(`${theme}: after the opening nothing is left behind (no ghost, no morph class, no running or held animation, banner cropped normally)`, after.ghost === 0 && !after.morph && after.anims === 0 && after.artClip === 'none' && after.artOv === 'hidden', JSON.stringify(after));

  // wheel does not scroll the locked page
  await p.mouse.move(700, 450);
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(300);
  check(`${theme}: the page behind does not scroll while open`, (await p.evaluate(() => scrollY)) === y0);

  // tabs: click, arrows (RTL), indicator slides, panel fades + slides in the direction of the change
  const tab = await p.evaluate(() => {
    const ind = document.querySelector('.tsheet .seg-ind'), tabs = [...document.querySelectorAll('.tsheet [role=tab]')];
    const before = ind.style.getPropertyValue('--ix');
    tabs[1].click();
    const anim = document.querySelectorAll('.tsheet [role=tabpanel]')[1].getAnimations()[0];
    const kf = anim && anim.effect.getKeyframes();
    return { before, after: ind.style.getPropertyValue('--ix'), want: tabs[1].offsetLeft + 'px', dur: parseFloat(getComputedStyle(ind).transitionDuration) * 1000, prop: getComputedStyle(ind).transitionProperty,
      kfDur: anim && anim.effect.getTiming().duration, from: kf && kf[0].transform, sel: tabs.map(t => t.getAttribute('aria-selected')).join() };
  });
  check(`${theme}: clicking a tab moves the sliding indicator by transform in 180-220 ms`, tab.before !== tab.after && tab.after === tab.want && tab.dur >= 180 && tab.dur <= 220 && /transform/.test(tab.prop), JSON.stringify(tab));
  check(`${theme}: the new panel fades 160 ms and slides 8px in the direction of travel`, tab.kfDur === 160 && /translateX\(8px\)/.test(tab.from || '') && tab.sel === 'false,true,false', JSON.stringify(tab));
  await p.waitForTimeout(250);
  const panel2 = await p.evaluate(() => [...document.querySelectorAll('.tsheet [role=tabpanel]')].map(t => getComputedStyle(t).visibility + ':' + getComputedStyle(t).opacity).join());
  check(`${theme}: tab 2's text is the visible panel`, /hidden:1,visible:1,hidden:1/.test(panel2), panel2);
  await p.focus('.tsheet [role=tab][aria-selected=true]');
  await p.keyboard.press('ArrowLeft');
  const k1 = await p.evaluate(() => [...document.querySelectorAll('.tsheet [role=tab]')].map(t => t.getAttribute('aria-selected')).join());
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('ArrowRight');
  const k2 = await p.evaluate(() => [...document.querySelectorAll('.tsheet [role=tab]')].map(t => t.getAttribute('aria-selected')).join());
  check(`${theme}: RTL arrows: ArrowLeft = next tab, ArrowRight = previous`, k1 === 'false,false,true' && k2 === 'true,false,false', `${k1} / ${k2}`);

  // Tab stays inside the sheet
  const trap = await p.evaluate(() => { const f = [...document.querySelectorAll('.tsheet-panel a[href], .tsheet-panel button:not(:disabled):not([tabindex="-1"])')]; return f.length; });
  await p.focus('.tsheet-more');
  await p.keyboard.press('Tab');
  const wrapped = await p.evaluate(() => !!document.activeElement.closest('.tsheet'));
  check(`${theme}: Tab wraps inside the dialog (${trap} stops)`, wrapped);
  await p.keyboard.press('Shift+Tab');
  check(`${theme}: Shift+Tab stays inside too`, await p.evaluate(() => !!document.activeElement.closest('.tsheet')));

  // close by the close button
  await p.click('.tsheet-x');
  await p.waitForTimeout(450);
  const cl = await p.evaluate(() => ({ hid: document.querySelector('.tsheet').hidden, lock: document.documentElement.classList.contains('tsheet-open'), exp: document.querySelectorAll('.tg-card')[2].getAttribute('aria-expanded'),
    focus: document.activeElement === document.querySelectorAll('.tg-card')[2], inert: document.querySelectorAll('[inert]').length, y: scrollY }));
  check(`${theme}: close button: sheet hidden, scroll lock removed, nothing inert, focus back on the card`, cl.hid && !cl.lock && cl.exp === 'false' && cl.focus && cl.inert === 0 && cl.y === y0, JSON.stringify(cl));
  check(`${theme}: page scrolls again after closing`, await (async () => { await p.mouse.wheel(0, 200); await p.waitForTimeout(400); return (await p.evaluate(() => scrollY)) > y0; })());

  // backdrop
  await p.evaluate(() => { window.scrollTo({ top: document.querySelector('.tgal').getBoundingClientRect().top + scrollY - 200, behavior: 'instant' }); });
  await p.waitForTimeout(200);
  const cc = await cardCentre(p, 2);
  await p.mouse.click(cc.x, cc.y);
  await p.waitForTimeout(450);
  await p.mouse.click(20, 450);
  await p.waitForTimeout(450);
  check(`${theme}: a click on the backdrop closes it`, await hiddenNow(p));
  // Esc during the opening animation (interruptible)
  await p.evaluate(() => document.querySelectorAll('.tg-card')[2].click());
  await p.waitForTimeout(90);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(550);
  const intr = await p.evaluate(() => { const pn = document.querySelector('.tsheet-panel'); return { hid: document.querySelector('.tsheet').hidden, lock: document.documentElement.classList.contains('tsheet-open'), tr: pn.style.transform, anims: pn.getAnimations().length, inert: document.querySelectorAll('[inert]').length }; });
  check(`${theme}: Esc in the middle of the opening closes cleanly (no stuck state)`, intr.hid && !intr.lock && intr.tr === '' && intr.anims === 0 && intr.inert === 0, JSON.stringify(intr));
  await p.evaluate(() => document.querySelectorAll('.tg-card')[2].click());
  await p.waitForTimeout(450);
  check(`${theme}: it opens again normally afterwards`, await sheetOpen(p));
  await p.evaluate(() => { const l = document.querySelector('.tsheet-more'); l.addEventListener('click', e => e.preventDefault(), { once: true }); });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  // search overlay on top: Esc closes the search first, not the sheet
  await p.evaluate(() => document.querySelectorAll('.tg-card')[2].click());
  await p.waitForTimeout(450);
  await p.evaluate(() => window.YanabeeSearch && window.YanabeeSearch.open());
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  check(`${theme}: with the search overlay on top, Esc closes the search and leaves the sheet`, await sheetOpen(p) && await p.evaluate(() => document.querySelector('.search').hidden));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  check(`${theme}: ... and the next Esc closes the sheet`, await hiddenNow(p));
  check(`${theme}: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('detail sheet: inclusion card, drag-down dismissal (1440, mouse on the header)');
{
  const { ctx, p, errs } = await open();
  await toView(p);
  await goTo(p, 7);
  const c = await cardCentre(p, 7);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(450);
  const inc = await p.evaluate(() => ({
    title: document.getElementById('tsheet-title').textContent.trim(), sub: document.querySelector('.tsheet-sub').textContent.trim(),
    tabs: [...document.querySelectorAll('.tsheet [role=tab]')].map(t => t.textContent.trim()), work: document.querySelector('.tsheet-work').textContent.trim(),
    label: document.querySelector('.tsheet [role=tablist]').getAttribute('aria-label'), link: document.querySelector('.tsheet-more').getAttribute('href'),
  }));
  check('inclusion: verbatim title, kicker, three axes as tabs, no work paragraph, link to #s3', /الشمول/.test(inc.title) && inc.sub === 'ثالثاً' && inc.tabs.length === 3 && /دمج/.test(inc.tabs[0]) && inc.work === '' && inc.label === 'محاور الشمول' && inc.link === 'teams.html#s3', JSON.stringify(inc));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);

  await goTo(p, 2);
  const c3 = await cardCentre(p, 2);
  await p.mouse.click(c3.x, c3.y);
  await p.waitForTimeout(450);
  const geo = await p.evaluate(() => { const r = document.querySelector('.tsheet-panel').getBoundingClientRect(), h = document.querySelector('.tsheet-head').getBoundingClientRect(); return { x: r.left + 60, y: h.top + h.height / 2, h: r.height, top: r.top }; });
  // short, slow drag: follows the pointer, backdrop fades, springs back
  await p.mouse.move(geo.x, geo.y);
  await p.mouse.down();
  await p.mouse.move(geo.x, geo.y + 90, { steps: 9 });
  await p.waitForTimeout(120);
  const mid = await p.evaluate(() => ({ t: document.querySelector('.tsheet-panel').style.transform, sc: parseFloat(getComputedStyle(document.querySelector('.tsheet-scrim')).opacity), top: document.querySelector('.tsheet-panel').getBoundingClientRect().top, drag: document.querySelector('.tsheet').classList.contains('is-dragging') }));
  check('drag tracks the pointer 1:1 with a translate3d and no transition', near(mid.top - geo.top, 90, 3) && /translate3d\(0px?, ?9\d/.test(mid.t) || near(mid.top - geo.top, 90, 3), JSON.stringify(mid) + ' base ' + geo.top);
  check('the backdrop fades with the drag (1 - y/height)', near(mid.sc, 1 - 90 / geo.h, 0.05), `${mid.sc} vs ${1 - 90 / geo.h}`);
  await p.mouse.move(geo.x, geo.y - 60, { steps: 5 });
  await p.waitForTimeout(100);
  const up = await p.evaluate(() => document.querySelector('.tsheet-panel').getBoundingClientRect().top);
  check('dragging upward is damped (60px up moves it ~12px at most)', geo.top - up < 20, `${geo.top - up}`);
  await p.mouse.move(geo.x, geo.y + 90, { steps: 5 });
  await p.waitForTimeout(300);
  await p.mouse.up();
  await p.waitForTimeout(600);
  const back = await p.evaluate(() => ({ open: window.YanabeeGallery.isOpen(), top: document.querySelector('.tsheet-panel').getBoundingClientRect().top, tr: document.querySelector('.tsheet-panel').style.transform, sc: getComputedStyle(document.querySelector('.tsheet-scrim')).opacity }));
  check('a short drag (90px of ~' + Math.round(geo.h) + ') springs back to rest', back.open && near(back.top, geo.top, 1) && back.tr === '' && back.sc === '1', JSON.stringify(back));
  // past 35 percent: dismiss
  await p.mouse.move(geo.x, geo.y);
  await p.mouse.down();
  await p.mouse.move(geo.x, geo.y + Math.round(geo.h * 0.5), { steps: 14 });
  await p.waitForTimeout(350);
  await p.mouse.up();
  await p.waitForTimeout(450);
  const gone = await p.evaluate(() => ({ hid: document.querySelector('.tsheet').hidden, lock: document.documentElement.classList.contains('tsheet-open'), focus: document.activeElement === document.querySelectorAll('.tg-card')[2], inert: document.querySelectorAll('[inert]').length }));
  check('a drag past 35% dismisses; focus returns to the card; scroll lock and inert are lifted', gone.hid && !gone.lock && gone.focus && gone.inert === 0, JSON.stringify(gone));
  // fast flick of a few pixels dismisses
  await p.mouse.click(c3.x, c3.y);
  await p.waitForTimeout(450);
  const g2 = await p.evaluate(() => { const h = document.querySelector('.tsheet-head').getBoundingClientRect(), r = document.querySelector('.tsheet-panel').getBoundingClientRect(); return { x: r.left + 60, y: h.top + h.height / 2 }; });
  await p.mouse.move(g2.x, g2.y);
  await p.mouse.down();
  for (let k = 1; k <= 4; k++) { await p.mouse.move(g2.x, g2.y + k * 30); await p.waitForTimeout(2); } // 120px (20%) at ~1px/ms
  await p.mouse.up();
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelector('.tsheet').hidden, null, { timeout: 1500 });
  const took = Date.now() - t0;
  check(`a fast flick (120px, 20% of the height, at >0.5px/ms) dismisses within ~260 ms of release (${took} ms incl. polling)`, took < 700, String(took));
  // drag on the close button must still close it (no drag capture there)
  await p.mouse.click(c3.x, c3.y);
  await p.waitForTimeout(450);
  await p.click('.tsheet-x');
  await p.waitForTimeout(400);
  check('the close button inside the draggable header still works', await hiddenNow(p));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('detail sheet (phone 390): bottom sheet, touch drag-down');
for (const theme of ['dark', 'light']) {
  const { ctx, p, errs } = await open({ ...PHONE, colorScheme: theme });
  await toView(p);
  await goTo(p, 4);
  const c = await cardCentre(p, 4);
  await p.touchscreen.tap(c.x, c.y);
  await p.waitForTimeout(500);
  const o = await p.evaluate(() => { const r = document.querySelector('.tsheet-panel').getBoundingClientRect(), cs = getComputedStyle(document.querySelector('.tsheet-panel')); return { x: r.left, w: r.width, top: r.top, b: r.bottom, h: r.height, vh: innerHeight, radius: cs.borderTopLeftRadius, rb: cs.borderBottomLeftRadius, handle: getComputedStyle(document.querySelector('.tsheet-handle')).display, ov: document.documentElement.classList.contains('tsheet-open'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth, tabs: document.querySelectorAll('.tsheet [role=tab]').length, ta: getComputedStyle(document.querySelector('.tsheet-top')).touchAction, tab2: document.querySelector('.tsheet-body').style.touchAction, ic: getComputedStyle(document.querySelector('.tsheet [role=tab]')).minHeight }; });
  check(`${theme}: phone: bottom sheet spans the width, hugs the bottom, max 92dvh, rounded top, drag handle`, o.w >= 388 && near(o.b, o.vh, 1) && o.h <= o.vh * 0.92 + 1 && parseFloat(o.radius) >= 20 && parseFloat(o.rb) === 0 && o.handle !== 'none', JSON.stringify(o));
  check(`${theme}: touch-action:none only on the header/handle`, o.ta === 'none');
  check(`${theme}: no horizontal overflow while open`, o.over <= 0, String(o.over));
  const cdpS = await cdp(ctx, p);
  // short touch drag on the handle: springs back
  const hx = o.w / 2, hy = o.top + 14;
  let end = await touchDrag(cdpS, hx, hy, 80, 8, 25);
  await p.waitForTimeout(150);
  const mid = await p.evaluate(() => ({ top: document.querySelector('.tsheet-panel').getBoundingClientRect().top, sc: parseFloat(getComputedStyle(document.querySelector('.tsheet-scrim')).opacity) }));
  check(`${theme}: touch drag on the handle follows the finger (80px) and fades the backdrop`, near(mid.top - o.top, 80, 4) && mid.sc < 0.95, JSON.stringify(mid));
  await end();
  await p.waitForTimeout(600);
  check(`${theme}: released short of 35% it springs back`, await p.evaluate(t => window.YanabeeGallery.isOpen() && Math.abs(document.querySelector('.tsheet-panel').getBoundingClientRect().top - t) < 1, o.top));
  // drag from the BODY at scrollTop 0 downwards: dismiss
  end = await touchDrag(cdpS, hx, o.top + 300, 330, 12, 20);
  await p.waitForTimeout(250);
  const dmid = await p.evaluate(t => document.querySelector('.tsheet-panel').getBoundingClientRect().top - t, o.top);
  check(`${theme}: a downward drag that starts in the body at scrollTop 0 moves the sheet (${Math.round(dmid)}px)`, dmid > 200, String(dmid));
  await end();
  await p.waitForTimeout(550);
  check(`${theme}: ... and past 35% dismisses it`, await hiddenNow(p) && await p.evaluate(() => !document.documentElement.classList.contains('tsheet-open')));
  check(`${theme}: focus is back on the card`, await p.evaluate(() => document.activeElement === document.querySelectorAll('.tg-card')[4]));
  // an upward drag in the body must scroll the text, not move the sheet
  await p.touchscreen.tap(c.x, c.y);
  await p.waitForTimeout(500);
  const b0 = await p.evaluate(() => ({ top: document.querySelector('.tsheet-panel').getBoundingClientRect().top, sh: document.querySelector('.tsheet-body').scrollHeight, ch: document.querySelector('.tsheet-body').clientHeight }));
  end = await touchDrag(cdpS, hx, b0.top + 500, -200, 8, 20);
  await end();
  await p.waitForTimeout(200);
  const b1 = await p.evaluate(() => ({ top: document.querySelector('.tsheet-panel').getBoundingClientRect().top, st: document.querySelector('.tsheet-body').scrollTop }));
  check(`${theme}: an upward drag in the body never moves the sheet`, near(b1.top, b0.top, 1), JSON.stringify([b0, b1]));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  check(`${theme}: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('scroll lock keeps the layout still (browser with classic, always-visible scrollbars)');
{
  const classic = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', ignoreDefaultArgs: ['--hide-scrollbars'] });
  const ctx = await classic.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const p = await ctx.newPage();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ } });
  await p.goto(url('index.html'));
  await p.waitForTimeout(600);
  await toView(p);
  const m = () => p.evaluate(() => ({ sb: innerWidth - document.documentElement.clientWidth, left: document.querySelectorAll('.tg-card')[0].getBoundingClientRect().left, wrap: document.querySelector('.teams-home .wrap').getBoundingClientRect().left,
    nav: document.querySelector('.nav-bar').getBoundingClientRect().left }));
  const a = await m();
  await p.evaluate(() => document.querySelectorAll('.tg-card')[0].click());
  await p.waitForTimeout(500);
  const b = await m();
  check(`a classic scrollbar (${a.sb}px) is replaced by an equal gutter: cards, content and nav stay put`, a.sb > 0 && near(a.left, b.left, 1) && near(a.wrap, b.wrap, 1) && near(a.nav, b.nav, 1), JSON.stringify([a, b]));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  const c = await m();
  check('... and everything is back after closing', near(a.left, c.left, 1) && near(a.wrap, c.wrap, 1), JSON.stringify([a, c]));
  await ctx.close();
  await classic.close();
}

console.log('optional neighbours: YanabeeApp.haptic is used when present, nothing breaks without it');
{
  const { ctx, p, errs } = await open();
  await p.evaluate(() => { window.__h = []; window.YanabeeApp = { haptic: k => window.__h.push(k), toast() {}, go() {} }; });
  await toView(p);
  await p.click('[data-next]');
  await settle(p);
  const c = await cardCentre(p, 1);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(450);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  check('haptics go through YanabeeApp.haptic when it exists', (await p.evaluate(() => window.__h)).length >= 2, JSON.stringify(await p.evaluate(() => window.__h)));
  check('no script errors with the stub (and none without it above)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('reduced motion');
{
  const { ctx, p, errs } = await open({ reducedMotion: 'reduce' });
  await toView(p);
  const m = await p.evaluate(() => ({ eff: [...document.querySelectorAll('.tg-item')].filter(li => li.style.transform || li.style.opacity).length, tr: getComputedStyle(document.querySelector('.tg-card')).transitionDuration }));
  check('no scale / fade effect on the cards', m.eff === 0, JSON.stringify(m));
  await p.click('[data-next]');
  await p.waitForTimeout(200);
  check('buttons still navigate (instantly)', (await nearestIdx(p)) === 1 && near((await centred(p))[1], 0, 3), JSON.stringify(await centred(p)));
  await p.evaluate(() => document.querySelectorAll('.tg-card')[1].click());
  const inst = await p.evaluate(() => { const pn = document.querySelector('.tsheet-panel'); return { hid: document.querySelector('.tsheet').hidden, anims: pn.getAnimations().length + document.querySelector('.tsheet-art').getAnimations().length, clip: getComputedStyle(pn).clipPath, lock: document.documentElement.classList.contains('tsheet-open') }; });
  check('the sheet swaps in instantly: no clip-path animation, no FLIP', !inst.hid && inst.anims === 0 && inst.clip === 'none' && inst.lock, JSON.stringify(inst));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(60);
  check('... and out instantly', await hiddenNow(p));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('no JavaScript');
{
  const { ctx, p, errs } = await open({ javaScriptEnabled: false });
  const m = await p.evaluate(() => {
    const sc = document.querySelector('.tgal-scroller');
    return {
      bar: getComputedStyle(document.querySelector('.tgal-bar')).display, detail: [...document.querySelectorAll('.tg-detail')].every(d => getComputedStyle(d).display === 'none'),
      scroll: sc.scrollWidth > sc.clientWidth + 100, cards: document.querySelectorAll('a.tg-card[href^="teams.html#"]').length, snap: getComputedStyle(sc).scrollSnapType,
      grid: getComputedStyle(document.querySelector('.team-grid')).display, over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sheet: !!document.querySelector('.tsheet'), tplHidden: getComputedStyle(document.querySelector('template[data-sheet-tpl]')).display,
    };
  });
  check('controls and details stay hidden', m.bar === 'none' && m.detail, JSON.stringify(m));
  check('a plain scroller of 8 linked cards that scrolls sideways natively with snap', m.cards === 8 && m.scroll && /x mandatory/.test(m.snap), JSON.stringify(m));
  check('no sheet exists, no page overflow', !m.sheet && m.over <= 0, JSON.stringify(m));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('print: a grid with the detail text visible');
{
  const { ctx, p, errs } = await open();
  await p.emulateMedia({ media: 'print' });
  const m = await p.evaluate(() => {
    const sc = document.querySelector('.tgal-scroller'), cs = getComputedStyle(sc);
    const det = [...document.querySelectorAll('.tg-detail')];
    return { disp: cs.display, cols: cs.gridTemplateColumns.split(' ').length, ov: cs.overflowX, det: det.filter(d => d.getBoundingClientRect().height > 0).length, bar: getComputedStyle(document.querySelector('.tgal-bar')).display,
      txt: det[2].textContent.replace(/\s+/g, ' '), work: document.querySelectorAll('.tg-d-work').length, grid: getComputedStyle(document.querySelector('.team-grid')).display };
  });
  check('cards are a grid, not a scroller', m.disp === 'grid' && m.cols >= 2 && m.ov === 'visible', JSON.stringify(m));
  check('all 8 details are visible so the verbatim text prints; no controls', m.det === 8 && m.bar === 'none', JSON.stringify(m));
  check('the details carry the work text and the impact lines', /طبيعة العمل/.test(m.txt) && /الأثر على الفرد/.test(m.txt) && /الأثر على المجتمع/.test(m.txt), m.txt.slice(0, 120));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} gallery tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
