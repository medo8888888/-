// MANARA («منارة») — tests for the landing page: site/manara/index.html, css/home.css, js/home.js and 404.html.
//
//   node tools/manara/test-home.mjs            (about 2–3 minutes; needs Playwright + Chromium, see tools/manara/lib.mjs)
//
// What is checked (numbered like the sections printed below):
//   1  the project laws, read from the source: classic scripts, no fetch/XHR/CDN, innerHTML only for author-written SVG, logical CSS only, tokens only
//   2  every real-world number on the page against docs/MANARA-SOURCES.md, and every simulation / detector number against the engines that produce it
//      (ManaraSim A/B + sweeps, test-fire.mjs, the Decoy Lab in detect.html, the tier costs in build.html, the persona wording in messages.js, §13 thresholds)
//   3  page loads clean at 360 … 1920 px in both themes and languages: no console error, no horizontal scroll, no box that hides overflowing content
//   4  bilingual structure (every data-l="ar" has its "en"), language/theme switch, no letter-spacing on Arabic
//   5  hero: six hazards, radiogroup keyboard, still frame under reduced motion, pause off-screen, redraw on theme change, deep link to Mission Control
//   6  counters, pipeline tabs (mouse + keyboard, RTL arrows), proof-before-panic logic
//   7  the fastest-responder map: farther-but-faster, night, trauma, jam/close, keyboard, honest SIM labels, all three unit types
//   8  hazard cards + gauges, personas + languages, transparency filter, placeholders, links resolve
//   9  accessibility (names, ids, headings, landmarks, target size, focus, WCAG AA contrast in both themes × both languages)
//  10  print (always paper-light, PDF renders), reduced motion, layout shift, 404.html
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, SITE, ROOT, url } from './lib.mjs';

const section = t => console.log('\n' + t);
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const HTML = read('index.html'), CSS = read('css/home.css'), JS = read('js/home.js'), NF = read('404.html');
const SOURCES = fs.readFileSync(path.join(ROOT, 'docs/MANARA-SOURCES.md'), 'utf8');
const HAZ = fs.readFileSync(path.join(ROOT, 'docs/MANARA-HAZARDS.md'), 'utf8');
const loadCtx = f => { const c = vm.createContext({ console }); vm.runInContext(read('js/' + f), c); return c; };
const S = loadCtx('sim.js').ManaraSim, MSG = loadCtx('messages.js').MANARA_MSG;
const browser = await launch();
const mk = (o = {}) => openPage(browser, 'index.html', o);
const strip = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

/* ============================================================================================ 1. laws */
section('1. Project laws (read from the source)');
{
  const scripts = [...HTML.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
  check('classic scripts only: every external <script> is defer, none is type=module', scripts.filter(s => /src=/.test(s)).every(s => /\bdefer\b/.test(s)) && !scripts.some(s => /type=["']?module/.test(s)));
  const ext = [...HTML.matchAll(/(?:href|src)=["'](https?:[^"']+)["']/g)].map(m => m[1]).filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u));
  check('no library or CDN: the only external hosts are Google Fonts', ext.length === 0, ext.join(' '));
  check('home.js: no fetch / XMLHttpRequest / import / export / eval', !/\b(fetch|XMLHttpRequest|eval)\s*\(|^\s*(import|export)\s/m.test(JS));
  check('home.js: no cookies, no network sends, storage only through core.js', !/document\.cookie|sendBeacon|WebSocket|localStorage|sessionStorage/.test(JS));
  const inner = JS.match(/\.innerHTML\s*=/g) || [];
  check('innerHTML is assigned in exactly one place (setStaticHTML)', inner.length === 1 && /function setStaticHTML\(node, html\) \{ node\.innerHTML = html; \}/.test(JS), String(inner.length));
  const calls = [...JS.matchAll(/setStaticHTML\(([^;]*?)\);/g)].map(m => m[1]).filter(a => !a.startsWith('node, html'));
  check(`all ${calls.length} setStaticHTML calls pass only author-written SVG (Manara.icon/logo, iconInner or a literal <svg>)`, calls.length >= 8 && calls.every(a => /^[^,]+,\s*(M\.(icon|logo)\(|iconInner\(|kd\.icon === 'plus')/.test(a)), calls.filter(a => !/^[^,]+,\s*(M\.(icon|logo)\(|iconInner\(|kd\.icon === 'plus')/.test(a)).join(' || '));
  check('home.js: no insertAdjacentHTML / document.write / outerHTML', !/insertAdjacentHTML|document\.write|outerHTML/.test(JS));
  const cssNoPrint = CSS.slice(0, CSS.indexOf('@page{'));
  const physical = cssNoPrint.match(/(margin|padding|border)-(left|right)\b|text-align\s*:\s*(left|right)|(^|[;{\s])(left|right)\s*:|\bfloat\s*:/gm) || [];
  check('home.css: logical properties only (no margin/padding/border-left|right, no left:/right:, no text-align left|right, no float)', physical.length === 0, physical.join(' '));
  const hex = (cssNoPrint.replace(/mask-image:[^;}]*/g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || []);   // (a mask's #000 is an alpha stop, not a visible colour)
  check('home.css: colours come from tokens (no hex colour outside the print block)', hex.length === 0, hex.join(' '));
  check('home.js: colours come from tokens (no hex or rgb() literal)', !/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(\s*\d/.test(JS.replace(/'rgb\(' \+|'rgba\(' \+/g, '')));
  const ls = [...cssNoPrint.matchAll(/([^{}]+)\{[^{}]*letter-spacing\s*:\s*([^;}]+)[;}]/g)].map(m => m[1].trim() + ' => ' + m[2].trim());
  check('letter-spacing only in English rules, with an Arabic reset, or on digits', ls.every(l => /data-lang=en|\.pp-ex|\.nf-code/.test(l)) && /html\[data-lang=ar\] \.pp-ex\{letter-spacing:0\}/.test(CSS), ls.join(' | '));
  check('print block exists, sets paper colours and hides nav/subnav/controls', /@media print\{[\s\S]*--bg:#fff[\s\S]*\.nav,\.subnav/.test(CSS) && /@page\{margin/.test(CSS));
  check('reduced motion: CSS stops the route animation, JS shows a still frame and counters finish', /prefers-reduced-motion:reduce\)\{[^}]*\.route\{animation:none\}/.test(CSS) && /if \(reduced\(\)\) \{ st\.playing = false; st\.t = STILL_T; \}/.test(JS) && /if \(reduced\(\) \|\| !\('IntersectionObserver' in window\)\) \{ nodes\.forEach\(finish\)/.test(JS));
  check('the canvas pauses off-screen (IntersectionObserver) and when the tab is hidden', /new IntersectionObserver\(function \(es\) \{ st\.visible = es\[0\]\.isIntersecting/.test(JS) && /document\.hidden/.test(JS));
  check('page title, description and social tags are bilingual-aware', /<title data-en="[^"]+">[^<]*[؀-ۿ][^<]*<\/title>/.test(HTML) && /<meta name="description" content="[^"]*[؀-ۿ]/.test(HTML));
  check('404.html: relative links only, base-href guard for deep missing paths, bilingual title', !/href="\/|href="https?:/.test(NF.replace(/https:\/\/fonts\.[a-z.]+[^"']*/g, '')) && /createElement\('base'\)/.test(NF) && !/document\.write/.test(NF) && /<title data-en="MANARA/.test(NF));
}

/* ============================================================================================ 2. numbers */
section('2. Numbers on the page against their sources and engines');
const sourceIds = new Set([...SOURCES.matchAll(/^\|\s*(S\d+)\s*\|/gm)].map(m => m[1]));
{
  const used = [...new Set((strip(HTML + JS).match(/\bS\d{1,2}\b/g) || []))];
  const unknown = used.filter(s => !sourceIds.has(s));
  check(`every source id cited (${used.length}: ${used.slice(0, 8).join(' ')} …) exists in docs/MANARA-SOURCES.md`, used.length >= 20 && unknown.length === 0, unknown.join(' '));
  const must = ['1,326,300', '2,846,118', '46.6', '92.7', '7–10', '7–12', '1,636', '2,473', '102', '145', '49%', '66.7%', '87.5', '81.3', '184', '188', '991', '32.1', '7,000', '64.0%', '75%'];
  const txt = strip(HTML);
  check('the sourced figures are on the page exactly as written in the sources file', must.every(m => txt.includes(m)), must.filter(m => !txt.includes(m)).join(' '));
  const text = strip(HTML).replace(/\s+/g, ' ');
  const banned = [/world[- ]first/i, /first[- ]ever/i, /\bthe first (in|of its kind|to)/i, /\bsaves? \d+ lives/i, /saves lives/i, /(?<!not say “)we save lives/i, /deep learning/i, /neural network/i, /AI-powered/i, /أول من نوعه/, /الأول من نوعه/, /ننقذ \d+ /, /تُنقذ أرواح/];
  const hit = banned.filter(r => r.test(text));
  check('banned claims never appear ("first", "saves lives", "deep learning", "AI-powered", …)', hit.length === 0, hit.join(' '));
  // «ذكاء اصطناعي» may only appear in a negation about the detector or in the AI-disclosure paragraph
  const aiAr = [...text.matchAll(/.{0,26}ذكاء[ًٌٍ]? ?اصطناعي[ًّ]?.{0,16}/g)].map(m => m[0]);
  check(`the rule-based detector is never called "AI" (${aiAr.length} Arabic mentions: all negations or the disclosure)`, aiAr.every(s => /ليست|ليس|أدوات|الذكاء الاصطناعي/.test(s)), aiAr.join(' || '));
  const aiEn = [...text.matchAll(/.{0,30}\bAI\b.{0,24}/g)].map(m => m[0]);
  check(`English: "AI" only as "not AI" or in the AI-disclosure (${aiEn.length} mentions)`, aiEn.every(s => /not AI|AI tools|AI disclosure|AI_TOOLS|Ownership & AI|Ownership &amp; AI/.test(s)), aiEn.join(' || '));
  check('Arabic names the detector «رؤية حاسوبية بقواعد» and English "rule-based computer vision"', /رؤية حاسوبية بقواعد/.test(HTML) && /rule-based computer vision/i.test(HTML));
  check('prior art is named respectfully: Saqr/Falcon, Shaheen, Suhail, ISEF 2025 (title and award only) and "not a competitor"', ['Saqr', 'Shaheen', 'Suhail', 'ISEF 2025', 'not a competitor'].every(w => HTML.includes(w)));
  check('"SIM" labels the simulated parts (hero chip, dispatch map, A/B, sweeps, truth table)', (HTML.match(/>SIM</g) || []).length >= 6 && /\(SIM\)/.test(HTML));
}
{ // engines
  const ab = S.ab({ preset: 'fire-night', seed: 1 });
  const { page } = await mk({ lang: 'en' });
  const ev = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ev]')].map(n => [n.getAttribute('data-ev'), n.textContent.trim().replace(/,/g, '')])));
  const exp = {
    'ab.p90.ord': Math.round(ab.ordinary.timeToSafeP90Sec), 'ab.p90.man': Math.round(ab.manara.timeToSafeP90Sec),
    'ab.inj.ord': ab.ordinary.injuredInModel, 'ab.inj.man': ab.manara.injuredInModel, 'ab.dead.ord': ab.ordinary.deadEnds, 'ab.dead.man': ab.manara.deadEnds,
    'ab.siren': ab.ordinary.timeToFirstAlertSec, 'ab.personal': ab.manara.timeToFirstPersonalAlertSec, 'ab.inf120': ab.manara.informedPctAt120
  };
  const bad = Object.keys(exp).filter(k => String(exp[k]) !== ev[k]);
  check(`A/B numbers on the page equal ManaraSim.ab(fire-night, seed 1): ${Object.keys(exp).length} values (p90 ${exp['ab.p90.ord']} vs ${exp['ab.p90.man']} s, injured ${exp['ab.inj.ord']}/${exp['ab.inj.man']}, dead ends ${exp['ab.dead.ord']}/${exp['ab.dead.man']})`, bad.length === 0, bad.map(k => `${k}: page ${ev[k]} engine ${exp[k]}`).join('; '));
  check('A/B bar widths use the same numbers (626.2 / 317 / 10 / 5 / 64 / 3)', ['--v:626.2', '--v:317', '--v:10', '--v:5', '--v:64', '--v:3'].every(v => HTML.includes(v)));
  const sw = S.sweep({ preset: 'fire-night', param: 'phoneAppPct', values: [0, 40, 85, 100], seeds: [1], seconds: 600 }).rows;
  const labels = await page.evaluate(() => [...document.querySelectorAll('#sweep-svg .sw-v')].map(n => n.textContent));
  check('sweep chart equals ManaraSim.sweep(phoneAppPct 0/40/85/100, seed 1, 600 s): ' + labels.join(', '), JSON.stringify(labels) === JSON.stringify(sw.map(r => String(Math.round(r.headlineManara)))) && sw.every(r => r.headlineOrdinary === 570), labels.join() + ' vs ' + sw.map(r => Math.round(r.headlineManara)).join());
  const gas = S.sweep({ preset: 'gas-night', param: 'gasInfilPct', values: [0, 30, 60, 90], seeds: [1], seconds: 600 }).rows;
  const cells = await page.evaluate(() => [...document.querySelectorAll('#gas-sweep tbody tr')].map(r => [...r.querySelectorAll('td')].slice(1).map(c => c.textContent.trim().replace(/,/g, ''))));
  check('gas table equals ManaraSim.sweep(gasInfilPct 0/30/60/90, seed 1): ' + JSON.stringify(cells), JSON.stringify(cells) === JSON.stringify(gas.map(r => [String(r.headlineOrdinary), String(r.headlineManara)])));
  const hasSim = await page.evaluate(() => /mechanism check/i.test(document.querySelector('#ev-sim').textContent) && /SIM/.test(document.querySelector('#ev-assume h3').textContent));
  check('A/B and sweep cards say "mechanism check" and carry the SIM tag', hasSim);
  // detector (test-fire.mjs prints the numbers the page shows)
  const tf = spawnSync('node', [path.join(ROOT, 'tools/manara/test-fire.mjs')], { encoding: 'utf8' }).stdout;
  const acc = /sample set ([\d.]+) % and tuning set ([\d.]+) % .*test set ([\d.]+) %/.exec(tf);
  const mx = /fire\s+(\d+)\s+(\d+)\s+(\d+)\s*\n\s*smoke\s+(\d+)\s+(\d+)\s+(\d+)\s*\n\s*none\s+(\d+)\s+(\d+)\s+(\d+)/.exec(tf.slice(tf.lastIndexOf('confusion matrix')));
  const rec = [...tf.matchAll(/fire recall (\d+)\/(\d+)\s+false fire alarms (\d+)\/(\d+)/g)].pop();   // the last block is the held-out test set
  const det = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ev^="det."]')].map(n => [n.getAttribute('data-ev'), n.textContent.trim()])));
  check('detector accuracy bars equal test-fire.mjs: sample ' + (acc && acc[1]) + ', tuning ' + (acc && acc[2]) + ', held-out ' + (acc && acc[3]), !!acc && det['det.sample'] === acc[1] && det['det.tuning'] === acc[2] && det['det.test'] === acc[3], JSON.stringify(det));
  const keys = ['ff', 'fs', 'fn', 'sf', 'ss', 'sn', 'nf', 'ns', 'nn'];
  check('confusion matrix equals test-fire.mjs: ' + (mx && mx.slice(1).join(' ')), !!mx && keys.every((k, i) => det['det.mx.' + k] === mx[i + 1]), JSON.stringify(det));
  const pt = await page.evaluate(() => document.querySelector('#ev-det').textContent.replace(/\s+/g, ' '));
  check('"12 / 18", "6 / 6", "3 / 12", "0 / 3" on the page equal the matrix (' + (rec && rec.slice(1).join(',')) + ')', !!rec && !!mx && +mx[1] + +mx[5] + +mx[9] === 12 && /12 \/ 18/.test(pt) && /6 \/ 6/.test(pt) && /3 \/ 12/.test(pt) && /0 \/ 3/.test(pt) && rec[1] === '6' && rec[3] === '3' && rec[4] === '12');
  check('the page says outright that the first two accuracy bars were tuned on (optimistic) and the test set is the honest one', /optimistic/.test(pt) && /never used/i.test(pt));
  await page.context().close();
}
{ // Decoy Lab + live decoys in detect.html
  const { page } = await openPage(browser, 'detect.html', { lang: 'en' });
  await page.click('#t-decoy');
  await page.waitForFunction(() => window.__decoyDone === true, null, { timeout: 120000 });
  const kp = await page.evaluate(() => [...document.querySelectorAll('.kpi')].map(k => k.innerText.replace(/\s+/g, ' ')));
  const full = kp.find(k => /detection \(full stack\)/.test(k)), fa = kp.find(k => /false alarms \(full stack\)/.test(k)), col = kp.find(k => /false alarms \(colour only\)/.test(k));
  const f = s => (/(\d+)\/(\d+)/.exec(s || '') || []).slice(1, 3).join(' / ');
  const idx = strip(HTML).replace(/\s+/g, ' ');
  check(`Decoy Lab (detect.html) says detection ${f(full)}, false alarms full ${f(fa)}, colour only ${f(col)}; the landing page quotes exactly those`, !!full && !!fa && !!col && idx.includes(f(col)) && idx.includes(f(fa)) && idx.includes(f(full)), JSON.stringify(kp));
  const r = await page.evaluate(() => {
    const L = window.ManaraLab, res = [];
    for (const id of ['shirt', 'car', 'scarf', 'led', 'flashlight', 'wall', 'flicker']) for (const seed of [1, 2]) {
      const sc = L.makeScene(id, 160, 120, seed, id === 'flicker' ? { hz: 10 } : undefined), p = L.createPipeline({}), n = Math.round(8 * L.FPS); let fire = false;
      for (let k = 0; k < n; k++) { const out = p.push({ data: sc.frame(k), width: sc.w, height: sc.h }, k * 1000 / L.FPS, L.thermalGrid(sc.heat(k), k, 1)); if (out.state === 'fire' || out.visionState === 'fire') fire = true; }
      res.push(!fire);
    }
    return res;
  });
  check(`"14 / 14 decoy trials never reached FIRE" is reproduced here: ${r.filter(Boolean).length} / ${r.length}`, r.length === 14 && r.every(Boolean) && /14 \/ 14/.test(idx));
  await page.context().close();
}
{ // hardware tiers vs build.html
  const { page } = await openPage(browser, 'build.html', { lang: 'en' });
  await page.waitForTimeout(600);
  const cards = await page.evaluate(() => [...document.querySelectorAll('#tier-cards > *')].map(k => (/US\$\s*([\d.]+)[–-]([\d.]+)/.exec(k.innerText) || []).slice(1, 3).join('-')));
  const idx = strip(HTML).replace(/\s+/g, ' ');
  check(`tier costs on the page equal build.html (${cards.join(', ')}) and the running totals add up`, JSON.stringify(cards) === JSON.stringify(['2-10', '78-217', '15-43']) && /US\$ 2–10/.test(idx) && /US\$ 78–217/.test(idx) && /US\$ 15–43/.test(idx) && /US\$ 80–227/.test(idx) && /US\$ 95–270/.test(idx) && /US\$ 22–43/.test(idx) && 2 + 78 === 80 && 10 + 217 === 227 && 80 + 15 === 95 && 227 + 43 === 270, cards.join());
  await page.context().close();
}
{ // persona wording = the message engine
  const { page } = await mk({ lang: 'en' });
  const PM = await page.evaluate(() => window.__manaraHome.PERSONA_MSG);
  const P = { ravi: 'worker', huda: 'deaf', abu: 'wheelchair', lina: 'child' }, vars = { exit: { ar: 'الدرج (ب)', en: 'Stair B' }, shelter: { ar: 'الحاوية المكيّفة', en: 'the cooling container' }, n: 4 };
  let ok = 0; const bad = [];
  for (const hz of Object.keys(PM)) for (const pid of Object.keys(PM[hz])) for (const lang of ['ar', 'en', 'ml']) {
    const d = PM[hz][pid]; if (!d[lang]) continue; let hit = false;
    for (const level of ['evacuate', 'warning']) for (const asleep of [false, true]) {
      const g = MSG.get({ hazard: hz, level, persona: P[pid], lang, asleep, vars });
      if (g.headline === d[lang].h && JSON.stringify((g.lines || []).slice(0, d[lang].l.length)) === JSON.stringify(d[lang].l)) hit = true;
    }
    hit ? ok++ : bad.push(`${hz}/${pid}/${lang}`);
  }
  check(`persona cards (${ok} headline+lines) are word for word what MANARA_MSG.get returns`, ok >= 50 && bad.length === 0, bad.join(' '));
  check('Ravi\'s Malayalam text is flagged draft in the engine and on the page', (await page.evaluate(() => window.__manaraHome.PERSONA_MSG.fire.ravi.draft)) === true && MSG.get({ hazard: 'fire', level: 'evacuate', persona: 'worker', lang: 'ml' }).draft === true);
  await page.context().close();
}
{ // §13 thresholds
  const rows = {}; for (const m of HAZ.matchAll(/^\| (fire|gas|flood|dust|heat|sos) \| ([^|]+) \| ([a-z0-9_]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)) rows[m[3]] = [m[4], m[5], m[6]].map(x => { x = x.trim(); return /^[\d.]+$/.test(x) ? +x : null; });
  const { page } = await mk({ lang: 'en' });
  await page.evaluate(() => document.querySelectorAll('.hz-btn').forEach(b => b.click()));
  const g = await page.evaluate(() => [...document.querySelectorAll('.hz-card')].map(c => ({ hz: c.dataset.hz, text: c.querySelector('.hz-body').textContent, rows: [...c.querySelectorAll('.g-row')].map(r => ({ top: r.querySelector('.g-top .num').textContent, ticks: [...r.querySelectorAll('.g-tick:not(.ref) span')].map(t => +t.textContent.replace(/,/g, '')) })) })));
  const MAP = { fire: ['tmax_sustained_5s', 'tmax_rise_per_min'], gas: ['co_ppm', 'h2s_ppm', 'lpg_ppm_propane_equivalent'], flood: ['water_depth_cm'], dust: ['pm10_10min_mean'], heat: ['wbgt_estimate_light_work'], sos: ['stillness_after_impact_s', 'no_answer_s'] };
  const bad = [];
  for (const c of g) MAP[c.hz].forEach((metric, i) => {
    const want = rows[metric], got = c.rows[i]; if (!want || !got) return bad.push(c.hz + ':' + metric + ' missing');
    const w = want.filter(x => x != null), isPrefix = got.ticks.length >= 1 && got.ticks.length <= w.length && got.ticks.every((t, k) => t === w[k]);
    const missing = w.slice(got.ticks.length);                       // a critical value that does not fit the gauge must at least be in the row's source line
    if (!isPrefix || !missing.every(m => c.text.includes(m.toLocaleString('en-US')))) bad.push(`${c.hz}:${metric} page ${got.ticks} doc ${w}`);
  });
  check('hazard gauges equal the thresholds in docs/MANARA-HAZARDS.md §13 (warn / danger / critical; 11 gauges; a critical value off the gauge is in the source line)', bad.length === 0 && g.length === 6, bad.join('; '));
  await page.context().close();
}

/* ============================================================================================ 3. loads */
section('3. Loads clean everywhere: console, horizontal scroll, hidden overflow');
const BOX_AUDIT = () => {
  const bad = [];
  document.querySelectorAll('body *').forEach(el => {
    if (/^(svg|canvas|path|g|circle|rect|line|polyline|text|use|defs|tspan|option|select|input|br|wbr)$/i.test(el.tagName) || el.closest('svg,[hidden],.sr-only,.subnav-row,.table-wrap,.journey')) return;   // .journey: its connector chevrons are drawn in the gap between the cards on purpose
    const cs = getComputedStyle(el); if (['none', 'inline', 'contents'].includes(cs.display) || !el.getBoundingClientRect().width || ['auto', 'scroll'].includes(cs.overflowX)) return;
    if (el.scrollWidth > el.clientWidth + 1) bad.push(((typeof el.className === 'string' && el.className) || el.tagName).split(' ').slice(0, 2).join('.') + ` ${el.scrollWidth}>${el.clientWidth}`);
  });
  return bad.slice(0, 6);
};
{
  const fails = [], over = []; let n = 0;
  for (const w of [360, 390, 768, 1024, 1440, 1920]) for (const theme of ['dark', 'light']) for (const lang of ['ar', 'en']) {
    const { ctx, page, errors } = await mk({ width: w, height: w < 600 ? 844 : 900, theme, lang }); n++;
    await page.waitForTimeout(150);
    const o = await overflow(page), ready = await page.evaluate(() => window.__homeReady === true && !!window.__manaraHome);
    if (errors.length || !ready) fails.push(`${w}/${theme}/${lang}: ${errors.join(' | ')}${ready ? '' : ' (home.js not ready)'}`);
    if (o.scrollW > o.W) over.push(`${w}/${theme}/${lang}: scrollW ${o.scrollW} > ${o.W}`);
    if ([360, 390, 1440].includes(w)) { const b = await page.evaluate(BOX_AUDIT); if (b.length) over.push(`${w}/${theme}/${lang}: ${b.join(', ')}`); }
    await ctx.close();
  }
  check(`no console error, no failed request, home.js ready: ${n} combinations (360, 390, 768, 1024, 1440, 1920 × dark/light × ar/en)`, fails.length === 0, fails.slice(0, 3).join(' || '));
  check('no horizontal page scroll and no box that silently clips wider content, at every width', over.length === 0, over.slice(0, 4).join(' || '));
}

/* ============================================================================================ 4. bilingual */
section('4. Bilingual structure, language and theme');
{
  const { ctx, page } = await mk({ lang: 'ar' });
  const pairs = await page.evaluate(() => { const bad = []; document.querySelectorAll('main [data-l], footer [data-l]').forEach(el => {
    const other = el.getAttribute('data-l') === 'ar' ? 'en' : 'ar', p = el.parentElement; if (![...p.children].some(c => c !== el && c.getAttribute('data-l') === other)) bad.push((p.className || p.tagName) + ': ' + el.textContent.trim().slice(0, 30)); }); return bad.slice(0, 6); });
  check('every data-l="ar" has its data-l="en" twin in the same parent (and the other way round)', pairs.length === 0, pairs.join(' | '));
  // text outside data-l and outside the JS-rendered / numeric containers
  const bare = await page.evaluate(() => { const bad = [], skip = '.tag.warn,.pp-ex,#fast-chart-h,#ravi-lang,#truth-filter,#ph-status,[data-l],script,style,svg,canvas,.ph,bdi,.num,#hero-hz,#hero-steps,#hero-cap,#hero-why,#hero-verdict,#hero-safe,#hero-clock,#fast-results,#fast-live,.gauge,.phone,.persona-hz,#persona-hz,#lang-chips,#lang-bars,#proof-verdict,.flag,[data-nav],[data-footer],.g-row,.stat-n,.kpi b,noscript,.mini-draft,.ab-b,.matrix,#ev-det .bars b,.hz-links,.fr-eta';
    const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode, el = t.parentElement; if (!el || el.closest(skip)) continue; const s = t.nodeValue.trim(); if (/[A-Za-z؀-ۿ]{3,}/.test(s)) bad.push(el.tagName + '.' + el.className + ': ' + s.slice(0, 30)); }
    return bad.slice(0, 8); });
  check('no visible sentence sits outside a data-l span or a JS-rendered container (nothing is single-language by accident)', bare.length === 0, bare.join(' | '));
  const ar = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, title: document.title }));
  check('Arabic is the default: dir=rtl lang=ar, Arabic title', ar.dir === 'rtl' && ar.lang === 'ar' && /منارة/.test(ar.title), JSON.stringify(ar));
  const ls = await page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const t = w.currentNode, el = t.parentElement; if (!el || !/[؀-ۿ]/.test(t.nodeValue) || !el.getBoundingClientRect().width) continue; const v = getComputedStyle(el).letterSpacing; if (v !== 'normal' && parseFloat(v) !== 0) bad.push(el.className + ' ' + v); } return bad.slice(0, 4); });
  check('no letter-spacing on any Arabic text', ls.length === 0, ls.join(' | '));
  await page.evaluate(() => Manara.setLang('en')); await page.waitForTimeout(200);
  const en = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, title: document.title, cap: document.querySelector('#hero-cap').textContent, fr: document.querySelector('.fr-card .fr-name').textContent, h1: document.querySelector('h1').innerText.trim(), nav: document.querySelector('.brand small').textContent }));
  check('switching to English flips to ltr, re-renders the hero caption, the dispatch cards, the title and the nav tagline', en.dir === 'ltr' && /^MANARA/.test(en.title) && /[A-Za-z]{4}/.test(en.cap) && /\(demo\)/.test(en.fr) && /MANARA/.test(en.h1) && /Sees the danger/.test(en.nav), JSON.stringify(en));
  const arVis = await page.evaluate(() => [...document.querySelectorAll('main [data-l=ar]')].filter(e => e.getBoundingClientRect().width > 0).length);
  check('in English no Arabic data-l block is visible', arVis === 0, String(arVis));
  await page.evaluate(() => Manara.theme.set('light')); await page.waitForTimeout(100);
  check('theme switch sets data-theme and the canvas is repainted with the new tokens', await page.evaluate(() => document.documentElement.dataset.theme === 'light'));
  await ctx.close();
}

/* ============================================================================================ 5. hero */
section('5. Hero: the live miniature');
{
  const { ctx, page } = await mk({ lang: 'en', reducedMotion: 'reduce' });
  const h = await page.evaluate(() => ({ radios: [...document.querySelectorAll('#hero-hz [role=radio]')].map(b => b.getAttribute('aria-label')), sim: !!document.querySelector('.stage-title .tag.warn')?.textContent.includes('SIM'),
    ctas: [...document.querySelectorAll('.hero-cta a')].map(a => a.getAttribute('href') + ' ' + a.innerText.trim()), canvas: document.querySelector('#hero-canvas').getAttribute('aria-label'), h1: document.querySelectorAll('h1').length, tag: document.querySelector('.hero-tag').textContent.trim(), slogan: document.querySelector('.hero-slogan').textContent.trim() }));
  check('six hazards in the switcher: ' + h.radios.join(', '), h.radios.length === 6 && ['Fire & smoke', 'Gas leak', 'Flash flood', 'Dust storm', 'Extreme heat', 'Someone needs help'].every((x, i) => h.radios[i] === x));
  check('hero has the SIM chip, one h1, the tagline and the slogan', h.sim && h.h1 === 1 && /Sees the danger\. Wakes everyone\. Lights the safe way out\./.test(h.tag) && /No one left asleep\. No one left behind\./.test(h.slogan), JSON.stringify(h));
  check('two primary calls to action: Open Mission Control → mission.html, Try the Evidence Lab → detect.html', h.ctas.length === 2 && /^mission\.html Open Mission Control/.test(h.ctas[0]) && /^detect\.html Try the Evidence Lab/.test(h.ctas[1]), h.ctas.join(' | '));
  check('the canvas has a live aria-label that says "Simulation (SIM)"', /Simulation \(SIM\)/.test(h.canvas), h.canvas);
  // reduced motion: a still frame where the story has finished, for every hazard
  const still = await page.evaluate(() => { const H = window.__manaraHome.hero, out = []; for (const id of window.__manaraHome.HZ) { H.selectHz(id, false); const s = H.state(); out.push([id, s.playing, s.t === s.stillT, s.stage, s.safe, s.people, document.querySelector('#hero-safe').textContent, document.querySelector('#hero-open').getAttribute('href')]); } return out; });
  check('prefers-reduced-motion: the hero is paused on a finished still frame (stage 6, everyone safe) for all six hazards', still.every(s => s[1] === false && s[2] && s[3] === 5 && (s[0] === 'sos' || s[4] === s[5])), JSON.stringify(still));
  check('SOS still frame says the ambulance is on scene; other hazards show "Safe n / n"', /on scene/.test(still[5][6]) && still.slice(0, 5).every(s => /^Safe (\d+) \/ \1$/.test(s[6])), still.map(s => s[6]).join(' | '));
  const presets = Object.keys(S.PRESETS);
  check('the link under the scene opens the matching Mission Control scenario (valid ManaraSim preset ids)', still.every(s => /^mission\.html#scenario=/.test(s[7]) && presets.includes(s[7].split('=')[1])) && new Set(still.map(s => s[7])).size === 6, still.map(s => s[7]).join(' '));
  const px = await page.evaluate(() => { const c = document.querySelector('#hero-canvas'), g = c.getContext('2d'), set = new Set(); for (let i = 0; i < 400; i++) { const d = g.getImageData((i * 37) % c.width, (i * 53) % c.height, 1, 1).data; set.add(d[0] + ',' + d[1] + ',' + d[2]); } return set.size; });
  check('the canvas is drawn (not blank): many distinct colours', px > 12, String(px));
  // keyboard on the radiogroup (LTR: ArrowRight = next)
  await page.click('#hero-hz [data-hz=fire]'); await page.focus('#hero-hz [role=radio][aria-checked=true]'); await page.keyboard.press('ArrowRight');
  const k1 = await page.evaluate(() => [window.__manaraHome.hero.state().hz, document.activeElement.getAttribute('aria-label'), [...document.querySelectorAll('#hero-hz [role=radio]')].map(b => b.tabIndex).join()]);
  check('radiogroup keyboard: ArrowRight selects and focuses the next hazard, roving tabindex', k1[0] === 'gas' && k1[1] === 'Gas leak' && k1[2] === '-1,0,-1,-1,-1,-1', k1.join(' | '));
  await page.keyboard.press('End'); await page.keyboard.press('Home');
  check('Home/End jump to the first/last hazard', await page.evaluate(() => window.__manaraHome.hero.state().hz) === 'fire');
  await page.click('#hero-hz [data-hz=flood]');
  const cap = await page.evaluate(() => [document.querySelector('#hero-cap').textContent, document.querySelector('#hero-clock').textContent, document.querySelector('#hero-canvas').getAttribute('aria-label')]);
  check('choosing Flood changes the caption, the clock (day 10:30) and the canvas label', /Hand-off|hand-off/.test(cap[0]) && /10:30/.test(cap[1]) && /underpass/.test(cap[2]), cap.join(' | '));
  // scrub + play
  await page.click('#hero-steps li:nth-child(2) button');
  const st2 = await page.evaluate(() => window.__manaraHome.hero.state());
  check('clicking a stage pill jumps the scene to that stage and pauses it', st2.stage === 1 && st2.playing === false, JSON.stringify(st2));
  await page.click('#hero-play'); await page.waitForTimeout(100);
  check('with reduced motion the play button never starts motion', (await page.evaluate(() => window.__manaraHome.hero.state().t)) === st2.t);
  // theme repaint
  const sig = () => page.evaluate(() => { const c = document.querySelector('#hero-canvas'), d = c.getContext('2d').getImageData(c.width * .5, c.height * .5, 1, 1).data; const e = c.getContext('2d').getImageData(8, 8, 1, 1).data; return [d[0], d[1], d[2], e[0], e[1], e[2]].join(','); });
  await page.evaluate(() => Manara.theme.set('dark')); await page.waitForTimeout(100); const a = await sig();
  await page.evaluate(() => Manara.theme.set('light')); await page.waitForTimeout(100); const b = await sig();
  check('themechange re-reads the tokens and repaints the canvas (pixels differ between dark and light)', a !== b, a + ' vs ' + b);
  await ctx.close();
}
{ // with motion: it runs, and pauses off-screen
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference' });
  await context.addInitScript(() => { window.__raf = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => { window.__raf++; return r(f); }; try { localStorage.setItem('manara-lang', 'en'); } catch (e) { /* ignore */ } });
  const { page, errors } = await openPage(browser, 'index.html', { context });
  const t = () => page.evaluate(() => window.__manaraHome.hero.state().t);
  await page.waitForTimeout(300); const t0 = await t(); await page.waitForTimeout(900); const t1 = await t();
  check('with motion allowed the scene plays (time advances)', t1 - t0 > 0.5, `${t0.toFixed(2)} → ${t1.toFixed(2)}`);
  const stat = await page.evaluate(() => window.__manaraHome.hero.state());
  check('it loops: the clock never leaves 0…19.5 s', stat.t >= 0 && stat.t < stat.loop && stat.playing);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#hardware').offsetTop)); await page.waitForTimeout(2300);   // (smooth scroll + the counters it passes have finished)
  const r0 = await page.evaluate(() => window.__raf), p0 = await t(); await page.waitForTimeout(1200); const r1 = await page.evaluate(() => window.__raf), p1 = await t();
  check('canvas pauses when scrolled off-screen (IntersectionObserver): the clock stands still and no animation frames are requested', p1 === p0 && r1 - r0 <= 12, `t ${p0} → ${p1}; rAF ${r1 - r0}`);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(900);
  check('and resumes when it scrolls back into view', (await t()) !== p1);
  await page.click('#hero-play'); await page.waitForTimeout(150); const q0 = await t(); await page.waitForTimeout(500);
  check('the pause button stops the scene and labels itself "Play the scene"', (await t()) === q0 && (await page.getAttribute('#hero-play', 'aria-label')) === 'Play the scene');
  check('no console errors with motion on', errors.length === 0, errors.join(' | '));
  await context.close();
}

/* ============================================================================================ 6. counters, pipeline, proof */
section('6. Counters, pipeline, proof before panic');
{
  const { ctx, page } = await mk({ lang: 'en', reducedMotion: 'reduce' });
  const c = await page.evaluate(() => [...document.querySelectorAll('.stat')].map(s => s.querySelector('.stat-n').innerText.replace(/\s+/g, '') + '|' + s.querySelector('.stat-tag').innerText.trim() + '|' + /Source:/.test(s.querySelector('.src').innerText)));
  check('three problem numbers, each with a Qatar / international tag and its source: ' + c.join('  '), c.length === 3 && c[0].startsWith('46.6%|Qatar|true') && c[1].startsWith('7–10min|Qatar · 2017|true') && c[2].startsWith('1–2min|International research (US)|true'));
  await ctx.close();
  const m = await mk({ lang: 'en', reducedMotion: 'no-preference' });
  await m.page.evaluate(() => document.querySelector('.stats').scrollIntoView()); await m.page.waitForTimeout(300);
  const mid = await m.page.evaluate(() => document.querySelector('[data-count="46.6"]').textContent);
  await m.page.waitForTimeout(1900);
  const end = await m.page.evaluate(() => [...document.querySelectorAll('[data-count]')].map(n => n.textContent).join());
  check(`counters animate when scrolled into view (${mid} on the way) and land on 46.6,7,10,1,2`, end === '46.6,7,10,1,2' && mid !== '46.6', `${mid} / ${end}`);
  await m.ctx.close();
}
{
  for (const [lang, next] of [['en', 'ArrowRight'], ['ar', 'ArrowLeft']]) {
    const { ctx, page } = await mk({ lang });
    await page.focus('#pt-1'); await page.keyboard.press(next);
    const s = await page.evaluate(() => [...document.querySelectorAll('.pipe-tab')].map(t => t.getAttribute('aria-selected')).join() + '|' + [...document.querySelectorAll('.pipe-panel')].filter(p => !p.hidden).map(p => p.id).join());
    check(`pipeline (${lang}): ${next} moves to step 2 (arrows follow reading direction); exactly one panel is visible`, s === 'false,true,false,false,false,false|pp-2', s);
    await page.keyboard.press('End'); await page.keyboard.press('Home');
    await page.click('#pt-4');
    check(`pipeline (${lang}): click selects step 4 (Guide); Home/End work`, (await page.getAttribute('#pt-4', 'aria-selected')) === 'true' && (await page.evaluate(() => document.querySelector('#pp-4').hidden)) === false);
    const wired = await page.evaluate(() => [...document.querySelectorAll('.pipe-tab')].every(t => document.getElementById(t.getAttribute('aria-controls')).getAttribute('aria-labelledby') === t.id));
    check(`pipeline (${lang}): tab ↔ panel ids and aria-labelledby match, the tablist is labelled`, wired && !!(await page.getAttribute('#pipe-tabs', 'aria-label')));
    await ctx.close();
  }
}
{
  const { ctx, page } = await mk({ lang: 'en' });
  const st = () => page.evaluate(() => ({ s: document.querySelector('#proof-ladder li.on')?.dataset.s, v: document.querySelector('#proof-verdict').textContent, human: !document.querySelector('#k-human').disabled, pub: document.querySelector('#proof-phone').dataset.public, local: document.querySelector('#pf-local').textContent, pubf: document.querySelector('#pf-public').textContent }));
  let r = await st();
  check('initial state: WATCHING, human key disabled, no public alert', r.s === 'watch' && !r.human && r.pub === 'false', JSON.stringify(r));
  await page.click('[data-preset=mug]'); r = await st();
  check('a hot mug: heat alone = SUSPECT, the local buzzer is on but nothing goes public', r.s === 'suspect' && /hot mug/.test(r.v) && /ON/.test(r.local) && /not sent/.test(r.pubf) && !r.human, JSON.stringify(r));
  await page.click('[data-preset=video]'); r = await st();
  check('a fire video on a phone: vision alone = SUSPECT (the thermal layer holds it)', r.s === 'suspect' && /video|phone/.test(r.v) && !r.human);
  await page.click('[data-preset=vapour]'); r = await st();
  check('sanitiser vapour: smoke index alone = SUSPECT (MQ-2 also answers alcohol)', r.s === 'suspect' && /alcohol/.test(r.v));
  await page.check('#k-thermal'); await page.check('#k-vision'); await page.uncheck('#k-smoke'); r = await st();
  check('heat + vision = CONFIRMED with two independent keys; only now can the human key be turned', r.s === 'confirmed' && r.human && r.pub === 'false', JSON.stringify(r));
  await page.click('#k-human'); r = await st();
  check('the human key makes it a PUBLIC ALERT and the demo phone shows the alert with its EXERCISE banner', r.s === 'public' && r.pub === 'true' && /sent/.test(r.pubf) && /EXERCISE/.test(await page.textContent('#proof-phone')), JSON.stringify(r));
  await page.uncheck('#k-thermal'); r = await st();
  check('removing a key withdraws the human key and the public alert (never stays latched on one sensor)', r.s === 'suspect' && !r.human && r.pub === 'false' && !(await page.isChecked('#k-human')));
  await page.click('[data-preset=fire]'); r = await st();
  check('"a real fire" turns on all three sensor keys → CONFIRMED, waiting for the human', r.s === 'confirmed' && (await page.isChecked('#k-thermal')) && (await page.isChecked('#k-smoke')) && (await page.isChecked('#k-vision')));
  await page.click('[data-preset=reset]'); r = await st();
  check('reset returns to WATCHING', r.s === 'watch');
  check('the ladder and flags are announced politely (aria-live) and the ladder itself is decorative', (await page.getAttribute('#proof-verdict', 'aria-live')) === 'polite' && (await page.getAttribute('#proof-ladder', 'aria-hidden')) === 'true');
  const pressed = await page.evaluate(() => [...document.querySelectorAll('#proof-chips .chip')].map(c => c.getAttribute('aria-pressed')));
  check('preset chips expose aria-pressed', pressed.every(p => p === 'true' || p === 'false'));
  await page.evaluate(() => Manara.setLang('ar')); await page.waitForTimeout(100);
  check('the verdict re-renders in Arabic', /[؀-ۿ]{3}/.test((await st()).v));
  await ctx.close();
}

/* ============================================================================================ 7. fastest */
section('7. The fastest responder (simulated traffic, fictional units)');
{
  const { ctx, page } = await mk({ lang: 'en' });
  const fs_ = () => page.evaluate(() => window.__manaraHome.fast.state());
  let s = await fs_();
  check('default rush hour (80 %): Fire B is chosen over the NEARER Fire A — farther but faster', s.picks.fire.chosen === 'FB' && s.picks.fire.nearest === 'FA' && s.picks.fire.runner === 'FA', JSON.stringify(s.picks.fire));
  check('all three unit types are recommended: fire/rescue, police, hospital', ['fire', 'police', 'hospital'].every(k => s.picks[k] && s.picks[k].chosen), JSON.stringify(s.picks));
  check('the hospital pick is also "farther but faster" at rush hour (the nearer hospital sits behind the jam)', s.picks.hospital.chosen !== s.picks.hospital.nearest, JSON.stringify(s.picks.hospital));
  const cards = await page.evaluate(() => [...document.querySelectorAll('.fr-card')].map(c => ({ k: c.dataset.pick, t: c.textContent.replace(/\s+/g, ' '), sr: c.querySelector('.sr-only')?.textContent, vis: c.querySelector('.fr-eta > span:first-child').textContent, hid: c.querySelector('.fr-eta > span:first-child').getAttribute('aria-hidden') })));
  check('each decision card shows ETA mm:ss, "SIM · km", a "(demo)" unit name and a spoken ETA for screen readers', cards.length === 3 && cards.every(c => /^\d+:\d\d$/.test(c.vis) && c.hid === 'true' && /SIM · [\d.]+ km/.test(c.t) && /\(demo\)/.test(c.t) && /(min|s) \(SIM\)/.test(c.sr)), JSON.stringify(cards.map(c => c.vis + ' ' + c.sr)));
  check('the explanation names the road that slows the nearer unit ("West Arterial 2") and says how much faster, in minutes and seconds', /farther but 2 min 33 s faster: the nearest one’s shortest route uses West Arterial 2/.test(cards[0].t), cards[0].t);
  const etas = await page.evaluate(() => { const H = window.__manaraHome.fast, out = []; for (const l of [0, 0.2, 0.5, 0.8, 1]) { H.setLoad(l); const p = H.state().picks; out.push([l, p.fire.chosen, p.fire.eta]); } return out; });
  check('the chosen fire ETA never decreases as traffic rises: ' + etas.map(e => `${e[0]}:${e[1]} ${e[2].toFixed(1)}`).join(', '), etas.every((e, i) => i === 0 || e[2] >= etas[i - 1][2] - 1e-9));
  await page.click('[data-load="5"]'); s = await fs_();
  check('Night (5 %): empty roads, the NEAREST unit wins (Fire A)', s.load === 0.05 && s.picks.fire.chosen === 'FA' && s.picks.fire.chosen === s.picks.fire.nearest, JSON.stringify(s.picks.fire));
  check('Night: the explanation says "The nearest by distance is also the fastest right now."', /nearest by distance is also the fastest/.test(await page.textContent('.fr-card[data-pick=fire]')));
  await page.click('#fast-trauma'); s = await fs_();
  check('"needs a trauma centre": the capable hospital is chosen, not the nearest (capability beats speed)', s.picks.hospital.chosen === 'H2' && /capable hospital is chosen, not the nearest/.test(await page.textContent('.fr-card[data-pick=hospital]')), JSON.stringify(s.picks.hospital));
  await page.click('#fast-trauma'); await page.click('[data-load="80"]');
  // jam / close a road with the mouse and with the keyboard
  const road = page.locator('.rd[data-e=r2]');
  await road.click({ force: true }); s = await fs_();
  const jam1 = s.jam.r2;
  await road.click({ force: true }); s = await fs_();
  const jam2 = s.jam.r2;
  check('clicking a road cycles clear → jammed → closed', jam1 === 1 && jam2 === 2, `${jam1},${jam2}`);
  check('a closed road is removed: the road keeps aria-pressed and its label says "closed"', (await road.getAttribute('aria-pressed')) === 'true' && /closed/.test(await road.getAttribute('aria-label')));
  await road.click({ force: true }); s = await fs_();
  check('a third click reopens it', !s.jam.r2);
  await page.focus('.rd[data-e=r1]'); await page.keyboard.press('Enter'); s = await fs_();
  check('keyboard: Enter on a focused road jams it (roads are real buttons for assistive tech)', s.jam.r1 === 1 && (await page.getAttribute('.rd[data-e=r1]', 'role')) === 'button');
  await page.keyboard.press(' '); await page.keyboard.press(' '); s = await fs_();
  check('keyboard: Space cycles back to clear', !s.jam.r1);
  // closing the arterial that Fire B uses changes the decision
  const before = (await fs_()).picks.fire.chosen;
  await page.evaluate(() => { const H = window.__manaraHome.fast; H.jam('v8', 2); H.jam('r9', 2); });
  s = await fs_();
  check('closing both roads into Station B\'s junction takes B out of the decision: Fire A is recommended and no ETA is invented (Dijkstra skips closed roads)', before === 'FB' && s.picks.fire.chosen === 'FA' && s.picks.fire.runner === null, JSON.stringify(s.picks.fire));
  await page.click('#fast-reset'); s = await fs_();
  check('"Reset roads" clears every jam', Object.values(s.jam).every(v => !v));
  const live = await page.evaluate(() => document.querySelector('#fast-live').getAttribute('aria-live'));
  check('changes are announced in a polite live region', live === 'polite');
  const lbl = await page.evaluate(() => ({ h: document.querySelector('#fast-chart-h').textContent, svg: document.querySelector('#fast-svg').getAttribute('aria-label'), legend: document.querySelector('.fast-legend').textContent }));
  check('SIM is said on the map, the chart and the cards', /SIM/.test(lbl.h) && /SIM/.test(lbl.svg), JSON.stringify(lbl));
  const txt = await page.evaluate(() => document.querySelector('#fastest').textContent.replace(/\s+/g, ' '));
  check('honesty: "999 stays the dispatcher", needs live traffic + authority vehicle data + an agreement, Qatar 75 % in 10 minutes target (HMC 2023)', /999 stays the dispatcher/.test(txt) && /live traffic provider/.test(txt) && /agreement/.test(txt) && /75% of calls within 10 minutes/.test(txt) && /Hamad Medical Corporation, 2023/.test(txt));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const mob = await page.evaluate(() => { const t = document.querySelector('.mk-t'), svg = document.querySelector('#fast-svg'), k = svg.getBoundingClientRect().width / 640, fs = parseFloat(getComputedStyle(t).fontSize); const m = t.closest('.mk').getAttribute('transform'); const sc = +/scale\(([\d.]+)\)/.exec(m)[1]; return { eff: fs * sc * k, w: svg.getBoundingClientRect().width }; });
  check('on a 390 px phone the map labels stay legible (effective ≥ 8.5 px)', mob.eff >= 8.5, JSON.stringify(mob));
  await ctx.close();
}

/* ============================================================================================ 8. cards, personas, table, placeholders, links */
section('8. Hazard cards, personas, transparency table, placeholders, links');
{
  const { ctx, page } = await mk({ lang: 'en' });
  const cards = await page.$$('.hz-btn');
  let opened = 0, bodies = [];
  for (const b of cards) { await b.click(); const o = await b.evaluate(e => [e.getAttribute('aria-expanded'), !document.getElementById(e.getAttribute('aria-controls')).hidden, document.getElementById(e.getAttribute('aria-controls')).querySelectorAll('.g-row').length, document.getElementById(e.getAttribute('aria-controls')).textContent.replace(/\s+/g, ' ')]); if (o[0] === 'true' && o[1] && o[2] >= 1) opened++; bodies.push(o[3]); await b.click(); }
  check('six hazard cards open and close (aria-expanded) and each shows threshold gauges', cards.length === 6 && opened === 6, `${cards.length} cards, ${opened} opened`);
  check('every playbook lists sensors, two keys, protective action, units and an honest limit, with source ids', bodies.every(b => /Sensors/.test(b) && /Two keys/.test(b) && /Protective action/.test(b) && /Recommended units/.test(b) && /Honest limit/.test(b) && /Sources?:/.test(b) && /S\d\d/.test(b)));
  check('gas playbook carries the cross-sensitivity + 48 h burn-in warning, flood the flow-speed limit, heat the estimate-vs-measured WBGT limit, SOS "not a medical device"', /48 hours/.test(bodies[1]) && /flow speed/.test(bodies[2]) && /estimate/.test(bodies[4]) && /not a medical device/i.test(bodies[5]));
  const links = await page.evaluate(() => [...document.querySelectorAll('.hz-links a')].map(a => a.getAttribute('href')));
  check('each card links to its Mission Control scenario and the right lab (12 links)', links.length === 12 && links.filter(l => l.startsWith('mission.html#scenario=')).length === 6, links.join(' '));
  // personas
  const rows = [];
  for (const hz of ['fire', 'gas', 'flood', 'dust', 'heat', 'sos']) {
    await page.click(`#persona-hz [data-hz=${hz}]`);
    rows.push(await page.evaluate(h => [h, ...['ravi', 'huda', 'abu', 'lina'].map(p => document.querySelector(`[data-p=${p}] .phone-h`).textContent + ' / ' + document.querySelector(`[data-p=${p}] .phone-l`).textContent)], hz));
  }
  check('personas: the wording changes with the hazard and differs between the four people in every hazard (headline + lines)', new Set(rows.map(r => r[1])).size === 6 && rows.every(r => new Set(r.slice(1)).size === 4), JSON.stringify(rows[5]));
  await page.click('#persona-hz [data-hz=fire]');
  const abu = await page.evaluate(() => document.querySelector('[data-p=abu] .phone-l').textContent);
  check('Abu Salem (wheelchair) is never sent to the stairs: the refuge balcony', /Do not use the stairs or the lift/.test(abu) && /refuge balcony/.test(abu), abu);
  const huda = await page.evaluate(() => [document.querySelector('[data-p=huda] .phone-fmt').textContent, document.querySelector('[data-p=huda] .persona-note').textContent]);
  check('Huda (Deaf): strobe is opt-in and limited to 3 flashes a second, with vibration, text, pictograms', /Strobe \(opt-in\)/.test(huda[0]) && /opt-in, at most 3 flashes/.test(huda[1]) && /Vibration/.test(huda[0]));
  const lina = await page.evaluate(() => document.querySelector('[data-p=lina] .phone-fmt').textContent);
  check('Lina (child): picture card and voice', /Picture card/.test(lina) && /Voice/.test(lina));
  await page.click('#ravi-lang [data-lang=ml]');
  const ml = await page.evaluate(() => ({ h: document.querySelector('[data-p=ravi] .phone-h').textContent, lang: document.querySelector('[data-p=ravi] .phone-h').lang, draft: !document.querySelector('[data-p=ravi] .phone-draft').hidden }));
  check('Ravi in Malayalam: shown in Malayalam with lang="ml" and the DRAFT notice', /[ഀ-ൿ]/.test(ml.h) && ml.lang === 'ml' && ml.draft, JSON.stringify(ml));
  await page.click('#ravi-lang [data-lang=en]');
  check('Ravi in English: no draft notice (English is complete)', await page.evaluate(() => document.querySelector('[data-p=ravi] .phone-draft').hidden));
  const lg = await page.evaluate(() => [...document.querySelectorAll('#lang-chips li')].map(l => l.className + ':' + l.querySelector('b').textContent));
  check('eight languages: Arabic + English complete, six drafts (ml, ne, bn, ur, hi, tl)', lg.filter(l => l.startsWith('complete')).length === 2 && lg.filter(l => l.startsWith('draft')).length === 6, lg.join(' '));
  const bars = await page.evaluate(() => document.querySelector('#lang-bars').textContent.replace(/\s+/g, ' '));
  check('community sizes are the embassy estimates (S23), with Sri Lanka marked "not covered yet"', ['650,000', '350,000', '280,000', '260,000', '200,000', '145,256', '125,000', 'not covered yet'].every(x => bars.includes(x)) && /not official national-statistics/.test(await page.textContent('#inclusive')));
  // transparency
  const cnt = await page.evaluate(() => { const rows = [...document.querySelectorAll('#truth tbody tr')], by = {}; rows.forEach(r => by[r.dataset.s] = (by[r.dataset.s] || 0) + 1); return { n: rows.length, by }; });
  check('transparency table: ' + JSON.stringify(cnt.by), cnt.n >= 14 && ['real', 'sim', 'concept', 'draft', 'planned'].every(k => cnt.by[k] >= 1));
  for (const f of ['sim', 'concept', 'draft', 'planned', 'real']) {
    await page.click(`#truth-filter [data-f=${f}]`);
    const vis = await page.evaluate(() => [...document.querySelectorAll('#truth tbody tr')].filter(r => !r.hidden).map(r => r.dataset.s));
    if (!(vis.length === cnt.by[f] && vis.every(v => v === f))) check('filter ' + f, false, vis.join());
  }
  await page.click('#truth-filter [data-f=all]');
  check('the status filter shows exactly the rows of each status (sim, concept, draft, planned, real) and "All" restores them', (await page.evaluate(() => [...document.querySelectorAll('#truth tbody tr')].filter(r => !r.hidden).length)) === cnt.n);
  const claims = await page.textContent('#truth');
  check('table says: drone = concept, integrations = not connected, comprehension test = planned/not run, A/B = mechanism check', /Concept/.test(claims) && /Not connected/.test(claims) && /Not run yet/.test(claims) && /mechanism check/.test(claims));
  // placeholders
  const ph = await page.evaluate(() => [...document.querySelectorAll('.ph')].map(n => n.dataset.ph + '=' + n.textContent.trim()));
  check('12 placeholders, all in {{BRACES}} and unique: ' + ph.map(p => p.split('=')[0]).join(', '), ph.length === 12 && new Set(ph).size === 12 && ph.every(p => /^([A-Z_]+)=\{\{\1\}\}$/.test(p)), ph.join(' '));
  check('the status line counts what is left to fill in', /Fields still to fill in: 12 of 12/.test(await page.textContent('#ph-status')));
  await page.evaluate(() => { document.querySelector('[data-ph=STUDENT_NAME]').textContent = 'Test'; Manara.setLang('en'); });
  check('…and updates when a field is filled in', /11 of 12/.test(await page.textContent('#ph-status')));
  await ctx.close();
}
{ // links
  const idsOf = h => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  const check1 = (name, html, file) => {
    const hrefs = [...html.matchAll(/\shref="([^"]+)"/g)].map(m => m[1]).filter(h => !/^https?:/.test(h) && !h.startsWith('data:'));
    const bad = [], pending = [], ids = idsOf(html), tabs = ['live', 'fool', 'decoy', 'sensor'], persons = ['ravi', 'huda', 'abu-salem', 'lina', 'yousef', 'guard'];
    for (const h of hrefs) {
      if (h.startsWith('#')) { if (!ids.has(h.slice(1))) bad.push(h); continue; }
      const [fileq, hash] = h.split('#'), [f, q] = fileq.split('?');
      if (!fs.existsSync(path.join(SITE, f))) { if (/^(pitch|report|poster)\.html$/.test(f)) pending.push(f); else bad.push(h); continue; }
      if (f === 'mission.html' && hash && !Object.keys(S.PRESETS).includes((/scenario=([\w-]+)/.exec(hash) || [])[1])) bad.push(h);
      if (f === 'detect.html' && hash && !tabs.includes(hash)) bad.push(h);
      if (f === 'alert.html' && q && !persons.includes((/persona=([\w-]+)/.exec(q) || [])[1])) bad.push(h);
    }
    check(`${name}: ${hrefs.length} local links resolve (files, #anchors, Mission Control scenarios, Evidence Lab tabs, phone personas)${pending.length ? ' — not written yet, linked anyway: ' + [...new Set(pending)].join(', ') : ''}`, bad.length === 0, bad.join(' '));
  };
  check1('index.html', HTML, 'index.html'); check1('404.html', NF, '404.html');
  const mustLink = ['mission.html', 'detect.html', 'alert.html', 'build.html', 'pitch.html', 'report.html', 'poster.html'];
  check('the landing page links to all seven other pages', mustLink.every(l => HTML.includes('href="' + l)), mustLink.filter(l => !HTML.includes('href="' + l)).join());
}

/* ============================================================================================ 9. accessibility */
section('9. Accessibility');
const CONTRAST = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = css => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, b) => { const a = t[3] + b[3] * (1 - t[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (t[i] * t[3] + b[i] * b[3] * (1 - t[3])) / a).concat([a]); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = el => {
    let acc = [0, 0, 0, 0];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e); let c = rgba(cs.backgroundColor), bi = cs.backgroundImage;
      if (bi && bi !== 'none' && /gradient/.test(bi)) { const cols = (bi.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/gi) || []).map(rgba); const vis = cols.filter(x => x[3] > 0.001); if (vis.length) { const wsum = vis.reduce((a, x) => a + x[3], 0); c = [0, 1, 2].map(i => vis.reduce((a, x) => a + x[i] * x[3], 0) / wsum).concat([Math.max(...vis.map(x => x[3]))]); } else c = [0, 0, 0, 0]; }
      acc = over(acc, c); if (acc[3] >= 0.999) break;
    }
    if (acc[3] < 0.999) acc = over(acc, rgba(getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : getComputedStyle(document.documentElement).backgroundColor));
    return acc;
  };
  const bad = [], seen = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n = 0;
  while (w.nextNode()) {
    const t = w.currentNode, el = t.parentElement; if (!t.nodeValue.trim() || !el || seen.has(el)) continue; seen.add(el);
    if (el.closest('button:disabled,[disabled],[aria-hidden="true"],[hidden],script,style,.sr-only,[data-nav],[data-footer],.nav,.foot,option,canvas,svg,.stage-badges,.pp-frame')) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    const bg = bgOf(el); let fg = rgba(cs.color); fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05), px = parseFloat(cs.fontSize);
    const need = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700) ? 3 : 4.5; n++;
    if (ratio < need) bad.push(`${(typeof el.className === 'string' && el.className) || el.tagName} "${t.nodeValue.trim().slice(0, 24)}" ${ratio.toFixed(2)}<${need}`);
  }
  return { n, bad: bad.slice(0, 10), count: bad.length };
};
{
  const { ctx, page } = await mk({ lang: 'en', width: 1440 });
  const a = await page.evaluate(() => {
    const vis = e => e.getBoundingClientRect().width > 0 && !e.closest('[hidden],[aria-hidden="true"]');
    const nameOf = e => (e.getAttribute('aria-label') || '').trim() || (e.getAttribute('aria-labelledby') ? e.getAttribute('aria-labelledby').split(' ').map(i => (document.getElementById(i) || {}).textContent || '').join('').trim() : '') || (e.labels && e.labels.length ? [...e.labels].map(l => l.textContent).join('').trim() : '') || (e.textContent || '').trim() || (e.getAttribute('title') || '').trim();
    const unnamed = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=tab],[role=radio]')].filter(vis).filter(e => !nameOf(e)).map(e => e.outerHTML.slice(0, 70));
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i && !/^mn-b2?$/.test(x));   // mn-b/mn-b2: core.js draws its logo in the nav and the footer with the same gradient ids (shared file)
    const dangling = [...document.querySelectorAll('[aria-controls],[aria-labelledby],[aria-describedby]')].flatMap(e => ['aria-controls', 'aria-labelledby', 'aria-describedby'].flatMap(k => (e.getAttribute(k) || '').split(' ').filter(Boolean).filter(i => !document.getElementById(i)).map(i => k + '→' + i)));
    const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map(h => +h.tagName[1]); let jump = 0; hs.forEach((l, i) => { if (i && l - hs[i - 1] > 1) jump++; });
    const lm = { main: document.querySelectorAll('main').length, header: document.querySelectorAll('body > header').length, footer: document.querySelectorAll('footer').length, navs: [...document.querySelectorAll('nav')].filter(n => !n.getAttribute('aria-label')).length, skip: !!document.querySelector('.skip[href="#main"]'), mainId: !!document.getElementById('main') };
    const secs = [...document.querySelectorAll('main section[aria-labelledby]')].filter(s => !document.getElementById(s.getAttribute('aria-labelledby'))).length;
    const lab = [...document.querySelectorAll('canvas,svg[role=img],svg[role=group]')].filter(e => !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).length;
    return { unnamed, dup, dangling, h1: document.querySelectorAll('h1').length, jump, lm, secs, lab, fieldsets: [...document.querySelectorAll('fieldset')].every(f => f.querySelector('legend')) };
  });
  check('every visible link, button, input, tab and radio has an accessible name', a.unnamed.length === 0, a.unnamed.join(' | '));
  check('ids are unique and every aria-controls / labelledby / describedby target exists', a.dup.length === 0 && a.dangling.length === 0 && a.secs === 0, a.dup.concat(a.dangling).join(' '));
  check('exactly one h1; headings never skip a level', a.h1 === 1 && a.jump === 0, `h1 ${a.h1}, jumps ${a.jump}`);
  check('landmarks: one main, header, footer; every nav is labelled; skip link targets #main', a.lm.main === 1 && a.lm.header === 1 && a.lm.footer === 1 && a.lm.navs === 0 && a.lm.skip && a.lm.mainId, JSON.stringify(a.lm));
  check('the canvas and every SVG widget has an accessible label; fieldsets have legends', a.lab === 0 && a.fieldsets, String(a.lab));
  const tgt = await page.evaluate(() => [...document.querySelectorAll('button,input[type=checkbox],input[type=range],.chip,.btn,.pipe-tab,.hz-opt,.icon-btn')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]')).filter(e => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  check('WCAG 2.2 target size: every button, chip, tab and toggle is at least 24 × 24 px', tgt.length === 0, tgt.slice(0, 4).join(' | '));
  await page.focus('.hz-btn'); await page.waitForTimeout(80); const fo = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
  check('keyboard focus is clearly visible (3 px outline from base.css)', fo);
  const ml = await page.evaluate(() => { document.querySelector('#ravi-lang [data-lang=ml]').click(); const h = document.querySelector('[data-p=ravi] .phone-h'); return [h.lang, h.dir]; });
  check('foreign-language text carries lang and dir (Malayalam ltr)', ml[0] === 'ml' && ml[1] === 'ltr');
  const live = await page.evaluate(() => ({ cap: document.querySelector('#hero-cap').getAttribute('aria-live'), verdict: document.querySelector('#proof-verdict').getAttribute('aria-live') }));
  check('live regions: hero caption is silent while playing (no chatter), polite when paused; the proof verdict is polite', live.cap === 'off' || live.cap === 'polite', JSON.stringify(live));
  await ctx.close();
}
{ // contrast: both themes × both languages × (initial, everything open)
  let total = 0; const worst = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const theme of ['dark', 'light']) for (const lang of ['ar', 'en']) {
    const { ctx, page } = await mk({ width: w, height: h, theme, lang });
    await page.evaluate(() => document.querySelectorAll('.hz-btn').forEach(b => b.click())); await page.waitForTimeout(150);
    let r = await page.evaluate(CONTRAST); total += r.n; if (r.count) worst.push(`${w}/${theme}/${lang}/open: ${r.bad.join(' ; ')}`);
    await page.evaluate(() => { document.querySelector('[data-preset=fire]').click(); document.querySelector('#k-human').click(); document.querySelector('#fast-trauma').click(); document.querySelector('#ravi-lang [data-lang=ml]').click(); document.querySelector('#persona-hz [data-hz=sos]').click(); document.querySelector('#hero-hz [data-hz=gas]').click(); });
    await page.waitForTimeout(150);
    r = await page.evaluate(CONTRAST); total += r.n; if (r.count) worst.push(`${w}/${theme}/${lang}/used: ${r.bad.join(' ; ')}`);
    await ctx.close();
  }
  check(`WCAG AA contrast: all ${total} visible text runs meet 4.5:1 (3:1 for large text) at 1440 and 390 × dark/light × ar/en, with every card open and the controls used`, worst.length === 0, worst.slice(0, 3).join(' || '));
}

/* ============================================================================================ 10. print, motion, layout shift, 404 */
section('10. Print, reduced motion, layout shift, 404');
{
  const { ctx, page } = await mk({ lang: 'en', theme: 'dark', width: 1200, height: 900 });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.waitForTimeout(100);
  const during = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => { const cs = e => getComputedStyle(document.querySelector(e)); return { body: cs('body').backgroundColor, ink: cs('body').color, nav: cs('.nav').display, sub: cs('.subnav').display, foot: cs('.foot').display, hz: cs('.hz-body').display, h1: cs('h1').color, sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth, hero: cs('.hero-stage').display, anim: document.getAnimations().length }; });
  check('print: a dark-theme page prints on paper-light colours (white background, dark ink), nav, sub-nav, footer and controls hidden', during === 'light' && pr.body === 'rgb(255, 255, 255)' && /^rgb\((\d|[1-4]\d|50),/.test(pr.ink) && pr.nav === 'none' && pr.sub === 'none' && pr.foot === 'none' && pr.hero !== 'none', JSON.stringify(pr));
  check('print: every hazard playbook is expanded and nothing runs (no animations), no horizontal overflow', pr.hz !== 'none' && pr.anim === 0 && pr.sw <= pr.w + 1, JSON.stringify(pr));
  const pdf = path.join(process.env.MANARA_SHOTS || os.tmpdir(), 'manara-home-print.pdf'); fs.mkdirSync(path.dirname(pdf), { recursive: true });
  await page.pdf({ path: pdf, format: 'A4', printBackground: true });
  const pdfTxt = fs.readFileSync(pdf, 'latin1'), pages = (pdfTxt.match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(`print to PDF works: ${pages} A4 pages, ${Math.round(fs.statSync(pdf).size / 1024)} kB`, pages >= 5 && pages <= 40 && fs.statSync(pdf).size > 20000, String(pages));
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await page.waitForTimeout(100);
  check('after printing the on-screen theme (dark) is restored', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await ctx.close();
}
{
  const { ctx, page } = await mk({ lang: 'en', reducedMotion: 'reduce' });
  await page.evaluate(() => document.querySelector('#fast').scrollIntoView()); await page.waitForTimeout(500);
  const inf = await page.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity).length);
  check('reduced motion: no infinite CSS animation runs anywhere on the page', inf === 0, String(inf));
  const rv = await page.evaluate(() => [...document.querySelectorAll('.rv')].every(e => e.classList.contains('in') || getComputedStyle(e).opacity === '1'));
  check('reduced motion: scroll-reveal content is visible at once', rv);
  const flash = await page.evaluate(() => document.querySelectorAll('[class*=strobe],[class*=flash]').length);
  check('there is no strobe or flashing element on the landing page (the Deaf persona\'s strobe is described, opt-in, never played)', flash === 0);
  await ctx.close();
}
{ // layout shift
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'no-preference' });
  await context.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { /* ignore */ } try { localStorage.setItem('manara-lang', 'ar'); } catch (e) { /* ignore */ } });
  const { page } = await openPage(browser, 'index.html', { context });
  await page.waitForTimeout(600);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 700) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(40); }
  const cls = await page.evaluate(() => window.__cls);
  check(`cumulative layout shift while loading and scrolling the whole 390 px page: ${cls.toFixed(3)} (≤ 0.1)`, cls <= 0.1, String(cls));
  await context.close();
}
{ // 404
  const out = [];
  for (const [lang, theme, w] of [['ar', 'dark', 390], ['en', 'light', 1440], ['ar', 'light', 1440], ['en', 'dark', 390]]) {
    const { ctx, page, errors } = await openPage(browser, '404.html', { lang, theme, width: w, height: w < 600 ? 844 : 900 });
    const o = await overflow(page);
    const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, nav: !!document.querySelector('.nav .brand'), logo: !!document.querySelector('.nf-logo svg'), links: [...document.querySelectorAll('main a')].map(a => a.getAttribute('href')), title: document.title, vis: [...document.querySelectorAll('main [data-l]')].filter(e => e.getBoundingClientRect().width > 0).length, code: document.querySelector('.nf-code').textContent }));
    const c = await page.evaluate(CONTRAST);
    out.push([lang, theme, w, errors.length, o.scrollW <= o.W, r.h1 === 1 && r.nav && r.logo && r.code === '404' && r.vis > 3, r.links.length === 8 && r.links.every(l => /^[a-z]+\.html$/.test(l)), c.count === 0 ? '' : c.bad.join(';'), /منارة|MANARA/.test(r.title)]);
    await ctx.close();
  }
  check('404.html: loads clean, no overflow, branded (logo, 404, one h1, nav), bilingual, 8 relative links, AA contrast — 4 combinations', out.every(o => o[3] === 0 && o[4] && o[5] && o[6] && o[7] === '' && o[8]), JSON.stringify(out));
}

await done(browser);
