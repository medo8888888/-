// Pitch (pitch.html) tests — Playwright + Chromium, file:// URLs:  node manara/tools/test-pitch.mjs
//
//  1. Loads clean in ar/en × dark/light at 390 and 1440, no horizontal overflow on any tab or slide, one h1, ARIA tabs
//  2. Data: 15 slides (drone → control room → robot story), the strict path adds up to exactly 3:00 and the extended path to exactly 7:00, one live moment of 55 s
//  3. Deck: keyboard (direction-aware arrows, Home/End, digits, F, N, O, ?, L, S, Esc), path skipping, swipe, overview, notes, timer
//  4. Slide modules: proof (two keys + human), building section, dispatch (live ManaraSim: farther-but-faster, jam, close), the whole of Qatar (real OSM map + the real
//     farther-but-faster example: static baseline = live ManaraNational.findFartherButFaster(7); another seed; without the engine/data), evidence (static baseline = live engine)
//  5. Script tab: timestamps, one live moment with 5 steps, pace, fallback levels, 7-minute path, mirror toggle
//  6. Q&A: 50+ questions in seven groups (13 on Qatar-wide data), both languages each, weak spots with a "say it first" line, search (Arabic + English), filters, deep link
//  7. Booth: checklist (persisted), rehearsal timer (saves a run), ten risks, numbers sheet, personal fields (textContent only)
//  8. Print: A4 PDF page counts for slides / script / Q&A / booth
//  9. Honesty scan: banned phrases, every number on the numbers sheet has a source, contrast of slide text
// 10. Motion: reduced motion = static final frames, loops only when allowed, travel direction honours RTL, counters, the robot's walk, the timer ring,
//     pause when hidden, no flashing faster than 3 Hz, print unaffected; the control-room / robot numbers equal the live engines; Tier 4 prices equal the Build page
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, overflow, check, done, SITE } from './lib.mjs';

const browser = await launch();
const section = t => console.log(`\n${t}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async (opts = {}) => {
  const o = await openPage(browser, 'pitch.html', { width: 1440, height: 1000, lang: 'ar', reducedMotion: 'reduce', ...opts });
  await o.page.waitForFunction(() => window.__pitchReady === true, null, { timeout: 8000 }).catch(() => o.errors.push('pitch never set __pitchReady'));
  return o;
};
const idx = page => page.evaluate(() => ManaraPitch.state.i);
const key = (page, k, o) => page.keyboard.press(k, o);

// ======================================================================= 1. loads clean
section('1. Loads clean · layout · ARIA');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
  const { page, errors, ctx } = await open({ lang, theme, width, height: width < 600 ? 844 : 1000 });
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  const tabs = ['slides', 'script', 'qa', 'booth'];
  let worst = 0, bad = [];
  for (const t of tabs) {
    await page.click('#t-' + t); await page.waitForTimeout(120);
    const o = await overflow(page); worst = Math.max(worst, o.scrollW - o.W); bad = bad.concat(o.bad.map(b => t + ':' + b));
  }
  check(`${tag}: no horizontal overflow on any tab`, worst <= 0 && bad.length === 0, bad.join(', '));
  if (width === 1440 && theme === 'dark') {
    await page.click('#t-slides');
    const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, tabs: [...document.querySelectorAll('[role=tab]')].map(t => t.getAttribute('aria-selected')), panels: [...document.querySelectorAll('[role=tabpanel]')].filter(p => !p.hidden).length, lang: document.documentElement.lang, dir: document.documentElement.dir, live: !!document.querySelector('#deck-live[aria-live]') }));
    check(`${tag}: one h1, one open panel, lang/dir set, live region`, r.h1 === 1 && r.panels === 1 && r.tabs[0] === 'true' && r.lang === lang && r.dir === (lang === 'ar' ? 'rtl' : 'ltr') && r.live, JSON.stringify(r));
  }
  // every slide fits its frame (stage mode) or flows without sideways overflow (reader mode)
  await page.click('#t-slides');
  const fit = await page.evaluate(() => {
    const out = [];
    ManaraPitch.state.skip = false;
    for (let i = 0; i < ManaraPitch.slides.length; i++) {
      ManaraPitch.goTo(i, { force: true, noHash: true, noScroll: true });
      const s = document.querySelector('.slide.is-active'), st = document.querySelector('#stage');
      const reader = document.querySelector('#deck').dataset.mode === 'reader';
      if (!reader && s.scrollHeight > s.clientHeight + 2) out.push(`slide ${i + 1}: content ${s.scrollHeight} > frame ${s.clientHeight}`);
      if (s.scrollWidth > s.clientWidth + 1) out.push(`slide ${i + 1}: wider ${s.scrollWidth} > ${s.clientWidth}`);
    }
    return out;
  });
  check(`${tag}: all 15 slides fit (no clipped content)`, fit.length === 0, fit.join('; '));
  await ctx.close();
}

// ======================================================================= 2. data
section('2. Data: budgets, paths, the one live moment');
{
  const { page } = await open();
  const d = await page.evaluate(() => {
    const S = ManaraPitch.slides, sum = k => S.reduce((a, s) => a + s[k], 0);
    return { n: S.length, t3: sum('t3'), t7: sum('t7'), live: S.filter(s => s.live).length, liveT: ManaraPitch.live.reduce((a, s) => a + (s.t1 - s.t0), 0), liveEnd: ManaraPitch.live[ManaraPitch.live.length - 1].t1, liveB: S.find(s => s.live).t3,
      dom: document.querySelectorAll('.slide').length, say3: S.filter(s => s.t3 > 0).every(s => s.say3 && s.say3.ar && s.say3.en), say7: S.every(s => (s.say3 || s.more7)), skipped: S.filter(s => s.t3 === 0).map(s => s.id) };
  });
  check('15 slides in the data and in the page', d.n === 15 && d.dom === 15, JSON.stringify(d));
  check('strict path = exactly 3:00 (180 s)', d.t3 === 180, String(d.t3));
  check('extended path = exactly 7:00 (420 s)', d.t7 === 420, String(d.t7));
  check('exactly ONE live moment, 55 s, five steps that add up', d.live === 1 && d.liveT === 55 && d.liveB === 55 && d.liveEnd === 55, JSON.stringify(d));
  check('every slide in the strict path has a spoken line in both languages', d.say3);
  check('every slide has something to say in the extended path', d.say7);
  check('the strict path skips the phones and dispatch slides (shown live)', d.skipped.join() === 'people,dispatch', d.skipped.join());
}

// ======================================================================= 3. deck behaviour
section('3. Deck: keyboard · skipping · swipe · overview · notes · timer · present');
{
  const { page, errors } = await open({ lang: 'ar', width: 1440, height: 1000 });
  await page.click('#t-slides');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  check('opens on slide 1 with 15 progress segments', (await idx(page)) === 0 && (await page.$$eval('.db-seg', e => e.length)) === 15);
  // Arabic = RTL: ArrowLeft goes forward, ArrowRight back
  await key(page, 'ArrowLeft'); check('RTL: ArrowLeft = next slide', (await idx(page)) === 1);
  await key(page, 'ArrowRight'); check('RTL: ArrowRight = previous slide', (await idx(page)) === 0);
  await key(page, 'End'); check('End goes to the last slide', (await idx(page)) === 14);
  await key(page, 'Home'); check('Home goes to the first slide', (await idx(page)) === 0);
  await key(page, '5'); await sleep(900); check('digit 5 goes to slide 5', (await idx(page)) === 4);
  await key(page, '1'); await key(page, '0'); await sleep(100); check('digits 1 then 0 go to slide 10', (await idx(page)) === 9);
  // strict path skipping: 7 -> 10
  await page.evaluate(() => ManaraPitch.goTo(7, { force: true })); await key(page, 'ArrowLeft');
  check('strict path: next from the live moment skips slides 9 and 10 → slide 11', (await idx(page)) === 10, String(await idx(page)));
  await page.click('.db-path button[aria-pressed=false]'); // 7 min
  await page.evaluate(() => ManaraPitch.goTo(7, { force: true })); await key(page, 'ArrowLeft');
  check('extended path: next from the live moment → slide 9', (await idx(page)) === 8);
  await page.click('.db-path button:first-child');
  // English flips direction
  await key(page, 'l'); await sleep(200);
  check('L switches language (en, ltr)', await page.evaluate(() => document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr'));
  await page.evaluate(() => ManaraPitch.goTo(0, { force: true }));
  await key(page, 'ArrowRight'); check('LTR: ArrowRight = next slide', (await idx(page)) === 1);
  await key(page, 'ArrowLeft'); check('LTR: ArrowLeft = previous slide', (await idx(page)) === 0);
  // progress + aria-live
  await page.evaluate(() => ManaraPitch.goTo(2, { force: true }));
  check('live region announces the slide', /Slide 3 of 15/.test(await page.$eval('#deck-live', e => e.textContent)));
  check('exactly one slide is visible to AT', (await page.$$eval('.slide[aria-hidden=false]', e => e.length)) === 1);
  check('progress segment marks the current slide', (await page.$$eval('.db-seg[aria-current=true]', e => e.length)) === 1);
  // swipe (touch pointer events)
  await page.evaluate(() => ManaraPitch.goTo(1, { force: true }));
  const swipe = (dx) => page.evaluate((dx) => { const st = document.querySelector('#stage'), r = st.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; const ev = (t, cx) => new PointerEvent(t, { bubbles: true, clientX: cx, clientY: y, pointerType: 'touch', isPrimary: true }); st.dispatchEvent(ev('pointerdown', x)); st.dispatchEvent(ev('pointerup', x + dx)); }, dx);
  await swipe(-120); check('LTR swipe left = next', (await idx(page)) === 2);
  await swipe(120); check('LTR swipe right = previous', (await idx(page)) === 1);
  await key(page, 'l'); await sleep(150);
  await swipe(120); check('RTL swipe right = next', (await idx(page)) === 2);
  await swipe(-120); check('RTL swipe left = previous', (await idx(page)) === 1);
  // overview
  await key(page, 'o'); await sleep(200);
  check('O opens the overview with 15 thumbnails', (await page.$$eval('.ov-item', e => e.length)) === 15 && await page.$eval('#overview', e => !e.hidden));
  check('overview thumbnails are inert clones (no duplicate ids inside the deck)', await page.evaluate(() => { const ids = [...document.querySelectorAll('#deck [id]')].map(e => e.id); return ids.length === new Set(ids).size && [...document.querySelectorAll('.ov-item [inert]')].length === 15; }));
  check('overview marks the skipped slides', (await page.$$eval('.ov-item.skipped', e => e.length)) === 2);
  await page.click('.ov-item[data-i="6"]'); await sleep(150);
  check('clicking a thumbnail jumps and closes', (await idx(page)) === 6 && await page.$eval('#overview', e => e.hidden));
  await key(page, 'o'); await key(page, 'Escape'); check('Esc closes the overview', await page.$eval('#overview', e => e.hidden));
  // help
  await key(page, '?'); check('? opens the shortcuts panel', await page.$eval('#kbd-help', e => !e.hidden) && (await page.$$eval('#kbd-help kbd', e => e.length)) >= 10);
  await key(page, 'Escape');
  // notes
  const notesBefore = await page.evaluate(() => ManaraPitch.state.notes);
  await key(page, 'n'); check('N toggles the notes panel', (await page.evaluate(() => ManaraPitch.state.notes)) === !notesBefore);
  await key(page, 'n'); if (!(await page.evaluate(() => ManaraPitch.state.notes))) await key(page, 'n');
  await page.evaluate(() => ManaraPitch.goTo(4, { force: true }));
  const nt = await page.evaluate(() => ({ say: !!document.querySelector('#notes .nt-say'), weak: !!document.querySelector('#notes .nt-weak'), qa: document.querySelectorAll('#notes .nt-qa button').length, next: !!document.querySelector('#notes .nt-next'), timer: !!document.querySelector('#notes .nt-clock') }));
  check('notes show: say-this, weak spot, related questions, next-up, timer', nt.say && nt.weak && nt.qa >= 3 && nt.next && nt.timer, JSON.stringify(nt));
  await page.evaluate(() => ManaraPitch.goTo(8, { force: true }));
  check('a slide outside the 3-minute path says so', await page.$eval('#notes', e => /outside the strict|خارج المسار/.test(e.textContent)));
  // timer
  await page.evaluate(() => { ManaraPitch.goTo(0, { force: true }); });
  await page.click('#notes .nt-ctl .btn-ghost'); await page.evaluate(() => ManaraPitch.timer.running && document.querySelector('#notes .nt-ctl .btn-primary').click());
  check('timer starts stopped at 00:00', await page.$eval('.db-timer .tmv', e => e.textContent.startsWith('00:00 / 03:00')));
  await key(page, (await page.evaluate(() => document.documentElement.dir)) === 'rtl' ? 'ArrowLeft' : 'ArrowRight'); await sleep(1300);
  const tm = await page.evaluate(() => ({ run: ManaraPitch.timer.running, txt: document.querySelector('.db-timer .tmv').textContent }));
  check('leaving slide 1 auto-starts the timer', tm.run && !/^00:00 \//.test(tm.txt), JSON.stringify(tm));
  await key(page, 's'); check('S pauses the timer', !(await page.evaluate(() => ManaraPitch.timer.running)));
  await key(page, 's'); check('S resumes the timer', await page.evaluate(() => ManaraPitch.timer.running));
  await page.evaluate(() => { const T = ManaraPitch.timer; T.running = false; T.acc = 200; });   // over budget on the 3-minute path
  await page.evaluate(() => ManaraPitch.goTo(2, { force: true })); await sleep(100);
  check('timer turns red past 3:00', (await page.$eval('.db-timer', e => e.getAttribute('data-st'))) === 'over');
  // present
  await page.evaluate(() => { const T = ManaraPitch.timer; T.acc = 0; });
  await key(page, 'f'); await sleep(300);
  check('F enters present mode (fixed full-viewport deck)', await page.evaluate(() => { const d = document.querySelector('#deck'), r = d.getBoundingClientRect(); return d.classList.contains('is-present') && getComputedStyle(d).position === 'fixed' && r.width >= innerWidth - 1 && r.height >= innerHeight - 1; }));
  const geo = await page.evaluate(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return { w: r.width, h: r.height, ratio: r.width / r.height, fits: r.width <= innerWidth + 1 && r.height <= innerHeight + 1 }; });
  check('present: 16:9 stage fits the screen', Math.abs(geo.ratio - 16 / 9) < 0.02 && geo.fits, JSON.stringify(geo));
  await key(page, 'ArrowLeft'); await key(page, ' '); check('present: arrows and Space step the deck', (await idx(page)) >= 3);
  await page.mouse.move(300, 300); await sleep(3300);
  check('present: the control bar auto-hides when idle', await page.$eval('#deck', e => e.classList.contains('is-idle')));
  await page.mouse.move(320, 320); await sleep(150);
  check('present: moving the mouse brings the bar back', await page.$eval('#deck', e => !e.classList.contains('is-idle')));
  await key(page, 'Escape'); await sleep(200);
  check('Esc leaves present mode', await page.$eval('#deck', e => !e.classList.contains('is-present')) && await page.evaluate(() => !document.documentElement.classList.contains('pt-present')));
  check('no console errors during the deck run', errors.length === 0, errors.join(' | '));
}

// ======================================================================= 4. slide modules
section('4. Slide modules: proof · building · dispatch · evidence');
{
  const { page, errors } = await open({ lang: 'en', width: 1440, height: 1000 });
  await page.click('#t-slides');
  // proof
  await page.evaluate(() => { ManaraPitch.state.skip = false; ManaraPitch.goTo(5, { force: true }); });
  const pf = () => page.evaluate(() => ({ s: document.querySelector('#pf-badge').dataset.state, human: document.querySelector('.pf-human').disabled }));
  check('proof: starts CLEAR, human key locked', (await pf()).s === 'clear' && (await pf()).human);
  await page.click('.pf-key[data-key=k1]');
  check('proof: one key = SUSPECT only (human still locked)', (await pf()).s === 'suspect' && (await pf()).human);
  await page.click('.pf-key[data-key=k2]');
  check('proof: two keys = CONFIRMED and the human key unlocks', (await pf()).s === 'confirmed' && !(await pf()).human);
  await page.click('.pf-human');
  check('proof: human approves = PUBLIC alert', (await pf()).s === 'public');
  await page.click('.pf-key[data-key=k1]');
  check('proof: dropping a key withdraws the approval', (await pf()).s === 'suspect' && (await pf()).human);
  await page.click('[data-decoy=mug]'); check('proof: hot mug fools one key only → SUSPECT', (await pf()).s === 'suspect');
  await page.click('[data-decoy=video]'); check('proof: fire video fools one key only → SUSPECT', (await pf()).s === 'suspect');
  await page.click('[data-decoy=reset]'); check('proof: reset → CLEAR', (await pf()).s === 'clear');
  check('proof: the 66.7% / 12 of 18 honesty card is on the slide', await page.$eval('.s-proof', e => /66\.7%/.test(e.textContent) && /12\s*\/\s*18/.test(e.textContent) && /not AI|rule-based/i.test(e.textContent)));
  check('proof: links to the Evidence Lab and its Fool-me tab', await page.$$eval('.s-proof a', a => a.map(x => x.getAttribute('href')).join()) === 'detect.html,detect.html#fool');
  // building
  await page.evaluate(() => ManaraPitch.goTo(7, { force: true }));
  const routes = () => page.evaluate(() => ({ a: !document.querySelector('#bld .bd-route:nth-of-type(1)') ? null : 0, offA: [...document.querySelectorAll('#bld .bd-route')].map(e => e.classList.contains('off')) }));
  let r = await routes(); check('building: Ravi routes via Stair A at first', r.offA[0] === false && r.offA[1] === true);
  await page.click('#lv-lock'); r = await routes();
  check('building: locking Stair A flips Ravi to Stair B', r.offA[0] === true && r.offA[1] === false && /Use Stair B/.test(await page.$eval('#lv-msg', e => e.textContent)));
  await page.click('#lv-safe'); check('building: "I\'m safe" turns Ravi green and counts 1 of 3', await page.evaluate(() => /1 of 3/.test(document.querySelector('#bld').textContent) && document.querySelector('#bd-ravi circle').getAttribute('class') === 'bd-safe'));
  check('live moment: opens Mission Control with a fixed scenario + seed', (await page.$eval('#lv-open', a => a.getAttribute('href') + '|' + a.target)) === 'mission.html#scenario=fire-night&seed=1|_blank');
  check('live moment: lists exactly five judge steps', (await page.$$eval('#lv-steps li', e => e.length)) === 5);
  // dispatch
  await page.evaluate(() => ManaraPitch.goTo(9, { force: true })); await sleep(200);
  check('dispatch: live ManaraSim is loaded', await page.evaluate(() => !!window.ManaraSim && ManaraPitch.DP.ready));
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#dp-rows .dp-row')].map(r => ({ eta: r.querySelector('.dp-eta').firstChild.textContent, unit: r.querySelector('.dp-unit').textContent, fbf: !!r.querySelector('.dp-why.fbf'), why: r.querySelector('.dp-why').textContent })));
  let rw = await rows();
  check('dispatch: fire, ambulance, police and hospital rows at 07:00', rw.length === 4, JSON.stringify(rw.map(x => x.unit)));
  check('dispatch: at 07:00 rush hour the FARTHER fire station is the FASTER one', rw[0].fbf && /farther but .* faster/.test(rw[0].why) && /Station B/.test(rw[0].unit), rw[0].why);
  await page.$eval('#dp-hour', e => { e.value = 4; e.dispatchEvent(new Event('input', { bubbles: true })); });
  rw = await rows(); check('dispatch: at 04:00 the nearest station is also the fastest', !rw[0].fbf && /Station A/.test(rw[0].unit), JSON.stringify(rw[0]));
  await page.$eval('#dp-hour', e => { e.value = 7; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const eta0 = (await rows())[0].eta;
  await page.selectOption('#dp-seg', 'AR-E'); await page.click('#dp-jam'); await sleep(100);
  const eta1 = (await rows())[0];
  check('dispatch: jamming the road to the chosen station re-dispatches (ETA or unit changes)', eta1.eta !== eta0 || !/Station B/.test(eta1.unit), `${eta0} → ${eta1.eta} ${eta1.unit}`);
  check('dispatch: a jammed road is drawn (grey/red segment present)', (await page.$$eval('#dp-map .mp-road', e => e.length)) > 30);
  await page.click('#dp-close'); await sleep(100);
  check('dispatch: a closed road is drawn dashed with a cross', (await page.$$eval('#dp-map .mp-road.closed', e => e.length)) === 1 && (await page.$$eval('#dp-map .mp-x', e => e.length)) === 1);
  await page.click('#dp-clear'); await sleep(100);
  check('dispatch: clear restores the first answer', (await rows())[0].eta === eta0);
  await page.$eval('#dp-load', e => { e.value = 1.5; e.dispatchEvent(new Event('input', { bubbles: true })); });
  check('dispatch: heavier traffic widens the gap (still farther-but-faster)', (await rows())[0].fbf);
  check('dispatch: states "SIM", fictional stations and that 999 stays the dispatcher', await page.$eval('.s-dispatch', e => /SIM/.test(e.textContent) && /fictional/i.test(e.textContent) && /999/.test(e.textContent)));
  const click = await page.evaluate(() => { const hit = document.querySelector('#dp-map .mp-hit[data-seg="MS5"]'); hit.dispatchEvent(new MouseEvent('click', { bubbles: true })); return ManaraPitch.DP.state.MS5; });
  check('dispatch: clicking a road on the map jams it', click === 1);
  await page.click('#dp-clear');
  // evidence: the static baseline equals what the engine computes now
  await page.evaluate(() => ManaraPitch.goTo(12, { force: true }));
  const live = await page.evaluate(() => { const b = ManaraPitch.EV_BASE, l = ManaraPitch.evSummarise(ManaraSim.ab({ preset: b.preset, seed: b.seed })); const r = x => x == null ? null : Math.round(x * 10) / 10; return { b: [r(b.head.ord), r(b.head.man), ...b.inj, ...b.disp, b.siren, b.personal], l: [r(l.head.ord), r(l.head.man), ...l.inj, ...l.disp, l.siren, l.personal] }; });
  check('evidence: the static fire-night seed-1 baseline equals the live ManaraSim.ab() result (not stale)', JSON.stringify(live.b) === JSON.stringify(live.l), JSON.stringify(live));
  check('evidence: shows ordinary vs MANARA bars labelled SIM and a mechanism-check note', await page.$eval('.s-evidence', e => (e.querySelectorAll('.ev-pair').length === 6) && /SIM/.test(e.textContent) && /mechanism check/i.test(e.textContent)));
  check('evidence: states the awkward trade-off (siren 14 s vs first personal message 39 s)', await page.$eval('#ev-trade', e => /14 s/.test(e.textContent) && /39 s/.test(e.textContent)));
  await page.selectOption('#ev-preset', 'heat-day'); await page.fill('#ev-seed', '7'); await page.click('#ev-go');
  await page.waitForFunction(() => /computed just now|heat/i.test(document.querySelector('#ev-trade').textContent), null, { timeout: 15000 });
  check('evidence: any scenario and seed re-runs live (heat, seed 7 — including the awkward result)', await page.$eval('#ev-trade', e => /seed 7/.test(e.textContent)) && (await page.$$eval('.ev-pair b', e => e.length)) === 6);
  check('evidence: the "not yet" column says N/A / not measured and never invents numbers', await page.$eval('#ev-todo', e => /N\/A/.test(e.textContent) && /Not measured yet/.test(e.textContent) && !/\d+\s*ms/.test(e.textContent)));
  check('no console errors in the modules', errors.length === 0, errors.join(' | '));
}

// ======================================================================= 4b. presenter window
section('4b. Presenter window (second window kept in step over Manara.link)');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('manara-lang', 'en'); } catch (e) { /* ignore */ } });
  const A = await openPage(browser, 'pitch.html', { context: ctx });
  await A.page.waitForFunction(() => window.__pitchReady === true);
  const B = await openPage(browser, 'pitch.html', { context: ctx, query: '#presenter' });
  await B.page.waitForFunction(() => window.__pitchReady === true);
  check('presenter window hides the site chrome and shows notes, timer, next slide', await B.page.evaluate(() => document.documentElement.classList.contains('pt-pv') && getComputedStyle(document.querySelector('.nav')).display === 'none' && !!document.querySelector('#notes .nt-clock') && !!document.querySelector('#notes .nt-preview .slide')));
  await A.page.keyboard.press('ArrowLeft'.replace('ArrowLeft', 'ArrowRight')); await sleep(500);
  check('moving the main window moves the presenter window', (await idx(A.page)) === 1 && (await idx(B.page)) === 1, `${await idx(A.page)} / ${await idx(B.page)}`);
  await B.page.keyboard.press('ArrowRight'); await sleep(500);
  check('moving the presenter window moves the main window', (await idx(A.page)) === 2 && (await idx(B.page)) === 2, `${await idx(A.page)} / ${await idx(B.page)}`);
  check('the presenter window shows the NEXT slide of the path (not the skipped one)', await B.page.evaluate(() => { ManaraPitch.goTo(7, { force: true }); const t = document.querySelector('#notes .nt-preview .slide'); return t && t.dataset.slide === 'national'; }));
  check('the main window offers "Open the presenter window"', await A.page.$eval('#notes', e => /presenter window/i.test(e.textContent)));
  check('no console errors in either window', A.errors.length === 0 && B.errors.length === 0, A.errors.concat(B.errors).join(' | '));
  await ctx.close();
}

// ======================================================================= 4c. works without the simulation engine
section('4c. Without sim.js (engine missing): the pitch still works and says so');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/sim\.js/, r => r.abort());
  await page.goto(new URL('../pitch.html', import.meta.url).href);
  await page.waitForFunction(() => window.__pitchReady === true, null, { timeout: 8000 }).catch(() => errs.push('never ready'));
  await page.evaluate(() => { ManaraPitch.state.skip = false; ManaraPitch.goTo(9, { force: true }); });
  check('no script errors when ManaraSim is missing', errs.length === 0, errs.join(' | '));
  check('dispatch slide explains that the live map needs the engine', await page.$eval('#dp-map', e => /engine did not load|محرّك المحاكاة غير محمَّل/.test(e.textContent)));
  await page.evaluate(() => ManaraPitch.goTo(12, { force: true }));
  check('evidence slide still shows the static baseline (626 vs 317) and hides the run controls', await page.evaluate(() => /626/.test(document.querySelector('#ev-bars').textContent) && /317/.test(document.querySelector('#ev-bars').textContent) && document.querySelector('.ev-run').hidden));
  await ctx.close();
}

// ======================================================================= 4d. the whole of Qatar (slide 10)
section('4d. The whole of Qatar: the real OSM map + the real farther-but-faster example');
{
  const { page, errors } = await open({ lang: 'en', width: 1440, height: 1000 });
  await page.click('#t-slides');
  await page.evaluate(() => { ManaraPitch.state.skip = false; ManaraPitch.goTo(10, { force: true }); });
  await sleep(300);
  const sl = await page.evaluate(() => ({ id: document.querySelector('.slide.is-active').dataset.slide, ids: ManaraPitch.slides.map(s => s.id).join(), t3: ManaraPitch.slides[10].t3, t7: ManaraPitch.slides[10].t7 }));
  check('slide 11 is "national", in the strict path (11 s) and the extended path (34 s)', sl.id === 'national' && sl.t3 === 11 && sl.t7 === 34, JSON.stringify(sl));
  const m = await page.evaluate(() => ({
    zoom: !!document.querySelector('#na-zoom svg'), loc: !!document.querySelector('#na-loc svg'),
    fast: !!document.querySelector('#na-zoom .na-route.fast'), near: !!document.querySelector('#na-zoom .na-route.near'),
    facZoom: document.querySelectorAll('#na-zoom .na-fac').length, facLoc: document.querySelectorAll('#na-loc .na-fac').length,
    land: (document.querySelector('#na-zoom .na-land') || {}).getAttribute ? document.querySelector('#na-zoom .na-land').getAttribute('d').length : 0,
    roads: ['na-r1', 'na-r2', 'na-r3'].map(c => (document.querySelector('#na-zoom .' + c) || { getAttribute: () => '' }).getAttribute('d').length),
    locRoads: (document.querySelector('#na-loc .na-r1') || { getAttribute: () => '' }).getAttribute('d').length,
    muni: (document.querySelector('#na-loc .na-muni') || { getAttribute: () => '' }).getAttribute('d').split('M').length - 1,
    labels: document.querySelectorAll('#na-zoom .na-lab').length, aria: [...document.querySelectorAll('#na-zoom svg,#na-loc svg')].every(x => x.getAttribute('role') === 'img' && x.getAttribute('aria-label').length > 40),
    ids: new Set([...document.querySelectorAll('#deck [id]')].map(e => e.id)).size === [...document.querySelectorAll('#deck [id]')].length }));
  check('the map is drawn from the REAL data: outline, roads of all classes, facilities (zoom + whole-Qatar locator), municipalities', m.zoom && m.loc && m.land > 2000 && m.roads.every(x => x > 500) && m.locRoads > 2000 && m.facZoom >= 10 && m.facLoc >= 120 && m.muni >= 8, JSON.stringify(m));
  check('both routes are drawn (orange = fastest, grey dashed = nearest), labelled in both languages, with accessible names', m.fast && m.near && m.labels === 6 && m.aria && m.ids, JSON.stringify(m));
  const t = await page.$eval('.s-national', e => e.innerText);
  check('the slide shows the real numbers: 86 s sooner, 4.4 km farther, 14:00 vs 12:34, 5.7 vs 10.0 km', /86\s*s sooner/.test(t) && /4\.4 km farther/.test(t) && /14:00/.test(t) && /12:34/.test(t) && /5\.7/.test(t) && /10\.0/.test(t) && /free flow\s*08:05/.test(t) && /free flow\s*09:09/.test(t), t.slice(0, 400));
  check('it is labelled SIM, names the OSM snapshot date and licence, says the roads are real and the traffic simulated, and that 999 dispatches', /SIM/.test(t) && /2026-10-08/.test(t) && /Contains data © OpenStreetMap contributors, ODbL 1\.0/.test(t) && /traffic and the position and availability of units are simulated/.test(t) && /999 stays the dispatcher/.test(t), t);
  check('it is candid about the OSM gaps (21 fire stations on the map against 23 official) and the station that has no name in OSM', /21 fire stations[\s\S]*23 official/.test(t) && /unnamed in OSM/.test(t));
  check('a link opens the national view of Mission Control', (await page.$eval('#na-open', a => a.getAttribute('href') + '|' + a.target)) === 'mission.html#scope=national|_blank');
  // the static baseline equals the live engine (not stale)
  const live = await page.evaluate(() => {
    const r = ManaraNational.findFartherButFaster(7), b = ManaraPitch.NA_BASE, pick = x => [x.unitId, x.etaSec, x.freeFlowEtaSec, x.roadKm, x.straightKm, x.congestedSegments];
    return { b: [b.seed, b.clock, b.gainSec, b.extraStraightKm, b.reason, b.flips, b.incident.lon, b.incident.lat, ...pick(b.fastest), ...pick(b.nearest), b.nearest.worst.en],
             l: [r.seed, r.clock, r.gainSec, r.extraStraightKm, r.reason, r.trafficAloneFlipsOrder, r.incident.lon, r.incident.lat, ...pick(r.fastest), ...pick(r.nearest), r.nearest.slowest[0].name.en],
             routeOK: b.fastest.route.length > 40 && Math.abs(b.fastest.route[0][0] - r.fastest.route[0][0]) < 1e-3 && Math.abs(b.nearest.route[b.nearest.route.length - 1][1] - r.nearest.route[r.nearest.route.length - 1][1]) < 1e-3 };
  });
  check('the embedded seed-7 baseline equals ManaraNational.findFartherButFaster(7) computed now (numbers, units, reason)', JSON.stringify(live.b) === JSON.stringify(live.l) && live.routeOK, JSON.stringify(live));
  // another seed, live
  await page.fill('#na-seed', '4'); await page.click('#na-go');
  const busy = await page.$eval('#na-go', e => e.getAttribute('data-busy') + '|' + e.disabled);
  check('"Find another real example" shows a busy state while it searches the real roads', busy === 'true|true', busy);
  await page.waitForFunction(() => /seed 4/.test(document.querySelector('#na-gain').textContent), null, { timeout: 20000 });
  const t4 = await page.$eval('.s-national', e => e.innerText);
  const live4 = await page.evaluate(() => { const r = ManaraNational.findFartherButFaster(4); return { gain: r.gainSec, reason: r.reason, name: r.fastest.name.en, eta: r.fastest.etaSec }; });
  check('seed 4 re-runs live: the numbers on the slide are the engine\'s (gain, arrival), and it says "computed just now"', new RegExp(live4.gain + '\\s*s sooner').test(t4) && /computed just now/.test(t4) && t4.includes(live4.name.split(' — ').slice(1).join(' — ')), t4.slice(0, 300) + JSON.stringify(live4));
  check('seed 4 is a NETWORK case (traffic does not decide) and the explanation says so instead of blaming traffic', live4.reason === 'network' && /road network, not traffic, decides/.test(t4), live4.reason);
  check('the map redrew for the new example (a different incident and stations)', await page.evaluate(() => ManaraPitch.NA.res.seed === 4 && ManaraPitch.NA.live && document.querySelectorAll('#na-zoom .na-lab').length === 6));
  await page.fill('#na-seed', '7'); await page.click('#na-go'); await page.waitForFunction(() => /seed 7/.test(document.querySelector('#na-gain').textContent), null, { timeout: 20000 });
  check('seed 7 brings the baseline numbers back', /86\s*s sooner/.test(await page.$eval('#na-gain', e => e.innerText)) && /12:34/.test(await page.$eval('#na-cmp', e => e.innerText)));
  // Arabic
  await page.evaluate(() => Manara.setLang('ar')); await sleep(250);
  const ar = await page.$eval('.s-national', e => ({ t: e.innerText, rtl: getComputedStyle(e).direction }));
  check('Arabic: title, tags, numbers and the attribution are all there (RTL)', /الأسرع وصولًا بحسب الازدحام/.test(ar.t) && /خريطة حقيقية/.test(ar.t) && /ثواني|ث أبكر/.test(ar.t) && /12:34/.test(ar.t) && /OpenStreetMap contributors/.test(ar.t) && ar.rtl === 'rtl', ar.t.slice(0, 200));
  const lab = await page.evaluate(() => [...document.querySelectorAll('#na-zoom text.na-lab[data-l=ar]')].map(t => { const r = t.getBoundingClientRect(), s = document.querySelector('#na-zoom svg').getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1; }));
  check('Arabic: every station and incident label sits inside the picture (the anchor flips for right-to-left text)', lab.length === 3 && lab.every(Boolean), lab.join());
  await page.evaluate(() => Manara.setLang('en'));
  check('no console errors on the national slide', errors.length === 0, errors.join(' | '));
}
{
  // the data files or the engine missing: the slide still shows the numbers and says why the map is blank
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route(/qatar-(geo|facilities|roads)\.js|national\.js/, r => r.abort());
  await page.goto(new URL('../pitch.html', import.meta.url).href);
  await page.waitForFunction(() => window.__pitchReady === true, null, { timeout: 8000 }).catch(() => errs.push('never ready'));
  await page.evaluate(() => { ManaraPitch.state.skip = false; ManaraPitch.goTo(10, { force: true }); });
  check('no script errors when the data files and the engine are missing', errs.length === 0, errs.join(' | '));
  check('the slide still shows the baseline numbers and explains that the map data did not load; the live button is disabled', await page.evaluate(() => /12:34/.test(document.querySelector('#na-cmp').textContent) && /data files .* did not load|ملفات بيانات الخريطة غير محمَّلة/.test(document.querySelector('#na-zoom').textContent) && document.querySelector('#na-go').disabled));
  await ctx.close();
}

// ======================================================================= 5. script tab
section('5. Script tab');
{
  const { page, errors } = await open({ lang: 'ar', width: 1440, height: 1000 });
  await page.click('#t-script'); await sleep(200);
  const sc = await page.evaluate(() => ({
    rows: document.querySelectorAll('.sc-row').length, live: document.querySelectorAll('.sc-live').length, steps: document.querySelectorAll('.sc-live .sc-step').length,
    first: document.querySelector('.sc-row .sc-when b').textContent, last: [...document.querySelectorAll('.sc-row .sc-when b')].pop().textContent,
    seg: document.querySelectorAll('.sc-seg').length, fb: document.querySelectorAll('.fb-lv').length, rule: !!document.querySelector('.sc-fallback .note'),
    mirror: document.querySelectorAll('.sc-row [data-lm]').length > 5, pace: document.querySelectorAll('.sc-pace').length, hdr: /3 دقائق|3 min/.test(document.querySelector('.seg-toggle').textContent) }));
  check('script: 13 timed segments in the strict path', sc.rows === 13 && sc.seg === 13, JSON.stringify(sc));
  check('script: starts 00:00 and ends 03:00', /^00:00/.test(sc.first) && /03:00$/.test(sc.last), sc.first + ' … ' + sc.last);
  check('script: ONE live moment with five sub-steps', sc.live === 1 && sc.steps === 5);
  check('script: "if the demo fails" has four levels and the rule', sc.fb === 4 && sc.rule);
  check('script: English mirror under every Arabic line, pace shown', sc.mirror && sc.pace >= 9);
  const stepTimes = await page.$$eval('.sc-live .sc-step > b', e => e.map(x => x.textContent));
  check('script: live sub-steps carry exact timestamps (01:12–01:22 … 01:57–02:07)', stepTimes[0] === '01:12–01:22' && stepTimes[4] === '01:57–02:07', stepTimes.join(' '));
  const wpm = await page.$$eval('.sc-pace', e => e.map(x => +(x.textContent.match(/(\d+)\s*(?:كلمة\/دقيقة|wpm)/) || [])[1]).filter(Boolean));
  check('script: spoken pace of every segment is humanly possible (≤ 180 wpm outside the live block)', wpm.every(w => w <= 180), wpm.join());
  // each language is paced on its OWN word count (the Arabic line on Arabic words, the English mirror on English words)
  const pace = await page.$$eval('.sc-row:not(.sc-live) .sc-pace', e => e.map(x => ({
    ar: +((x.querySelector('[data-l=ar]') || x).textContent.match(/(\d+)\s*كلمة\/دقيقة/) || [])[1],
    en: +((x.querySelector('[data-l=en]') || x).textContent.match(/(\d+)\s*wpm/) || [])[1],
    enWords: /English words/.test(x.textContent) })));
  check('script: the pace line reports Arabic and English words separately', pace.length >= 8 && pace.every(p => p.ar > 0 && p.en > 0 && p.enWords), JSON.stringify(pace.slice(0, 3)));
  check('script: the English mirror is speakable too (≤ 165 wpm outside the live block)', pace.every(p => p.en <= 165), pace.map(p => p.en).join());
  const roles = await page.evaluate(() => ({ stage: document.querySelector('#stage').getAttribute('aria-label'), bad: document.querySelectorAll('button[role=listitem]').length, grp: document.querySelector('.sc-time').getAttribute('role') }));
  check('a11y: the deck stage has an accessible name; buttons keep their button role', !!roles.stage && roles.bad === 0 && roles.grp === 'group', JSON.stringify(roles));
  await page.click('.seg-toggle button:last-child'); await sleep(200);
  const r7 = await page.evaluate(() => ({ rows: document.querySelectorAll('.sc-row').length, last: [...document.querySelectorAll('.sc-row .sc-when b')].pop().textContent }));
  check('script: the 7-minute path has 15 segments and ends at 07:00', r7.rows === 15 && /07:00$/.test(r7.last), JSON.stringify(r7));
  await page.click('.seg-toggle button:first-child');
  await page.evaluate(() => { const c = document.querySelector('#p-script .switch input'); c.click(); });
  check('script: the mirror can be hidden', await page.$eval('#p-script', e => e.classList.contains('no-mirror')) && await page.$eval('.sc-row .sc-mirror', e => getComputedStyle(e).display === 'none'));
  check('no console errors in the script tab', errors.length === 0, errors.join(' | '));
}

// ======================================================================= 6. Q&A
section('6. Judge Q&A');
{
  const { page, errors } = await open({ lang: 'en', width: 1440, height: 1000 });
  await page.click('#t-qa'); await sleep(200);
  const q = await page.evaluate(() => {
    const D = ManaraPitch.qa, g = {}; D.forEach(x => g[x.g] = (g[x.g] || 0) + 1);
    return { n: D.length, groups: Object.keys(g).length, g, bothLangs: D.every(x => x.q.ar && x.q.en && x.a.ar.length > 60 && x.a.en.length > 60), weak: D.filter(x => x.weak).length, weakFirst: D.filter(x => x.weak).every(x => x.first && x.first.ar && x.first.en),
      ids: new Set(D.map(x => x.id)).size, dom: document.querySelectorAll('.qa-item').length, fill: D.filter(x => x.fill).map(x => x.id), opening: ManaraPitch.opening.length };
  });
  check('Q&A: 50+ questions in seven groups (13 about the whole of Qatar and the data)', q.n >= 50 && q.groups === 7 && q.g.national >= 10 && q.dom === q.n && q.ids === q.n, JSON.stringify(q.g));
  check('Q&A: every question and answer exists in Arabic and English', q.bothLangs);
  check('Q&A: weak spots are flagged and each has a "say it first" line in both languages', q.weak >= 10 && q.weakFirst, String(q.weak));
  check('Q&A: personal answers (built/bought/AI disclosure, ethics) ask the student to edit them', ['B1', 'B2', 'H3'].every(x => q.fill.includes(x)), q.fill.join());
  check('Q&A: seven opening disclosures (the seventh is about the OSM snapshot and the simulated traffic)', q.opening === 7);
  const must = { D1: /fastest/i, D2: /closes|closed/i, D3: /simulat/i, D4: /999/, R1: /drone/i, R2: /Law No\. 10/, R3: /heat|battery/i, H1: /privacy|camera/i, H2: /data protection/i, H4: /no phone/i, B1: /built/i, B2: /AI tools/i, B3: /cost/i, B4: /scale/i, B5: /maintain/i, B6: /network/i, W3: /cell broadcast/i, W5: /ISEF/i, P2: /66\.7/, P4: /real fires/i, P6: /fatigue/i, H5: /translations/i, H3: /ethics/i, P1: /AI/,
    N1: /OpenStreetMap[\s\S]*(23 are not in OSM|MISSING)/, N2: /simulated[\s\S]*live traffic provider/, N3: /CAD[\s\S]*AVL/, N4: /ODbL[\s\S]*Produced Work/, N5: /attribution[\s\S]*CREDITS/i, N6: /out of date[\s\S]*no name in OSM/, N7: /Gulf[\s\S]*tested only Qatar/, N8: /location[\s\S]*never leaves/, N9: /offline|no internet/i, N10: /no network requests[\s\S]*airplane/i, N11: /three (ambulance )?points[\s\S]*assumption/, N12: /navigation app[\s\S]*blank table/, N13: /median[\s\S]*tail/ };
  const have = await page.evaluate(() => Object.fromEntries(ManaraPitch.qa.map(x => [x.id, x.q.en + ' ' + x.a.en])));
  const missing = Object.entries(must).filter(([k, re]) => !re.test(have[k] || '')).map(([k]) => k);
  check('Q&A: covers the required topics (dispatch/traffic/road closed, who dispatches, drone, legality, heat, privacy, network, cost, ISEF, AI, ethics, scale, maintenance, fatigue, languages, cell broadcast, no phone, data)', missing.length === 0, missing.join());
  // search
  const shown = async () => page.$$eval('.qa-item:not([hidden])', e => e.length);
  await page.fill('#qa-q', 'drone'); const sDrone = await shown();
  check('search "drone" narrows the list and finds the drone questions', sDrone >= 3 && sDrone < q.n, String(sDrone));
  await page.fill('#qa-q', 'مسيّرة'); const sAr = await shown();
  check('search works in Arabic with diacritics ("مسيّرة")', sAr >= 3, String(sAr));
  await page.fill('#qa-q', 'مسيرة'); check('search ignores Arabic diacritics ("مسيرة" = "مسيّرة")', (await shown()) === sAr);
  await page.fill('#qa-q', 'traffic road closed'); check('search matches several words (traffic road closed → the dispatch questions)', (await page.$$eval('.qa-item:not([hidden])', e => e.map(x => x.id).join())).includes('q-D2'));
  await page.fill('#qa-q', 'zzzzqq'); check('an unmatched search shows the empty state', (await shown()) === 0 && await page.$eval('#qa-empty', e => !e.hidden));
  await page.fill('#qa-q', '');
  await page.click('.qa-chips .chip[data-g=dispatch]'); check('group filter: dispatch shows exactly its questions', (await shown()) === q.g.dispatch);
  await page.click('.qa-chips .chip[data-g=all]');
  await page.click('.qa-chips .chip[data-g=weak]'); check('weak-spots filter shows only flagged questions', (await shown()) === q.weak && (await page.$$eval('.qa-item:not([hidden]):not(.weak)', e => e.length)) === 0);
  await page.click('.qa-chips .chip[data-g=weak]');
  // open an item
  await page.click('#q-P2 > summary');
  check('opening a weak-spot question shows the "say it first" line and the other-language mirror', await page.$eval('#q-P2', e => e.open && !!e.querySelector('.qa-first') && e.querySelectorAll('.qa-mirror [data-lm]').length >= 1));
  await page.goto((await page.url()).split('#')[0] + '#q-D1'); await sleep(500);
  check('deep link #q-D1 opens the Q&A tab and that question', await page.evaluate(() => !document.querySelector('#p-qa').hidden && document.querySelector('#q-D1').open));
  check('a slide jump button exists on dispatch answers', await page.$eval('#q-D1', e => /Show slide 10/.test(e.textContent)));
  check('the national answers jump to slide 11 and every national answer is specific about what is real and what is simulated', await page.evaluate(() => /Show slide 11/.test(document.querySelector('#q-N1').textContent) && ManaraPitch.qa.filter(x => x.g === 'national').every(x => /SIM|simulat|real|OpenStreetMap|OSM|assum|not|no /i.test(x.a.en))));
  check('no console errors in Q&A', errors.length === 0, errors.join(' | '));
}

// ======================================================================= 7. booth
section('7. Booth tab');
{
  const { page, errors, ctx } = await open({ lang: 'en', width: 1440, height: 1000 });
  await page.click('#t-booth'); await sleep(200);
  const { tcQ, tcN } = await page.evaluate(() => ({ tcQ: MANARA_TEST_COUNTS.suites['qatar-data'].passed, tcN: MANARA_TEST_COUNTS.suites.national.passed }));
  const b = await page.evaluate(() => ({ items: document.querySelectorAll('.ck input').length, groups: document.querySelectorAll('.ck-group').length, risks: document.querySelectorAll('.risk').length, nums: document.querySelectorAll('.num-table tbody tr').length, roles: document.querySelectorAll('.roles li').length, plan: !!document.querySelector('.plan-svg'), svgBig: document.querySelector('.plan h3 svg') ? document.querySelector('.plan h3 svg').getBoundingClientRect().width : 0 }));
  check('booth: checklist covers setup, warm-ups, backups, offline test, power, fallback video, safety', b.items >= 25 && b.groups >= 7, JSON.stringify(b));
  check('booth: exactly ten failure points, each with a fix and a line to say', b.risks === 10);
  check('booth: who-stands-where plan + four roles; icons are not oversized', b.plan && b.roles === 4 && b.svgBig < 40, String(b.svgBig));
  check('booth: numbers sheet lists sourced figures only', b.nums >= 14);
  const rk = await page.evaluate(() => ManaraPitch.risks.every(r => r.t && r.why && r.fix && r.say) && ManaraPitch.ck.every(g => g.items.every(i => i.ar && i.en)));
  check('booth: every risk/checklist item has both languages', rk);
  const txt = await page.$eval('#p-booth', e => e.textContent);
  check('booth: names the real warm-up facts (≈4 min thermal, ≈3 min MQ, 48 h burn-in) and the offline test', /4 minutes/.test(txt) && /3 minutes|3 for the MQ/.test(txt) && /48 hours/.test(txt) && /airplane mode/i.test(txt));
  await page.click('.ck input >> nth=0'); await page.click('.ck input >> nth=1');
  const prog = await page.$eval('.bt-prog b', e => e.textContent);
  check('booth: the offline DATA check is on the list (three data files, airplane mode, slide 10, CREDITS)', /Offline data check/.test(txt) && /qatar-geo\.js/.test(txt) && /airplane mode/i.test(txt) && /CREDITS\.txt/.test(txt) && new RegExp(`${tcQ} and ${tcN}`).test(txt));
  check('booth: ticking items updates the progress', /^2 \/ \d+$/.test(prog), prog);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('manara-pitch-checks') || '{}'));
  check('booth: ticks are saved in this browser only', Object.keys(saved).length === 2);
  await page.reload(); await page.waitForFunction(() => window.__pitchReady === true); await page.click('#t-booth'); await page.waitForSelector('.ck input', { state: 'attached' }); await page.waitForFunction(() => document.querySelectorAll('.ck input:checked').length === 2, null, { timeout: 4000 }).catch(() => {}); await sleep(250);
  check('booth: ticks survive a reload', (await page.$$eval('.ck input:checked', e => e.length)) === 2);
  // rehearsal
  await page.click('#rh-body .btn-primary'); await sleep(250);
  check('rehearsal: starts at segment 1 of 13', await page.$eval('#rh-body', e => /1\/13/.test(e.textContent)));
  for (let i = 0; i < 13; i++) { await page.click('#rh-body .btn-primary'); await sleep(40); }
  check('rehearsal: finishing shows plan vs you per segment and the total', (await page.$$eval('#rh-body tbody tr', e => e.length)) === 14);
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem('manara-pitch-rehearsals') || '[]'));
  check('rehearsal: the run is saved (counts toward "at least 5")', runs.length === 1 && runs[0].splits.length === 13);
  await page.click('#rh-body .btn-primary'); await sleep(100); await page.keyboard.press('Space'); await sleep(60);
  check('rehearsal: Space = next segment', await page.$eval('#rh-body', e => /2\/13/.test(e.textContent)));
  // my details (textContent only)
  const evil = '<img src=x onerror=window.__xss=1>';
  await page.fill('.mine-grid label:nth-child(2) input', evil); await page.fill('.mine-grid label:nth-child(5) input', '180 ms');
  await page.evaluate(() => ManaraPitch.goTo(0, { force: true }));
  const by = await page.$eval('.ti-by', e => ({ hidden: e.hidden, html: e.innerHTML, text: e.textContent }));
  check('personal fields appear on the title slide as TEXT (no HTML injection)', !by.hidden && by.text.includes(evil) && !/<img/i.test(by.html.replace(/&lt;img/g, '')) && !(await page.evaluate(() => window.__xss)), by.html);
  check('own measured number replaces N/A on the Evidence slide', await page.$eval('#ev-todo', e => /180 ms/.test(e.textContent) && /\(our own\)/.test(e.textContent)));
  await ctx.close();
  check('no console errors in the booth tab', errors.length === 0, errors.join(' | '));
}

// ======================================================================= 8. print
section('8. Print (A4 PDF)');
{
  const { page } = await open({ lang: 'en', width: 1440, height: 1000 });
  const pages = async kind => {
    await page.evaluate(k => { ManaraPitch.showTab(k === 'slides' ? 'slides' : k, true); ManaraPitch.beforePrint(k, false); }, kind);
    await page.emulateMedia({ media: 'print' });
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => ManaraPitch.afterPrint());
    return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  };
  const ps = await pages('slides'); check('print slides: 15 landscape pages (one per slide)', ps === 15, String(ps));
  const pc = await pages('script'); check('print script: a handful of A4 pages (≥ 3, ≤ 12)', pc >= 3 && pc <= 12, String(pc));
  const pq = await pages('qa'); check('print Q&A: A4 pages, answers expanded (≥ 8, ≤ 50; 67 questions, a reference binder, not a handout)', pq >= 8 && pq <= 50, String(pq));
  const pb = await pages('booth'); check('print booth sheet: A4 pages (≥ 2, ≤ 14)', pb >= 2 && pb <= 14, String(pb));
  const clean = await page.evaluate(() => !/print-(slides|script|qa|booth)/.test(document.documentElement.className) && document.querySelector('#print-root').children.length === 0);
  check('print: classes and the print root are cleaned up afterwards', clean);
}

// ======================================================================= 9. honesty + contrast
section('9. Honesty scan · contrast');
{
  const { page } = await open({ lang: 'ar', width: 1440, height: 1000 });
  for (const t of ['script', 'qa', 'booth']) { await page.click('#t-' + t); }
  const all = await page.evaluate(() => {
    const D = ManaraPitch; const parts = [];
    D.slides.forEach(s => { [s.title, s.say3, s.more7, s.act, s.weak].forEach(o => o && parts.push(o.ar + ' ' + o.en)); });
    D.qa.forEach(q => { [q.q, q.a, q.first].forEach(o => o && parts.push(o.ar + ' ' + o.en)); });
    D.fb.forEach(f => parts.push(f.say.ar + f.say.en + f.act.ar + f.act.en));
    D.risks.forEach(r => parts.push(r.t.ar + r.t.en + r.why.en + r.fix.en + r.say.en));
    D.live.forEach(s => parts.push(s.say.ar + s.say.en + s.tip.en));
    return parts.join('\n') + '\n' + document.body.innerText;
  });
  const banned = [/world-first/i, /first in the world/i, /\bthe first\b[^.]{0,40}(system|platform|project|drone)/i, /saves?\s+(\d+\s+)?lives/i, /سنّقذ|ننقذ أرواح|أول (نظام|مشروع) في العالم/, /deep learning/i, /neural network/i, /guarantee/i, /100% (safe|accurate)/i];
  const hits = banned.filter(re => re.test(all)).map(String);
  check('no banned claims ("first", "saves lives", "deep learning", guarantees)', hits.length === 0, hits.join(' '));
  const aiBad = (all.match(/[^.\n]{0,60}\bAI\b[^.\n]{0,40}/g) || []).filter(x => !/not AI|Is your fire detector|AI tools|AI project|Did you use AI|AI-assist|no AI|AI for|AI,|AI ·|AI\)|ذكاء/.test(x));
  check('"AI" never describes the rule-based detector', aiBad.length === 0, aiBad.slice(0, 3).join(' | '));
  check('the detector is called rule-based computer vision (and 66.7% appears with its 12/18 sample)', /rule-based computer vision/.test(all) && /66\.7%/.test(all) && /رؤية حاسوبية بقواعد/.test(all));
  check('SIM labelling is present on simulation numbers (A/B, dispatch)', (all.match(/SIM/g) || []).length > 20);
  check('"999 stays the dispatcher" and "plugs in, replaces none" are stated', /999 stays the dispatcher/i.test(all) && /replace/i.test(all) && /يبقى هو المرسِل/.test(all));
  check('the national alert sound is never to be copied', /never (copy|play)[^.]{0,40}(national|alert)/i.test(all));
  check('no invented cost totals ("$150", "US$ 150", "SDG")', !/\$\s?150|SDG|11\.5/.test(all));
  const srcOK = await page.evaluate(() => ManaraPitch.nums.every(n => n[2] && (typeof n[2] === 'string' || n[2].ar)));
  check('every number on the numbers sheet has a source', srcOK);
  // contrast of slide text in both themes
  for (const theme of ['dark', 'light']) {
    await page.evaluate(t => Manara.theme.set(t), theme); await sleep(250);
    await page.click('#t-slides');
    const bad = await page.evaluate(() => {
      const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgba = c => { cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + bot[i] * (1 - a)).concat([1]); };
      const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 1) break; } let base = rgba(getComputedStyle(document.body).backgroundColor); if (!stack.length || stack[stack.length - 1][3] < 1) stack.push(base[3] ? base : [255, 255, 255, 1]); let out = stack.pop(); while (stack.length) out = over(stack.pop(), out); return out; };
      const out = []; const seen = new Set();
      ManaraPitch.state.skip = false;
      for (let i = 0; i < ManaraPitch.slides.length; i++) {
        ManaraPitch.goTo(i, { force: true, noHash: true, noScroll: true });
        const s = document.querySelector('.slide.is-active');
        s.querySelectorAll('*').forEach(el => {
          if (el.closest('svg,[aria-hidden=true],.sr-only,[hidden]') || getComputedStyle(el).display === 'none') return;
          const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1); if (!own) return;
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden') return; let gt = false; for (let a = el; a && a !== s; a = a.parentElement) { const k = getComputedStyle(a); if (k.webkitBackgroundClip === 'text' || k.backgroundClip === 'text') gt = true; } if (gt) return;   // gradient headline text: checked by eye + tokens
          const fg = rgba(cs.color), bg = bgOf(el), f = over(fg, bg), L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
          const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700), need = large ? 3 : 4.5;
          if (ratio < need) { const k = (el.className || el.tagName) + ratio.toFixed(2); if (!seen.has(k)) { seen.add(k); out.push(`slide ${i + 1} ${el.tagName}.${String(el.className).slice(0, 24)} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}<${need}`); } }
        });
      }
      return out;
    });
    check(`slide text contrast (${theme}): every text ≥ 4.5:1 (large ≥ 3:1)`, bad.length === 0, bad.slice(0, 6).join(' | '));
  }
}

// ======================================================================= 10. motion
section('10. Motion: reduced = static final frames · loops only when allowed · direction · counters · the robot · timer ring · hidden · 3 Hz · print');
{
  const FINAL = { control: ['90%', '33%', '2%', '70%'], robot: ['5 / 8', '3 / 8', '346 s', '344 s'] };
  const counts = (page, id) => page.evaluate(id => [...document.querySelector(`.slide[data-slide=${id}]`).querySelectorAll('[data-count]')].map(e => e.textContent), id);
  const idOf = (page, id) => page.evaluate(id => ManaraPitch.slides.findIndex(s => s.id === id), id);
  // ---- (a) reduced motion: the final frame at once, no loops
  {
    const { page, errors, ctx } = await open({ lang: 'en', width: 1440, height: 1000 });
    await page.click('#t-slides');
    await page.evaluate(() => { ManaraPitch.state.skip = false; });
    const ic = await idOf(page, 'control'), ir = await idOf(page, 'robot'), is = await idOf(page, 'solution');
    await page.evaluate(i => ManaraPitch.goTo(i, { force: true, noHash: true }), ic);
    const a = await page.evaluate(() => ({ nums: [...document.querySelectorAll('.slide.is-active [data-count]')].map(e => e.textContent), jobs: ManaraPitch.motion.jobs(), ping: getComputedStyle(document.querySelector('.slide.is-active .cr-ping')).animationName, smoke: getComputedStyle(document.querySelector('.slide.is-active .cr-smoke.s1')).animationName, rowOpacity: getComputedStyle(document.querySelector('.slide.is-active .cr-row:last-child')).opacity }));
    check('reduced motion: the control-room numbers are the FINAL numbers at once (90%, 33%, 2%, 70%), nothing is counting', JSON.stringify(a.nums) === JSON.stringify(FINAL.control) && a.jobs === 0, JSON.stringify(a));
    check('reduced motion: the pulsing marker and the drifting smoke do not loop, and no list item waits to appear', a.ping === 'none' && a.smoke === 'none' && a.rowOpacity === '1', JSON.stringify(a));
    await page.evaluate(i => ManaraPitch.goTo(i, { force: true, noHash: true }), is);
    const p = await page.evaluate(() => { const ico = document.querySelector('.slide.is-active .pipe-ico'); return { ring: getComputedStyle(ico, '::after').animationName, dot: getComputedStyle(document.querySelector('.slide.is-active .pipe-dot')).animationName, items: document.querySelectorAll('.slide.is-active .pipe li').length }; });
    check('reduced motion: the pipeline has 7 steps and its glow ring and travelling dot do not loop', p.items === 7 && p.ring === 'none' && p.dot === 'none', JSON.stringify(p));
    await page.evaluate(i => ManaraPitch.goTo(i, { force: true, noHash: true }), ir);
    const r = await page.evaluate(() => ({ nums: [...document.querySelectorAll('.slide.is-active [data-count]')].map(e => e.textContent), off: document.querySelector('.rb-route').style.strokeDashoffset, on: document.querySelectorAll('.rb-steps li[data-on="1"]').length, found: document.querySelector('#rb-plan').dataset.found, cone: getComputedStyle(document.querySelector('.rb-cone')).animationName, running: ManaraPitch.motion.running() }));
    check('reduced motion: the robot slide shows the finished search (route drawn, robot at the person, all 4 steps lit, found) and no loop', JSON.stringify(r.nums) === JSON.stringify(FINAL.robot) && r.off === '0' && r.on === 4 && r.found === '1' && r.cone === 'none' && !r.running, JSON.stringify(r));
    check('reduced motion: the stage has no travel offset (slides do not slide)', await page.evaluate(() => getComputedStyle(document.querySelector('#stage .slide:not(.is-active)')).transform === 'none'));
    check('no console errors in the reduced-motion run', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // ---- (b) motion allowed: loops run only on the active slide, numbers count up, the robot walks, direction honours RTL
  for (const lang of ['en', 'ar']) {
    const { page, errors, ctx } = await open({ lang, width: 1440, height: 1000, reducedMotion: 'no-preference' });
    await page.click('#t-slides');
    await page.evaluate(() => { ManaraPitch.state.skip = false; });
    const ic = await idOf(page, 'control'), ir = await idOf(page, 'robot');
    await page.evaluate(i => ManaraPitch.goTo(i - 1, { force: true, noHash: true }), ic);
    await page.evaluate(i => ManaraPitch.goTo(i, { force: true, noHash: true }), ic);
    await sleep(160);
    const mid = await page.evaluate(() => ({ nums: [...document.querySelectorAll('.slide.is-active [data-count]')].map(e => e.textContent), jobs: ManaraPitch.motion.jobs(), ping: getComputedStyle(document.querySelector('.slide.is-active .cr-ping')).animationName, iter: getComputedStyle(document.querySelector('.slide.is-active .cr-ping')).animationIterationCount, idle: getComputedStyle(document.querySelector('.slide:not(.is-active) .cr-ping') || document.body).animationPlayState }));
    check(`${lang}: motion allowed: the control-room numbers are counting up (not yet final), and the marker pulses in a loop`, mid.jobs > 0 && mid.nums.join() !== FINAL.control.join() && mid.ping === 'crPing' && mid.iter === 'infinite', JSON.stringify(mid));
    await sleep(1500);
    check(`${lang}: the counters END exactly on the stated numbers (90%, 33%, 2%, 70%)`, JSON.stringify(await counts(page, 'control')) === JSON.stringify(FINAL.control), JSON.stringify(await counts(page, 'control')));
    const dir = await page.evaluate(() => ({ x: document.querySelector('#stage').style.getPropertyValue('--enter-x'), rtl: document.documentElement.dir === 'rtl' }));
    check(`${lang}: going forward the new slide enters from the side the reading direction moves towards (${lang === 'ar' ? '-5%, from the left' : '+5%, from the right'})`, dir.x === (lang === 'ar' ? '-5%' : '5%'), JSON.stringify(dir));
    await page.evaluate(i => ManaraPitch.goTo(i - 1, { force: true, noHash: true }), ic);
    await sleep(60);
    const back = await page.evaluate(() => document.querySelector('#stage').style.getPropertyValue('--enter-x'));
    check(`${lang}: going back mirrors it (${lang === 'ar' ? '+5%' : '-5%'})`, back === (lang === 'ar' ? '5%' : '-5%'), back);
    // the robot walks: partway the route is half drawn and some steps are lit; it pauses and loops; leaving the slide settles it
    await page.evaluate(i => ManaraPitch.goTo(i, { force: true, noHash: true }), ir);
    await sleep(2600);
    const w = await page.evaluate(() => ({ off: +document.querySelector('.rb-route').style.strokeDashoffset, on: document.querySelectorAll('.rb-steps li[data-on="1"]').length, running: ManaraPitch.motion.running(), cone: getComputedStyle(document.querySelector('.slide.is-active .rb-cone')).animationName }));
    check(`${lang}: the robot is walking its path (route partly drawn, 1–3 steps lit, a loop running)`, w.off > 0.05 && w.off < 0.95 && w.on >= 1 && w.on <= 3 && w.running && w.cone === 'rbCone', JSON.stringify(w));
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(150);
    const hid = await page.evaluate(() => ({ jobs: ManaraPitch.motion.jobs(), running: ManaraPitch.motion.running(), off: document.querySelector('.rb-route').style.strokeDashoffset }));
    check(`${lang}: nothing runs while the tab is hidden: the work stops and the robot jumps to its final frame`, hid.jobs === 0 && !hid.running && hid.off === '0', JSON.stringify(hid));
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(500);
    check(`${lang}: it resumes when the tab is visible again`, await page.evaluate(() => ManaraPitch.motion.running()));
    await page.evaluate(i => ManaraPitch.goTo(i, { force: true, noHash: true }), ic);
    check(`${lang}: leaving the robot slide stops its walk`, !(await page.evaluate(() => ManaraPitch.motion.rbOn())));
    check(`${lang}: no console errors with motion on`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // ---- (c) the timer ring fills as the talk uses its time
  {
    const { page, ctx } = await open({ lang: 'en', width: 1440, height: 1000 });
    await page.click('#t-slides');
    await page.evaluate(() => { ManaraPitch.state.skip = false; const T = ManaraPitch.timer; T.running = false; T.acc = 90; ManaraPitch.goTo(3, { force: true, noHash: true }); });
    await sleep(150);
    const off = await page.$eval('.db-timer .rp', e => +e.style.strokeDashoffset);
    check('the timer ring is half full at 1:30 of 3:00 (stroke-dashoffset ≈ half of the circumference)', Math.abs(off - 62.83 / 2) < 2.5, String(off));
    check('the timer ring is a decorative SVG (aria-hidden) inside the timer button', await page.$eval('.db-timer .db-ring', e => e.getAttribute('aria-hidden') === 'true' && !!e.closest('button')));
    await ctx.close();
  }
  // ---- (d) no flashing: every looping animation is slower than 3 Hz; printing is untouched
  {
    const css = fs.readFileSync(path.join(SITE, 'css/pitch.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const loops = [...css.matchAll(/(?:animation|--ia)\s*:\s*([\w-]+)\s+([\d.]+)(m?s)\b[^;}]*infinite/g)].map(m => ({ name: m[1], sec: +m[2] / (m[3] === 'ms' ? 1000 : 1) }));
    const fast = loops.filter(l => l.sec < 0.9);
    check(`no looping animation is faster than ~1 Hz (${loops.length} loops, shortest ${Math.min(...loops.map(l => l.sec))} s; the WCAG limit is 3 flashes a second)`, loops.length >= 8 && fast.length === 0, JSON.stringify(fast));
    check('the new motion only uses transform / opacity / stroke (no layout properties in the new keyframes)', !/@keyframes (bulletIn|stepRing|crPing|crDrift|rbCone)\b[^}]*\{[^}]*(width|height|top|left|inset|margin)/.test(css.replace(/\s+/g, ' ')));
    const { page, ctx } = await open({ lang: 'en', width: 1440, height: 1000, reducedMotion: 'no-preference' });
    await page.click('#t-slides');
    await page.evaluate(() => { ManaraPitch.showTab('slides', true); ManaraPitch.beforePrint('slides', false); });
    await page.emulateMedia({ media: 'print' });
    const pr = await page.evaluate(() => { const root = document.querySelector('#print-root'); const els = [...root.querySelectorAll('.slide *')].slice(0, 1200); return { n: els.length, anim: els.filter(e => getComputedStyle(e).animationName !== 'none').length, active: root.querySelectorAll('.slide.is-active').length, counts: [...root.querySelectorAll('[data-count]')].map(e => e.textContent).join('|'), route: [...root.querySelectorAll('.rb-route')].map(e => e.style.strokeDashoffset).join() }; });
    check('print: no element in the printed slides animates, none is "active", and every counter and the robot route are at their final frame', pr.n > 300 && pr.anim === 0 && pr.active === 0 && pr.counts.includes('90%') && pr.counts.includes('346 s') && (pr.route === '' || pr.route === '0'), JSON.stringify(pr));
    await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => ManaraPitch.afterPrint());
    await ctx.close();
  }
  // ---- (e) the control-room and robot numbers are the live engines' numbers (not stale)
  {
    const { page, ctx } = await open({ lang: 'en', width: 1440, height: 1000 });
    const fe = await page.evaluate(() => { const f = ManaraNational.ab({ seed: 7, n: 150 }).firstEyes; return { first: f.droneFirstPct, none: f.noDroneAvailablePct, d: f.droneEtaSec.p50, g: f.firstGroundEtaSec.p50 }; });
    const txt = await page.evaluate(() => document.querySelector('.s-control').textContent + ' ' + ManaraPitch.slides.find(s => s.id === 'control').more7.en);
    check('control slide numbers = the live ManaraNational.ab({seed 7, n 150}): drone first in 90%, 33% out of range, medians 244 s vs 440.5 s', fe.first === 90 && Math.round(fe.none) === 33 && fe.d === 244 && fe.g === 440.5 && /90%/.test(txt) && /33%/.test(txt) && /244 s/.test(txt) && /440\.5 s/.test(txt), JSON.stringify(fe));
    const rb = await page.evaluate(() => { const rows = []; for (let seed = 1; seed <= 8; seed++) { const r = ManaraSim.abRobot({ preset: 'fire-night-robot', seed }); const pp = m => m.unaccounted.perPerson.filter(p => p.key === 'abu-salem')[0] || null; rows.push({ w: r.without.unaccounted.timeToLocate.p50, r: r.withRobot.unaccounted.timeToLocate.p50, byRobot: !!(pp(r.withRobot) && pp(r.withRobot).byRobot), as: !!pp(r.withRobot) }); } const mean = a => a.reduce((s, x) => s + x, 0) / a.length; return { first: rows.filter(x => x.byRobot).length, crews: rows.filter(x => x.as && !x.byRobot).length, w: mean(rows.map(x => x.w)), r: mean(rows.map(x => x.r)) }; });
    const rtxt = await page.evaluate(() => document.querySelector('.s-robot').textContent + ' ' + ManaraPitch.slides.find(s => s.id === 'robot').say3.en);
    check('robot slide numbers = the live ManaraSim.abRobot over seeds 1–8: the robot first in 5, the crews first in 3, mean median 346 s without and 344 s with', rb.first === 5 && rb.crews === 3 && Math.round(rb.w) === 346 && Math.round(rb.r) === 344 && /5 \/ 8/.test(rtxt) && /3 \/ 8/.test(rtxt) && /346 s/.test(rtxt) && /344 s/.test(rtxt) && /5 of 8/.test(rtxt), JSON.stringify(rb));
    await ctx.close();
  }
  // ---- (f) the new Q&A and the Tier 4 prices equal the Build page
  {
    const { page, ctx } = await open({ lang: 'en', width: 1440, height: 1000 });
    const qa = await page.evaluate(() => Object.fromEntries(ManaraPitch.qa.filter(x => /^R\d+$/.test(x.id)).map(x => [x.id, x.q.en + ' ' + x.a.en + ' ' + (x.first ? x.first.en : '')])));
    const need = { R4: /GCAA[\s\S]*Qatar Civil Aviation Authority|Qatar Civil Aviation Authority[\s\S]*GCAA/, R5: /privacy|filmed/i, R6: /233[\s\S]*96\.6/, R7: /33%[\s\S]*8\.3 km|8\.3 km[\s\S]*33%/, R8: /dust[\s\S]*wind[\s\S]*heat/i, R9: /liab|responsib/i, R10: /CCTV/, R11: /vacuum/, R12: /5 of 8[\s\S]*3/, R13: /US\$ 79–204[\s\S]*US\$ 174–474/, R14: /airspace/i };
    const miss = Object.entries(need).filter(([k, re]) => !re.test(qa[k] || '')).map(([k]) => k);
    check('Q&A: eleven new drone / control-room / robot questions (R4–R14): aviation rules and permits (QCAA, GCAA), privacy, false alarms, battery and range, dust, wind and heat, liability, CCTV, a vacuum robot, cost, scale', Object.keys(qa).length >= 14 && miss.length === 0, miss.join());
    check('R4 does not invent permit rules: it says they must be confirmed with the authority and names no height, zone or permit category', /must be confirmed with the authority/.test(qa.R4) && !/\b\d+\s?(m|metres|meters|ft|feet)\b/i.test(qa.R4.replace(/Law No\. 10 of 2026/, '')) && !/category [A-Z0-9]|class [A-Z0-9]\b/i.test(qa.R4));
    const bp = await openPage(browser, 'build.html', { width: 1440, height: 1000, lang: 'en' });
    await bp.page.waitForFunction(() => window.__buildReady === true, null, { timeout: 8000 });
    const sum = await bp.page.evaluate(() => ({ t4: ManaraBuild.sumParts(4, true).core, all: ManaraBuild.sumParts(4, false).core }));
    await bp.ctx.close();
    const nums = await page.evaluate(() => ManaraPitch.nums.map(n => n[0]).join('|') + ' ' + document.querySelector('.s-build').textContent);
    check(`Tier 4 prices: the pitch says US$ ${sum.t4.lo}–${sum.t4.hi} (adds) and US$ ${sum.all.lo}–${sum.all.hi} (all four tiers), equal to the Build page's own sums`, qa.R13.includes(`US$ ${sum.t4.lo}–${sum.t4.hi}`) && qa.R13.includes(`US$ ${sum.all.lo}–${sum.all.hi}`) && nums.includes(`US$ ${sum.t4.lo}–${sum.t4.hi}`), JSON.stringify(sum));
    await ctx.close();
  }
}

await done(browser);
