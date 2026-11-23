// Browser test of «تعلّم والعب» (learn.html) and the global play layer (passport, confetti, verse practice).
//   node tools/yanabee/test-learn.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0, total = 0; const fails = [];
const check = (n, ok, d = '') => { total++; if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open(f, opts = {}, ctxIn = null) {
  const ctx = ctxIn || await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', ...opts });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url(f));
  await p.waitForTimeout(600);
  return { ctx, p, errs };
}

console.log('quiz');
{
  const { ctx, p, errs } = await open('learn.html');
  await p.evaluate(() => window.YanabeeLearn.seed(42));
  await p.evaluate(() => document.querySelector('#quiz').scrollIntoView());
  await p.waitForTimeout(900);
  await p.click('[data-q-go]');
  let points = 0, sources = 0, kinds = new Set();
  for (let i = 0; i < 8; i++) {
    await p.waitForSelector('.ln-q-card [data-i]');
    const info = await p.evaluate(() => {
      const card = document.querySelector('.ln-q-card');
      const q = window.YANABEE_QUIZ.questions.find(x => x.id === card.dataset.qid);
      const btns = [...card.querySelectorAll('.ln-opt')];
      return { idx: btns.findIndex(b => b.querySelector('.ln-opt-t').textContent.trim() === q.a.t.replace(/"([^"]+)"/g, '«$1»').trim()), n: btns.length, t: q.t, texts: btns.map(b => b.querySelector('.ln-opt-t').textContent) };
    });
    kinds.add(info.t);
    if (i === 0) check('options: 3–4, no duplicates', info.n >= 3 && info.n <= 4 && new Set(info.texts).size === info.n, JSON.stringify(info.texts));
    if (info.idx < 0) { check('correct option found in DOM', false, JSON.stringify(info)); break; }
    await p.click(`.ln-opt[data-i="${info.idx}"]`);
    const fb = await p.evaluate(() => ({ ok: document.querySelector('.ln-q-fb.ok') !== null, src: document.querySelector('[data-src]')?.getAttribute('href'), quote: document.querySelector('.ln-src blockquote')?.textContent.length, pts: +document.querySelector('[data-pts]').textContent }));
    if (fb.ok) points = fb.pts;
    if (fb.src && /\.html#?/.test(fb.src) && fb.quote > 5) sources++;
    await p.click('[data-next]');
  }
  check('8 correct answers give points', points > 800, 'points ' + points);
  check('every answer showed the verbatim source and a link', sources === 8, 'sources ' + sources);
  check('round mixes several question types', kinds.size >= 4, [...kinds].join(','));
  await p.waitForSelector('.ln-q-end:not([hidden]) .ln-stars');
  const end = await p.evaluate(() => ({ score: document.querySelector('[data-score]').textContent, stars: document.querySelectorAll('.ln-stars .on').length }));
  check('end screen: 8 of 8 and 3 stars', end.score === '8' && end.stars === 3, JSON.stringify(end));
  check('confetti on a good score', await p.evaluate(() => !!document.querySelector('.yb-confetti')));
  // a wrong answer shows the review
  await p.click('[data-again]');
  await p.waitForSelector('.ln-q-card');
  for (let i = 0; i < 8; i++) {
    await p.waitForSelector('.ln-q-card [data-i]');
    const idx = await p.evaluate(() => { const card = document.querySelector('.ln-q-card'); const q = window.YANABEE_QUIZ.questions.find(x => x.id === card.dataset.qid); const btns = [...card.querySelectorAll('.ln-opt')]; return btns.findIndex(b => b.querySelector('.ln-opt-t').textContent.trim() !== q.a.t.replace(/"([^"]+)"/g, '«$1»').trim()); });
    await p.click(`.ln-opt[data-i="${idx}"]`);
    if (i === 0) check('wrong answer is marked and the correct one revealed', await p.evaluate(() => !!document.querySelector('.ln-opt.bad') && !!document.querySelector('.ln-opt.ok')));
    await p.click('[data-next]');
  }
  await p.waitForSelector('.ln-q-end:not([hidden]) .ln-review');
  check('end screen reviews the wrong answers with source links', await p.evaluate(() => document.querySelectorAll('.ln-rev').length === 8 && document.querySelectorAll('.ln-rev a[href]').length === 8));
  check('quiz: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('memory match');
{
  const { ctx, p, errs } = await open('learn.html');
  await p.evaluate(() => document.querySelector('#match').scrollIntoView());
  await p.waitForTimeout(900);
  await p.click('[data-m-level] [data-n="3"]');
  const pairs = await p.evaluate(() => { const m = {}; document.querySelectorAll('.mc').forEach((c, i) => (m[c.dataset.pair] ||= []).push(i)); return Object.values(m); });
  check('3 pairs = 6 cards', pairs.length === 3 && pairs.every(x => x.length === 2));
  // one mismatch first
  const a = pairs[0][0], b = pairs[1][0];
  await p.click(`.mc >> nth=${a}`); await p.click(`.mc >> nth=${b}`);
  check('mismatch shakes', await p.evaluate(() => !!document.querySelector('.mc.shake')));
  await p.waitForTimeout(1200);
  check('mismatched cards flip back', await p.evaluate(() => document.querySelectorAll('.mc.up').length === 0));
  for (const [x, y] of pairs) { await p.click(`.mc >> nth=${x}`); await p.click(`.mc >> nth=${y}`); await p.waitForTimeout(550); }
  await p.waitForSelector('[data-m-win]:not([hidden])');
  const res = await p.evaluate(() => ({ moves: document.querySelector('[data-m-moves]').textContent, best: document.querySelector('[data-m-best]').textContent, stored: localStorage.getItem('yanabee-match-best') }));
  check('win records moves = 4 and a best score', res.moves === '4' && /"3"/.test(res.stored || '') && /4/.test(res.best), JSON.stringify(res));
  check('confetti on win', await p.evaluate(() => !!document.querySelector('.yb-confetti')));
  // keyboard
  await p.click('[data-m-again]');
  await p.focus('.mc >> nth=0');
  await p.keyboard.press('ArrowLeft');
  check('arrow keys move focus between cards', await p.evaluate(() => document.activeElement.dataset.i === '2'));
  await p.keyboard.press('Enter');
  check('Enter flips the focused card', await p.evaluate(() => document.activeElement.classList.contains('up')));
  check('match: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('flashcards + pick');
{
  const { ctx, p, errs } = await open('learn.html');
  await p.evaluate(() => document.querySelector('#cards').scrollIntoView());
  await p.waitForTimeout(900);
  await p.focus('.fc-card');
  await p.keyboard.press('Space');
  check('Space flips the card', await p.evaluate(() => document.querySelector('.fc-card').classList.contains('flipped')));
  const first = await p.evaluate(() => document.querySelector('.fc-t').textContent);
  await p.keyboard.press('ArrowLeft');
  check('ArrowLeft (forward in RTL) goes to the next card', await p.evaluate(f => document.querySelector('.fc-t').textContent !== f, first));
  const c0 = await p.evaluate(() => document.querySelector('[data-fc-count]').textContent);
  await p.click('[data-fc-later]');
  await p.click('[data-fc-know]');
  const c1 = await p.evaluate(() => document.querySelector('[data-fc-count]').textContent);
  check('"عرفتها" advances progress', c0 !== c1 && /عرفت 1 من 9/.test(c1), c1);
  await p.click('[data-deck="axes"]');
  check('axes deck has 11 cards', await p.evaluate(() => /11/.test(document.querySelector('[data-fc-count]').textContent)));
  await p.click('[data-deck="teams"]');
  await p.click('.fc-card');
  check('teams deck back shows the verbatim «طبيعة العمل»', await p.evaluate(() => /طبيعة العمل/.test(document.querySelector('.fc-back').textContent)));
  // pick
  await p.evaluate(() => document.querySelector('#pick').scrollIntoView());
  await p.waitForTimeout(900);
  for (const t of ['t1', 't3', 't5']) await p.click(`.ln-pk[data-team="${t}"]`);
  await p.click('.ln-pk[data-team="t7"]');
  check('at most 3 picks', await p.evaluate(() => document.querySelectorAll('.ln-pk.on').length === 3));
  await p.click('[data-pk-show]');
  const pk = await p.evaluate(() => ({ n: document.querySelectorAll('.ln-pk-card').length, imps: document.querySelectorAll('.ln-pk-card li').length, link: document.querySelector('.ln-pk-card a').getAttribute('href'), label: document.querySelector('.ln-pk-card li b').textContent }));
  check('result shows 3 teams with 3 impacts each and a link', pk.n === 3 && pk.imps === 9 && pk.link === 'teams.html#t1' && pk.label === 'الأثر على الفرد', JSON.stringify(pk));
  check('cards/pick: no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('passport + verse practice (shared context = same localStorage origin per file)');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const { p, errs } = await open('teams.html', {}, ctx);
  check('passport chip is on teams.html', await p.evaluate(() => !!document.querySelector('.yb-pass')));
  for (const id of ['t1', 't2', 't3']) {
    await p.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'center', behavior: 'instant' }), id);
    await p.waitForTimeout(1700);
  }
  const got = await p.evaluate(() => window.YanabeeFun.passport.get());
  check('visiting panels collects springs', ['t1', 't2', 't3'].every(x => got.includes(x)), got.join(','));
  check('chip droplets fill', await p.evaluate(() => document.querySelectorAll('.yb-d.on').length >= 3));
  check('no collision with the assistant button', await p.evaluate(() => { const a = document.querySelector('.yb-pass').getBoundingClientRect(), b = document.querySelector('.chat-fab').getBoundingClientRect(); return a.right < b.left || a.left > b.right; }));
  for (const id of ['t4', 't5', 't6', 't7']) {
    await p.evaluate(i => document.getElementById(i).scrollIntoView({ block: 'center', behavior: 'instant' }), id);
    await p.waitForTimeout(1700);
  }
  check('all seven collect → toast', await p.evaluate(() => document.querySelector('.yb-toast')?.textContent.includes('اكتملت الينابيع السبعة')));
  check('all seven collect → confetti', await p.evaluate(() => !!document.querySelector('.yb-confetti')));
  check('teams: no script errors', errs.length === 0, errs.join(' | '));
  const l = await open('learn.html', {}, ctx);
  check('progress persists on learn.html (7 stamps on)', await l.p.evaluate(() => document.querySelectorAll('.ln-stamp.on').length === 7 && document.querySelector('[data-pp-n]').textContent === '7'));
  await l.p.click('[data-pp-reset]');
  check('reset clears the passport', await l.p.evaluate(() => document.querySelectorAll('.ln-stamp.on').length === 0));
  check('learn: no script errors', l.errs.length === 0, l.errs.join(' | '));

  // verse practice
  const q = await open('quran.html', {}, ctx);
  const before = await q.p.evaluate(() => document.querySelector('.verse').textContent);
  await q.p.evaluate(() => document.querySelector('.verse').scrollIntoView({ block: 'center' }));
  await q.p.waitForTimeout(2500);
  await q.p.click('.yb-seg [data-lv="50"]');
  const st = await q.p.evaluate(() => ({ hid: document.querySelectorAll('.yb-hid').length, all: document.querySelectorAll('.yb-w').length, role: document.querySelector('.yb-hid').getAttribute('aria-label'), txt: document.querySelector('.verse').textContent }));
  check('50% hides about half the words', Math.abs(st.hid - st.all / 2) <= 1 && st.hid > 5, JSON.stringify({ h: st.hid, a: st.all }));
  check('hidden words are labelled buttons', st.role === 'كلمة مخفية');
  check('verse textContent unchanged while hidden', st.txt === before);
  await q.p.click('.yb-hid >> nth=0');
  const rv = await q.p.evaluate(() => ({ hid: document.querySelectorAll('.yb-hid').length, status: document.querySelector('.yb-verse-st').textContent, txt: document.querySelector('.verse').textContent }));
  check('pressing a hidden word reveals it and counts', rv.hid === st.hid - 1 && /كشفت 1 من/.test(rv.status), rv.status);
  await q.p.focus('.yb-hid >> nth=0');
  await q.p.keyboard.press('Enter');
  check('keyboard reveals too', await q.p.evaluate(h => document.querySelectorAll('.yb-hid').length === h - 2, st.hid));
  await q.p.click('.yb-seg [data-lv="100"]');
  check('hide all', await q.p.evaluate(() => document.querySelectorAll('.yb-hid').length === document.querySelectorAll('.yb-w').length));
  await q.p.click('.yb-seg [data-lv="all"]');
  check('show all restores the text', await q.p.evaluate(t => document.querySelector('.yb-hid') === null && document.querySelector('.verse').textContent === t, before));
  check('quran: no script errors', q.errs.length === 0, q.errs.join(' | '));
  await ctx.close();
}

console.log('reduced motion');
{
  const { ctx, p, errs } = await open('learn.html', { reducedMotion: 'reduce' });
  const r = await p.evaluate(() => window.YanabeeFun.confetti(300, 300));
  check('confetti is skipped (no canvas)', r === false && await p.evaluate(() => !document.querySelector('.yb-confetti')));
  const q = await open('quran.html', { reducedMotion: 'reduce' });
  check('verse practice works without fx word spans', await q.p.evaluate(() => { document.querySelector('.yb-seg [data-lv="25"]').click(); return document.querySelectorAll('.yb-hid').length > 3; }));
  check('reduced motion: no script errors', errs.length + q.errs.length === 0, errs.concat(q.errs).join(' | '));
  await ctx.close();
}

console.log('index + operations load without errors');
for (const f of ['index.html', 'operations.html']) {
  const { ctx, p, errs } = await open(f);
  check(f + ': no script errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\nPASS ${pass}/${total}`);
if (fails.length) { console.log('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
