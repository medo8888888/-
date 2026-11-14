// MANARA («منارة») — tests for the landing page: manara/index.html, css/home.css, js/home.js, js/home-map.js and 404.html.
//
//   node manara/tools/test-home.mjs            (about 3 minutes; needs Playwright + Chromium, see manara/tools/lib.mjs)
//   ONLY=6,7 node manara/tools/test-home.mjs   (run just those sections)
//
// The page tells ONE story: the drone SEES → the control room PROVES (two independent keys + a human Approve; the local siren never waits) → the fastest unit
// REACHES (all of Qatar, OSM roads) → the drone GUIDES the last 100 m → the rescue robot COUNTS (finds people who cannot self-evacuate) → HAND OFF.
//   1  the project laws, read from the source (classic scripts, no network, no innerHTML, logical CSS, tokens, transform/opacity-only motion)
//   2  every number on the page against the engine that produces it (sim.js, national.js, test-fire.mjs, the Decoy Lab, the data files, the test counts)
//   3  structure: sections, six-step pipeline links, every link resolves, AR/EN twins, the 12 team placeholders
//   4  loads clean at 360 / 390 / 820 / 1440 in both themes and languages: no console error, no overflow
//   5  the hero story: reduced-motion still frame, the 20 s loop (camera → map → last 100 m → robot → hand-off), controls, theme/language redraw
//   6  MOTION: reduced motion disables every loop, everything pauses off-screen and in a hidden tab, the pipeline lights in sequence, numbers count up and end
//      on the written value, reveals stagger, nothing flashes more than 3 times a second, no console error, no overflow, no layout shift while it all runs
//   7  the control-room miniature and the Qatar-wide demo (real map data, engine ETAs equal the ones drawn in the hero)
//   8  hazards, robot section, numbers filter, criteria, team placeholders
//   9  accessibility (names, ids, headings, landmarks, 44 px targets, contrast AA in both themes and languages)
//  10  print, layout shift, 404
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, SITE, ROOT, url } from './lib.mjs';

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean).map(Number);
const on = n => !ONLY.length || ONLY.includes(n);
const section = t => console.log('\n' + t);
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const HTML = read('index.html'), CSS = read('css/home.css'), JS = read('js/home.js'), JSM = read('js/home-map.js'), NF = read('404.html');
const SOURCES = fs.readFileSync(path.join(ROOT, 'docs', 'MANARA-SOURCES.md'), 'utf8');
const strip = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
const TEXT = strip(HTML).replace(/\s+/g, ' ');
const browser = await launch();
const motion = (o = {}) => openPage(browser, 'index.html', { reducedMotion: 'no-preference', ...o });
const still = (o = {}) => openPage(browser, 'index.html', { reducedMotion: 'reduce', ...o });
const ready = async page => { await page.waitForFunction(() => window.__homeReady === true && window.__homeMapReady === true, null, { timeout: 15000 }); return page; };
const go = (page, sel) => page.evaluate(s => { const n = document.querySelector(s); window.scrollTo({ top: n.getBoundingClientRect().top + window.scrollY - 70, behavior: 'instant' }); }, sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ============================================================================================ 1. laws */
if (on(1)) {
  section('1. Project laws (read from the source)');
  const scripts = [...HTML.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
  check('classic scripts only: every external <script> is defer, none is type=module', scripts.filter(s => /src=/.test(s)).every(s => /\bdefer\b/.test(s)) && !scripts.some(s => /type=["']?module/.test(s)));
  const ext = [...HTML.matchAll(/(?:href|src)=["'](https?:[^"']+)["']/g)].map(m => m[1]).filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(u));
  check('no library or CDN: the only external host besides Google Fonts is the OpenStreetMap copyright link (an anchor, never a script)', ext.length === 1 && ext[0] === 'https://www.openstreetmap.org/copyright', ext.join(' '));
  const order = [...HTML.matchAll(/<script src="([^"]+)" defer>/g)].map(m => m[1]);
  check('script order: core, test counts, fire, drone-scene, home, the three data files, national, the national map, home-map (all local, all defer)',
    JSON.stringify(order) === JSON.stringify(['js/core.js', 'data/test-counts.js', 'js/fire.js', 'js/drone-scene.js', 'js/home.js', 'data/qatar-geo.js', 'data/qatar-facilities.js', 'data/qatar-roads.js', 'js/national.js', 'js/mission-national-map.js', 'js/home-map.js']), order.join(' '));
  for (const [nm, src] of [['home.js', JS], ['home-map.js', JSM]]) {
    check(`${nm}: no fetch / XMLHttpRequest / import / export / eval, no cookies, no storage, no network sends`, !/\b(fetch|XMLHttpRequest|eval)\s*\(|^\s*(import|export)\s|document\.cookie|sendBeacon|WebSocket|localStorage|sessionStorage/m.test(src));
    check(`${nm}: no innerHTML / outerHTML / insertAdjacentHTML / document.write (SVG is parsed with DOMParser, text with textContent)`, !/\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write/.test(src));
    check(`${nm}: colours come from tokens (no hex or rgb() literal)`, !/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(\s*\d/.test(src.replace(/'rgba?\(' \+/g, '')));
    check(`${nm}: a single IIFE in strict mode, one global namespace (ManaraHome) and the two ready flags`, /^\(function \(\) \{\s*'use strict';/m.test(src) && /window\.ManaraHome/.test(src) && /window\.__home(Map)?Ready = true/.test(src));
  }
  const body = CSS.slice(0, CSS.indexOf('@media print'));
  const noTok = body.replace(/\.dv\{[^}]*\}/, '');                       // the device scope re-declares the dark token set: the one place hex is allowed
  const physical = noTok.match(/(margin|padding|border)-(left|right)\b|text-align\s*:\s*(left|right)|(^|[;{\s])(left|right)\s*:|\bfloat\s*:/gm) || [];
  check('home.css: logical properties only (no margin/padding/border-left|right, no left:/right:, no text-align left|right, no float)', physical.length === 0, physical.join(' '));
  const hex = (noTok.replace(/mask-image:[^;}]*/g, '').match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g) || []);
  check('home.css: colours come from tokens (hex / rgba only inside the .dv device scope and the print block)', hex.length === 0, hex.join(' '));
  const ls = [...body.matchAll(/([^{}]+)\{[^{}]*letter-spacing\s*:\s*([^;}]+)[;}]/g)].map(m => m[1].trim() + ' => ' + m[2].trim());
  check('letter-spacing only in English rules or on digits (never on Arabic)', ls.every(l => /data-lang=en|\.num|\.tag|\.eyebrow/.test(l) || /:\s*0$/.test(l)), ls.join(' | '));
  // motion law: only transform / opacity are animated inside @keyframes (the filter on the blurred beam is static)
  const kf = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)].map(m => [m[1], [...m[2].matchAll(/([\w-]+)\s*:/g)].map(x => x[1]).filter(p => !['from', 'to'].includes(p))]);
  const badKf = kf.filter(([, props]) => props.some(p => !['transform', 'opacity'].includes(p)));
  check(`every @keyframes in home.css (${kf.map(k => k[0]).join(', ')}) animates only transform and opacity`, kf.length >= 6 && badKf.length === 0, JSON.stringify(badKf));
  check('no @keyframes is named strobe / flash / blink / flicker (the lint demands those be opt-in); the one-shot alert pulse is called ringout', !kf.some(([n]) => /strobe|flash|blink|flicker/i.test(n)) && kf.some(([n]) => n === 'ringout'), kf.map(k => k[0]).join(' '));
  const inf = [...CSS.matchAll(/animation:([^;}]*)\binfinite\b/g)].map(m => m[1]);
  check(`looping animations are slow (no loop shorter than 0.4 s, so nothing flashes more than 3 times a second): ${inf.length} found`, inf.every(a => { const d = /(\d*\.?\d+)s/.exec(a); return d && +d[1] >= 0.4; }), inf.join(' | '));
  check('reduced motion: the CSS stops the loops, the entrance animation and the sheen; the JS draws still frames and counters end at once',
    /prefers-reduced-motion:reduce\)\{[^]*\.con-radar\{animation:none\}/.test(CSS) && /if \(reduced\(\)\) \{ player\.pause\(\); still\(\); \}/.test(JS) && /if \(reduced\(\)\) return;/.test(JS) && /reduced\(\)\) \{ setN\(6\); return; \}/.test(JS));
  check('every loop pauses off-screen (IntersectionObserver in the Player and for CSS) and in a hidden tab (visibilitychange / document.hidden)',
    /new IntersectionObserver\(function \(es\) \{ P\.visible/.test(JS) && /document\.hidden/.test(JS) && /data-tab-hidden/.test(JS) && /section\[data-live="0"\]/.test(CSS) && /html\[data-tab-hidden\]/.test(CSS));
  check('print block: paper colours, nav / sub-nav / controls hidden, the invisible caption sizer removed', /@media print\{[^]*--bg:#fff[^]*\.nav,\.subnav/.test(CSS) && /\.cam-cap\.ghost\{display:none\}/.test(CSS));
  check('404.html: relative links only, base-href guard for deep missing paths, bilingual title', !/href="\/|href="https?:/.test(NF.replace(/https:\/\/fonts\.[a-z.]+[^"']*/g, '')) && /createElement\('base'\)/.test(NF) && !/document\.write/.test(NF) && /<title /.test(NF));
}

/* ============================================================================================ 2. numbers */
if (on(2)) {
  section('2. Numbers on the page against the engines that produce them (every one SIM or MEASURED, with its limit)');
  const sourceIds = new Set([...SOURCES.matchAll(/^\|\s*(S\d+)\s*\|/gm)].map(m => m[1]));
  const used = [...new Set(TEXT.match(/\bS\d{1,2}\b/g) || [])];
  check(`every source id cited on the page (${used.length}: ${used.slice(0, 8).join(' ')}) exists in docs/MANARA-SOURCES.md`, used.every(s => sourceIds.has(s)), used.filter(s => !sourceIds.has(s)).join(' '));
  const banned = [/world[- ]first/i, /first[- ]ever/i, /\bthe first (in|of its kind|to)/i, /\bsaves? \d+ lives/i, /(?<!not say “)we save lives/i, /deep learning/i, /neural network/i, /AI-powered/i, /أول من نوعه/, /ننقذ \d+ /, /تُنقذ أرواح/];
  const hit = banned.filter(r => r.test(TEXT));
  check('banned claims never appear ("first of its kind", "saves lives", "deep learning", "AI-powered", …)', hit.length === 0, hit.join(' '));
  const aiAr = [...TEXT.matchAll(/.{0,28}ذكاء[ًٌٍ]? ?اصطناعي[ًّ]?.{0,16}/g)].map(m => m[0]);
  check(`the rule-based detector is never called "AI" (${aiAr.length} Arabic mentions, all negations or the AI-disclosure)`, aiAr.every(s => /ليست|ليس|أدوات|الذكاء الاصطناعي/.test(s)), aiAr.join(' || '));
  const aiEn = [...TEXT.matchAll(/.{0,30}\bAI\b.{0,24}/g)].map(m => m[0]);
  check(`English: "AI" only as "not AI" or in the AI-disclosure (${aiEn.length} mentions)`, aiEn.every(s => /not AI|AI tools|AI disclosure|AI_TOOLS|Ownership & AI/.test(s)), aiEn.join(' || '));
  check('Arabic names the detector «رؤية حاسوبية بقواعد», English "rule-based computer vision"; the robot and drone are "concept / simulated", never "product"', /رؤية حاسوبية بقواعد/.test(HTML) && /rule-based computer vision/i.test(HTML) && /no robot has been built/i.test(HTML) && /no real drone has flown/i.test(HTML));
  check('prior art is named respectfully (Saqr, Shaheen, Suhail, Hassantuk) with "complements, never competes"; 999 stays the dispatcher', ['Saqr', 'Shaheen', 'Suhail', 'Hassantuk'].every(w => HTML.includes(w)) && /Complements, never competes/.test(HTML) && /999 stays/.test(HTML + JS));
  check('"SIM" labels the simulated parts: camera, story views, all-Qatar demo, console, robot, every simulated number card', (HTML.match(/>SIM</g) || []).length >= 14 && (HTML.match(/data-k="sim"/g) || []).length === 9 && (HTML.match(/data-k="measured"/g) || []).length === 3);

  // ---- engines, run here in Node (independent of the page)
  const loadCtx = files => { const c = vm.createContext({ console }); for (const f of files) vm.runInContext(read(f), c, { filename: f }); return c; };
  const S = loadCtx(['js/sim.js']).ManaraSim;
  const NC = loadCtx(['js/fire.js', 'js/drone-scene.js', 'data/qatar-geo.js', 'data/qatar-facilities.js', 'data/qatar-roads.js', 'js/national.js']);
  const N = NC.ManaraNational, GEO = NC.MANARA_QATAR_GEO, FAC = NC.MANARA_QATAR_FACILITIES, RDS = NC.MANARA_QATAR_ROADS;
  const TC = (() => { const w = {}; vm.runInContext(read('data/test-counts.js'), vm.createContext({ window: w })); return w.MANARA_TEST_COUNTS; })();
  const QUIET = { dronePatrolPct: 0, droneFaultPct: 0, droneUnavailPct: 0, droneWindMps: 0 };
  const exp = {};
  { // first eyes, national A/B
    const ab = N.ab({ seed: 7, n: 150 }), fe = ab.firstEyes;
    Object.assign(exp, { 'fe.first': fe.droneFirstPct, 'fe.d50': fe.droneEtaSec.p50, 'fe.g50': fe.firstGroundEtaSec.p50, 'fe.out': fe.noDroneAvailablePct, 'nab.differs': ab.differs.unitChoicesPct, 'nab.saved.mean': Math.round(ab.savedSec.all.mean) });
    check(`engine: A/B seed 7, 150 incidents: ${ab.evaluated} evaluated, ${fe.n} reachable by a drone`, ab.n === 150 && fe.n > 80);
  }
  { // thermal key on a person lying down, July 13:00 vs 02:00 (50 seeds each)
    const rate = hour => { let seen = 0, tot = 0; for (let i = 0; i < 50; i++) { const n = N.create({ seed: 600 + i, date: '2026-07-12', hour, params: QUIET }); N.createIncident(n, { hazard: 'sos', lon: 51.47 + 0.003 * (i % 5), lat: 25.30 + 0.003 * Math.floor(i / 5), severity: 1, trigger: 'citizen' }); for (let k = 0; k < 36; k++) N.step(n, 10); const al = N.alertQueue(n, { all: true })[0]; if (!al || !al.evidence.thermal) continue; tot++; if (al.evidence.thermal.seen) seen++; } return seen / tot; };
    exp['th.noon'] = Math.round(100 * rate(13)); exp['th.night'] = Math.round(100 * rate(2));
  }
  { // one simulated day of patrols with look-alikes
    const nat = N.create({ seed: 77, date: '2026-07-12', hour: 0, tickSec: 10, params: { droneFalsePerHour: 3, droneFaultPct: 0 } });
    for (let i = 0; i < 86400 / 10; i++) N.step(nat, 10);
    const k = N.kpis(nat).drones, fa = N.alertQueue(nat, { all: true }).filter(a => a.source === 'drone' && a.sim.truth === 'false');
    Object.assign(exp, { 'fa.raised': k.alerts.droneRaised, 'fa.pct': k.alerts.falseDismissedPct, 'fa.disp': fa.filter(a => a.tState.APPROVED !== undefined).length });
  }
  { // the robot (seed 1), tracked against wheeled, the thermal constant, the night-fire A/B
    const r = S.abRobot({ preset: 'fire-night-robot', seed: 1 }), sw = S.sweepRobot({ preset: 'fire-night-robot', param: 'variant', values: ['wheeled', 'tracked'], seeds: [1] }).rows;
    const ab = S.ab({ preset: 'fire-night', seed: 1 });
    Object.assign(exp, { 'rb.first': r.delta.timeSaved.n, 'rb.saved': r.delta.timeSaved.meanSec, 'rb.wheeled': sw.find(x => x.value === 'wheeled').needsRescPct, 'rb.tracked': sw.find(x => x.value === 'tracked').needsRescPct,
      'rb.body': +/var BODY_C = (\d+);/.exec(read('js/sim.js'))[1], 'ab.p90.ord': Math.round(ab.ordinary.timeToSafeP90Sec), 'ab.p90.man': Math.round(ab.manara.timeToSafeP90Sec), 'ab.siren': ab.ordinary.timeToFirstAlertSec, 'ab.personal': ab.manara.timeToFirstPersonalAlertSec });
  }
  { // the detector: test-fire.mjs prints the three accuracies
    const tf = spawnSync('node', [path.join(ROOT, 'tools/test-fire.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout;
    const acc = /sample set ([\d.]+) % and tuning set ([\d.]+) % .*test set ([\d.]+) %/.exec(tf);
    check('engine: test-fire.mjs prints the sample / tuning / held-out accuracies', !!acc, tf.slice(-200));
    if (acc) Object.assign(exp, { 'det.sample': +acc[1], 'det.tuning': +acc[2], 'det.test': +acc[3] });
  }
  const { ctx, page } = await still({ lang: 'en', width: 1440 }); await ready(page);
  const ev = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ev]')].map(n => [n.getAttribute('data-ev'), n.textContent.trim().replace(/,/g, '')])));
  const keys = Object.keys(exp).sort(), bad = keys.filter(k => String(exp[k]) !== ev[k]);
  check(`${keys.length} simulation / detector numbers on the page equal the engines (${keys.map(k => k + '=' + exp[k]).join(' ')})`, bad.length === 0 && keys.length >= 23, bad.map(k => `${k}: page ${ev[k]} engine ${exp[k]}`).join('; '));
  const dup = await page.evaluate(() => { const m = {}; document.querySelectorAll('[data-ev]').forEach(n => { const k = n.getAttribute('data-ev'); (m[k] = m[k] || new Set()).add(n.textContent.trim()); }); return Object.entries(m).filter(([, v]) => v.size > 1).map(([k]) => k); });
  check('a number quoted twice on the page (in a card and in its Limit line) is the same text both times', dup.length === 0, dup.join(' '));
  const tc = await page.evaluate(() => ({ total: document.querySelector('[data-tc=total]').textContent, suites: document.querySelector('[data-tc=suites]').textContent }));
  check(`the test count is READ from data/test-counts.js (generated by tools/update-counts.mjs): ${TC.total.toLocaleString('en-US')} checks across ${TC.suites ? (Array.isArray(TC.suites) ? TC.suites.length : TC.suites) : '?'} suites`, tc.total === TC.total.toLocaleString('en-US') && /MEASURED/.test(HTML.slice(HTML.indexOf('data-tc="total"') - 400, HTML.indexOf('data-tc="total"'))), JSON.stringify(tc));
  check('no stale count survives from the old page ("212 checks", "1,326 checks"…)', !/\b212 (checks|فحص)|1,326 checks/.test(TEXT));
  // facts from the data files, counted here independently of the page
  const c = { hosp: 0, fire: 0, ed: 0 }; FAC.forEach(f => { if (f.kind === 'hospital') c.hosp++; else if (f.kind === 'fire') c.fire++; if (f.ed === 'yes') c.ed++; });
  const G = RDS.decode(); let km = 0; for (let e = 0; e < G.e; e++) km += G.eLen[e];
  const nat = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-nat]')].map(n => [n.getAttribute('data-nat'), n.textContent.trim().replace(/,/g, '')])));
  const want = { munis: GEO.municipalities.length, places: GEO.places.length, fac: FAC.length, hosp: c.hosp, fire: c.fire, ed: c.ed, roadkm: Math.round(km / 1000), snapshot: GEO.meta.snapshotDate, osmts: GEO.meta.osmBaseTimestamp };
  const nb = Object.keys(want).filter(k => String(want[k]) !== nat[k]);
  check(`Qatar-wide facts equal the data files: ${want.munis} municipalities, ${want.fac} facilities (${want.hosp} hospitals, ${want.fire} fire stations, ${want.ed} EDs), ${want.places} places, ${want.roadkm} km of roads, snapshot ${want.snapshot}`, nb.length === 0 && want.munis === 8 && want.snapshot === '2026-10-08', nb.map(k => `${k}: page ${nat[k]} data ${want[k]}`).join('; '));
  const rows = await page.evaluate(() => [...document.querySelectorAll('#qd-table tbody tr')].map(r => [...r.children].map(c => c.textContent.trim())));
  const byM = id => ({ hosp: FAC.filter(f => f.muni === id && (f.kind === 'hospital' || f.kind === 'clinic-ed')).length, police: FAC.filter(f => f.muni === id && f.kind === 'police').length, fire: FAC.filter(f => f.muni === id && f.kind === 'fire').length });
  check('the municipality table lists all 8 municipalities with their area (km², rounded) and their hospital / police / fire counts, recounted here from the data', rows.length === GEO.municipalities.length && rows.every((r, i) => { const m = GEO.municipalities[i], c = byM(m.id); return r[1].replace(/,/g, '') === String(Math.round(m.areaKm2)) && +r[2] === c.hosp && +r[3] === c.police && +r[4] === c.fire; }), JSON.stringify(rows.slice(0, 3)));
  // the ETAs drawn in the hero story are the engine's plan for the same scenario (fire in Doha, seed 7, 07:30, quiet fleet)
  const run = N.create({ seed: 7, date: '2026-07-12', hour: 7.5, autoApprove: false, params: { unitBusyPct: 0, ...QUIET } });
  const inc = N.createIncident(run, { hazard: 'fire', lon: 51.5264, lat: 25.2856, severity: 2, trigger: 'sentinel' });
  const mmss = s => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
  const plan = Object.fromEntries(inc.plan.units.map(u => [u.kind, mmss(u.etaSec)]));
  const story = await page.evaluate(() => [...document.querySelectorAll('#cam-story .st-route')].map(r => r.classList[1]).concat('|', [...document.querySelectorAll('#cam-story .st-eta')].map(t => t.textContent)));
  const i = story.indexOf('|'), kinds = story.slice(0, i), etas = story.slice(i + 1);
  check(`the ETAs drawn in the hero story (${kinds.map((k, j) => k + ' ' + etas[j]).join(', ')}) are the engine's plan for that fire (${Object.entries(plan).map(e => e.join(' ')).join(', ')})`, kinds.length === 3 && kinds.every((k, j) => plan[k] === etas[j]), JSON.stringify(plan));
  await ctx.close();
  { // Decoy Lab in detect.html
    const d = await still({ lang: 'en' }); const dp = d.page;
    await dp.goto(url('detect.html'), { waitUntil: 'load' });
    await dp.click('#t-decoy');
    await dp.waitForFunction(() => window.__decoyDone === true, null, { timeout: 120000 });
    const kp = await dp.evaluate(() => [...document.querySelectorAll('.kpi')].map(k => k.innerText.replace(/\s+/g, ' ')));
    const f = s => (/(\d+)\/(\d+)/.exec(s || '') || []).slice(1, 3).join(' / ');
    const full = kp.find(k => /detection \(full stack\)/.test(k)), fa = kp.find(k => /false alarms \(full stack\)/.test(k)), col = kp.find(k => /false alarms \(colour only\)/.test(k));
    const pg = await openPage(browser, 'index.html', { lang: 'en' }); await ready(pg.page);
    const dl = await pg.page.evaluate(() => Object.fromEntries(['dl.col', 'dl.full', 'dl.det'].map(k => [k, document.querySelector(`[data-ev="${k}"]`).textContent.trim()])));
    check(`the Decoy Lab (detect.html) says false alarms colour-only ${f(col)}, full stack ${f(fa)}, detection ${f(full)}; the landing page quotes exactly those (${JSON.stringify(dl)})`, !!full && !!fa && !!col && dl['dl.col'] === f(col) && dl['dl.full'] === f(fa) && dl['dl.det'] === f(full), JSON.stringify(kp.slice(0, 6)));
    await d.ctx.close(); await pg.ctx.close();
  }
}

/* ============================================================================================ 3. structure */
if (on(3)) {
  section('3. Structure: sections, pipeline links, every link resolves, AR/EN twins, placeholders');
  const { ctx, page } = await still({ lang: 'ar', width: 1440 }); await ready(page);
  const secs = await page.evaluate(() => [...document.querySelectorAll('main > section')].map(s => s.id));
  check('the story is in order: hero, why, how (pipeline), control room, robot, all hazards, all of Qatar, numbers, trust, criteria, team, closing, credits', JSON.stringify(secs.slice(0, 12)) === JSON.stringify(['top', 'why', 'how', 'room', 'robot', 'hazards', 'qatar', 'numbers', 'trust', 'criteria', 'team', secs[11]]) && secs[secs.length - 1] === 'credits', secs.join(' '));
  const steps = await page.evaluate(() => [...document.querySelectorAll('#flow .step')].map(s => [s.querySelector('a') && s.querySelector('a').getAttribute('href'), s.querySelector('h3') && s.querySelector('h3').textContent.trim().length > 0]));
  check('the pipeline has six steps (sense, prove, reach, guide, count, hand off) and their links reach build, control room, detect, the all-Qatar demo, mission, alert, robot and the demo story', steps.length === 6 && steps.every(s => s[1]) && steps.flatMap(s => s[0]).filter(Boolean).length >= 6, JSON.stringify(steps));
  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('main a[href], footer a[href], .nav a[href], .subnav a[href]')].map(a => a.getAttribute('href')))]);
  const bad = [], dynamic = new Set(['control.html#demo', 'detect.html#fool']);     // hash routes handled by the target page's own script
  for (const h of hrefs) {
    if (/^https?:|^mailto:/.test(h)) continue;
    const [file, hash] = h.split('#'), f = file || 'index.html';
    if (!fs.existsSync(path.join(SITE, f))) { bad.push(h + ' (no such file)'); continue; }
    if (hash && !dynamic.has(h) && !/^scenario=/.test(hash)) { const src = fs.readFileSync(path.join(SITE, f), 'utf8'); if (!new RegExp(`id=["']${hash}["']`).test(src)) bad.push(h + ' (no such id)'); }
  }
  check(`all ${hrefs.length} internal links resolve to a real file and, where static, a real id (control.html#demo and detect.html#fool are routed by their own scripts)`, bad.length === 0, bad.join(' | '));
  check('the page links to the two new pages: control.html (Control Room) and robot.html (Rescue Robot), from the hero, the pipeline and the sections', ['control.html#demo', 'robot.html'].every(h => hrefs.includes(h)) && (HTML.match(/href="control\.html/g) || []).length >= 3 && (HTML.match(/href="robot\.html/g) || []).length >= 3);
  const par = await page.evaluate(() => { const bad = []; document.querySelectorAll('main [data-l], footer [data-l]').forEach(el => { const other = el.getAttribute('data-l') === 'ar' ? 'en' : 'ar', p = el.parentElement; if (![...p.children].some(c => c !== el && c.getAttribute('data-l') === other)) bad.push((p.className || p.tagName) + ': ' + el.textContent.trim().slice(0, 30)); }); return bad.slice(0, 6); });
  check('every data-l="ar" has its data-l="en" twin in the same parent (and the other way round)', par.length === 0, par.join(' | '));
  const sig = await page.evaluate(() => { const num = t => (t.match(/\d[\d,.]*/g) || []).map(x => x.replace(/,/g, '')).filter(x => +x >= 10 && x !== '100').sort().join(' '); const bad = []; const pairs = new Map(); document.querySelectorAll('main [data-l]').forEach(e => { const p = e.parentElement; if (!pairs.has(p)) pairs.set(p, { ar: [], en: [] }); pairs.get(p)[e.getAttribute('data-l')].push(e); }); pairs.forEach(g => g.ar.forEach((a, i) => { const b = g.en[i]; if (b && num(a.textContent) !== num(b.textContent)) bad.push(num(a.textContent) + ' ≠ ' + num(b.textContent)); })); return bad.slice(0, 5); });
  check('the significant numbers in each Arabic block equal those in its English twin (“100 m” is written «مئة متر» in Arabic)', sig.length === 0, sig.join(' | '));
  const phs = await page.evaluate(() => ({ list: [...document.querySelectorAll('#ph-list .ph')].map(n => n.textContent), status: document.querySelector('#ph-status').textContent, inline: [...new Set([...document.querySelectorAll('.ph[data-ph]')].map(n => n.getAttribute('data-ph')))] }));
  const want = ['STUDENT_NAME', 'SCHOOL_NAME', 'GRADE_CLASS', 'MENTOR_NAME', 'COORDINATOR_NAME', 'SUBMISSION_DATE', 'ETHICS_APPROVAL_REF', 'NATIVE_REVIEWERS', 'BUILT_BY_STUDENT', 'BOUGHT_OR_REUSED', 'HELPED_BY', 'AI_TOOLS_USED'];
  check(`the team placeholders are listed once each in {{…}} form (${want.length}: ${want.join(' ')}) and the status line counts them`, JSON.stringify(phs.list) === JSON.stringify(want.map(w => `{{${w}}}`)) && want.every(w => phs.inline.includes(w)) && /12/.test(phs.status), JSON.stringify(phs));
  const nav = await page.evaluate(() => [...document.querySelectorAll('.subnav a')].map(a => a.getAttribute('href')));
  check('the sub-navigation links only to sections that exist', nav.length >= 8 && nav.every(h => secs.includes(h.slice(1))), nav.join(' '));
  check('credits: OpenStreetMap contributors (ODbL 1.0), the snapshot date and "concept + simulated prototype" are visible in both languages', await page.evaluate(() => { const c = document.querySelector('#credits').textContent; return /OpenStreetMap/.test(c) && /ODbL/.test(c) && /2026-10-08/.test(c) && /مفهوم/.test(c) && /simulated prototype/.test(c); }));
  check('the competition criteria table names the ISEF-style categories and a three-minute path for the judges', await page.evaluate(() => document.querySelectorAll('#crit-table tbody tr').length >= 5 && /Three minutes for a judge/.test(document.querySelector('#criteria').textContent)));
  await ctx.close();
}

/* ============================================================================================ 4. loads clean */
const BOX_AUDIT = () => {
  const bad = [];
  document.querySelectorAll('body *').forEach(el => {
    if (/^(svg|canvas|path|g|circle|rect|line|polyline|polygon|ellipse|text|use|defs|tspan|option|select|input|br|wbr|stop|lineargradient|radialgradient)$/i.test(el.tagName) || el.closest('svg,[hidden],.sr-only,.subnav-row,.table-wrap,.scroll-x,[aria-hidden="true"]') || el.matches('.hero,.con-map,.step')) return;   // .hero and .con-map clip their decorative beam / radar sweep on purpose; a .step draws its connector chevron in the gap between the cards
    const cs = getComputedStyle(el); if (['none', 'inline', 'contents'].includes(cs.display) || !el.getBoundingClientRect().width || ['auto', 'scroll'].includes(cs.overflowX)) return;
    if (el.scrollWidth > el.clientWidth + 1) bad.push(((typeof el.className === 'string' && el.className) || el.tagName).split(' ').slice(0, 2).join('.') + ` ${el.scrollWidth}>${el.clientWidth}`);
  });
  return bad.slice(0, 6);
};
if (on(4)) {
  section('4. Loads clean: no console error, no failed request, no horizontal overflow, no box that clips');
  const fails = [], over = []; let n = 0;
  for (const w of [360, 390, 820, 1440]) for (const theme of ['dark', 'light']) for (const lang of ['ar', 'en']) {
    const { ctx, page, errors } = await still({ width: w, height: w < 600 ? 844 : 900, theme, lang }); n++;
    await ready(page); await sleep(200);
    const o = await overflow(page);
    if (errors.length) fails.push(`${w}/${theme}/${lang}: ${errors.join(' | ')}`);
    if (o.scrollW > o.W || o.bad.length) over.push(`${w}/${theme}/${lang}: scrollW ${o.scrollW} > ${o.W} ${o.bad.join(',')}`);
    const b = await page.evaluate(BOX_AUDIT); if (b.length) over.push(`${w}/${theme}/${lang}: ${b.join(', ')}`);
    await ctx.close();
  }
  check(`no console error or failed request, home.js and home-map.js ready: ${n} combinations (360, 390, 820, 1440 × dark/light × ar/en)`, fails.length === 0, fails.slice(0, 3).join(' || '));
  check('no horizontal page scroll, no element past the viewport edge, no box that silently clips wider content, at every width', over.length === 0, over.slice(0, 4).join(' || '));
  const { ctx, page } = await still({ lang: 'ar' }); await ready(page);
  const ar = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, title: document.title, h1: document.querySelector('h1').innerText.trim() }));
  check('Arabic is the default: dir=rtl lang=ar, Arabic title, the h1 is «منارة»', ar.dir === 'rtl' && ar.lang === 'ar' && /منارة/.test(ar.title) && /منارة/.test(ar.h1), JSON.stringify(ar));
  const lsp = await page.evaluate(() => { const bad = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const t = w.currentNode, el = t.parentElement; if (!el || !/[؀-ۿ]/.test(t.nodeValue) || !el.getBoundingClientRect().width) continue; const v = getComputedStyle(el).letterSpacing; if (v !== 'normal' && parseFloat(v) !== 0) bad.push(el.className + ' ' + v); } return bad.slice(0, 4); });
  check('no letter-spacing on any Arabic text', lsp.length === 0, lsp.join(' | '));
  await page.evaluate(() => Manara.setLang('en')); await sleep(250);
  const en = await page.evaluate(() => ({ dir: document.documentElement.dir, title: document.title, cap: document.querySelector('#cam-cap').textContent, state: document.querySelector('#cam-state').textContent, h1: document.querySelector('h1').innerText.trim(), arVis: [...document.querySelectorAll('main [data-l=ar]')].filter(e => e.getBoundingClientRect().width > 0).length, tag: (document.querySelector('.brand small') || {}).textContent }));
  check('switching to English flips to ltr and re-renders the title, the camera caption, the state chip and the nav tagline; no Arabic block stays visible', en.dir === 'ltr' && /^MANARA/.test(en.title) && /[A-Za-z]{4}/.test(en.cap) && /[A-Z]{4}/.test(en.state) && /MANARA/.test(en.h1) && en.arVis === 0 && /No one is left behind/.test(en.tag || ''), JSON.stringify(en));
  await page.evaluate(() => Manara.theme.set('light')); await sleep(150);
  check('theme switch sets data-theme; the camera stage stays dark (a monitor) and the page goes light', await page.evaluate(() => document.documentElement.dataset.theme === 'light' && getComputedStyle(document.querySelector('#cam')).colorScheme === 'dark' && getComputedStyle(document.body).backgroundColor !== getComputedStyle(document.querySelector('#cam')).backgroundColor));
  await ctx.close();
}

/* ============================================================================================ 5. hero */
if (on(5)) {
  section('5. Hero: the drone camera, the 20 s story, the six-step strip');
  { // reduced motion: a meaningful still frame
    const { ctx, page, errors } = await still({ lang: 'en', width: 1440 }); await ready(page); await sleep(400);
    const a = await page.evaluate(() => { const c = ManaraHome.core.cam.state(), q = s => document.querySelector(s); return { playing: c.playing, t: c.t, view: c.view, k1: q('#cam-k1').dataset.on, k2: q('#cam-k2').dataset.on, alert: q('#cam-alert').dataset.on, s: q('#cam-state').dataset.s, steps: [...document.querySelectorAll('#cam-steps li')].map(l => l.dataset.st).join(','), btn: q('#cam-play').getAttribute('aria-pressed'), ink: (() => { const cv = q('#cam-rgb'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 40) n++; return n; })(), th: (() => { const cv = q('#cam-th'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 53) if (d[i] + d[i + 1] + d[i + 2] > 40) n++; return n; })(), clock: q('#cam-clock').textContent }; });
    check('reduced motion: the camera shows ONE meaningful still frame (both keys lit, the alert sent to the control room, the detector boxes drawn, thermal picture-in-picture), paused, with the play button saying so', !a.playing && a.view === 'cam' && a.k1 === '1' && a.k2 === '1' && a.alert === '1' && a.s === 'sent' && a.btn === 'false' && a.ink > 100 && a.th > 30, JSON.stringify(a));
    await sleep(900); const b = await page.evaluate(() => ManaraHome.core.cam.state().t);
    check('reduced motion: the frame does not move (the story clock stays put)', b === a.t, `${a.t} → ${b}`);
    check('reduced motion: the six-step strip marks "sense" done and "prove" as now', a.steps.startsWith('done,now,'), a.steps);
    check('the hero loads with no console error', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // the loop
    const { ctx, page, errors } = await motion({ lang: 'en', width: 1440 }); await ready(page); await sleep(500);
    const snap = () => page.evaluate(() => { const c = ManaraHome.core.cam.state(), q = s => document.querySelector(s); return { t: c.t, playing: c.playing, view: c.view, k1: q('#cam-k1').dataset.on, k2: q('#cam-k2').dataset.on, alert: q('#cam-alert').dataset.on, s: q('#cam-state').dataset.s, steps: [...document.querySelectorAll('#cam-steps li')].map(l => l.dataset.st[0]).join(''), cap: q('#cam-cap').textContent, pip: q('#cam').dataset.pip }; });
    const t0 = (await snap()).t; await sleep(900); const t1 = (await snap()).t;
    check(`motion on: the story plays by itself (clock ${t0.toFixed(1)} → ${t1.toFixed(1)} s)`, t1 - t0 > 0.5);
    const T = await page.evaluate(() => ManaraHome.core.cam.C ? ManaraHome.core.cam.C.times : ManaraHome.core.cam.times);
    check('the story is one 12–20 s loop (the brief asks 12–20 s)', T.LOOP >= 12 && T.LOOP <= 20, JSON.stringify(T));
    const at = async t => { await page.evaluate(t => ManaraHome.core.cam.seek(t), t); await sleep(120); return snap(); };
    const s1 = await at(1), s3 = await at(3), s4 = await at(4), s5 = await at(5.5), s7 = await at(7.8), s11 = await at(11.8), s14 = await at(14.8), s18 = await at(18.2);
    check('0–2 s PATROL: the drone watches, no key, no alert, camera view, strip at "sense"', s1.s === 'watch' && s1.view === 'cam' && s1.k1 === '0' && s1.k2 === '0' && s1.alert === '0' && s1.steps[0] === 'n', JSON.stringify(s1));
    check('smoke and flames enter: SUSPECT with ONE key (one key never raises a public alert), thermal picture-in-picture appears', s3.s === 'suspect' && s3.pip === '1' && (+s3.k1 + +s3.k2) === 1, JSON.stringify(s3));
    check('then CONFIRMED with two independent keys, then SENT to the control room (alert card)', s4.s === 'confirmed' && s4.k1 === '1' && s4.k2 === '1' && s4.alert === '0' && s5.s === 'sent' && s5.alert === '1', JSON.stringify([s4, s5]));
    check('Approve → the MAP view: routes drawn from the stations, "fastest rolls" (SIM), strip at "reach"', s7.view === 'map' && s7.s === 'route' && s7.steps.startsWith('ddn'), JSON.stringify(s7));
    check('the last 100 m: building view, the drone guides people out, strip at "guide"', s11.view === 'bld' && s11.s === 'guide' && s11.steps.startsWith('dddn'), JSON.stringify(s11));
    check('the robot counts: building view, "robot counts" (SIM), strip at "count"', s14.view === 'bld' && s14.s === 'count' && s14.steps.startsWith('ddddn'), JSON.stringify(s14));
    check('hand-off: the verified card goes to the rescue lead, strip at "hand off", the last step', s18.view === 'bld' && s18.s === 'done' && s18.steps === 'dddddn', JSON.stringify(s18));
    check('every phase has its own caption in English (nine different sentences)', new Set([s1, s3, s4, s5, s7, s11, s14, s18].map(s => s.cap)).size >= 7);
    const story = await page.evaluate(() => { const g = id => document.querySelector(id); return { routes: [...document.querySelectorAll('#cam-story .st-route')].map(r => [r.getAttribute('stroke-dasharray'), r.getAttribute('stroke-dashoffset')]), counter: [...document.querySelectorAll('#cam-story .st-count')].map(t => t.textContent), cards: document.querySelectorAll('#cam-story .st-cardg').length }; });
    await at(6.5); const d0 = await page.evaluate(() => [...document.querySelectorAll('#cam-story .st-route')].map(r => +r.getAttribute('stroke-dashoffset')));
    await at(7.6); const dm = await page.evaluate(() => [...document.querySelectorAll('#cam-story .st-route')].map(r => +r.getAttribute('stroke-dashoffset')));
    await at(9.2); const d1 = await page.evaluate(() => [...document.querySelectorAll('#cam-story .st-route')].map(r => +r.getAttribute('stroke-dashoffset')));
    check('the three routes DRAW themselves in turn (stroke-dashoffset runs from the full length, through a partial draw, to 0 as the units are sent)', d0.every(v => v > 5) && dm.some(v => v > 1 && v < d0[dm.indexOf(v)]) && d1.every(v => v < 1) && story.routes.length === 3, JSON.stringify([d0, dm, d1]));
    await at(15.6); const cnt = await page.evaluate(() => document.querySelector('#cam-story .st-count').textContent);
    check('the people counter counts up against the register ("n / total")', /^\d+ \/ \d+$/.test(cnt.trim()), cnt);
    // controls
    await page.click('#cam-restart'); await sleep(300); await page.click('#cam-play'); await sleep(100); const pa = await snap(); await sleep(500); const pb = await snap();
    check('the pause button stops the story and says so (aria-pressed=false, a play icon)', !pa.playing && Math.abs(pb.t - pa.t) < 0.02 && await page.evaluate(() => document.querySelector('#cam-play').getAttribute('aria-pressed') === 'false'));
    await page.click('#cam-play'); await sleep(300); check('the same button plays it again', (await snap()).playing);
    await page.click('#cam-restart'); await sleep(150); const rs = await snap(); check('restart returns to the patrol at t≈0 with the keys off', rs.t < 0.6 && rs.s === 'watch' && rs.k1 === '0' && rs.view === 'cam', JSON.stringify(rs));
    // language and theme redraw
    await page.evaluate(() => { ManaraHome.core.cam.seek(5.5); Manara.setLang('ar'); }); await sleep(250);
    const ar = await page.evaluate(() => ({ cap: document.querySelector('#cam-cap').textContent, state: document.querySelector('#cam-state').textContent, ghosts: document.querySelectorAll('#cam-capw .cam-cap.ghost').length }));
    check('switching language re-renders the caption, the state chip and the invisible caption sizer (9 ghosts) in Arabic', /[؀-ۿ]{4}/.test(ar.cap) && /[؀-ۿ]{3}/.test(ar.state) && ar.ghosts === 9, JSON.stringify(ar));
    const px = () => page.evaluate(() => { const cv = document.querySelector('#cam-rgb'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0; for (let i = 0; i < d.length; i += 4 * 61) s += d[i] + d[i + 1] * 3 + d[i + 2]; return s; });
    check('the camera canvas is painted (not blank) and the story layer exists', await px() > 1000 && await page.evaluate(() => !!document.querySelector('#cam-story g')));
    check('the hero runs with no console error through the whole story', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // the caption box never changes size (the cause of layout shift in an earlier draft)
    const out = [];
    for (const w of [360, 390, 820, 1440]) for (const lang of ['ar', 'en']) {
      const { ctx, page } = await motion({ width: w, height: 900, lang }); await ready(page);
      const hs = await page.evaluate(async () => { const c = ManaraHome.core.cam, set = new Set(); for (let t = 0; t <= 19.5; t += 1.3) { c.seek(t); await new Promise(r => setTimeout(r, 30)); set.add(Math.round(document.querySelector('.hero').getBoundingClientRect().height)); } return [...set]; });
      if (hs.length !== 1) out.push(`${w}/${lang}: ${hs.join(',')}`);
      await ctx.close();
    }
    check('the hero is exactly as tall in every phase of the story (the captions are stacked in one grid cell): 360, 390, 820, 1440 × ar/en', out.length === 0, out.join(' | '));
  }
}

/* ============================================================================================ 6. motion */
if (on(6)) {
  section('6. MOTION: reduced motion, pausing, pipeline lighting, count-up, reveals, flashing, errors, overflow');
  { // reduced motion: nothing loops, everything is a still frame, numbers are final
    const { ctx, page, errors } = await still({ lang: 'en', width: 1440 }); await ready(page);
    const before = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ev],[data-tc],[data-nat]')].map((n, i) => [i, n.textContent])));
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += 600) { await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y); await sleep(70); }
    await sleep(900);
    const r = await page.evaluate(() => {
      const anims = document.getAnimations().filter(a => a instanceof CSSAnimation);
      const H = ManaraHome, st = { cam: H.core.cam.state().t, rob: H.core.rob.player && H.core.rob.player.t, con: H.map.con.player && H.map.con.player.t, qd: H.map.qd.state && H.map.qd.state().playing };
      return { running: anims.filter(a => a.playState === 'running').length, infinite: anims.filter(a => a.effect && a.effect.getComputedTiming().iterations === Infinity).length,
        players: { cam: H.core.cam.player.playing, rob: H.core.rob.player && H.core.rob.player.playing, con: H.map.con.player && H.map.con.player.playing, qd: !!(H.map.qd.state() && H.map.qd.state().playing) }, st,
        lit: [...document.querySelectorAll('#flow .step')].map(s => s.getAttribute('data-lit')).join(''), fr: getComputedStyle(document.querySelector('#flow-rail')).getPropertyValue('--fr'),
        rv: [...document.querySelectorAll('.rv')].every(e => getComputedStyle(e).opacity === '1'), hero: getComputedStyle(document.querySelector('.hero-slogan')).animationName, py: document.querySelector('.hero-bg').style.getPropertyValue('--py'), enter: document.querySelectorAll('.alert.enter').length,
        sheen: getComputedStyle(document.querySelector('.btn-primary'), '::after').display };
    });
    check(`reduced motion: no CSS animation is running anywhere on the page, not even a one-shot (${r.running} running, ${r.infinite} infinite)`, r.running === 0 && r.infinite === 0, JSON.stringify(r));
    check('reduced motion: the camera, the control-room miniature, the robot and the Qatar-wide demo are all paused on a still frame', !r.players.cam && !r.players.rob && !r.players.con && !r.players.qd, JSON.stringify(r.players));
    await sleep(800);
    const r2 = await page.evaluate(() => { const H = ManaraHome; return { cam: H.core.cam.state().t, rob: H.core.rob.player.t, con: H.map.con.player.t }; });
    check('reduced motion: the story clocks do not move over time (camera, robot, control room)', r2.cam === r.st.cam && r2.rob === r.st.rob && r2.con === r.st.con, JSON.stringify([r.st, r2]));
    check('reduced motion: the pipeline is fully lit at once (6 steps, rail 100 %), reveals are visible, no entrance animation, no parallax, no sheen', r.lit === '111111' && +r.fr === 1 && r.rv && r.hero === 'none' && r.py === '' && r.enter === 0, JSON.stringify(r));
    const after = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-ev],[data-tc],[data-nat]')].map((n, i) => [i, n.textContent])));
    check('reduced motion: counters show their final values (the text written in the HTML or read from the data) with no counting', JSON.stringify(before) === JSON.stringify(after));
    const stillCards = await page.evaluate(() => ({ hz: [...document.querySelectorAll('.hz-res')].filter(n => n.textContent.trim().length > 10).length, robot: document.querySelector('#rob-count') && document.querySelector('#rob-count').textContent.trim().length, qdCap: document.querySelector('#qd-cap').textContent.trim().length, conCap: document.querySelector('#con-cap').textContent.trim().length }));
    check('reduced motion: the still frames carry meaning (six hazard verdicts, the robot count, the Qatar-wide caption, the console caption)', stillCards.hz === 6 && stillCards.robot > 0 && stillCards.qdCap > 20 && stillCards.conCap > 20, JSON.stringify(stillCards));
    check('reduced motion: no console error while the whole page is scrolled through', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // pausing off-screen and in a hidden tab (motion ON)
    const { ctx, page, errors } = await motion({ lang: 'en', width: 1440 }); await ready(page); await sleep(400);
    const tt = () => page.evaluate(() => { const H = ManaraHome; return { cam: H.core.cam.state().t, con: H.map.con.player ? H.map.con.player.t : -1, rob: H.core.rob.player ? H.core.rob.player.t : -1, qd: H.map.qd.state() ? H.map.qd.state().simT : -1 }; });
    const live = () => page.evaluate(() => [...document.querySelectorAll('main > section')].map(s => s.id + ':' + s.getAttribute('data-live')).join(' '));
    const running = () => page.evaluate(() => document.getAnimations().filter(a => a instanceof CSSAnimation && a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations === Infinity).map(a => (a.effect.target.className || a.effect.target.tagName) + ''));
    const a0 = await tt(); await sleep(900); const a1 = await tt();
    check(`on screen the hero story runs (${a0.cam.toFixed(1)} → ${a1.cam.toFixed(1)} s) and so does the backdrop beam`, a1.cam - a0.cam > 0.5 && (await running()).some(c => /beam/.test(c)));
    await go(page, '#credits'); await sleep(900); const b0 = await tt(); await sleep(900); const b1 = await tt();
    check('scrolled away (down at the credits): the hero story, the console, the robot and the Qatar demo stand still (clocks unchanged over 0.9 s)', Math.abs(b1.cam - b0.cam) < 0.02 && Math.abs(b1.con - b0.con) < 0.02 && Math.abs(b1.rob - b0.rob) < 0.02 && Math.abs(b1.qd - b0.qd) < 0.01, JSON.stringify([b0, b1]));
    const lv = await live(); const run2 = await running();
    check('off-screen sections are marked data-live="0" and none of their CSS loops is running (the beam and the radar are paused)', /top:0/.test(lv) && /room:0/.test(lv) && !run2.some(c => /beam|con-radar/.test(c)), lv + ' | ' + run2.join(','));
    await go(page, '#room'); await sleep(2200); const c0 = await tt(); await sleep(1200); const c1 = await tt(); const run3 = await running();
    check(`at the control-room miniature: it plays (${c0.con.toFixed(1)} → ${c1.con.toFixed(1)} s), the radar sweep runs, the hero (off-screen now) does not`, c1.con - c0.con > 0.6 && run3.some(c => /con-radar/.test(c)) && !run3.some(c => /beam/.test(c)) && Math.abs(c1.cam - b1.cam) < 0.05, JSON.stringify([b1, c0, c1, run3]));
    await go(page, '#robot'); await sleep(2000); const d0 = await tt(); await sleep(900); const d1 = await tt();
    check(`at the robot: it plays (${d0.rob.toFixed(1)} → ${d1.rob.toFixed(1)} s) and the console we just left stands still`, d1.rob - d0.rob > 0.4 && Math.abs(d1.con - d0.con) < 0.02, JSON.stringify([c1, d0, d1]));
    await go(page, '#top'); await sleep(900);
    const e0 = await tt(); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(900);
    const e1 = await tt(), tab = await page.evaluate(() => document.documentElement.hasAttribute('data-tab-hidden')), run4 = await running();
    check('a hidden tab freezes everything: the story clock stops, html[data-tab-hidden] is set and no CSS loop runs', tab && Math.abs(e1.cam - e0.cam) < 0.2 && run4.length === 0, JSON.stringify([e0, e1, run4]));
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(900);
    const e2 = await tt(); check('and everything resumes when the tab is shown again', e2.cam - e1.cam > 0.4 && !(await page.evaluate(() => document.documentElement.hasAttribute('data-tab-hidden'))), JSON.stringify([e1, e2]));
    const loops = await page.evaluate(() => document.getAnimations().filter(a => a instanceof CSSAnimation && a.effect && a.effect.getComputedTiming().iterations === Infinity).map(a => +a.effect.getComputedTiming().duration));
    check(`no loop flashes faster than 3 times a second: ${loops.length} looping CSS animations, the shortest ${Math.min(...loops, 1e9)} ms per cycle (≥ 400)`, loops.every(d => d >= 400));
    check('no console error while the sections are scrolled through and the tab is hidden and shown', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // the pipeline lights up in sequence; numbers count; reveals stagger; hover; the alert card slides in
    const { ctx, page } = await motion({ lang: 'en', width: 1440 }); await ready(page); await sleep(300);
    const lit0 = await page.evaluate(() => [...document.querySelectorAll('#flow .step')].map(s => s.getAttribute('data-lit')).join(''));
    await go(page, '#flow'); const seq = [];
    for (let i = 0; i < 40; i++) { seq.push(await page.evaluate(() => [...document.querySelectorAll('#flow .step')].filter(s => s.getAttribute('data-lit') === '1').length)); await sleep(100); }
    const prefix = await page.evaluate(() => { const l = [...document.querySelectorAll('#flow .step')].map(s => s.getAttribute('data-lit')); return l.join('').replace(/1+0*$/, '') === ''; });
    const fr = await page.evaluate(() => +getComputedStyle(document.querySelector('#flow-rail')).getPropertyValue('--fr'));
    const rail = await page.evaluate(() => [...document.querySelectorAll('#flow-rail .fr-d.on')].length);
    check(`the six pipeline steps are dark until scrolled to, then light up ONE AFTER ANOTHER (samples ${[...new Set(seq)].join('→')}) and the rail grows to 100 % (${fr})`, lit0 === '000000' && seq[seq.length - 1] === 6 && new Set(seq).size >= 4 && seq.every((v, i) => !i || v >= seq[i - 1]) && prefix && fr === 1 && rail === 6, `${lit0} ${seq.join(',')}`);
    const stag = await page.evaluate(() => [...document.querySelector('#nums').children].map(c => c.style.getPropertyValue('--d')));
    check('cards in a group are revealed with a stagger (each child has a longer transition delay than the one before, up to a cap)', stag.length >= 10 && stag.every((d, i) => !i || parseFloat(d) >= parseFloat(stag[i - 1])) && parseFloat(stag[3]) > parseFloat(stag[0]), stag.join(' '));
    // reveal: the cards are hidden below the fold, shown when scrolled to
    const hid = await page.evaluate(() => { const n = document.querySelector('#nums .num-card:last-child'); return [n.classList.contains('in'), getComputedStyle(n).opacity]; });
    check('a reveal below the fold starts hidden (opacity 0, no .in class) while the user is at the pipeline', hid[0] === false && +hid[1] < 0.5, JSON.stringify(hid));
    // count-up
    const finals = await page.evaluate(() => [...document.querySelectorAll('#nums .num-big [data-ev]')].slice(0, 3).map(n => n.textContent));
    await go(page, '#numbers'); await page.evaluate(() => document.querySelector('#nums .num-card').scrollIntoView({ block: 'center', behavior: 'instant' }));
    const samples = [];
    for (let i = 0; i < 40; i++) { samples.push(await page.evaluate(() => document.querySelector('#nums .num-card:nth-child(2) .num-big [data-ev]').textContent)); await sleep(50); }
    const first = finals[0];
    check(`a number counts up when it scrolls into view and ends on the written value (${[...new Set(samples)].slice(0, 5).join(', ')} … ${samples[samples.length - 1]} ; HTML says ${first})`, new Set(samples).size >= 3 && samples[samples.length - 1] === first, JSON.stringify(finals));
    const cw = await page.evaluate(() => { const n = document.querySelector('#nums .num-big [data-count]'); return n ? getComputedStyle(n).display : 'none'; });
    check('counters reserve their final width (inline-block), so counting never shifts the layout', cw === 'inline-block' || cw === 'none', cw);
    // hover micro-interaction
    await go(page, '#numbers'); await sleep(900);
    const card = page.locator('#nums .num-card').nth(3); await card.scrollIntoViewIfNeeded(); await sleep(900);
    const t0 = await card.evaluate(n => getComputedStyle(n).transform); await card.hover(); await sleep(500); const t1 = await card.evaluate(n => getComputedStyle(n).transform);
    check('hover micro-interaction: a card lifts (its transform changes on hover)', t0 !== t1 && /matrix/.test(t1), `${t0} → ${t1}`);
    // control-room alert card slides in with a flash when the loop restarts
    await go(page, '#room'); await sleep(2500);
    await page.click('#con-restart'); await sleep(250);
    const al = await page.evaluate(() => { const li = document.querySelector('#al-main'); return { enter: li.classList.contains('enter'), anims: document.getAnimations().filter(a => a.effect && li.contains(a.effect.target) || (a.effect && a.effect.target === li)).map(a => a.animationName) }; });
    check('the alert card slides in with a single expanding ring when the control-room story restarts (class .enter, animations slidein + ringout)', al.enter && al.anims.includes('slidein') && al.anims.includes('ringout'), JSON.stringify(al));
    const sweep = await page.evaluate(() => { const r = document.querySelector('.con-radar'); const a = r && r.getAnimations()[0]; return a ? [a.animationName, a.playState, a.effect.getComputedTiming().duration] : null; });
    check('the control-room map has a radar sweep (transform rotate, 8 s per turn, running while visible)', !!sweep && sweep[0] === 'sweep' && sweep[1] === 'running' && sweep[2] >= 4000, JSON.stringify(sweep));
    // parallax on the lighthouse beam
    await go(page, '#top'); await sleep(200); await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' })); await sleep(300);
    const py = await page.evaluate(() => [document.querySelector('.hero-bg').style.getPropertyValue('--py'), document.querySelector('.hero-bg').style.getPropertyValue('--py2'), getComputedStyle(document.querySelector('.hero-bg .grid-bg')).transform]);
    check('parallax: scrolling the hero moves the beam layer and the grid at different speeds (--py ≠ --py2, the grid has a transform)', parseFloat(py[0]) > 0 && parseFloat(py[1]) < 0 && /matrix/.test(py[2]), JSON.stringify(py));
    await ctx.close();
  }
  { // the whole page, motion on, every viewport: no console error, no overflow, no layout shift
    const out = [], shifts = [];
    for (const [w, lang, theme] of [[360, 'ar', 'dark'], [390, 'en', 'light'], [820, 'ar', 'light'], [1440, 'en', 'dark'], [1440, 'ar', 'dark']]) {
      const context = await browser.newContext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600, colorScheme: theme, reducedMotion: 'no-preference' });
      await context.addInitScript(l => { window.__cls = 0; try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { /* ignore */ } try { localStorage.setItem('manara-lang', l); } catch (e) { /* ignore */ } }, lang);
      const { page, errors } = await openPage(browser, 'index.html', { context }); await ready(page);
      const H = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < H; y += 500) { await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y); await sleep(160); }
      await go(page, '#top'); await sleep(1500);
      const o = await overflow(page), cls = await page.evaluate(() => window.__cls);
      if (errors.length) out.push(`${w}/${lang}: ${errors.join(' | ')}`); if (o.scrollW > o.W || o.bad.length) out.push(`${w}/${lang}: overflow ${o.scrollW}>${o.W} ${o.bad.join(',')}`);
      shifts.push(`${w}/${lang}:${cls.toFixed(3)}`); if (cls > 0.02) out.push(`${w}/${lang}: CLS ${cls}`);
      await context.close();
    }
    check(`motion on, the whole page scrolled through at 360 / 390 / 820 / 1440 (ar+en, dark+light): no console error, no overflow, layout shift ≤ 0.02 (${shifts.join(' ')})`, out.length === 0, out.join(' || '));
  }
}

/* ============================================================================================ 7. console + Qatar-wide */
if (on(7)) {
  section('7. The control-room miniature and the Qatar-wide demo (real map data, real engine)');
  { // reduced motion: static but complete
    const { ctx, page, errors } = await still({ lang: 'en', width: 1440 }); await ready(page); await go(page, '#room'); await sleep(900);
    const a = await page.evaluate(() => ({ stage: document.querySelector('#con').dataset.stage, ready: document.querySelector('#con').dataset.ready, alert: document.querySelector('#al-main').dataset.st, units: document.querySelectorAll('#con-units li').length, cap: document.querySelector('#con-cap').textContent, canvas: (() => { const cv = document.querySelector('#con-canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 211) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; })() }));
    check('control-room miniature (reduced motion): a still, confirmed alert on a real OpenStreetMap map, with the feed thumbnails and the fleet', a.ready === '1' && a.stage === '2' && a.alert === 'confirmed' && a.canvas > 30 && a.cap.length > 30, JSON.stringify(a));
    await page.click('#con-approve'); await sleep(500);
    const b = await page.evaluate(() => ({ stage: document.querySelector('#con').dataset.stage, alert: document.querySelector('#al-main').dataset.st, units: [...document.querySelectorAll('#con-units li')].map(l => l.dataset.k + ' ' + l.textContent.replace(/\s+/g, ' ')), cap: document.querySelector('#con-cap').textContent }));
    const document999 = await page.evaluate(() => document.querySelector('#how').textContent + ' ' + document.querySelector('#room').textContent);
    check('Approve in the miniature (a human click): the alert becomes APPROVED, the fastest unit of each type (fire, police, ambulance, rescue) is listed with its ETA (the same 2:48 and 3:21 the hero draws), and the page says 999 stays the dispatcher', b.stage === '4' && b.alert === 'approved' && b.units.length === 4 && /2:48/.test(b.units.join(' ')) && /3:21/.test(b.units.join(' ')) && /6:06/.test(b.units.join(' ')) && /9:43/.test(b.units.join(' ')) && /999/.test(document999), JSON.stringify(b));
    await ctx.close();
  }
  { // the Qatar-wide demo
    const { ctx, page, errors } = await motion({ lang: 'en', width: 1440 }); await ready(page); await go(page, '#qd'); await sleep(2500);
    const q0 = await page.evaluate(() => ({ s: ManaraHome.map.qd.state(), chips: [...document.querySelectorAll('#qd-hz .chip')].map(c => c.dataset.hz) }));
    check('the Qatar-wide demo has a chip for each of the six hazards (fire, gas, flood, dust, heat, SOS)', JSON.stringify(q0.chips) === JSON.stringify(['fire', 'gas', 'flood', 'dust', 'heat', 'sos']), JSON.stringify(q0.chips));
    await sleep(9000);
    const q1 = await page.evaluate(() => ({ s: ManaraHome.map.qd.state(), verdict: document.querySelector('#qd-verdict').textContent, steps: [...document.querySelectorAll('#qd-steps li')].map(l => l.dataset.st[0]).join(''), units: document.querySelectorAll('#qd-units li').length, cvs: (() => { const cv = document.querySelector('#qd-map'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 311) if (d[i] + d[i + 1] + d[i + 2] > 60) n++; return n; })() }));
    check('the demo plays a real engine run on the real map: simulated time advances, the steps move on, the units appear', q1.s.simT > q0.s.simT + 20 && /[dn]/.test(q1.steps) && q1.cvs > 30, JSON.stringify(q1));
    for (const hz of ['gas', 'heat']) { await page.click(`#qd-hz [data-hz=${hz}]`); await sleep(1500); }
    const sw = await page.evaluate(() => ({ hz: ManaraHome.map.qd.state().hz, pressed: [...document.querySelectorAll('#qd-hz .chip')].filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.hz) }));
    check('picking a hazard restarts the demo for that hazard (heat in the Industrial Area at 13:00)', sw.hz === 'heat' && JSON.stringify(sw.pressed) === '["heat"]', JSON.stringify(sw));
    check('the Qatar demo runs with no console error', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // map data really are Qatar: the console map and the demo draw OSM geometry (no tiles, no network)
    const { ctx, page } = await still({ lang: 'en', width: 1440 }); await ready(page);
    const net = []; page.on('request', r => { if (!r.url().startsWith('file:') && !/fonts\./.test(r.url())) net.push(r.url()); });
    await go(page, '#qatar'); await sleep(2500);
    check('no network request leaves the page (maps are drawn from the bundled OSM data; no tiles, no API)', net.length === 0, net.join(' '));
    await ctx.close();
  }
}

/* ============================================================================================ 8. hazards, robot, numbers, team */
if (on(8)) {
  section('8. Hazards, robot, numbers filter, criteria, team placeholders');
  { // hazards
    const { ctx, page, errors } = await still({ lang: 'en', width: 1440 }); await ready(page);
    await go(page, '#hazards'); await page.evaluate(() => document.querySelectorAll('.hz').forEach(h => h.scrollIntoView({ block: 'center', behavior: 'instant' }))); await sleep(2500);
    const hz = await page.evaluate(() => [...document.querySelectorAll('.hz')].map(c => ({ id: c.dataset.hz, res: c.querySelector('.hz-res').textContent.trim().length, ink: (() => { const cv = c.querySelector('canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 40) n++; return n; })() })));
    check('six hazard cards (fire, gas, flood, dust, heat, SOS): each paints a simulated aerial frame and writes what each key saw', hz.length === 6 && hz.every(h => h.res > 20 && h.ink > 100), JSON.stringify(hz));
    const verdict = async () => page.evaluate(() => document.querySelector('.hz[data-hz=heat] .hz-res').textContent.replace(/\s+/g, ' '));
    const v13 = await verdict(); await page.click('.hz[data-hz=heat] [data-hour="2"]'); await sleep(1500); const v02 = await verdict();
    check('the heat / person card is honest about the limit: at 13:00 thermal does not see the person; at 02:00 it does', /✘/.test(v13) && v13 !== v02 && /two keys/.test(v02), `${v13} || ${v02}`);
    await page.click('.hz[data-hz=fire] [data-cam=th]'); await sleep(400);
    check('the camera toggle switches a card from RGB to thermal and is announced through aria-pressed', await page.evaluate(() => document.querySelector('.hz[data-hz=fire] [data-cam=th]').getAttribute('aria-pressed') === 'true' && document.querySelector('.hz[data-hz=fire] [data-cam=rgb]').getAttribute('aria-pressed') === 'false'));
    check('hazard cards run with no console error', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // robot
    const { ctx, page, errors } = await still({ lang: 'en', width: 1440 }); await ready(page); await go(page, '#robot'); await sleep(900);
    const r = await page.evaluate(() => ({ svg: document.querySelectorAll('#rob-svg *').length, scrub: document.querySelector('#rob-scrub').max, limits: document.querySelector('#robot').textContent, link: [...document.querySelectorAll('#robot a')].map(a => a.getAttribute('href')) }));
    check('the robot section draws a scripted three-floor building in SVG with a scrubber, and links to robot.html', r.svg > 60 && +r.scrub > 0 && r.link.some(h => /^robot\.html/.test(h)), JSON.stringify([r.svg, r.scrub, r.link]));
    check('the robot section states its limits: cannot climb stairs when wheeled, hot rooms kill thermal contrast, no robot has been built', /stairs/i.test(r.limits) && /thermal/i.test(r.limits) && /built/i.test(r.limits));
    await page.evaluate(() => { const s = document.querySelector('#rob-scrub'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);
    const c = await page.evaluate(() => document.querySelector('#rob-count').textContent);
    check(`dragging the scrubber to the end shows the finished search ("${c.trim()}")`, /\d/.test(c));
    check('the robot section runs with no console error', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // numbers filter
    const { ctx, page } = await still({ lang: 'en', width: 1440 }); await ready(page); await go(page, '#numbers');
    const cnt = async () => page.evaluate(() => [...document.querySelectorAll('#nums .num-card')].filter(c => getComputedStyle(c).display !== 'none').length);
    const all = await cnt(); await page.click('#num-filter [data-f=measured]'); await sleep(200); const m = await cnt(); await page.click('#num-filter [data-f=sim]'); await sleep(200); const s = await cnt(); await page.click('#num-filter [data-f=all]'); await sleep(200);
    check(`the MEASURED / SIM filter shows ${all} → ${m} measured, ${s} simulated, ${all} again`, all === 12 && m === 3 && s === 9 && await cnt() === 12);
    check('every card has a tag (MEASURED or SIM), a source line and a Limit line', await page.evaluate(() => [...document.querySelectorAll('#nums .num-card')].every(c => /^(MEASURED|SIM)$/.test(c.querySelector('.tag').textContent.trim()) && c.querySelector('.nc-src') && c.querySelector('.nc-lim'))));
    await ctx.close();
  }
}

/* ============================================================================================ 9. accessibility */
const CONTRAST = () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = css => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, b) => { const a = t[3] + b[3] * (1 - t[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map(i => (t[i] * t[3] + b[i] * b[3] * (1 - t[3])) / a).concat([a]); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = el => {
    let acc = [0, 0, 0, 0];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e); let c = rgba(cs.backgroundColor); const bi = cs.backgroundImage;
      if (bi && bi !== 'none' && /gradient/.test(bi)) { const cols = (bi.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|#[0-9a-f]{3,8})/gi) || []).map(rgba); const vis = cols.filter(x => x[3] > 0.001); if (vis.length) { const wsum = vis.reduce((a, x) => a + x[3], 0); c = [0, 1, 2].map(i => vis.reduce((a, x) => a + x[i] * x[3], 0) / wsum).concat([Math.max(...vis.map(x => x[3]))]); } else c = [0, 0, 0, 0]; }
      acc = over(acc, c); if (acc[3] >= 0.999) break;
    }
    if (acc[3] < 0.999) acc = over(acc, rgba(getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fff' : getComputedStyle(document.documentElement).backgroundColor));
    return acc;
  };
  const bad = [], seen = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n = 0;
  while (w.nextNode()) {
    const t = w.currentNode, el = t.parentElement; if (!t.nodeValue.trim() || !el || seen.has(el)) continue; seen.add(el);
    if (el.closest('button:disabled,[disabled],[aria-hidden="true"],[hidden],script,style,.sr-only,[data-nav],[data-footer],.nav,.foot,option,canvas,svg,.cam-ghost,.cap.ghost,.cam-cap.ghost')) continue;
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
if (on(9)) {
  section('9. Accessibility');
  { const { ctx, page } = await still({ lang: 'en', width: 1440 }); await ready(page);
    const a = await page.evaluate(() => {
      const vis = e => e.getBoundingClientRect().width > 0 && !e.closest('[hidden],[aria-hidden="true"]');
      const nameOf = e => (e.getAttribute('aria-label') || '').trim() || (e.getAttribute('aria-labelledby') ? e.getAttribute('aria-labelledby').split(' ').map(i => (document.getElementById(i) || {}).textContent || '').join('').trim() : '') || (e.labels && e.labels.length ? [...e.labels].map(l => l.textContent).join('').trim() : '') || (e.textContent || '').trim() || (e.getAttribute('title') || '').trim();
      const unnamed = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=tab],[role=radio]')].filter(vis).filter(e => !nameOf(e)).map(e => e.outerHTML.slice(0, 70));
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i && !/^mn-b2?$/.test(x));
      const dangling = [...document.querySelectorAll('[aria-controls],[aria-labelledby],[aria-describedby]')].flatMap(e => ['aria-controls', 'aria-labelledby', 'aria-describedby'].flatMap(k => (e.getAttribute(k) || '').split(' ').filter(Boolean).filter(i => !document.getElementById(i)).map(i => k + '→' + i)));
      const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).filter(h => !h.closest('footer,.nav')).map(h => +h.tagName[1]); let jump = 0; hs.forEach((l, i) => { if (i && l - hs[i - 1] > 1) jump++; });
      const lm = { main: document.querySelectorAll('main').length, header: document.querySelectorAll('body > header').length, footer: document.querySelectorAll('footer').length, navs: [...document.querySelectorAll('nav')].filter(n => !n.getAttribute('aria-label')).length, skip: !!document.querySelector('.skip[href="#main"]') };
      const lab = [...document.querySelectorAll('canvas,svg[role=img]')].filter(e => !e.closest('[aria-hidden="true"]') && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).length;
      const hid = [...document.querySelectorAll('#cam-story,#rob-svg')].map(e => e.getAttribute('aria-hidden') === 'true' || !!e.getAttribute('aria-label') || !!e.getAttribute('aria-labelledby'));
      return { unnamed, dup, dangling, h1: document.querySelectorAll('h1').length, jump, lm, lab, hid, srStory: !!document.querySelector('.cam ~ .sr-only, .hero .sr-only') };
    });
    check('every visible link, button, input, tab and radio has an accessible name', a.unnamed.length === 0, a.unnamed.join(' | '));
    check('ids are unique and every aria-controls / labelledby / describedby target exists', a.dup.length === 0 && a.dangling.length === 0, a.dup.concat(a.dangling).join(' '));
    check('exactly one h1; headings never skip a level', a.h1 === 1 && a.jump === 0, `h1 ${a.h1}, jumps ${a.jump}`);
    check('landmarks: one main, header, footer; every nav labelled; the skip link targets #main', a.lm.main === 1 && a.lm.header === 1 && a.lm.footer === 1 && a.lm.navs === 0 && a.lm.skip, JSON.stringify(a.lm));
    check('every canvas and SVG picture is labelled or hidden from assistive technology (the story layer is decorative; a screen-reader paragraph tells the story in words)', a.lab === 0 && a.hid.every(Boolean) && a.srStory, JSON.stringify(a));
    const tgt = await page.evaluate(() => [...document.querySelectorAll('main button,main .chip,main .btn,main .icon-btn,main input[type=range]')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]')).filter(e => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
    check('WCAG 2.2 target size: every button, chip and slider on the page is at least 24 × 24 px', tgt.length === 0, tgt.slice(0, 4).join(' | '));
    await ctx.close(); }
  { const { ctx, page } = await still({ lang: 'ar', width: 390 }); await ready(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('main button,main .btn,main .icon-btn,main .chip')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('[hidden],.subnav,footer,.nav')).filter(e => { const r = e.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(e => (e.className || e.tagName).toString().slice(0, 24) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
    check('on a phone (390 px) the main controls (play, restart, approve, chips, buttons) are at least 44 px tall', small.length === 0, small.slice(0, 5).join(' | '));
    await page.focus('#cam-play'); await sleep(80); const fo = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; });
    check('keyboard focus is clearly visible (3 px outline from base.css)', fo);
    const live = await page.evaluate(() => ({ cap: document.querySelector('#cam-cap').getAttribute('aria-live'), qd: document.querySelector('#qd-cap').getAttribute('aria-live') }));
    check('live regions: the story caption never chatters (aria-live off); the demo caption is not assertive', live.cap === 'off' && live.qd !== 'assertive', JSON.stringify(live));
    await ctx.close(); }
  { let total = 0; const worst = [];
    for (const [w, h] of [[1440, 900], [390, 844]]) for (const theme of ['dark', 'light']) for (const lang of ['ar', 'en']) {
      const { ctx, page } = await still({ width: w, height: h, theme, lang }); await ready(page);
      await page.evaluate(() => document.querySelectorAll('main .hz').forEach(h => h.scrollIntoView({ behavior: 'instant' }))); await sleep(2200);
      const r = await page.evaluate(CONTRAST); total += r.n; if (r.count) worst.push(`${w}/${theme}/${lang}: ${r.bad.join(' ; ')}`);
      await page.evaluate(() => { document.querySelector('#con-approve').click(); document.querySelector('#num-filter [data-f=sim]').click(); }); await sleep(300);
      const r2 = await page.evaluate(CONTRAST); total += r2.n; if (r2.count) worst.push(`${w}/${theme}/${lang}/used: ${r2.bad.join(' ; ')}`);
      await ctx.close();
    }
    check(`WCAG AA contrast: all ${total} visible text runs meet 4.5:1 (3:1 large) at 1440 and 390 × dark/light × ar/en, before and after using the controls`, worst.length === 0, worst.slice(0, 3).join(' || ')); }
}

/* ============================================================================================ 10. print, 404 */
if (on(10)) {
  section('10. Print and 404');
  { const { ctx, page } = await still({ lang: 'en', theme: 'dark', width: 1200, height: 900 }); await ready(page);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(100);
    const during = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.emulateMedia({ media: 'print' }); await sleep(600);
    const pr = await page.evaluate(() => { const cs = e => getComputedStyle(document.querySelector(e)); return { body: cs('body').backgroundColor, nav: cs('.nav').display, sub: cs('.subnav').display, ctl: cs('.cam-ctl').display, ghost: cs('.cam-cap.ghost').display, sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth, anim: document.getAnimations().filter(a => a instanceof CSSAnimation && a.playState === 'running').length }; });
    check('print: a dark-theme page prints on paper-light colours; nav, sub-nav and controls hidden; the caption sizer removed; nothing runs; no horizontal overflow', during === 'light' && pr.body === 'rgb(255, 255, 255)' && pr.nav === 'none' && pr.sub === 'none' && pr.ctl === 'none' && pr.ghost === 'none' && pr.anim === 0 && pr.sw <= pr.w + 1, JSON.stringify(pr));
    const pdf = path.join(process.env.MANARA_SHOTS || os.tmpdir(), 'manara-home-print.pdf'); fs.mkdirSync(path.dirname(pdf), { recursive: true });
    await page.pdf({ path: pdf, format: 'A4', printBackground: true });
    const pages = (fs.readFileSync(pdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    check(`print to PDF works: ${pages} A4 pages, ${Math.round(fs.statSync(pdf).size / 1024)} kB`, pages >= 5 && pages <= 40 && fs.statSync(pdf).size > 20000, String(pages));
    await page.emulateMedia({ media: 'screen' }); await page.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await sleep(100);
    check('after printing the on-screen theme (dark) is restored', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
    await ctx.close(); }
  { const out = [];
    for (const [lang, theme, w] of [['ar', 'dark', 390], ['en', 'light', 1440], ['ar', 'light', 1440], ['en', 'dark', 390]]) {
      const { ctx, page, errors } = await openPage(browser, '404.html', { lang, theme, width: w, height: w < 600 ? 844 : 900 });
      const o = await overflow(page);
      const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, nav: !!document.querySelector('.nav .brand'), code: document.querySelector('.nf-code') && document.querySelector('.nf-code').textContent, links: [...document.querySelectorAll('main a')].map(a => a.getAttribute('href')), title: document.title }));
      const c = await page.evaluate(CONTRAST);
      out.push([lang, theme, w, errors.length, o.scrollW <= o.W, r.h1 === 1 && r.nav && r.code === '404', r.links.length >= 8 && r.links.every(l => /^[a-z]+\.html$/.test(l) && fs.existsSync(path.join(SITE, l))), c.count === 0 ? '' : c.bad.join(';'), /منارة|MANARA/.test(r.title)]);
      await ctx.close();
    }
    check('404.html: loads clean, no overflow, branded (nav, 404, one h1), every link goes to a real page, AA contrast — 4 combinations', out.every(o => o[3] === 0 && o[4] && o[5] && o[6] && o[7] === '' && o[8]), JSON.stringify(out)); }
}

await done(browser);
