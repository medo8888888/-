// Browser test of the pinned scroll story on the home page (module "story": the mission, performed).
//   node tools/yanabee/test-story.mjs
// Real Chromium over file://. Covers: the four fragments are the mission paragraph verbatim and in order, the live (pinned)
// mode, act/caption changes with scroll, a non-blank canvas in every act, the rail, pausing off-screen, theme switch,
// phone caps, reduced motion = plain static block, no console errors, no horizontal overflow. Exits non-zero on failure.
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
// scroll so the story's progress is v (0..1) and let particles settle
const goto = async (p, v, wait = 800) => {
  await p.evaluate(v => {
    const t = document.querySelector('.story-track'), s = document.querySelector('.story-stage'), r = t.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + v * (r.height - s.clientHeight), behavior: 'instant' });
  }, v);
  await p.waitForTimeout(wait);
};
const act = p => p.evaluate(() => +document.querySelector('[data-story]').dataset.act);
const prog = p => p.evaluate(() => +document.querySelector('[data-story]').dataset.progress);
// how many canvas pixels are visibly painted
const ink = p => p.evaluate(() => {
  const c = document.querySelector('.story-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 24) n++;
  return n;
});
const shown = p => p.evaluate(() => [...document.querySelectorAll('.frag')].map(f => +getComputedStyle(f).opacity));

console.log('markup: the mission, verbatim, in four fragments');
{
  const { ctx, p, errs } = await open();
  const frags = await p.$$eval('.frag .frag-text', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check('section present with four fragments', frags.length === 4, String(frags.length));
  check('the fragments, in order, are exactly the mission paragraph', norm(frags.join(' ')) === norm(mission), norm(frags.join(' ')).slice(0, 80));
  check('the paragraph reads as one (a single <p> holds all four)', await p.$$eval('.story-mission', e => e.length === 1 && e[0].tagName === 'P' && e[0].querySelectorAll('.frag').length === 4));
  const kick = await p.$eval('.story h2.kicker', e => e.textContent.trim());
  check('kicker is the mission title «الرسالة»', kick === 'الرسالة', kick);
  check('decoration is hidden from assistive tech', await p.$$eval('.story-canvas, .story-tags, .story-core, .story-final, .story-hint', els => els.every(e => e.getAttribute('aria-hidden') === 'true')));
  check('seven team labels from the content', (await p.$$eval('.story-tag', e => e.map(x => x.textContent.trim()))).length === 7);
  check('four rail ticks are real labelled buttons', await p.$$eval('.story-tick', b => b.length === 4 && b.every(x => x.tagName === 'BUTTON' && x.getAttribute('aria-label'))));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('live mode (desktop 1440×900)');
{
  const { ctx, p, errs } = await open();
  check('.is-live is set after init', await p.evaluate(() => document.querySelector('[data-story]').classList.contains('is-live') && window.YanabeeStory.live));
  const geo = await p.evaluate(() => {
    const t = document.querySelector('.story-track'), s = document.querySelector('.story-stage'), cs = getComputedStyle(s);
    return { vh: innerHeight, track: t.offsetHeight, stage: s.offsetHeight, pos: cs.position, stats: window.YanabeeStory.stats() };
  });
  check('tall track (~4.6 screens) with a sticky full-viewport stage', Math.abs(geo.track / geo.vh - 4.6) < 0.15 && geo.pos === 'sticky' && Math.abs(geo.stage - geo.vh) <= 1, JSON.stringify(geo));
  check('particles are capped (≤ 1800) and DPR ≤ 2', geo.stats.particles <= 1800 && geo.stats.particles >= 1000 && geo.stats.dpr <= 2, JSON.stringify(geo.stats));
  check('the word «ينابيع» was sampled into target points', geo.stats.word >= 1000, String(geo.stats.word));
  await goto(p, 0);
  check('the first act is current at the top', (await act(p)) === 0);
  check('the scroll hint is visible at the start', await p.evaluate(() => +getComputedStyle(document.querySelector('.story-hint')).opacity > 0.8));

  // pinned while the page scrolls through the track (real wheel)
  const top0 = await p.evaluate(() => { const r = document.querySelector('.story-track').getBoundingClientRect(); return window.scrollY + r.top; });
  await p.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), top0);
  await p.mouse.move(700, 400);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 500); await p.waitForTimeout(120); }
  await p.waitForTimeout(500);
  const pinned = await p.evaluate(() => Math.round(document.querySelector('.story-stage').getBoundingClientRect().top));
  check('the stage stays pinned while wheel-scrolling the track', pinned === 0, String(pinned));
  check('the hint has faded after scrolling', await p.evaluate(() => +getComputedStyle(document.querySelector('.story-hint')).opacity < 0.1));

  // acts follow the scroll; the caption fragment follows the act
  const seen = [];
  for (const v of [0.15, 0.41, 0.65, 0.985]) {
    await goto(p, v, 1000);
    const a = await act(p), op = await shown(p), n = await ink(p);
    seen.push(a);
    check(`progress ${v}: act ${a + 1}, its caption shown, canvas painted (${n})`, op[a] > 0.9 && op.filter((x, i) => i !== a).every(x => x < 0.1) && n > 150, JSON.stringify(op));
  }
  check('acts advance 1 → 4 with the scroll', seen.join() === '0,1,2,3', seen.join());
  check('words are all lit when an act has been read', await p.evaluate(() => [...document.querySelectorAll('.frag')][3].querySelectorAll('.w').length > 0 && [...document.querySelectorAll('.frag')][3].querySelectorAll('.w').length === [...document.querySelectorAll('.frag')][3].querySelectorAll('.w[style*="--l: 1"], .w[style*="--l:1"]').length));
  await goto(p, 0.10, 900);
  check('progress moves back and the first act returns', (await act(p)) === 0 && (await shown(p))[0] > 0.9);
  const lab = await p.$$eval('.story-tag', e => e.map(x => +getComputedStyle(x).opacity));
  await goto(p, 0.41, 900);
  const lab2 = await p.$$eval('.story-tag', e => e.map(x => +getComputedStyle(x).opacity));
  check('team labels are hidden in act 1 and shown in act 2', lab.every(o => o < 0.1) && lab2.every(o => o > 0.8), JSON.stringify([lab, lab2]));
  await goto(p, 0.985, 1200);
  check('the droplet and the closing line are shown in the final act', await p.evaluate(() => +getComputedStyle(document.querySelector('.story-core')).opacity > 0.9 && +getComputedStyle(document.querySelector('.story-final')).opacity > 0.9));
  check('the closing line is the project subtitle from the content', (await p.$eval('.story-final', e => e.textContent.trim())).includes('المنصة الوطنية الموحدة'));

  // the rail
  const ticks = [];
  for (const i of [0, 2, 1, 3]) {
    await p.click(`.story-tick[data-act="${i}"]`);
    await p.waitForTimeout(2200);
    ticks.push([i, await act(p), await p.$eval(`.story-tick[data-act="${i}"]`, b => b.getAttribute('aria-current') === 'step')]);
  }
  check('rail ticks scroll to their acts (and mark the current one)', ticks.every(([i, a, cur]) => i === a && cur), JSON.stringify(ticks));
  check('the story label is left alone by the headline splitter (no stray .w word blur)', await p.evaluate(() => { const k = document.querySelector('.story-head .kicker'); return !!k && !k.querySelector('.w') && getComputedStyle(k).filter === 'none'; }));
  check('the rail fills with the progress', await p.evaluate(() => +getComputedStyle(document.querySelector('.story-rail')).getPropertyValue('--rp') > 0.9));

  // off-screen: the loop pauses
  await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await p.waitForTimeout(500);
  const f1 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  await p.waitForTimeout(700);
  const f2 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  check('the loop pauses when the story is off-screen', f2 === f1, `${f1} -> ${f2}`);
  await goto(p, 0.41, 700);
  const f3 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  await p.waitForTimeout(400);
  const f4 = await p.evaluate(() => window.YanabeeStory.stats().frames);
  check('…and resumes when it returns', f4 > f3 + 5, `${f3} -> ${f4}`);

  // pointer: moving over the stage and pressing is harmless; a press paints a ripple
  await p.mouse.move(600, 380); await p.mouse.move(640, 400); await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(300);
  check('pointer move + press on the stage work', (await ink(p)) > 150);

  // theme switch keeps the canvas alive in both themes
  const before = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.evaluate(() => window.YanabeeTheme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => document.documentElement.dataset.theme);
  check('the story survives a theme switch and still paints', before !== after && (await ink(p)) > 150, before + ' -> ' + after);
  await goto(p, 0.985, 1300);
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
  check('.is-live on phones too', await p.evaluate(() => document.querySelector('[data-story]').classList.contains('is-live')));
  const st = await p.evaluate(() => window.YanabeeStory.stats());
  check('phone caps: ≤ 800 particles, DPR ≤ 1.5', st.particles <= 800 && st.particles >= 400 && st.dpr <= 1.5, JSON.stringify(st));
  check('phone track is shorter (~4 screens)', await p.evaluate(() => Math.abs(document.querySelector('.story-track').offsetHeight / innerHeight - 4) < 0.15));
  for (const v of [0.05, 0.41, 0.65, 0.985]) {
    await goto(p, v, 1100);
    const n = await ink(p), op = await shown(p), a = await act(p);
    check(`phone progress ${v}: act ${a + 1}, caption shown, canvas painted (${n})`, op[a] > 0.9 && n > 80, JSON.stringify(op));
  }
  check('no horizontal overflow at 390 (live)', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), await p.evaluate(() => document.documentElement.scrollWidth));
  const offs = await p.evaluate(() => {
    const s = document.querySelector('.story-stage').getBoundingClientRect(), bad = [];
    document.querySelectorAll('.story-ui *, .story-tag, .story-rail *, .story-final').forEach(el => {
      const r = el.getBoundingClientRect(), op = +getComputedStyle(el.closest('.story-tag, .story-final, .frag, .story-rail') || el).opacity;
      if (r.width && op > 0.5 && (r.left < s.left - 1 || r.right > s.right + 1)) bad.push((el.className || el.tagName) + ` ${Math.round(r.left)}..${Math.round(r.right)}`);
    });
    return bad.slice(0, 5);
  });
  check('nothing visible is clipped at the phone edges', offs.length === 0, offs.join(', '));
  check('no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('reduced motion: a plain static block');
for (const [name, opts] of [['desktop', {}], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const { ctx, p, errs } = await open({ reducedMotion: 'reduce', ...opts });
  const r = await p.evaluate(() => {
    const s = document.querySelector('[data-story]'), t = document.querySelector('.story-track'), fr = [...document.querySelectorAll('.frag')];
    return { live: s.classList.contains('is-live'), api: window.YanabeeStory && window.YanabeeStory.live, track: t.offsetHeight, vh: innerHeight, pos: getComputedStyle(document.querySelector('.story-stage')).position,
      canvas: getComputedStyle(document.querySelector('.story-canvas')).display, rail: getComputedStyle(document.querySelector('.story-rail')).display,
      frags: fr.map(f => { const b = f.getBoundingClientRect(); return [Math.round(b.height), getComputedStyle(f).opacity]; }),
      ov: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
  });
  check(`${name}: no .is-live, no sticky stage, no canvas, no rail`, !r.live && !r.api && r.pos !== 'sticky' && r.canvas === 'none' && r.rail === 'none', JSON.stringify(r));
  check(`${name}: no tall track (${r.track}px)`, r.track < r.vh * 2.6 + 400 && r.track < 1700, `${r.track} vs ${r.vh}`);
  check(`${name}: the four fragments are visible, readable cards`, r.frags.length === 4 && r.frags.every(([h, o]) => h > 60 && +o === 1), JSON.stringify(r.frags));
  check(`${name}: no horizontal overflow`, r.ov);
  const frags = await p.$$eval('.frag .frag-text', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(`${name}: the text is still the full mission`, norm(frags.join(' ')) === norm(mission));
  check(`${name}: no script errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('very short screen (landscape phone 844×390) gets the static block, then goes live when it grows');
{
  const { ctx, p, errs } = await open({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const r = await p.evaluate(() => ({ live: document.querySelector('[data-story]').classList.contains('is-live'), pos: getComputedStyle(document.querySelector('.story-stage')).position, ov: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 }));
  check('landscape phone: static block, no pinned stage', !r.live && r.pos !== 'sticky' && r.ov, JSON.stringify(r));
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(900);
  check('rotating to portrait turns the story on', await p.evaluate(() => document.querySelector('[data-story]').classList.contains('is-live') && window.YanabeeStory.live));
  await goto(p, 0.985, 1200);
  check('and it paints after the rotation', (await ink(p)) > 80);
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
  check('the static block is in the HTML (four fragments, no live class)', (html.match(/class="frag"/g) || []).length === 4 && !/story is-live/.test(html));
  const box = await p.$eval('.story-mission', e => { const b = e.getBoundingClientRect(); return [b.width, b.height]; }).catch(() => [0, 0]);
  check('and it is laid out (visible)', box[0] > 300 && box[1] > 100, String(box));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} story tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
