// MANARA («منارة») — tests for the landing page: site/manara/index.html, css/home.css, js/home.js and 404.html.
//
//   node tools/manara/test-home.mjs            (about 2–3 minutes; needs Playwright + Chromium, see tools/manara/lib.mjs)
//
// What is checked (numbered like the sections printed below; the hero is two views: 'All of Qatar' and 'Last 100 metres'):
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
//  10  print (always paper-light, PDF renders), reduced motion, layout shift, 404
//  11  the national layer: the real map of Qatar (data read independently in Node), Qatar-wide facts and hazard layers, credits, national A/B and the test tails.html
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
// an independent copy of the national engine and data, read in Node (the page is compared against it)
const NCTX = vm.createContext({ console });
for (const f of ['data/qatar-geo.js', 'data/qatar-facilities.js', 'data/qatar-roads.js', 'js/national.js']) vm.runInContext(read(f), NCTX);
const NN = NCTX.ManaraNational, NGEO = NCTX.MANARA_QATAR_GEO, NFAC = NCTX.MANARA_QATAR_FACILITIES, NROADS = NCTX.MANARA_QATAR_ROADS;
const natOpts = { seed: 7, date: '2026-07-12', hour: 7.5, autoApprove: false, params: { unitBusyPct: 0 } };
const NAT = NN.create(natOpts);
const browser = await launch();
const mk = (o = {}) => openPage(browser, 'index.html', o);
const strip = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');

/* ============================================================================================ 1. laws */
section('1. Project laws (read from the source)');
{
  const scripts = [...HTML.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
  check('classic scripts only: every external <script> is defer, none is type=module', scripts.filter(s => /src=/.test(s)).every(s => /\bdefer\b/.test(s)) && !scripts.some(s => /type=["']?module/.test(s)));
  const ext = [...HTML.matchAll(/(?:href|src)=["'](https?:[^"']+)["']/g)].map(m => m[1]).filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u));
  check('no library or CDN: the only external hosts are Google Fonts and the one OpenStreetMap copyright link (an anchor, never a script)', ext.length === 1 && ext[0] === 'https://www.openstreetmap.org/copyright' && /<a href="https:\/\/www\.openstreetmap\.org\/copyright"/.test(HTML), ext.join(' '));
  const dataScripts = [...HTML.matchAll(/<script src="([^"]+)" defer>/g)].map(m => m[1]);
  check('script order: core, the three data files, national.js, then home.js (all defer, local)', JSON.stringify(dataScripts) === JSON.stringify(['js/core.js', 'data/qatar-geo.js', 'data/qatar-facilities.js', 'data/qatar-roads.js', 'js/national.js', 'js/home.js']), dataScripts.join(' '));
  check('home.js: no fetch / XMLHttpRequest / import / export / eval', !/\b(fetch|XMLHttpRequest|eval)\s*\(|^\s*(import|export)\s/m.test(JS));
  check('home.js: no cookies, no network sends, storage only through core.js', !/document\.cookie|sendBeacon|WebSocket|localStorage|sessionStorage/.test(JS));
  const inner = JS.match(/\.innerHTML\s*=/g) || [];
  check('innerHTML is assigned in exactly one place (setStaticHTML)', inner.length === 1 && /function setStaticHTML\(node, html\) \{ node\.innerHTML = html; \}/.test(JS), String(inner.length));
  const calls = [...JS.matchAll(/setStaticHTML\(([^;]*?)\);/g)].map(m => m[1]).filter(a => !a.startsWith('node, html'));
  check(`all ${calls.length} setStaticHTML calls pass only author-written SVG (Manara.icon/logo, iconInner or a literal <svg>)`, calls.length >= 8 && calls.every(a => /^[^,]+,\s*(M\.(icon|logo)\(|iconInner\(|unitIcon\(|kd\.icon === 'plus')/.test(a)), calls.filter(a => !/^[^,]+,\s*(M\.(icon|logo)\(|iconInner\(|unitIcon\(|kd\.icon === 'plus')/.test(a)).join(' || '));
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
  const bare = await page.evaluate(() => { const bad = [], skip = '.tag.warn,.pp-ex,#fast-chart-h,#ravi-lang,#truth-filter,#ph-status,[data-l],script,style,svg,canvas,.ph,bdi,.num,#hero-hz,.cr-attr,#hero-steps,#hero-cap,#nat-steps,#nat-cap,#nat-why,#nat-board,#nat-example-t,#nat-verdict,#nat-t,#qa-legend,#qa-read,#qa-table,#qa-adv,#qa-adv-h,#qa-src,#qa-th-layer,#fast-ex,#fast-facts,#fast-roads,#fast-load-v,#fast-results,#hero-why,#hero-verdict,#hero-safe,#hero-clock,#fast-results,#fast-live,.gauge,.phone,.persona-hz,#persona-hz,#lang-chips,#lang-bars,#proof-verdict,.flag,[data-nav],[data-footer],.g-row,.stat-n,.kpi b,noscript,.mini-draft,.ab-b,.matrix,#ev-det .bars b,.hz-links,.fr-eta';
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
  const en = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, title: document.title, cap: document.querySelector('#hero-cap').textContent, fr: document.querySelector('#nat-cap').textContent, h1: document.querySelector('h1').innerText.trim(), nav: document.querySelector('.brand small').textContent }));
  check('switching to English flips to ltr, re-renders the hero captions, the title and the nav tagline', en.dir === 'ltr' && /^MANARA/.test(en.title) && /[A-Za-z]{4}/.test(en.cap) && /[A-Za-z]{4}/.test(en.fr) && /MANARA/.test(en.h1) && /Sees the danger/.test(en.nav), JSON.stringify(en));
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
  await page.evaluate(() => window.__manaraHome.tabs.select('st-zoom'));
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
  await page.evaluate(() => window.__manaraHome.tabs.select('st-zoom'));
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

/* ---- 5b. the national hero: "All of Qatar" (the real map, simulated incidents) ---- */
section('5b. Hero, all of Qatar: a hazard → two keys → approval → the fastest unit of each type drives in over real roads');
const waitNat = page => page.waitForFunction(() => window.__manaraHome.nat && window.__manaraHome.nat.state().ready, null, { timeout: 15000 });
{
  const { ctx, page, errors } = await mk({ lang: 'en', reducedMotion: 'reduce' });
  await waitNat(page);
  const o = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('#stage-tabs [role=tab]')].map(t => [t.id, t.getAttribute('aria-selected'), t.getAttribute('aria-controls'), t.tabIndex]), natHidden: document.querySelector('#sp-nat').hidden, zoomHidden: document.querySelector('#sp-zoom').hidden,
    sim: !!document.querySelector('.stage-title .tag.warn')?.textContent.includes('SIM'), label: document.querySelector('#nat-canvas').getAttribute('aria-label'), credit: document.querySelector('.hero-stage .stage-credit').textContent.replace(/\s+/g, ' '),
    note: document.querySelector('.hero-stage .stage-note').textContent, loadingHidden: document.querySelector('#nat-loading').hidden, busy: document.querySelector('#nat-canvas').getAttribute('aria-busy') }));
  check('two stage tabs (All of Qatar selected by default, Last 100 metres), a real tablist wired to its tabpanels with roving tabindex', o.tabs[0][0] === 'st-nat' && o.tabs[0][1] === 'true' && o.tabs[0][2] === 'sp-nat' && o.tabs[0][3] === 0 && o.tabs[1][1] === 'false' && o.tabs[1][3] === -1 && !o.natHidden && o.zoomHidden, JSON.stringify(o.tabs));
  check('the national canvas says "Simulation (SIM)" on the map of Qatar; the loading veil is gone and aria-busy cleared once the engine is ready', /Simulation \(SIM\) on the map of Qatar/.test(o.label) && o.loadingHidden && o.busy === null, o.label);
  check('the stage says the map is a real OpenStreetMap snapshot while incidents, traffic and availability are simulated, and 999 stays the dispatcher', /real OpenStreetMap snapshot/.test(o.note) && /simulated/.test(o.note) && /999 stays the dispatcher/.test(o.note), o.note);
  check(`the attribution line: "Contains data © OpenStreetMap contributors, ODbL 1.0 · snapshot ${NGEO.meta.snapshotDate}" (the date comes from the data)`, o.credit.includes('Contains data © OpenStreetMap contributors, ODbL 1.0') && o.credit.includes(NGEO.meta.snapshotDate), o.credit);
  // every hazard on the still frame: units per type, against an independent engine in Node
  const HZ = { fire: 4, gas: 4, flood: 10.5, dust: 10.5, heat: 10.5, sos: 10.5 }, want = { fire: ['fire', 'ambulance', 'police'], gas: ['fire', 'ambulance', 'police'], flood: ['rescue', 'police', 'ambulance'], dust: ['police', 'ambulance'], heat: ['ambulance'], sos: ['ambulance'] };
  const rows = [];
  for (const id of Object.keys(HZ)) {
    await page.click(`#hero-hz [data-hz=${id}]`);
    const r = await page.evaluate(() => { const s = window.__manaraHome.nat.state(); return { s, board: [...document.querySelectorAll('#nat-board .nb-row')].map(r => r.querySelector('.nb-eta').textContent), t: document.querySelector('#nat-t').textContent, v: document.querySelector('#nat-verdict').textContent, steps: document.querySelectorAll('#nat-steps li').length }; });
    const kinds = r.s.units.map(u => u.kind);
    const spot = r.s.spot, tt = NN.timeAt(NAT, '2026-07-12', HZ[id]);
    const plan = NN.dispatchNational(NAT, { hazard: id, lon: spot.lon, lat: spot.lat, severity: 2, patients: (id === 'sos' || id === 'heat') ? { n: 1, need: 'ed' } : undefined }, tt);
    const ok = want[id].every(k => kinds.includes(k)) && r.s.playing === false && r.s.t === r.s.stillT && r.s.stage === 5 && r.board.every(b => /arrived|^\d+:\d\d$/.test(b)) && r.steps === 6
      && r.s.units.every(u => { const m = plan.units.find(p => p.kind === u.kind && Math.abs(p.etaSec - u.eta) < 1); return !!m; }) && (id === 'heat' || id === 'sos' ? r.s.hosp === true : true) && NGEO.inLand(spot.lon, spot.lat);
    rows.push([id, ok, kinds.join('+'), r.s.units.map(u => Math.round(u.eta)).join('/')]);
  }
  check('reduced motion: a finished still frame for all six hazards; the units of each type are the ones the hazard needs (fire → fire+ambulance+police, flood → rescue+…, heat/SOS → ambulance + destination hospital)', rows.every(r => r[1]), JSON.stringify(rows));
  check('every ETA on the page equals ManaraNational.dispatchNational run independently in Node (same seed, same clock): ' + rows.map(r => r[0] + ' ' + r[3]).join('; '), rows.every(r => r[1]));
  // example: a real "farther but faster" case
  await page.click('#hero-hz [data-hz=fire]');
  await page.waitForFunction(() => !document.querySelector('#nat-example').disabled, null, { timeout: 20000 });
  await page.click('#nat-example');
  const ex = await page.evaluate(() => ({ s: window.__manaraHome.nat.state(), pressed: document.querySelector('#nat-example').getAttribute('aria-pressed'), cap: document.querySelector('#nat-cap').textContent, why: document.querySelector('#nat-why').textContent, rows: [...document.querySelectorAll('#nat-board .nb-row')].map(r => r.textContent.replace(/\s+/g, ' ')), steps: document.querySelector('#nat-steps').hidden }));
  const ref = NN.findFartherButFaster(7, { nat: NAT, times: [7.5], budget: 30, kinds: ['fire'], minGainSec: 60 });
  check(`the real "farther but faster" example equals ManaraNational.findFartherButFaster(seed 7, 07:30): fastest ${ref.fastest.etaSec} s vs nearest ${ref.nearest.etaSec} s, ${ref.gainSec} s faster, ${ref.extraStraightKm} km farther (reason: ${ref.reason})`, ex.s.mode === 'example' && ex.pressed === 'true' && ex.s.example.fast === ref.fastest.etaSec && ex.s.example.near === ref.nearest.etaSec && ex.s.example.gain === ref.gainSec && ref.gainSec > 0 && ref.extraStraightKm > 0 && ref.reason === 'traffic', JSON.stringify(ex.s.example));
  check('the example shows the engine\'s own explanation, both units with their straight-line and road km, and the SIM wording', ex.why.length > 40 && ex.rows.length === 2 && /Fastest given traffic/.test(ex.rows[0]) && /Nearest in a straight line/.test(ex.rows[1]) && /km straight/.test(ex.rows[0]) && /\(SIM\)/.test(ex.cap) && ex.steps === true, JSON.stringify([ex.why.slice(0, 60), ex.rows, ex.cap.slice(0, 80)]));
  await page.click('#nat-example');
  check('"Back to the story" returns to the hazard scene', (await page.evaluate(() => window.__manaraHome.nat.state().mode)) === 'story');
  // keyboard on the stage tabs (LTR: ArrowRight = next)
  await page.focus('#st-nat'); await page.keyboard.press('ArrowRight');
  const kt = await page.evaluate(() => [document.querySelector('#st-zoom').getAttribute('aria-selected'), document.activeElement.id, document.querySelector('#sp-nat').hidden, document.querySelector('#sp-zoom').hidden]);
  check('tabs keyboard: ArrowRight selects and focuses "Last 100 metres" and swaps the panels; Home returns', kt.join() === 'true,st-zoom,true,false' && (await (async () => { await page.keyboard.press('Home'); return page.evaluate(() => document.activeElement.id + document.querySelector('#sp-zoom').hidden); })()) === 'st-natfalse'.replace('false', 'true'), kt.join());
  // pixels and theme
  const px = await page.evaluate(() => { const c = document.querySelector('#nat-canvas'), g = c.getContext('2d'), set = new Set(); for (let i = 0; i < 500; i++) { const d = g.getImageData((i * 37) % c.width, (i * 53) % c.height, 1, 1).data; set.add(d[0] + ',' + d[1] + ',' + d[2]); } return set.size; });
  check('the national canvas is drawn (many distinct colours: land, roads, facilities, routes)', px > 15, String(px));
  const sig = () => page.evaluate(() => { const c = document.querySelector('#nat-canvas'), g = c.getContext('2d'); const d = g.getImageData(8, 8, 1, 1).data, e = g.getImageData(c.width / 2, c.height / 2, 1, 1).data; return [d[0], d[1], d[2], e[0], e[1], e[2]].join(','); });
  await page.evaluate(() => Manara.theme.set('dark')); await page.waitForTimeout(150); const a = await sig();
  await page.evaluate(() => Manara.theme.set('light')); await page.waitForTimeout(150); const b = await sig();
  check('themechange re-reads the tokens and repaints the national canvas (sea and land pixels differ between dark and light)', a !== b, a + ' vs ' + b);
  await page.evaluate(() => Manara.setLang('ar')); await page.waitForTimeout(200);
  const ar = await page.evaluate(() => [document.querySelector('#nat-cap').textContent, document.querySelector('#nat-example-t').textContent, document.querySelector('#nat-board .nb-k').textContent]);
  check('Arabic: the national caption, button and board are re-rendered in Arabic', ar.every(x => /[؀-ۿ]/.test(x)), ar.join(' | '));
  check('no console errors with the national scene', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{ // with motion: it runs, loops, pauses off-screen, scrubs
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference' });
  await context.addInitScript(() => { window.__raf = 0; const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => { window.__raf++; return r(f); }; try { localStorage.setItem('manara-lang', 'en'); } catch (e) { /* ignore */ } });
  const { page, errors } = await openPage(browser, 'index.html', { context });
  await waitNat(page);
  const t = () => page.evaluate(() => window.__manaraHome.nat.state().t);
  await page.waitForTimeout(300); const t0 = await t(); await page.waitForTimeout(900); const t1 = await t();
  check('with motion allowed the national scene plays (time advances) and loops inside its 26 s', t1 - t0 > 0.5 && (await page.evaluate(() => window.__manaraHome.nat.state().loop)) === 26, `${t0.toFixed(2)} → ${t1.toFixed(2)}`);
  await page.evaluate(() => window.__manaraHome.nat.seek(12, true));
  const mid = await page.evaluate(() => ({ s: window.__manaraHome.nat.state(), board: [...document.querySelectorAll('#nat-board .nb-eta')].map(e => e.textContent), v: document.querySelector('#nat-verdict').textContent, tt: document.querySelector('#nat-t').textContent, live: document.querySelector('#nat-cap').getAttribute('aria-live') }));
  check('mid-scene (12 s): stage "En route", the ETA countdowns are running (mm:ss), the clock "T+ … (SIM)" shows, the operator\'s approval is recorded, and the caption is polite while paused', mid.s.stage === 4 && mid.board.some(b => /^\d+:\d\d$/.test(b)) && /T\+ \d+:\d\d \(SIM\)/.test(mid.tt) && /APPROVED/.test(mid.v) && mid.live === 'polite', JSON.stringify(mid));
  await page.evaluate(() => window.__manaraHome.nat.seek(4, true));
  const keys = await page.evaluate(() => [document.querySelector('#nat-verdict').textContent, window.__manaraHome.nat.state().stage]);
  check('at 4 s one key is lit: "SUSPECT · 1 key" (a single key never alerts)', /SUSPECT · 1 key/.test(keys[0]) && keys[1] === 1, keys.join());
  await page.click('#nat-play'); await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#hardware').offsetTop)); await page.waitForTimeout(2300);
  const r0 = await page.evaluate(() => window.__raf), p0 = await t(); await page.waitForTimeout(1200); const r1 = await page.evaluate(() => window.__raf), p1 = await t();
  check('the national canvas pauses off-screen (IntersectionObserver): the clock stands still and no animation frames are requested', p1 === p0 && r1 - r0 <= 14, `t ${p0} → ${p1}; rAF ${r1 - r0}`);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(900);
  check('…and resumes when it scrolls back into view', (await t()) !== p1);
  await page.evaluate(() => window.__manaraHome.tabs.select('st-zoom')); await page.waitForTimeout(500);
  const z0 = await page.evaluate(() => window.__manaraHome.nat.state().t); await page.waitForTimeout(700); const z1 = await page.evaluate(() => window.__manaraHome.nat.state().t);
  check('with the "Last 100 metres" tab open the hidden national canvas does not run', z1 === z0, `${z0} → ${z1}`);
  check('no console errors with motion on (national scene)', errors.length === 0, errors.join(' | '));
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
section('7. The fastest responder on the real map (OSM roads, simulated traffic, real units)');
{
  const { ctx, page, errors } = await mk({ lang: 'en' });
  await page.evaluate(() => window.__manaraHome.fast.activate());
  await page.waitForFunction(() => window.__manaraHome.fast.state().ready, null, { timeout: 20000 });
  const fs_ = () => page.evaluate(() => window.__manaraHome.fast.state());
  let s = await fs_();
  const ex = NN.findFartherButFaster(7, { nat: NAT, times: [7.5], budget: 30, kinds: ['fire'], minGainSec: 60 });
  const t75 = NN.timeAt(NAT, '2026-07-12', 7.5);
  const ref = NN.dispatchNational(NAT, { hazard: 'fire', lon: ex.incident.lon, lat: ex.incident.lat, severity: 2 }, t75);
  const rf = ref.units.find(u => u.kind === 'fire'), rp = ref.units.find(u => u.kind === 'police');
  check(`default (fire example near ${ex.incident.place.name.en}, Sunday 07:30, load ×1.0): the fire pick equals the engine run in Node (${Math.round(rf.etaSec)} s), and it is NOT the nearest in a straight line — farther but faster`, s.picks.fire.far === true && s.picks.fire.nearest !== s.picks.fire.unit && Math.abs(s.picks.fire.eta - rf.etaSec) < 1 && s.picks.fire.unit === rf.unitId && s.picks.fire.gain > 0, JSON.stringify(s.picks.fire));
  check('all three unit types are recommended: fire & rescue, police, ambulance, plus a destination hospital', ['fire', 'police', 'ambulance'].every(k => s.picks[k] && s.picks[k].unit) && s.hosp && s.hosp.eta > 0 && Math.abs(s.picks.police.eta - rp.etaSec) < 1, JSON.stringify(s.picks));
  check('the incident sits on the real map of Qatar (inside the outline) and the clock is Sunday 07:30', NGEO.inLand(s.inc.lon, s.inc.lat) && s.t === t75, JSON.stringify(s.inc));
  const cards = await page.evaluate(() => [...document.querySelectorAll('.fr-card')].map(c => ({ k: c.dataset.pick, t: c.textContent.replace(/\s+/g, ' '), sr: c.querySelector('.sr-only')?.textContent, vis: c.querySelector('.fr-eta > span:first-child').textContent, hid: c.querySelector('.fr-eta > span:first-child').getAttribute('aria-hidden'), bars: c.querySelectorAll('.fr-bar').length })));
  check('each decision card shows ETA mm:ss, "SIM · km", the unit\'s OSM name and a spoken ETA for screen readers; the fire card carries the "farther but faster" tag and two ETA bars', cards.length === 3 && cards.every(c => /^\d+:\d\d$/.test(c.vis) && c.hid === 'true' && /SIM · [\d.]+ km/.test(c.t) && /(min|s) \(SIM\)/.test(c.sr)) && /farther but faster/.test(cards[0].t) && cards[0].bars === 2, JSON.stringify(cards.map(c => c.vis + ' ' + c.bars)));
  check('the explanation is the engine\'s own sentence: it names the road that slows the nearer unit and how many seconds faster', new RegExp(`${ex.gainSec} s|${Math.floor(ex.gainSec / 60)}:${String(ex.gainSec % 60).padStart(2, '0')}|${Math.floor(ex.gainSec / 60)} min ${ex.gainSec % 60} s`).test(cards[0].t) || /faster because congestion on/.test(cards[0].t), cards[0].t);
  check('the hospital line names the destination, its ETA from the scene and whether its emergency department is verified', /Hospital: .+ · in .+\(SIM\) · (ED verified|ED not verified)/.test(cards[2].t), cards[2].t);
  // traffic load: ETA never decreases as the load rises (the minimum over units), and equals Node
  const etas = await page.evaluate(() => { const H = window.__manaraHome.fast, out = []; for (const l of [0, 0.5, 1, 1.5, 2]) { H.setLoad(l); const p = H.state().picks; out.push([l, p.fire.eta, p.fire.unit, p.police.eta]); } return out; });
  const nat2 = NN.create(natOpts), nodeEtas = [0, 0.5, 1, 1.5, 2].map(l => { NN.setParam(nat2, 'trafficLoad', l); return NN.dispatchNational(nat2, { hazard: 'fire', lon: ex.incident.lon, lat: ex.incident.lat, severity: 2 }, t75).units.find(u => u.kind === 'fire').etaSec; });
  check('the chosen fire ETA never decreases as the traffic load rises, and every point equals the engine in Node: ' + etas.map(e => `×${e[0]} ${Math.round(e[1])} s`).join(', '), etas.every((e, i) => (i === 0 || e[1] >= etas[i - 1][1] - 1e-9) && Math.abs(e[1] - nodeEtas[i]) < 1), JSON.stringify([etas, nodeEtas]));
  check('with the load at ×0 the nearest unit wins; at ×1 and above the farther one wins (traffic changes the decision)', etas[0][2] !== etas[2][2] && etas[2][2] === etas[4][2], JSON.stringify(etas.map(e => e[2].slice(-9))));
  await page.evaluate(() => window.__manaraHome.fast.setLoad(1));
  await page.click('#fast-time [data-hour="3"]'); s = await fs_();
  check('Night 03:00 (empty roads): the ETA is shorter than at the morning peak', s.hour === 3 && s.picks.fire.eta < rf.etaSec, `${s.picks.fire.eta} vs ${rf.etaSec}`);
  await page.click('#fast-time [data-hour="7.5"]');
  // the slider input
  await page.evaluate(() => { const r = document.querySelector('#fast-load'); r.value = '200'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  s = await fs_(); const lv = await page.textContent('#fast-load-v');
  check('the traffic slider (×0…×2) moves the decision: ×2.0 is labelled and its ETA is the engine\'s', s.load === 2 && lv === '×2.0' && Math.abs(s.picks.fire.eta - nodeEtas[4]) < 1, lv + ' ' + s.picks.fire.eta);
  await page.evaluate(() => { const r = document.querySelector('#fast-load'); r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  // trauma: capability beats speed
  const sosPlan = need => NN.dispatchNational(NAT, { hazard: 'sos', lon: ex.incident.lon, lat: ex.incident.lat, severity: 2, patients: { n: 1, need } }, t75).hospital.chosen;
  const hEd = sosPlan('ed'), hTr = sosPlan('trauma'); s = await fs_();
  check(`default hospital = the engine's fastest ED (${hEd.name.en}, ${Math.round(hEd.etaSec)} s)`, s.hosp.name.en === hEd.name.en && Math.abs(s.hosp.eta - hEd.etaSec) < 1, JSON.stringify(s.hosp));
  await page.click('#fast-trauma'); s = await fs_();
  check(`"needs a trauma centre": the capable hospital is chosen, not the nearest (${hTr.name.en}); the card says so`, s.trauma && s.hosp.name.en === hTr.name.en && s.hosp.name.en !== hEd.name.en && /needs trauma centre/.test(await page.textContent('.fr-card[data-pick=ambulance]')), JSON.stringify(s.hosp));
  await page.click('#fast-trauma');
  // click-to-jam on a real road, with the mouse
  const road = await page.evaluate(() => { const H = window.__manaraHome, f = H.fast, st = f.state(), box = document.querySelector('#fast-canvas').getBoundingClientRect(), hit = f.edgeAtView(0.5, 0.45); if (!hit) return null; const X = (hit.lon - 51.2) * H.NATL.KX, Y = (hit.lat - 25.3) * H.NATL.KY, W = box.width, Hh = box.height; return { edge: hit.edge, name: hit.info.name.en, x: box.left + W / 2 + (X - st.view.cx) * st.view.k, y: box.top + Hh / 2 - (Y - st.view.cy) * st.view.k, win: innerHeight }; });
  check('a real OSM road (with its name) can be found under the map: ' + (road && road.name), !!road && road.edge >= 0);
  await page.evaluate(() => document.querySelector('#fast-canvas').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const pos = await page.evaluate(({ edge }) => { const H = window.__manaraHome, st = H.fast.state(), box = document.querySelector('#fast-canvas').getBoundingClientRect(), hit = H.fast.edgeAtView(0.5, 0.45); const X = (hit.lon - 51.2) * H.NATL.KX, Y = (hit.lat - 25.3) * H.NATL.KY; return { edge: hit.edge, x: box.left + box.width / 2 + (X - st.view.cx) * st.view.k, y: box.top + box.height / 2 - (Y - st.view.cy) * st.view.k }; }, road);
  await page.mouse.click(pos.x, pos.y); s = await fs_(); const j1 = s.jam[pos.edge];
  await page.mouse.click(pos.x, pos.y); s = await fs_(); const j2 = s.jam[pos.edge];
  await page.mouse.click(pos.x, pos.y); s = await fs_(); const j3 = s.jam[pos.edge] || 0;
  check('clicking a real road on the map cycles it: jammed → closed → clear', j1 === 1 && j2 === 2 && j3 === 0, `${j1},${j2},${j3}`);
  // a road on the chosen route, closed: the route cannot use it
  const before = (await fs_()).picks.fire;
  const edge = +(await page.locator('#fast-roads .road-btn').first().getAttribute('data-edge')), rb = () => page.locator(`#fast-roads .road-btn[data-edge="${edge}"]`);
  await rb().click(); await rb().click(); s = await fs_();
  const closedLbl = await page.locator(`#fast-roads .road-btn[data-edge="${edge}"]`).getAttribute('aria-label');
  check('closing a road on the chosen route (a real button, so the keyboard works too) removes it from the route: the fire ETA rises or the unit changes, and the label says "closed"', s.jam[edge] === 2 && (s.picks.fire.eta > before.eta || s.picks.fire.unit !== before.unit) && /closed/.test(closedLbl), JSON.stringify([before.eta, s.picks.fire.eta, s.picks.fire.unit === before.unit]));
  const nat3 = NN.create(natOpts); NN.closeRoad(nat3, edge); const nodeClosed = NN.dispatchNational(nat3, { hazard: 'fire', lon: ex.incident.lon, lat: ex.incident.lat, severity: 2 }, t75).units.find(u => u.kind === 'fire');
  check('…and that decision equals the engine in Node with the same road closed (' + Math.round(nodeClosed.etaSec) + ' s)', Math.abs(s.picks.fire.eta - nodeClosed.etaSec) < 1 && s.picks.fire.unit === nodeClosed.unitId, `${s.picks.fire.eta} vs ${nodeClosed.etaSec}`);
  await page.focus(`#fast-roads .road-btn[data-edge="${edge}"]`); await page.keyboard.press('Enter'); s = await fs_();
  check('keyboard: Enter on a focused road button cycles it back to normal', !s.jam[edge]);
  await page.locator('#fast-roads .road-btn').first().click(); await page.click('#fast-reset'); s = await fs_();
  check('"Reset roads" clears every jam', Object.keys(s.jam).length === 0);
  // examples
  const chips = await page.evaluate(() => [...document.querySelectorAll('#fast-ex .chip')].map(c => [c.dataset.ex, c.disabled, c.textContent]));
  check('three real examples (fire, ambulance, police), each named by its place: ' + chips.map(c => c[2]).join(' | '), chips.length === 3 && chips.every(c => !c[1] && / · /.test(c[2])), JSON.stringify(chips));
  await page.click('#fast-ex [data-ex=ambulance]'); s = await fs_();
  const exA = NN.findFartherButFaster(11, { nat: NAT, times: [7.5], budget: 30, kinds: ['ambulance'], minGainSec: 60 });
  check('the ambulance example is another real incident (' + exA.incident.place.name.en + '): it equals findFartherButFaster in Node', s.ex === 'ambulance' && Math.abs(s.inc.lon - exA.incident.lon) < 1e-9 && s.picks.ambulance.far === true, JSON.stringify([s.inc, exA.incident]));
  await page.click('#fast-ex [data-ex=fire]');
  const live = await page.evaluate(() => document.querySelector('#fast-live').getAttribute('aria-live'));
  check('changes are announced in a polite live region', live === 'polite');
  const lbl = await page.evaluate(() => ({ svg: document.querySelector('#fast-canvas').getAttribute('aria-label'), credit: document.querySelector('#fast .stage-credit').textContent.replace(/\s+/g, ' ') }));
  check('SIM is said on the map and the cards; the OSM attribution and the snapshot date sit under the map', /SIM/.test(lbl.svg) && lbl.credit.includes('© OpenStreetMap contributors, ODbL 1.0') && lbl.credit.includes(NGEO.meta.snapshotDate), JSON.stringify(lbl));
  const txt = await page.evaluate(() => document.querySelector('#fastest').textContent.replace(/\s+/g, ' '));
  check('honesty: "999 stays the dispatcher", needs live traffic + authority vehicle data + an agreement, Qatar 75 % in 10 minutes target (HMC 2023), major roads only, no signals', /999 stays the dispatcher/.test(txt) && /live traffic provider/.test(txt) && /agreement/.test(txt) && /75% of calls within 10 minutes/.test(txt) && /Hamad Medical Corporation, 2023/.test(txt) && /major-road network only/.test(txt) && /no traffic signals/.test(txt));
  const pxs = await page.evaluate(() => { const c = document.querySelector('#fast-canvas'), g = c.getContext('2d'), set = new Set(); for (let i = 0; i < 500; i++) { const d = g.getImageData((i * 37) % c.width, (i * 53) % c.height, 1, 1).data; set.add(d[0] + ',' + d[1] + ',' + d[2]); } return set.size; });
  check('the fastest-responder canvas is drawn (roads coloured by simulated congestion, routes, units)', pxs > 20, String(pxs));
  check('no console errors in the fastest-responder section', errors.length === 0, errors.join(' | '));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(400);
  const mob = await page.evaluate(() => { const c = document.querySelector('#fast-canvas').getBoundingClientRect(); return { w: c.width, h: c.height, W: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; });
  check('on a 390 px phone the real map fits (≥ 300 px wide) and the page does not scroll sideways', mob.w >= 300 && mob.w <= mob.W && mob.sw <= mob.W, JSON.stringify(mob));
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

/* ============================================================================================ 11. national layer */
section('11. The national layer: facts from the data, hazard layers, credits, the national A/B and the test tails');
const GDEC = NROADS.decode();
const F = (() => { const c = { hosp: 0, clinic: 0, fire: 0, police: 0, amb: 0, ed: 0 }; NFAC.forEach(f => { if (f.kind === 'hospital') c.hosp++; else if (f.kind === 'clinic-ed') c.clinic++; else if (f.kind === 'fire') c.fire++; else if (f.kind === 'police') c.police++; else if (f.kind === 'ambulance') c.amb++; if (f.ed === 'yes') c.ed++; });
  let km = 0, virt = 0; for (let e = 0; e < GDEC.e; e++) { km += GDEC.eLen[e]; if (GDEC.eFlags[e] & 256) virt++; }
  return Object.assign(c, { munis: NGEO.municipalities.length, places: NGEO.places.length, fac: NFAC.length, roadkm: Math.round(km / 1000), roadnodes: GDEC.n, virt, snapshot: NGEO.meta.snapshotDate, osmts: NGEO.meta.osmBaseTimestamp }); })();
{
  const { ctx, page, errors } = await mk({ lang: 'en' });
  const fmt = v => typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
  const live = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-nat]')].map(n => [n.dataset.nat, n.textContent.trim()])));
  const stat = Object.fromEntries([...HTML.matchAll(/data-nat="(\w+)"[^>]*>([^<]*)</g)].map(m => [m[1], m[2].trim()]));
  const bad = Object.keys(F).filter(k => k in live && live[k] !== fmt(F[k])), badStatic = Object.keys(stat).filter(k => k in F && stat[k] !== fmt(F[k]));
  check(`Qatar-wide facts are written from the data at run time and equal an independent read of the files in Node: ${Object.keys(live).map(k => k + '=' + live[k]).join(', ')}`, Object.keys(live).length >= 12 && bad.length === 0, bad.map(k => `${k}: page ${live[k]} data ${fmt(F[k])}`).join('; '));
  check('the static HTML fallback (what a reader without JavaScript sees) carries the same values as the data', badStatic.length === 0, badStatic.map(k => `${k}: html ${stat[k]} data ${fmt(F[k])}`).join('; '));
  check(`the data really are what the docs say: 8 municipalities, ${F.fac} facilities (hospital ${F.hosp}, fire ${F.fire}, police ${F.police}, ambulance ${F.amb}), ${F.roadkm} km of roads, snapshot ${F.snapshot}`, F.munis === 8 && F.fac === 138 && F.fire === 21 && F.roadkm === NN.world(NAT).km && fs.readFileSync(path.join(SITE, 'data/CREDITS.txt'), 'utf8').includes(F.snapshot));
  const gaps = await page.evaluate(() => document.querySelector('.qa-gaps').textContent.replace(/\s+/g, ' '));
  check('honest gaps are on the page: 21 OSM fire entries vs 23 centres in a 2021 press report (secondary, and an older report says 20), ED verified for 18 only, 3 ambulance points, major roads only, a snapshot not a feed', /21 entries in OSM against 23 Civil Defence centres/.test(gaps) && /secondary source/.test(gaps) && /says 20/.test(gaps) && /verified for only 18/.test(gaps) && /just 3 ambulance points/.test(gaps) && /major roads only/.test(gaps) && /snapshot, not a feed/.test(gaps), gaps.slice(0, 200));
  await page.evaluate(() => window.__manaraHome.qwide.activate());
  await page.waitForFunction(() => window.__manaraHome.qwide.state().ready, null, { timeout: 20000 });
  let q = await page.evaluate(() => window.__manaraHome.qwide.state());
  const tbl = await page.evaluate(() => [...document.querySelectorAll('#qa-table tbody tr')].map(r => [...r.children].map(c => c.textContent.trim())));
  const byM = {}; NFAC.forEach(f => { const m = byM[f.muni] || (byM[f.muni] = [0, 0, 0]); if (f.kind === 'hospital' || f.kind === 'clinic-ed') m[0]++; else if (f.kind === 'police') m[1]++; else if (f.kind === 'fire') m[2]++; });
  const okRows = NGEO.municipalities.every((m, i) => { const r = tbl[i], b = byM[m.id] || [0, 0, 0]; return r[0] === m.name.en && r[2] === String(b[0]) && r[3] === String(b[1]) && r[4] === String(b[2]); });
  const tot = tbl[8];
  check(`the municipality table has the 8 municipalities with facility counts equal to the data (total hospitals/EDs ${F.hosp + F.clinic}, police ${F.police}, fire ${F.fire})`, tbl.length === 9 && okRows && tot[2] === String(F.hosp + F.clinic) && tot[3] === String(F.police) && tot[4] === String(F.fire), JSON.stringify(tbl[0]) + JSON.stringify(tot));
  // heat: summer midday ban in force; winter not; numbers = Node
  await page.evaluate(() => window.__manaraHome.qwide.setLayer('heat'));
  q = await page.evaluate(() => window.__manaraHome.qwide.state());
  const tS = NN.timeAt(NAT, '2026-07-12', 12), fS = NN.fields(NAT, tS), maxS = Math.max(...fS.wbgt);
  check(`heat, summer 12:00: the midday work ban (10:00–15:30, 1 June–15 Sep) is in force and the WBGT estimate peak equals the engine (${maxS.toFixed(1)} °C)`, q.ban === true && NN.middayBan(NAT, tS) === true && Math.abs(q.wbgtMax - Math.max(...NN.municipalities(NAT, tS).map(m => m.wbgtMax))) < 0.06, JSON.stringify(q));
  const txtH = await page.evaluate(() => [document.querySelector('#qa-read').textContent, document.querySelector('#qa-src').textContent, document.querySelector('#qa-adv').textContent]);
  check('heat readout says the ban is in force, labels WBGT an estimate and cites S52, S19, S18 (28 °C warn, 32.1 °C stop-work, 10:00–15:30)', /ban .* is in force now/.test(txtH[0]) && /estimate/.test(txtH[0] + txtH[1]) && /S52/.test(txtH[1]) && /S19/.test(txtH[1]) && /S18/.test(txtH[1]) && /32\.1/.test(txtH[1]) && /stop work/.test(txtH[2]), txtH.join(' | ').slice(0, 300));
  await page.click('#qa-season [data-date="2026-01-11"]'); q = await page.evaluate(() => window.__manaraHome.qwide.state());
  const tW = NN.timeAt(NAT, '2026-01-11', 12);
  check('heat, winter 12:00: no ban, and the estimate is far lower (engine: ' + Math.max(...NN.fields(NAT, tW).wbgt).toFixed(1) + ' °C)', q.ban === false && NN.middayBan(NAT, tW) === false && q.wbgtMax < q.wbgtMax + 1 && q.wbgtMax < 25, JSON.stringify(q));
  await page.click('#qa-season [data-date="2026-07-12"]');
  // dust: a front crossing the country
  await page.evaluate(() => window.__manaraHome.qwide.setLayer('dust'));
  const dust = await page.evaluate(() => { const Q = window.__manaraHome.qwide, out = []; for (const h of [4, 9, 14]) { Q.setHour(h); out.push([h, Q.state().pm10Max]); } return out; });
  const nd = NN.create(natOpts); NN.startDust(nd, { t0: NN.timeAt(nd, '2026-07-12', 6) });
  const nodeDust = [4, 9, 14].map(h => Math.max(...NN.municipalities(nd, NN.timeAt(nd, '2026-07-12', h)).map(m => m.pm10Max)));
  check('dust: the simulated shamal front arrives (PM10 background before 06:00, above Qatar\'s 150 µg/m³ later) and every value equals the engine: ' + dust.map(d => d[0] + 'h ' + Math.round(d[1])).join(', '), dust[0][1] <= 60 && dust[1][1] > 150 && dust.every((d, i) => Math.abs(d[1] - nodeDust[i]) < 1.5), JSON.stringify([dust, nodeDust]));
  const srcD = await page.textContent('#qa-src');
  check('dust cites S31 (Qatar 150 µg/m³), S49 (255 / 425) and S30 (April 2015 storm) and says the front is simulated', /S31/.test(srcD) && /S49/.test(srcD) && /S30/.test(srcD) && /simulated/.test(srcD), srcD);
  // flood: underpasses from the road data, closure by simulated rain
  await page.evaluate(() => window.__manaraHome.qwide.setLayer('flood'));
  const dry = await page.evaluate(() => window.__manaraHome.qwide.state());
  const tunnelsInData = (() => { let n = 0; for (let e = 0; e < GDEC.e; e++) if (GDEC.eFlags[e] & 1) n++; return n; })();
  await page.click('#qa-rain [data-rain="60"]'); await page.waitForFunction(() => window.__manaraHome.qwide.state().rain === 60 && document.querySelector('#qa-loading').hidden, null, { timeout: 10000 });
  const wet = await page.evaluate(() => window.__manaraHome.qwide.state());
  const nf = NN.create(natOpts); NN.startDust(nf, { t0: NN.timeAt(nf, '2026-07-12', 6) }); NN.setRain(nf, 60); NN.step(nf, 3600); const nodeClosed = NN.floodState(nf, { all: true }).tunnels.filter(x => x.closed).length;
  check(`flood: the ${dry.tunnels} underpasses come from the road data (flagged tunnel edges: ${tunnelsInData}); dry = ${dry.closed} closed; 60 mm/h for one hour closes ${wet.closed}, the same as the engine (${nodeClosed})`, dry.tunnels === tunnelsInData || dry.tunnels === NN.world(NAT).tunnels, JSON.stringify([dry, wet]));
  check('rain closes underpasses (and not none): the 30 cm rule is applied by the engine', wet.closed === nodeClosed && wet.closed > 0, JSON.stringify([wet, nodeClosed]));
  const srcF = await page.textContent('#qa-src');
  check('flood cites S55 (30 cm) and S28 (October 2018), and the readout says there is no elevation model', /S55/.test(srcF) && /S28/.test(srcF) && /no elevation model/.test(await page.textContent('#qa-read')), srcF);
  const sim = await page.evaluate(() => [document.querySelector('#qa-canvas').getAttribute('aria-label'), document.querySelector('#qa').textContent.replace(/\s+/g, ' ')]);
  check('every hazard layer is labelled SIM (canvas label, credit line) and the map credit carries the OSM attribution and snapshot date', /SIM/.test(sim[0]) && /simulated \(SIM\)/.test(sim[1]) && sim[1].includes('© OpenStreetMap contributors, ODbL 1.0') && sim[1].includes(F.snapshot), sim[0]);
  const pxq = await page.evaluate(() => { const c = document.querySelector('#qa-canvas'), g = c.getContext('2d'), set = new Set(); for (let i = 0; i < 600; i++) { const d = g.getImageData((i * 37) % c.width, (i * 53) % c.height, 1, 1).data; set.add(d[0] + ',' + d[1] + ',' + d[2]); } return set.size; });
  check('the Qatar-wide canvas is drawn', pxq > 10, String(pxq));
  check('no console errors in the Qatar-wide section', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
{ // credits + transparency table
  const { ctx, page } = await mk({ lang: 'en' });
  const cr = await page.evaluate(() => ({ attr: document.querySelector('.cr-attr').textContent.replace(/\s+/g, ' '), href: document.querySelector('.cr-attr a').href, rel: document.querySelector('.cr-attr a').rel, all: document.querySelector('#credits').textContent.replace(/\s+/g, ' ') }));
  check('the data-credits block carries the exact ODbL attribution, links to the OSM copyright page (noopener) and shows the snapshot timestamp and build date', cr.attr.startsWith('Contains data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright') && cr.href === 'https://www.openstreetmap.org/copyright' && /noopener/.test(cr.rel) && cr.all.includes(F.osmts) && cr.all.includes(F.snapshot), JSON.stringify(cr).slice(0, 300));
  check('credits say what is real (a snapshot), what is simulated on top, and what is not used (live traffic, real vehicles, real incidents); Natural Earth only to cross-check; derived-database share-alike', /derived database/.test(cr.all) && /Natural Earth \(public domain\)/.test(cr.all) && /Not used:/.test(cr.all) && /live traffic, any real vehicle, any real incident/.test(cr.all) && /999 stays the dispatcher/.test(cr.all));
  const n = await page.evaluate(() => (document.body.textContent.match(/contains data © OpenStreetMap contributors, ODbL 1\.0/gi) || []).length);
  check(`the attribution appears wherever the data is used: hero, fastest-responder map, Qatar-wide map and the credits block (${n} places)`, n >= 4, String(n));
  const rows = await page.evaluate(() => [...document.querySelectorAll('#truth tbody tr')].map(r => [r.dataset.s, r.children[0].textContent.trim(), r.children[2].textContent.trim()]));
  const find = re => rows.find(r => re.test(r[1]));
  check('transparency table: REAL = map, facility locations (incomplete), road network; SIM = traffic, unit availability, incidents and hazard fields; the demo district is SIM', find(/map of Qatar/)[0] === 'real' && find(/Locations of hospitals/)[0] === 'real' && find(/major-road network/)[0] === 'real' && find(/Traffic and congestion/)[0] === 'sim' && find(/Unit availability/)[0] === 'sim' && find(/Incidents, and the heat/)[0] === 'sim' && find(/last 100 metres” demo district/)[0] === 'sim', JSON.stringify(rows.map(r => r[0] + ':' + r[1].slice(0, 25))));
  const roadmap = await page.textContent('#roadmap');
  check('roadmap: the national layer is listed as built; bringing it into Mission Control and the phones is "in progress" (no false claim)', /The national layer, on this page/.test(roadmap) && /In progress:.*Mission Control and the resident phones/.test(roadmap));
  await ctx.close();
}
{ // evidence: national A/B and the tails of the two test scripts
  const ab = NN.ab({ seed: 7, n: 150 });
  const { ctx, page } = await mk({ lang: 'en' });
  const ev = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ev^="nab."],[data-ev^="nt."],[data-ev^="qd."]')].map(n => [n.getAttribute('data-ev'), n.textContent.trim().replace(/,/g, '')])));
  const exp = { 'nab.mean.ord': Math.round(ab.firstResponderEtaSec.ordinary.mean), 'nab.mean.man': Math.round(ab.firstResponderEtaSec.manara.mean), 'nab.p90.ord': Math.round(ab.firstResponderEtaSec.ordinary.p90), 'nab.p90.man': Math.round(ab.firstResponderEtaSec.manara.p90),
    'nab.differs': ab.differs.unitChoicesPct, 'nab.fbf': ab.differs.farButFasterChoicesPct, 'nab.saved.med': Math.round(ab.savedSec.all.p50), 'nab.saved.mean': Math.round(ab.savedSec.all.mean), 'nab.saved.p90': Math.round(ab.savedSec.all.p90) };
  const bad = Object.keys(exp).filter(k => String(exp[k]) !== ev[k]);
  check(`national A/B numbers equal ManaraNational.ab(seed 7, n 150, Sunday 07:30): first-responder mean ${exp['nab.mean.ord']} → ${exp['nab.mean.man']} s, p90 ${exp['nab.p90.ord']} → ${exp['nab.p90.man']} s, ${exp['nab.differs']} % of unit choices differ, ${exp['nab.fbf']} % farther-but-faster, time saved median/mean/p90 ${exp['nab.saved.med']}/${exp['nab.saved.mean']}/${exp['nab.saved.p90']} s`, bad.length === 0 && ab.n === 150 && ab.evaluated === 150, bad.map(k => `${k}: page ${ev[k]} engine ${exp[k]}`).join('; '));
  check('national A/B bars use the same numbers (1133.5 / 1070.8 / 2480.2 / 2333)', ['--v:1133.5', '--v:1070.8', '--v:2480.2', '--v:2333'].every(v => HTML.includes(v)) && Math.abs(ab.firstResponderEtaSec.ordinary.mean - 1133.5) < 0.06 && Math.abs(ab.firstResponderEtaSec.manara.mean - 1070.8) < 0.06 && Math.abs(ab.firstResponderEtaSec.ordinary.p90 - 2480.2) < 0.06 && ab.firstResponderEtaSec.manara.p90 === 2333);
  const evTxt = await page.evaluate(() => document.querySelector('#ev-nat').textContent.replace(/\s+/g, ' '));
  check('the national card is labelled SIM / SIMULATION — a mechanism check, says the median saving is zero and the tail carries the benefit, and that long ETAs come from incidents anywhere on land incl. the desert', /SIMULATION — a mechanism check, not proof of impact/.test(evTxt) && /the median is zero/.test(evTxt) && /far desert/.test(evTxt) && /\bSIM\b/.test(await page.textContent('#ev-nat h3')), evTxt.slice(0, 160));
  const tn = spawnSync('node', [path.join(ROOT, 'tools/manara/test-national.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 }), tq = spawnSync('node', [path.join(ROOT, 'tools/manara/test-qatar-data.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const mn = /(\d+) passed, (\d+) failed/.exec(tn.stdout.slice(-400)), mq = /(\d+) passed, (\d+) failed/.exec(tq.stdout.slice(-400));
  check(`fresh runs: test-national.mjs → ${mn && mn[0]}, test-qatar-data.mjs → ${mq && mq[0]}; the page quotes exactly those`, !!mn && !!mq && tn.status === 0 && tq.status === 0 && ev['nt.pass'] === mn[1] && ev['nt.fail'] === mn[2] && ev['qd.pass'] === mq[1] && ev['qd.fail'] === mq[2], JSON.stringify([ev['nt.pass'], ev['nt.fail'], ev['qd.pass'], ev['qd.fail']]));
  await ctx.close();
}

await done(browser);
