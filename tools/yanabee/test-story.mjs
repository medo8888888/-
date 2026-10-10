// Browser test of the home page's scrollytelling (module "story": the mission as four text steps + a sticky particle companion).
//   node tools/yanabee/test-story.mjs
// Real Chromium over file://. Covers: the four steps are the mission paragraph verbatim, in order, as selectable text; no pin
// anywhere (nothing sticky/fixed taller than 70% of the viewport, the companion <= 62svh desktop / 44vh phone, the section about
// four steps tall); the page scrolls 1:1 under real wheel and touch input and nothing prevents it; the step at the reading line
// decides the particle act (time based, interruptible); the step indicator; labels, arch and the word fit; pausing off-screen;
// theme switch; reduced motion / no JS / short screens = the plain static block; section has no id; no console errors.
// Exits non-zero on failure.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = 'file://' + path.join(ROOT, 'site/yanabee/index.html');
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const norm = s => s.replace(/[«»"]/g, '"').replace(/\s+/g, ' ').trim();

// the mission paragraph, straight from the source document
const src = fs.readFileSync(path.join(ROOT, 'content/yanabee/platform.txt'), 'utf8').split('\n');
const mission = src[src.findIndex(l => /^##\s*mission\b/.test(l)) + 1].trim();
const storyJs = fs.readFileSync(path.join(ROOT, 'site/yanabee/js/story.js'), 'utf8');
const storyCss = fs.readFileSync(path.join(ROOT, 'site/yanabee/css/story.css'), 'utf8');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* storage blocked */ } }); // skip the opening scene
  await p.goto(url);
  await p.waitForTimeout(700);
  await p.evaluate(() => { const s = document.querySelector('[data-story]'); if (s) s.dataset.adaptive = 'off'; }); // no quality shedding while testing
  return { ctx, p, errs };
}
const sleep = (p, ms) => p.waitForTimeout(ms);
// scroll (instantly) until step i sits on the reading line; the line itself moves while the phone panel is not yet stuck, so iterate
const toLine = async (p, i) => {
  for (let k = 0; k < 5; k++) {
    const d = await p.evaluate(i => { const r = document.querySelectorAll('.step')[i].getBoundingClientRect(); return (r.top + r.bottom) / 2 - window.YanabeeStory.readingLine(); }, i);
    if (Math.abs(d) < 1.5) return d;
    await p.evaluate(d => window.scrollBy({ top: d, behavior: 'instant' }), d);
    await sleep(p, 50);
  }
  return p.evaluate(i => { const r = document.querySelectorAll('.step')[i].getBoundingClientRect(); return (r.top + r.bottom) / 2 - window.YanabeeStory.readingLine(); }, i);
};
const act = p => p.evaluate(() => window.YanabeeStory.act);
const settle = (p, ms = 1500) => p.waitForFunction(() => window.YanabeeStory.settled, null, { timeout: ms }).catch(() => {});
// how many canvas pixels are visibly painted
const ink = p => p.evaluate(() => {
  const c = document.querySelector('.story-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 24) n++;
  return n;
});
const rectOf = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
// every sticky / fixed element that can catch the pointer and is visible, with its share of the viewport height
const pinned = p => p.evaluate(() => {
  const vh = innerHeight, out = [];
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if ((cs.position === 'sticky' || cs.position === 'fixed') && cs.pointerEvents !== 'none' && cs.visibility !== 'hidden' && cs.display !== 'none') {
      const r = el.getBoundingClientRect();
      if (/^tgal-/.test(String(el.className))) return;   // the teams module's old pinned gallery (being replaced by its own module)
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh) out.push({ n: el.tagName + '.' + String(el.className).split(' ')[0], h: Math.round(r.height), share: +(r.height / vh).toFixed(2) });
    }
  });
  return out;
});

console.log('source: no scroll hijacking, no pin, no gradient text');
{
  check('story.js never calls preventDefault', !/preventDefault/.test(storyJs));
  check('story.js never drives the page scroll itself (no scrollTo / scrollBy / scrollTop writes; only native scrollIntoView)', !/scrollTo\s*\(|scrollBy\s*\(|scrollTop\s*=|window\.scroll\s*\(/.test(storyJs) && /scrollIntoView/.test(storyJs));
  check('story.js has no wheel / touchmove listeners', !/['"](wheel|touchmove|touchstart)['"]/.test(storyJs));
  check('story.css has no tall track, no 100vh stage, no gradient-filled text', !/460|400svh|height:100s?vh|background-clip:\s*text|-webkit-background-clip/.test(storyCss));
}

console.log('markup: the mission, verbatim, in four ordinary text steps');
{
  const { ctx, p, errs } = await open();
  const steps = await p.$$eval('.story .step .step-text', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('four steps', steps.length === 4, String(steps.length));
  check('the steps, in order, are exactly the mission paragraph', norm(steps.join(' ')) === norm(mission), norm(steps.join(' ')).slice(0, 80));
  check('each step text is a real <p>', await p.$$eval('.story .step > .step-text', e => e.length === 4 && e.every(x => x.tagName === 'P')));
  check('the mission text appears once in the section (last fragment found exactly once)', await p.$eval('.story', (s, last) => (s.textContent.replace(/\s+/g, ' ').split(last).length - 1) === 1, steps[3].replace(/\.$/, '')));
  const kick = await p.$eval('.story h2.kicker', e => e.textContent.trim());
  check('kicker is the mission title «الرسالة»', kick === 'الرسالة', kick);
  check('section has no id; no other section[id] was added (fx.js third section dot stays #model)', await p.evaluate(() => {
    const s = document.querySelector('[data-story]');
    const ids = [...document.querySelectorAll('main section[id]')].filter(x => x.querySelector('h2')).map(x => x.id);
    return !s.id && !s.matches('main > section[id]') && ![...document.querySelectorAll('main section[id]')].some(x => x.contains(s) || s.contains(x)) && ids[2] === 'model';
  }));
  check('steps are not hidden from assistive tech and not user-select:none', await p.$$eval('.story .step', els => els.every(e => !e.closest('[aria-hidden="true"]') && getComputedStyle(e.querySelector('.step-text')).userSelect !== 'none')));
  check('decoration is hidden from assistive tech (canvas, labels, droplet)', await p.$$eval('.story-canvas, .story-tags, .story-core, .story-bg', els => els.length === 4 && els.every(e => e.getAttribute('aria-hidden') === 'true')));
  check('seven team labels from the content', (await p.$$eval('.story-tag', e => e.map(x => x.textContent.trim()))).length === 7);
  check('four indicator buttons are real, labelled buttons inside a labelled nav', await p.$$eval('.story-dots', n => n.length === 1 && n[0].tagName === 'NAV' && !!n[0].getAttribute('aria-label') && [...n[0].querySelectorAll('button.story-dot')].length === 4 && [...n[0].querySelectorAll('button')].every(b => b.getAttribute('aria-label'))));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('live mode (desktop 1440×900)');
{
  const { ctx, p, errs } = await open();
  check('.is-live is set after init', await p.evaluate(() => document.querySelector('[data-story]').classList.contains('is-live') && window.YanabeeStory.live));
  const geo = await p.evaluate(() => {
    const s = document.querySelector('[data-story]'), c = document.querySelector('.story-companion'), st = document.querySelector('.story-steps'), cs = getComputedStyle(c);
    const cr = c.getBoundingClientRect(), sr = st.getBoundingClientRect();
    return { vh: innerHeight, section: s.offsetHeight, pos: cs.position, ch: cr.height, cw: cr.width, stepsLeft: sr.left, compRight: cr.right, stepH: [...document.querySelectorAll('.step')].map(e => e.offsetHeight), stats: window.YanabeeStory.stats(), top: cs.top };
  });
  check('companion is sticky and at most 62svh tall', geo.pos === 'sticky' && geo.ch <= geo.vh * 0.62 + 1 && geo.ch >= 380, `${geo.pos} ${geo.ch}`);
  check('two columns: the steps (inline-start = right) and the companion (left) side by side', geo.stepsLeft >= geo.compRight - 2 && geo.cw > 400, `${geo.stepsLeft} ${geo.compRight} ${geo.cw}`);
  check('each step is 52-66vh tall', geo.stepH.every(h => h >= geo.vh * 0.52 - 1 && h <= geo.vh * 0.66 + 1), JSON.stringify(geo.stepH));
  check('the whole section is about four steps tall (<= 3 screens)', geo.section <= geo.vh * 3, `${geo.section} vs ${geo.vh}`);
  check('particles are capped (<= 1800) and DPR <= 2', geo.stats.particles <= 1800 && geo.stats.particles >= 1000 && geo.stats.dpr <= 2, JSON.stringify(geo.stats));
  check('the word «ينابيع» was sampled into target points', geo.stats.word >= 1000, String(geo.stats.word));

  // the layout derived from the companion: labels, arch and word fit inside the canvas
  await toLine(p, 3); await settle(p);
  const g = await p.evaluate(() => window.YanabeeStory.geometry());
  check('the arch and the word fit inside the canvas (legible, not clipped)', g.cx - g.A >= 0 && g.cx + g.A <= g.W && g.wordW <= g.W - 40 && g.wordY - g.wordH / 2 > g.dropY + g.dropS / 2 && g.wordY + g.wordH / 2 < g.baseY, JSON.stringify(g));
  check('the word is at least 40% of the canvas width', g.wordW >= g.W * 0.4, `${g.wordW} of ${g.W}`);

  // scroll: a real wheel moves the page 1:1; the text is never transformed or held
  await p.evaluate(() => window.scrollTo({ top: document.querySelector('.story').getBoundingClientRect().top + scrollY - 40, behavior: 'instant' }));
  await sleep(p, 300);
  await p.mouse.move(1000, 450);
  const track = () => p.evaluate(() => { const r = document.querySelectorAll('.step')[1].getBoundingClientRect(); return { y: scrollY, doc: r.top + scrollY, h: document.documentElement.scrollHeight }; });
  const t0 = await track(), deltas = []; let prev = t0, docDrift = 0;
  for (let i = 0; i < 24; i++) {
    await p.mouse.wheel(0, 120);
    await sleep(p, 130);
    const t = await track(); deltas.push(t.y - prev.y); docDrift = Math.max(docDrift, Math.abs(t.doc - t0.doc)); prev = t;
  }
  await sleep(p, 400);
  const t1 = await track(), total = t1.y - t0.y;
  check('every wheel step (120px) moved the page', deltas.every(d => d > 0), deltas.join(','));
  check('the sum of the per-step scrollY deltas equals the scroll change, and it is what the wheel asked for', Math.abs(deltas.reduce((a, b) => a + b, 0) - (t1.y - t0.y) + (t1.y - prev.y)) <= 1 && total >= 24 * 120 * 0.85 && total <= 24 * 120 * 1.15, `${total} vs ${24 * 120}`);
  check('the page height never changed while scrolling', t1.h === t0.h);
  check('the step text moves 1:1 with the page (document position never drifts)', docDrift < 1, String(docDrift));
  // wheel over the canvas scrolls the page too
  await p.mouse.move(440, 400);
  const yb = (await track()).y;
  await p.mouse.wheel(0, 240); await sleep(p, 500);
  const ya = (await track()).y;
  check('a wheel over the particle canvas scrolls the page as well', ya - yb >= 200, `${ya - yb}`);
  check('nothing sticky or fixed covers more than 70% of the viewport height', (await pinned(p)).every(e => e.share <= 0.7), JSON.stringify(await pinned(p)));
  check('wheel / touchmove events are never cancelled on the companion or the steps', await p.evaluate(() => {
    let bad = 0;
    for (const sel of ['.story-canvas', '.story-companion', '.step-text']) {
      const el = document.querySelector(sel);
      const w = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true }); el.dispatchEvent(w); if (w.defaultPrevented) bad++;
      try { const t = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); el.dispatchEvent(t); if (t.defaultPrevented) bad++; } catch (e) { /* no TouchEvent */ }
    }
    return bad === 0;
  }));

  // selectable text
  await toLine(p, 1);
  await p.click('.step:nth-of-type(2) .step-text', { clickCount: 3 });
  const sel = await p.evaluate(() => window.getSelection().toString());
  const want = await p.$eval('.step:nth-of-type(2) .step-text', e => e.textContent);
  check('triple-click selects a whole step (real selectable text)', norm(sel) === norm(want) && sel.length > 20, norm(sel).slice(0, 60));
  await p.evaluate(() => window.getSelection().removeAllRanges());

  // acts follow the step on the reading line (and back), within ~400 ms, smoothly
  const seen = [];
  for (const i of [0, 1, 2, 3]) {
    await toLine(p, i);
    const sample = await p.evaluate(target => new Promise(res => {
      const t0 = performance.now(), us = []; let settledAt = null;
      const tick = () => {
        const now = performance.now() - t0, u = window.YanabeeStory.u; us.push([Math.round(now), +u.toFixed(3)]);
        if (settledAt === null && Math.abs(u - target) < 0.004) settledAt = now;
        if (now < 1000) requestAnimationFrame(tick); else res({ us, settledAt, act: window.YanabeeStory.act });
      };
      requestAnimationFrame(tick);
    }), [0, 1, 2, 4][i]);
    seen.push(sample.act);
    const monotone = sample.us.every((s, k) => k === 0 || s[1] >= sample.us[k - 1][1] - 0.001);
    const st = await p.evaluate(() => ({ cur: [...document.querySelectorAll('.step')].map(e => e.classList.contains('is-active')), dots: [...document.querySelectorAll('.story-dot')].map(b => b.getAttribute('aria-current') === 'step') }));
    const n = await ink(p);
    check(`step ${i + 1} on the reading line: act ${sample.act + 1}, only that step and dot are marked, canvas painted (${n})`,
      sample.act === i && st.cur.filter(Boolean).length === 1 && st.cur[i] && st.dots[i] && st.dots.filter(Boolean).length === 1 && n > 150, JSON.stringify(st));
    if (i > 0) check(`  …the scene settles within ~400 ms (settled at ${sample.settledAt && Math.round(sample.settledAt)} ms) and moves smoothly (monotone: ${monotone})`, sample.settledAt !== null && sample.settledAt >= 120 && sample.settledAt <= 700 && monotone, JSON.stringify(sample.us.slice(0, 40)));
  }
  check('acts advance 1 → 4 in order with the steps', seen.join() === '0,1,2,3', seen.join());
  const back = [];
  for (const i of [2, 1, 0]) { await toLine(p, i); await settle(p); back.push(await act(p)); }
  check('scrolling back reverses it (acts 3, 2, 1)', back.join() === '2,1,0', back.join());
  check('and the first act paints again', (await ink(p)) > 150);

  // interruptible: retarget mid-flight continues from the current state
  await toLine(p, 0); await settle(p);
  const jump = await p.evaluate(async () => {
    const steps = [...document.querySelectorAll('.step')], us = [];
    const line = window.YanabeeStory.readingLine();
    const go = i => { const r = steps[i].getBoundingClientRect(); window.scrollBy({ top: (r.top + r.bottom) / 2 - line, behavior: 'instant' }); };
    go(1);
    await new Promise(r => setTimeout(r, 120));
    const mid = window.YanabeeStory.u; go(2);
    for (let k = 0; k < 40; k++) { await new Promise(r => requestAnimationFrame(r)); us.push(window.YanabeeStory.u); }
    let maxJump = Math.abs(us[0] - mid); for (let k = 1; k < us.length; k++) maxJump = Math.max(maxJump, Math.abs(us[k] - us[k - 1]));
    return { mid, maxJump, end: us[us.length - 1] };
  });
  check('a new step mid-transition retargets from the current state (no restart, no jump)', jump.mid > 0.02 && jump.mid < 0.98 && jump.maxJump < 0.45 && Math.abs(jump.end - 2) < 0.01, JSON.stringify(jump));

  // the companion is entirely in view whenever a step's centre is within 60px of the reading line, and never leaves while any step is mostly on screen
  const sec = await p.evaluate(() => { const r = document.querySelector('.story').getBoundingClientRect(); return { top: scrollY + r.top, h: r.height, vh: innerHeight }; });
  let bad = [], looked = 0;
  for (let y = sec.top - sec.vh + 80; y < sec.top + sec.h - 40; y += 45) {
    await p.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), y);
    const r = await p.evaluate(() => {
      const vh = innerHeight, line = window.YanabeeStory.readingLine(), c = document.querySelector('.story-companion').getBoundingClientRect();
      const steps = [...document.querySelectorAll('.step')].map(e => e.getBoundingClientRect());
      const onLine = steps.some(b => Math.abs((b.top + b.bottom) / 2 - line) <= 60);
      const mostly = steps.some(b => Math.max(0, Math.min(b.bottom, vh) - Math.max(b.top, 0)) >= b.height * 0.7);
      const vis = Math.max(0, Math.min(c.bottom, vh) - Math.max(c.top, 0)) / c.height;
      return { onLine, mostly, vis: +vis.toFixed(2), y: scrollY };
    });
    if (r.onLine) { looked++; if (r.vis < 0.99) bad.push(r); }
    if (r.mostly && r.vis < 0.6) bad.push(r);
  }
  check(`the companion is fully in view while a step is at the reading line (+-60px), and >= 60% in view while any step is mostly on screen (${looked} positions)`, bad.length === 0 && looked > 6, JSON.stringify(bad.slice(0, 3)));
  // stuck under the nav
  await toLine(p, 2);
  const top2 = await p.$eval('.story-companion', e => e.getBoundingClientRect().top);
  check('while the steps scroll the companion stays stuck under the nav (top 78px)', Math.abs(top2 - 78) <= 2, String(top2));

  // team labels (act 2) fit: shown, inside the panel, none on top of another
  await toLine(p, 1); await settle(p); await sleep(p, 500);
  const lab = await p.evaluate(() => {
    const c = document.querySelector('.story-companion'), cr = c.getBoundingClientRect();
    const tags = [...document.querySelectorAll('.story-tag')].map(e => { const r = e.getBoundingClientRect(); return { o: +getComputedStyle(e).opacity, r }; });
    const inside = tags.every(t => t.r.left >= cr.left && t.r.right <= cr.right && t.r.top >= cr.top && t.r.bottom <= cr.bottom);
    let overlap = false;
    for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) { const a = tags[i].r, b = tags[j].r; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlap = true; }
    return { hidden: c.classList.contains('no-tags'), shown: tags.every(t => t.o > 0.8), inside, overlap };
  });
  check('team labels are shown at 1440, inside the panel and not crowded', !lab.hidden && lab.shown && lab.inside && !lab.overlap, JSON.stringify(lab));
  await toLine(p, 0); await settle(p); await sleep(p, 300);
  check('team labels are invisible in act 1', await p.$$eval('.story-tag', e => e.every(x => +getComputedStyle(x).opacity < 0.1)));

  // the step indicator
  const jumps = [];
  for (const i of [3, 0, 2, 1]) {
    await p.click(`.story-dot[data-act="${i}"]`);
    let last = -1, same = 0;
    for (let k = 0; k < 40 && same < 5; k++) { await sleep(p, 100); const y = await p.evaluate(() => scrollY); same = y === last ? same + 1 : 0; last = y; }
    await settle(p);
    jumps.push(await p.evaluate(i => { const r = document.querySelectorAll('.step')[i].getBoundingClientRect(); return [i, window.YanabeeStory.act, Math.round((r.top + r.bottom) / 2 - window.YanabeeStory.readingLine()), document.querySelectorAll('.story-dot')[i].getAttribute('aria-current')]; }, i));
  }
  check('clicking an indicator button scrolls that step to the reading line and activates it', jumps.every(([i, a, d, cur]) => i === a && Math.abs(d) <= 12 && cur === 'step'), JSON.stringify(jumps));
  // keyboard
  await p.evaluate(() => document.querySelectorAll('.story-dot')[1].focus());
  await p.keyboard.press('Shift+Tab');
  const foc = await p.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { cls: a.className, idx: [...document.querySelectorAll('.story-dot')].indexOf(a), style: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; });
  check('indicator buttons are keyboard focusable with a visible focus ring', foc.idx === 0 && foc.style !== 'none' && foc.w >= 2, JSON.stringify(foc));
  await p.keyboard.press('Enter');
  await sleep(p, 1600);
  check('Enter on a focused indicator button scrolls to its step', await act(p) === 0, String(await act(p)));

  // off-screen: the loop pauses
  await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await sleep(p, 500);
  const f1 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  await sleep(p, 700);
  const f2 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  check('the loop pauses when the companion is off-screen', f2 === f1, `${f1} -> ${f2}`);
  await toLine(p, 1); await sleep(p, 700);
  const f3 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  await sleep(p, 400);
  const f4 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  check('…and resumes when it returns (on the right act at once)', f4 > f3 + 5 && (await act(p)) === 1 && (await ink(p)) > 150, `${f3} -> ${f4}`);

  // pointer: moving over the companion and pressing is harmless
  const cr = await rectOf(p, '.story-canvas');
  await p.mouse.move(cr.left + 200, cr.top + 200); await p.mouse.move(cr.left + 240, cr.top + 220); await p.mouse.down(); await p.mouse.up();
  await sleep(p, 300);
  check('pointer move + press on the companion work', (await ink(p)) > 150);

  // theme switch keeps the canvas alive in both themes
  const before = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.evaluate(() => window.YanabeeTheme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  await sleep(p, 900);
  const after = await p.evaluate(() => document.documentElement.dataset.theme);
  check('the story survives a theme switch and still paints', before !== after && (await ink(p)) > 150, before + ' -> ' + after);
  await toLine(p, 3); await settle(p); await sleep(p, 600);
  check('final act paints in the other theme too', (await ink(p)) > 400);
  const w = await p.evaluate(() => ({ s: window.YanabeeStory.stats(), ov: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }));
  check('no horizontal overflow at 1440', w.ov);
  console.log(`  info  JS work per frame ${w.s.workMs} ms, frame interval ${w.s.frameMs} ms, ${w.s.particles} particles`);
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('live mode (phone 390×844, touch)');
{
  const { ctx, p, errs } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  check('.is-live on phones too', await p.evaluate(() => document.querySelector('[data-story]').classList.contains('is-live') && window.YanabeeStory.live));
  const st = await p.evaluate(() => window.YanabeeStory.stats());
  check('phone caps: <= 800 particles, DPR <= 1.5', st.particles <= 800 && st.particles >= 400 && st.dpr <= 1.5, JSON.stringify(st));
  const g0 = await p.evaluate(() => {
    const c = document.querySelector('.story-companion'), cs = getComputedStyle(c), r = c.getBoundingClientRect(), vh = innerHeight;
    return { pos: cs.position, h: r.height, w: r.width, left: r.left, right: innerWidth - r.right, vh, section: document.querySelector('.story').offsetHeight, stepH: [...document.querySelectorAll('.step')].map(e => e.offsetHeight) };
  });
  check('the companion is a sticky panel of at most 44vh, full width with the 16px gutter', g0.pos === 'sticky' && g0.h <= g0.vh * 0.44 + 1 && g0.h >= 250 && Math.abs(g0.left - 16) <= 1 && Math.abs(g0.right - 16) <= 1, JSON.stringify(g0));
  check('each step is 52-66vh tall and the section is about four steps tall (<= 3 screens)', g0.stepH.every(h => h >= g0.vh * 0.52 - 1 && h <= g0.vh * 0.66 + 1) && g0.section <= g0.vh * 3, JSON.stringify(g0));
  check('team labels are hidden on a panel narrower than 360px', await p.evaluate(() => document.querySelector('.story-companion').classList.contains('no-tags') && getComputedStyle(document.querySelector('.story-tags')).display === 'none'));

  // real touch swipes move the page 1:1 and nothing holds it
  await p.evaluate(() => window.scrollTo({ top: document.querySelector('.story').getBoundingClientRect().top + scrollY - 30, behavior: 'instant' }));
  await sleep(p, 300);
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x, y0, y1, n = 8) => {   // a real touch drag: finger down, moves, a pause (no fling), finger up
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= n; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / n }] }); await sleep(p, 16); }
    await sleep(p, 120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const tr = () => p.evaluate(() => { const r = document.querySelectorAll('.step')[2].getBoundingClientRect(); return { y: scrollY, doc: r.top + scrollY, ct: document.querySelector('.story-companion').getBoundingClientRect().top }; });
  const a0 = await tr(), sw = []; let drift = 0, prevY = a0.y; const tops = [];
  for (let i = 0; i < 6; i++) {
    await swipe(195, i % 2 ? 300 : 650, i % 2 ? 100 : 450);
    await sleep(p, 350);
    const t = await tr(); sw.push(t.y - prevY); prevY = t.y; drift = Math.max(drift, Math.abs(t.doc - a0.doc)); tops.push(Math.round(t.ct));
  }
  check('every touch swipe moved the page (sum of deltas = total scroll)', sw.every(d => d > 120) && Math.abs(sw.reduce((a, b) => a + b, 0) - (prevY - a0.y)) <= 1, sw.join(','));
  check('the steps move 1:1 under the finger (document position never drifts)', drift < 1, String(drift));
  check('the panel stays stuck under the nav (top 78px) while the steps scroll beneath', tops.slice(2).every(y => Math.abs(y - 78) <= 2), tops.join(','));
  check('nothing sticky or fixed covers more than 70% of the viewport height', (await pinned(p)).every(e => e.share <= 0.7), JSON.stringify(await pinned(p)));

  // acts at the reading line; the step is readable under the panel
  const seen = [];
  for (const i of [0, 1, 2, 3]) {
    await toLine(p, i); await settle(p); await sleep(p, 250);
    const r = await p.evaluate(i => {
      const el = document.querySelectorAll('.step-text')[i].getBoundingClientRect(), c = document.querySelector('.story-companion').getBoundingClientRect(), tb = document.querySelector('.tabbar'), tt = tb ? tb.getBoundingClientRect().top : innerHeight;
      return { act: window.YanabeeStory.act, below: el.top >= c.bottom - 2, above: el.bottom <= tt + 2, cur: [...document.querySelectorAll('.step')].filter(e => e.classList.contains('is-active')).length };
    }, i);
    seen.push(r.act);
    const n = await ink(p);
    check(`phone step ${i + 1} on the reading line: act ${r.act + 1}, its text is fully visible under the panel, canvas painted (${n})`, r.act === i && r.below && r.above && r.cur === 1 && n > 80, JSON.stringify(r));
  }
  check('phone acts advance 1 → 4 with the steps', seen.join() === '0,1,2,3', seen.join());
  const g = await p.evaluate(() => window.YanabeeStory.geometry());
  check('phone: the arch and the word «ينابيع» fit and stay legible (word >= 45% of the panel width)', g.cx - g.A >= 0 && g.cx + g.A <= g.W && g.wordW <= g.W - 30 && g.wordW >= g.W * 0.45 && g.wordY + g.wordH / 2 < g.baseY, JSON.stringify(g));
  // the indicator by tap
  const jumps = [];
  for (const i of [0, 3, 1]) {
    await p.locator(`.story-dot[data-act="${i}"]`).tap();
    let last = -1, same = 0;
    for (let k = 0; k < 40 && same < 5; k++) { await sleep(p, 100); const y = await p.evaluate(() => scrollY); same = y === last ? same + 1 : 0; last = y; }
    await settle(p);
    jumps.push(await p.evaluate(i => { const r = document.querySelectorAll('.step')[i].getBoundingClientRect(); return [i, window.YanabeeStory.act, Math.round((r.top + r.bottom) / 2 - window.YanabeeStory.readingLine())]; }, i));
  }
  check('phone: tapping an indicator button scrolls that step to the reading line', jumps.every(([i, a, d]) => i === a && Math.abs(d) <= 12), JSON.stringify(jumps));
  check('no horizontal overflow at 390 (live)', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  const offs = await p.evaluate(() => {
    const s = document.querySelector('.story-companion').getBoundingClientRect(), bad = [];
    document.querySelectorAll('.story-dots, .story-dots *, .story-core').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < s.left - 1 || r.right > s.right + 1 || r.bottom > s.bottom + 1)) bad.push((el.className || el.tagName) + ` ${Math.round(r.left)}..${Math.round(r.right)}`);
    });
    return bad.slice(0, 5);
  });
  check('nothing in the panel is clipped at the phone edges', offs.length === 0, offs.join(', '));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('light theme: live, both widths paint, no errors');
for (const [name, opts] of [['desktop', { colorScheme: 'light' }], ['phone', { colorScheme: 'light', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const { ctx, p, errs } = await open(opts);
  const res = [];
  for (const i of [1, 3]) { await toLine(p, i); await settle(p); await sleep(p, 500); res.push(await ink(p)); }
  check(`${name} (light): acts 2 and 4 paint (${res.join(', ')})`, res.every(n => n > 150) && (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  check(`${name} (light): no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('reduced motion: the plain static block');
for (const [name, opts] of [['desktop', {}], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const { ctx, p, errs } = await open({ reducedMotion: 'reduce', ...opts });
  const r = await p.evaluate(() => {
    const s = document.querySelector('[data-story]'), fr = [...document.querySelectorAll('.step')];
    const sticky = [...s.querySelectorAll('*')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position)).length;
    const end = document.querySelector('.story-end');
    return { live: s.classList.contains('is-live'), api: window.YanabeeStory && window.YanabeeStory.live, sticky, vh: innerHeight, h: s.offsetHeight,
      comp: getComputedStyle(document.querySelector('.story-companion')).display,
      steps: fr.map(f => { const b = f.getBoundingClientRect(); return [Math.round(b.height), getComputedStyle(f).opacity]; }),
      end: end ? [getComputedStyle(end).display, end.textContent.trim()] : null,
      ov: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
  });
  check(`${name}: no .is-live, companion hidden, no sticky element in the section`, !r.live && !r.api && r.comp === 'none' && r.sticky === 0, JSON.stringify(r));
  check(`${name}: the section is a plain block (${r.h}px)`, r.h < r.vh * 2.4 + 300 && r.h < 1700, `${r.h} vs ${r.vh}`);
  check(`${name}: the four steps are visible, readable cards`, r.steps.length === 4 && r.steps.every(([h, o]) => h > 60 && +o === 1), JSON.stringify(r.steps));
  check(`${name}: the final word «ينابيع» is shown as text`, !!r.end && r.end[0] !== 'none' && r.end[1] === 'ينابيع', JSON.stringify(r.end));
  check(`${name}: no horizontal overflow`, r.ov);
  const steps = await p.$$eval('.step .step-text', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(`${name}: the text is still the full mission`, norm(steps.join(' ')) === norm(mission));
  check(`${name}: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('very short screen (landscape phone 844×390) gets the static block, then goes live when it grows');
{
  const { ctx, p, errs } = await open({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const r = await p.evaluate(() => ({ live: document.querySelector('[data-story]').classList.contains('is-live'), comp: getComputedStyle(document.querySelector('.story-companion')).display, ov: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }));
  check('landscape phone: static block, no companion', !r.live && r.comp === 'none' && r.ov, JSON.stringify(r));
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(p, 900);
  check('rotating to portrait turns the story on', await p.evaluate(() => document.querySelector('[data-story]').classList.contains('is-live') && window.YanabeeStory.live));
  await toLine(p, 3); await settle(p); await sleep(p, 600);
  check('and it paints the final act after the rotation', (await ink(p)) > 80 && (await act(p)) === 3);
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('without JavaScript');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url);
  const html = await p.content();
  check('the static block is in the HTML (four steps, no live class)', (html.match(/class="step"/g) || []).length === 4 && !/story is-live/.test(html));
  const box = await p.$eval('.story-steps', e => { const b = e.getBoundingClientRect(); return [b.width, b.height]; }).catch(() => [0, 0]);
  check('and it is laid out (visible)', box[0] > 300 && box[1] > 100, String(box));
  check('the companion is not shown', await p.$eval('.story-companion', e => getComputedStyle(e).display === 'none'));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} story tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
