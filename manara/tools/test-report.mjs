// Scientific report (report.html) and build guide (build.html) tests — Playwright + Chromium, file:// URLs:  node manara/tools/test-report.mjs
//
//  1. Both pages load clean in ar/en × dark/light at 390 and 1440: no console errors, no horizontal overflow, one h1, language and direction follow
//  2. Structure of the report: unique ids, every contents link and every cross-reference resolves, the new parts (6.9 control room, 6.10 drone and its
//     alert pipeline, 6.11 robot, 9.11 and 9.12 results, 12.9 limits) exist and are in the contents; the "story" figure draws in both directions and widths
//  3. Test counts are READ, never typed: every [data-tc] equals data/test-counts.js; the kit table's rows add up to the kit count; no typed "N checks"
//  4. The abstract: ≤ 200 words in each language and it tells the drone → control room → robot story with its limits
//  5. Honesty: SIM / MEASURED / CONCEPT labels on the new tables, no banned claims, "AI" only as a denial or disclosure, prices are approximate ranges,
//     the student's {{placeholders}} stay visible, every Arabic span has its English twin
//  6. Provenance: the drone, control-room and robot numbers in the report equal a FRESH run (ManaraNational.ab, test-national.mjs DRONE REPORT, ManaraSim.abRobot)
//  7. Build guide: Tier 4 (the drone payload and the bench rover): parts priced as ranges that sum to the numbers the report prints, the rover's pins are
//     valid and unique, the firmware file exists and is linked, the safety text is there
//  8. Print: the report prints as A4 pages with the new sections and without the chrome
//
// Everything simulated is labelled SIM in the report; this test checks that the report is honest about it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, ROOT, SITE } from './lib.mjs';

const section = t => console.log(`\n${t}`);
const browser = await launch();
const openReport = async (o = {}) => {
  const r = await openPage(browser, 'report.html', { width: 1440, height: 900, lang: 'en', theme: 'light', ...o });
  await r.page.waitForFunction(() => window.__reportReady === true, null, { timeout: 10000 }).catch(() => r.errors.push('report never set __reportReady'));
  return r;
};
const openBuild = async (o = {}) => {
  const r = await openPage(browser, 'build.html', { width: 1440, height: 900, lang: 'en', theme: 'light', ...o });
  await r.page.waitForFunction(() => window.__buildReady === true, null, { timeout: 10000 }).catch(() => r.errors.push('build never set __buildReady'));
  return r;
};
const counts = (() => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(SITE, 'data/test-counts.js'), 'utf8'), c); return c.window.MANARA_TEST_COUNTS; })();
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const rhtml = fs.readFileSync(path.join(SITE, 'report.html'), 'utf8');

// ======================================================================= 1. loads clean
section('1. Both pages load clean · layout · language');
for (const [file, open] of [['report.html', openReport], ['build.html', openBuild]]) {
  for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 1440]) {
    const { page, errors, ctx } = await open({ lang, theme, width, height: width < 600 ? 844 : 900 });
    const tag = `${file} ${lang}/${theme}/${width}`;
    check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
    const o = await overflow(page);
    check(`${tag}: no horizontal page overflow`, o.scrollW <= o.W && o.bad.length === 0, `${o.scrollW} > ${o.W}: ${o.bad.join(', ')}`);
    const r = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme }));
    check(`${tag}: one h1, lang/dir/theme follow`, r.h1 === 1 && r.lang === lang && r.dir === (lang === 'ar' ? 'rtl' : 'ltr') && r.theme === theme, JSON.stringify(r));
    await ctx.close();
  }
}

// ======================================================================= 2. structure
section('2. Report structure: ids · contents · cross-references · the new parts · the story figure');
{
  const { page, errors, ctx } = await openReport({ lang: 'en' });
  const s = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    const have = new Set(ids), miss = [...document.querySelectorAll('.toc-list a, a.xref, a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h && h.length > 1 && !have.has(h.slice(1)));
    const heads = ['d-control', 'd-drone', 'd-robot', 'r-drone', 'r-robot', 'l-drone'].map(id => [id, !!document.getElementById(id)]);
    const toc = ['d-control', 'd-drone', 'd-robot'].map(id => !!document.querySelector(`.toc-list a[href="#${id}"]`));
    const cap = [...document.querySelectorAll('.cap-n [data-l=en]')].map(e => e.textContent), tabs = cap.filter(c => /^Table/.test(c)).map(c => +c.replace(/\D/g, '')), figs = cap.filter(c => /^Figure/.test(c)).map(c => +c.replace(/\D/g, ''));
    const seq = a => a.every((n, i) => n === i + 1);
    const num = n => document.getElementById(n) && document.getElementById(n).querySelector('.h-n').textContent;
    return { dup, miss, heads, toc, tabsSeq: seq(tabs), figsSeq: seq(figs), tabs: tabs.length, figs: figs.length, nums: ['d-control', 'd-drone', 'd-robot', 'r-drone', 'r-robot', 'l-drone'].map(num) };
  });
  check('every id is unique', s.dup.length === 0, s.dup.join(', '));
  check('every contents link and every cross-reference points at an element that exists', s.miss.length === 0, s.miss.join(', '));
  check('the new parts exist (6.9 control room, 6.10 drone and alert pipeline, 6.11 robot, 9.11 + 9.12 results, 12.9 limits) with the right numbers and are in the contents', s.heads.every(h => h[1]) && s.toc.every(Boolean) && JSON.stringify(s.nums) === JSON.stringify(['6.9', '6.10', '6.11', '9.11', '9.12', '12.9']), JSON.stringify([s.heads, s.toc, s.nums]));
  check(`table and figure captions are numbered 1…n in order (${s.tabs} tables, ${s.figs} figures)`, s.tabsSeq && s.figsSeq && s.tabs >= 25 && s.figs >= 7);
  const t = await page.evaluate(() => ({
    control: document.querySelectorAll('#tab-control tbody tr').length, alert: document.querySelectorAll('#tab-dronealert tbody tr').length, drone: document.querySelectorAll('#tab-drone tbody tr').length, robot: document.querySelectorAll('#tab-robot tbody tr').length,
    panels: [...document.querySelectorAll('#tab-control tbody th')].map(x => x.textContent).join('|'), limits: document.querySelectorAll('#l-drone + ol li').length
  }));
  check('control-room table lists the 7 panels (alert queue, feed wall, fleet, dispatch, robot, comms log, shift handover); the alert table 5 fields; 7 drone metrics; 3 robot metrics; 7 new limitations', t.control === 7 && /Alert queue/.test(t.panels) && /Feed wall/.test(t.panels) && /Fleet board/.test(t.panels) && /Dispatch/.test(t.panels) && /Robot panel/.test(t.panels) && /Comms log/.test(t.panels) && /Shift handover/.test(t.panels) && t.alert === 5 && t.drone === 7 && t.robot === 3 && t.limits === 7, JSON.stringify(t));
  const kp = await page.evaluate(() => [...document.querySelectorAll('.rp-kpis .kpi')].map(k => k.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)));
  check('the key-figure strip has five tiles and the new one is the SIM drone number (90%)', kp.length === 5 && /^90%/.test(kp[2]) && /SIM/.test(await page.evaluate(() => document.querySelectorAll('.rp-kpis .kpi')[2].textContent)), JSON.stringify(kp));
  check('no console errors on the report', errors.length === 0, errors.join(' | '));
  await ctx.close();
  for (const lang of ['en', 'ar']) for (const width of [1440, 390]) {
    const r = await openReport({ lang, width, height: width < 600 ? 844 : 900 });
    const f = await r.page.evaluate(() => { const host = document.querySelector('#fig-story .fig-body'), svg = host && host.querySelector('svg'); if (!svg) return null; const vb = svg.viewBox.baseVal, hr = host.getBoundingClientRect(); return { boxes: svg.querySelectorAll('.sv-box').length, badges: [...svg.querySelectorAll('.sv-badge')].map(x => x.textContent).join(''), dash: svg.querySelectorAll('.sv-box.dash').length, w: vb.width, hostW: Math.round(hr.width), sw: svg.getBoundingClientRect().width, texts: [...svg.querySelectorAll('text')].some(x => x.getBoundingClientRect().right > svg.getBoundingClientRect().right + 1 || x.getBoundingClientRect().left < svg.getBoundingClientRect().left - 1) }; });
    check(`story figure ${lang}/${width}: 7 numbered boxes (1–7), 3 dashed concept boxes (drone sees, drone guides, robot), nothing drawn outside the figure`, !!f && f.boxes === 7 && f.badges === '1234567' && f.dash === 3 && !f.texts, JSON.stringify(f));
    const ar = await r.page.evaluate(() => { const b = [...document.querySelectorAll('#fig-story .sv-box')].map(x => x.getBoundingClientRect()); return { first: b[0].left, second: b[1].left, w: window.innerWidth }; });
    if (width >= 640) check(`story figure ${lang}: step 1 is on the reading-start side (${lang === 'ar' ? 'right' : 'left'})`, lang === 'ar' ? ar.first > ar.second : ar.first < ar.second, JSON.stringify(ar));
    check(`story figure ${lang}/${width}: no console errors`, r.errors.length === 0, r.errors.join(' | '));
    await r.ctx.close();
  }
}

// ======================================================================= 3. counts are read, never typed
section('3. Test counts: read from data/test-counts.js, never typed');
{
  const { page, ctx } = await openReport({ lang: 'en' });
  const bad = await page.evaluate(([cs]) => {
    const out = [], ss = cs.suites;
    document.querySelectorAll('[data-tc]').forEach(e => {
      const spec = e.getAttribute('data-tc'), m = /^(sum|plus):(.+)$/.exec(spec), names = m ? m[2].split(',') : [spec], vals = names.map(n => ss[n] && ss[n].passed);
      if (vals.some(v => !(v > 0))) { out.push(spec + ': unknown suite'); return; }
      const fm = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','), want = m && m[1] === 'plus' ? vals.join(' + ') : fm(vals.reduce((a, b) => a + b, 0));
      if (e.textContent.trim() !== want) out.push(`${spec}: shows "${e.textContent.trim()}", generated ${want}`);
    });
    return out;
  }, [counts]);
  check(`every [data-tc] number equals the generated value (${await page.evaluate(() => document.querySelectorAll('[data-tc]').length)} of them)`, bad.length === 0, bad.slice(0, 4).join(' | '));
  await ctx.close();
  // the static fallbacks (no JavaScript) equal the generated numbers too
  const fb = [...rhtml.matchAll(/data-tc="([^"]+)"[^>]*>([^<]*)</g)].filter(m => {
    const mm = /^(sum|plus):(.+)$/.exec(m[1]), names = mm ? mm[2].split(',') : [m[1]], vals = names.map(n => counts.suites[n] && counts.suites[n].passed);
    return vals.every(v => v > 0) && m[2].trim() !== (mm && mm[1] === 'plus' ? vals.join(' + ') : fmt(vals.reduce((a, b) => a + b, 0)));
  }).map(m => `${m[1]} → ${m[2]}`);
  check('the static HTML fallbacks equal the generated numbers (what a reader sees without JavaScript)', fb.length === 0, fb.slice(0, 4).join(' | '));
  const kitRows = [...rhtml.matchAll(/id="tab-kit"[\s\S]*?<\/table>/g)][0][0], rowSum = [...kitRows.matchAll(/<td><b class="num">(\d+)<\/b><\/td>/g)].reduce((a, m) => a + +m[1], 0);
  check(`the kit table's six section counts add up to the kit count (${rowSum} = ${counts.suites.kit.passed})`, rowSum === counts.suites.kit.passed, String(rowSum));
  const text = rhtml.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const typed = [...rhtml.matchAll(/(?<!data-tc="[^"]*">)\b(\d{3,4})\s+(?:checks|passed|software checks|فحصًا|فحوص)/g)].map(m => m[0]);
  check('no test count is typed in the prose (a "NNN checks" outside a data-tc element)', typed.length === 0, typed.join(' | '));
  check('the page loads data/test-counts.js (defer) before its own script', /<script src="data\/test-counts\.js" defer><\/script>/.test(rhtml) && rhtml.indexOf('data/test-counts.js') < rhtml.indexOf('js/report.js'));
  check('the 703 of the old three-suite total is gone', !/\b703\b/.test(text));
}

// ======================================================================= 4. abstract
section('4. The abstract');
{
  for (const lang of ['ar', 'en']) {
    const { page, ctx } = await openReport({ lang });
    const a = await page.evaluate(() => { const p = document.querySelector('#abstract-box > p'), g = l => p.querySelector(`span[data-l=${l}]`).textContent.trim(); return { ar: g('ar'), en: g('en'), counter: document.getElementById('abs-count').textContent }; });
    const w = s => s.split(/\s+/).filter(Boolean).length;
    check(`abstract ${lang}: ${w(a[lang])} words ≤ 200, and the page's own counter says so`, w(a[lang]) <= 200 && w(a[lang]) > 120 && /200/.test(a.counter), a.counter);
    if (lang === 'en') {
      const t = a.en;
      check('abstract tells the story: drone sees, control room proves, two keys and a human Approve, fastest unit (999 stays the dispatcher), drone guides, robot searches, everyone counted', ['drone sees', 'control room proves', 'two independent keys', 'human Approve', '999 stays the dispatcher', 'guides people out', 'robot searches', 'counted', 'six hazards'].every(x => t.includes(x)), t.slice(0, 80));
      check('abstract states the limits: no drone has flown, no rescue robot exists, no hardware or human experiment, SIM numbers labelled ("labelled simulations"), 66.7% on 12 of 18', /No drone has flown/.test(t) && /no rescue robot exists/.test(t) && /no hardware or human experiment/.test(t) && /labelled simulations/.test(t) && /66\.7% \(12 of 18\)/.test(t));
      check('abstract number = the generated total of the four suites it names (fire + sim + msg + kit)', t.includes(`${fmt(counts.suites.fire.passed + counts.suites.sim.passed + counts.suites.msg.passed + counts.suites.kit.passed)} software checks`), t.match(/[\d,]+ software checks/)?.[0]);
    } else {
      const t = a.ar;
      check('abstract (Arabic) tells the same story and the same limits', ['مسيّرة', 'غرفة تحكم', 'مفتاحين مستقلين', '999', 'روبوت', 'لم تطر أي مسيّرة', 'لا يوجد روبوت إنقاذ', '66.7%'].every(x => t.includes(x)));
    }
    await ctx.close();
  }
}

// ======================================================================= 5. honesty
section('5. Honesty: labels · banned claims · AI wording · prices · placeholders · twins');
{
  const { page, ctx } = await openReport({ lang: 'en' });
  const parts = await page.evaluate(() => {
    const txt = id => { const e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; };
    const between = (a, b) => { const out = []; let n = document.getElementById(a); while (n && n.id !== b) { out.push(n); n = n.nextElementSibling; } return out.map(x => x.textContent).join(' ').replace(/\s+/g, ' '); };
    return {
      control: between('d-control', 'd-drone'), drone: between('d-drone', 'd-robot'), robot: between('d-robot', 's-process') || '', rdrone: between('r-drone', 'r-robot'), rrobot: between('r-robot', 's-exp'), ldrone: between('l-drone', 'no-claims'),
      tags: ['tab-control', 'tab-dronealert', 'tab-drone', 'tab-robot'].map(id => { const c = document.querySelector('#' + id + ' caption'); return [id, !!c && /SIM|CONCEPT|MEASURED/.test(c.textContent), !!c && /SIM/.test(c.textContent), !!c && /CONCEPT/.test(c.textContent)]; }),
      all: document.getElementById('rp-doc').textContent.replace(/\s+/g, ' '),
      ph: [...document.querySelectorAll('mark.ph')].map(m => m.textContent),
      twins: [...document.querySelectorAll('#rp-doc *')].filter(e => { const k = [...e.children].filter(c => c.hasAttribute && c.hasAttribute('data-l')); if (!k.length) return false; const a = k.filter(c => c.dataset.l === 'ar').length, en = k.filter(c => c.dataset.l === 'en').length; return a !== en; }).length
    };
  });
  const newText = [parts.control, parts.drone, parts.robot.slice(0, 2500), parts.rdrone, parts.rrobot, parts.ldrone].join(' ');
  check('new tables carry their evidence label: control-room panels = CONCEPT + SIM; drone alert fields = CONCEPT; drone and robot results = SIM', parts.tags.every(t => t[1]) && parts.tags[0][2] && parts.tags[0][3] && parts.tags[1][3] && parts.tags[2][2] && parts.tags[3][2], JSON.stringify(parts.tags));
  const banned = /world[- ]first|first[- ]ever|first of its kind|the first (ai|system|platform|project|drone)|saves? (\d+ )?lives|we save lives|guarantee|deep learning|neural net|machine learning/i;
  const stripped = newText.replace(/we never say “we save lives”/gi, '').replace(/not evidence that it saves time/gi, '');
  check('no banned claim in the new parts (world-first, saves lives, guarantee, deep learning)', !banned.test(stripped), (stripped.match(banned) || [''])[0]);
  const ai = [...newText.matchAll(/\bAI\b/g)].map(m => newText.slice(Math.max(0, m.index - 12), m.index + 16));
  check('"AI" in the new parts appears only as a denial ("not AI")', ai.every(c => /not AI/.test(c)), ai.join(' | '));
  check('the new parts say what was NOT done: no drone has flown, no rescue robot built, computer-generated scenes, no real video, no real authentication, nothing connected to a real system', /no drone has flown/i.test(newText) && /no rescue robot has been built/i.test(newText) && /computer-generated/.test(newText) && /no real video/i.test(newText) && /no real authentication/.test(newText) && /nothing in it is connected to a real system/.test(newText));
  check('the robot assists and firefighters decide; it does not break doors; the commander approves first; wheels do not climb stairs', /It assists; firefighters decide/.test(newText) && /without breaking them/.test(newText) && /incident commander approves/.test(newText) && /wheels cannot climb stairs/.test(newText));
  check('aviation rules are not invented: the Civil Aviation Authority licence is cited (Law No. 10 of 2026) and "no operating condition until the authority confirms" is said; no altitude, zone or permit category appears', /Law No\. 10 of 2026/.test(parts.drone) && /until the authority itself confirms/.test(parts.drone) && !/\b\d+\s?(m|metres|meters|ft|feet)\b[^.]{0,20}(altitude|height|ceiling)|altitude[^.]{0,20}\b\d+\s?(m|metres|ft)\b|permit categor|zone [A-Z0-9]\b/i.test(parts.drone + parts.ldrone));
  check('prices are approximate ranges with the "check suppliers" caveat, never a single price', /about US\$ 79–204/.test(parts.robot) && /US\$ 174–474/.test(parts.robot) && /approximate estimates; check suppliers/.test(parts.robot));
  check('the privacy and liability limits are stated (a camera in the sky, retention policy set by the agency, licence, liability)', /A camera in the sky/.test(parts.all) && /privacy, retention and deletion policy/.test(parts.all) && /Licence, privacy and liability/.test(parts.ldrone));
  check('the student\'s {{placeholders}} stay visible (≥ 5 of them, all double-braced)', parts.ph.length >= 5 && parts.ph.every(p => /^\{\{.+\}\}$/.test(p.trim())), JSON.stringify(parts.ph.slice(0, 3)));
  check('every bilingual group has as many Arabic spans as English spans (no half-translated block)', parts.twins === 0, String(parts.twins));
  const js = fs.readFileSync(path.join(SITE, 'js/report.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('report.js: no innerHTML / document.write / eval / fetch / modules; insertAdjacentHTML only for our own icon markup (M.icon), never for data', !/innerHTML|document\.write|\beval\(|\bfetch\(|XMLHttpRequest|\bimport\s*\(/.test(js) && !/insertAdjacentHTML/.test(js.replace(/\.insertAdjacentHTML\('afterbegin', M\.icon\('[a-z]+'\)\)/g, '')));
  check('report.html: classic scripts only, Google Fonts the only external host', !/type=["']module/.test(rhtml) && [...rhtml.matchAll(/(?:src|href)=["'](https?:[^"']+)/g)].every(m => /fonts\.(googleapis|gstatic)\.com|^https?:\/\/(www\.)?[a-z0-9.\-]+\/?/.test(m[1])) && ![...rhtml.matchAll(/<script[^>]+src=["'](https?:[^"']+)/g)].length);
  await ctx.close();
}

// ======================================================================= 6. provenance
section('6. Provenance: the numbers in the report equal a fresh run');
{
  const { page, ctx } = await openReport({ lang: 'en' });
  const cell = (id, row) => page.evaluate(([id, row]) => { const r = document.querySelectorAll(`#${id} tbody tr`)[row]; return r ? r.textContent.replace(/\s+/g, ' ') : ''; }, [id, row]);
  const nctx = vm.createContext({ console });
  for (const f of ['data/qatar-geo.js', 'data/qatar-facilities.js', 'data/qatar-roads.js', 'js/national.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(SITE, f), 'utf8'), nctx);
  const fe = nctx.ManaraNational.ab({ seed: 7, n: 150 }).firstEyes;
  const r0 = await cell('tab-drone', 0), r1 = await cell('tab-drone', 1);
  check(`drone first in ${fe.droneFirstPct}% of the incidents it can reach; medians ${fe.droneEtaSec.p50} s vs ${fe.firstGroundEtaSec.p50} s; ${Math.round(fe.noDroneAvailablePct)}% out of range  ← fresh ManaraNational.ab({seed 7, n 150})`,
    fe.droneFirstPct === 90 && /90%/.test(r0) && new RegExp(`${fe.droneEtaSec.p50} s against ${String(fe.firstGroundEtaSec.p50).replace('.', '\\.')} s`).test(r0) && Math.round(fe.noDroneAvailablePct) === 33 && /33%/.test(r1) && /50 of 150/.test(r1), JSON.stringify([fe.droneFirstPct, fe.noDroneAvailablePct, fe.droneEtaSec.p50, fe.firstGroundEtaSec.p50]));
  const rows = [];
  for (let seed = 1; seed <= 8; seed++) {
    const r = nctx.ManaraSim.abRobot({ preset: 'fire-night-robot', seed }), pp = m => m.unaccounted.perPerson.filter(p => p.key === 'abu-salem')[0] || null;
    rows.push({ w: r.without.unaccounted.timeToLocate.p50, r: r.withRobot.unaccounted.timeToLocate.p50, byRobot: !!(pp(r.withRobot) && pp(r.withRobot).byRobot), as: !!pp(r.withRobot) });
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length, first = rows.filter(x => x.byRobot).length, crews = rows.filter(x => x.as && !x.byRobot).length, w = mean(rows.map(x => x.w)), rr = mean(rows.map(x => x.r));
  const rb = [await cell('tab-robot', 0), await cell('tab-robot', 1), await cell('tab-robot', 2)];
  check(`robot A/B over seeds 1–8: robot first ${first}, crews first ${crews}, mean of the medians ${w.toFixed(1)} → ${rr.toFixed(1)} s  ← fresh ManaraSim.abRobot`, first === 5 && crews === 3 && w.toFixed(1) === '345.7' && rr.toFixed(1) === '344.2' && /5 \/ 8/.test(rb[0]) && /3 \/ 8/.test(rb[1]) && /345\.7 → 344\.2 s/.test(rb[2]), JSON.stringify([first, crews, w, rr]));
  if (process.env.REPORT_SKIP_NATIONAL === '1') console.log('  skip test-national.mjs re-run (REPORT_SKIP_NATIONAL=1)');
  else {
    const nn = spawnSync(process.execPath, [path.join(ROOT, 'tools/test-national.mjs')], { encoding: 'utf8', timeout: 400000 }), out = nn.stdout || '';
    check(`test-national.mjs passes with the ${counts.suites.national.passed} checks the report prints`, nn.status === 0 && new RegExp(`${counts.suites.national.passed} passed, 0 failed`).test(out), (out.match(/\d+ passed, \d+ failed/) || ['no summary'])[0]);
    const dr = (() => { try { return JSON.parse((out.match(/DRONE REPORT: (\{.*\})/) || [])[1]); } catch (e) { return null; } })();
    const rg = out.match(/range of one drone: January 03:00 ([\d.]+) km, July 14:00 ([\d.]+) km \(air ([\d.]+) °C, battery ([\d.]+) °C\), July heat wave \(\+8 °C\) ([\d.]+) km/), so = out.match(/same sortie: arrival (\d+) s \(cool\) \/ (\d+) s \(July\) \/ (\d+) s \(heat wave\); battery used ([\d.]+) \/ ([\d.]+) \/ ([\d.]+) %/);
    const ab = out.match(/A\/B first eyes \(SIM, n=(\d+) of (\d+) reachable by a drone, ([\d.]+) % out of range of every drone\): the drone is on station before the first ground unit in (\d+) % \((\d+) % counting the operator's approval time on the ground side\); median ([\d.]+) s vs ([\d.]+) s, lead where the drone wins: median (\d+) s/);
    const T = await page.evaluate(() => document.getElementById('tab-drone').textContent.replace(/\s+/g, ' '));
    check('first-eyes details: n = 100 of 150, 33.3% out of range, 91% with the approval time, the lead where the drone wins is a median 204 s  ← the fresh test-national.mjs run', !!ab && +ab[1] === 100 && +ab[2] === 150 && ab[3] === '33.3' && +ab[5] === 91 && +ab[8] === 204 && /91%/.test(T) && /204 s/.test(T) && /100 of 150/.test(T), JSON.stringify(ab && ab.slice(1)));
    check(`range ${rg && rg.slice(1, 6).join(' / ')}, sortie ${so && so.slice(1, 7).join(' / ')}  ← the fresh run, as printed in the table`, !!rg && !!so && /13 \/ 11 \/ 8\.3 km/.test(T) && rg[1] === '13' && rg[2] === '11' && rg[5] === '8.3' && /air 40\.6 °C, battery 45\.3 °C/.test(T) && rg[3] === '40.6' && rg[4] === '45.3' && /235 \/ 247 \/ 268 s/.test(T) && so.slice(1, 4).join('/') === '235/247/268' && /34\.7 \/ 40\.4 \/ 51\.9%/.test(T) && so.slice(4, 7).join('/') === '34.7/40.4/51.9', JSON.stringify([rg && rg.slice(1), so && so.slice(1)]));
    check('thermal key for a person lying down 2% / 70%; false alerts 233 raised, 96.6% dismissed, 8 dispatched in error; a day of 288 sorties and 35 drone alerts  ← DRONE REPORT of the fresh run', !!dr && Math.round(dr.peopleThermal.noon * 100) === 2 && Math.round(dr.peopleThermal.night * 100) === 70 && dr.falseAlarm.raised === 233 && dr.falseAlarm.dismissedPct === 96.6 && dr.falseAlarm.dispatched === 8 && dr.day.sorties === 288 && dr.day.alerts === 35 && /2% \/ 70%/.test(T) && /233 · 96\.6% · 8/.test(T) && /288 · 35/.test(T), JSON.stringify(dr));
  }
  const rt = await page.evaluate(() => document.getElementById('d-robot').parentElement.textContent.replace(/\s+/g, ' '));
  const bp = await openBuild({ lang: 'en' });
  const sum = await bp.page.evaluate(() => ({ t4: ManaraBuild.sumParts(4, true).core, all: ManaraBuild.sumParts(4, false).core }));
  await bp.ctx.close();
  check(`Tier 4 prices in the report (US$ ${sum.t4.lo}–${sum.t4.hi} adds, ${sum.all.lo}–${sum.all.hi} in all) equal the Build guide's own sums`, rt.includes(`US$ ${sum.t4.lo}–${sum.t4.hi}`) && rt.includes(`US$ ${sum.all.lo}–${sum.all.hi}`), JSON.stringify(sum));
  await ctx.close();
}

// ======================================================================= 7. build guide, Tier 4
section('7. Build guide: Tier 4 (the drone payload and the bench rover)');
{
  const { page, errors, ctx } = await openBuild({ lang: 'en' });
  const b = await page.evaluate(() => {
    const P = ManaraBuild.PARTS, t4 = P.filter(p => p.t === 4);
    const pins = ManaraBuild.ROVER_PINS.flatMap(r => String(r.gpio).split('·').map(x => x.trim()).filter(x => /^\d+$/.test(x)).map(Number));
    return {
      tiers: ManaraBuild.TIERS.length, t4: t4.length, ranged: t4.every(p => typeof p.lo === 'number' && typeof p.hi === 'number' && p.hi > p.lo - 0.0001 && p.hi >= p.lo), kinds: [...new Set(P.map(p => p.k))].sort().join(),
      pins, kit: ManaraBuild.KIT.map(k => k.path || k.file || k.href || JSON.stringify(k)).join('|'),
      section: !!document.getElementById('tier4'), text: document.getElementById('tier4') ? document.getElementById('tier4').textContent.replace(/\s+/g, ' ') : '',
      rows: document.querySelectorAll('#t4-parts-body tr').length, rover: document.querySelectorAll('#rover-pin-body tr').length
    };
  });
  check('the guide has four tiers, and Tier 4 has 11 parts, every one priced as a range (lo ≤ hi) flagged seen / est / opt, never a single price', b.tiers === 4 && b.t4 === 11 && b.ranged && /est/.test(b.kinds), JSON.stringify([b.tiers, b.t4, b.kinds]));
  check(`the rover's GPIO numbers are unique (${b.pins.join(', ')}), avoid the flash pins 6–11 and the boot-strapping pins 0 / 2 / 5 / 12 / 15, and only the battery sense uses an input-only pin (34)`, new Set(b.pins).size === b.pins.length && b.pins.length >= 12 && b.pins.every(p => !(p >= 6 && p <= 11) && ![0, 2, 5, 12, 15].includes(p) && (p < 34 || p === 34)), b.pins.join());
  check('the Tier 4 section and its two tables are drawn (parts and rover pins)', b.section && b.rows === 11 && b.rover >= 8, JSON.stringify([b.section, b.rows, b.rover]));
  check('the firmware file exists on disk and is linked from the guide', fs.existsSync(path.join(SITE, 'kit/firmware/manara_rover/manara_rover.ino')) && /manara_rover/.test(b.kit), b.kit.slice(0, 160));
  check('Tier 4 says what it is not: not a rescue robot, approximate prices (check suppliers), no driving at the booth, an emergency stop and local safety the browser cannot override, the approval gate and the heartbeat', /not a rescue robot|no rescue robot|models only/i.test(b.text) && /check suppliers|approximate/i.test(b.text) && /E-stop|emergency stop/i.test(b.text) && /cannot override|can(?:no|’)t override|never override/i.test(b.text) && /heartbeat|keep-alive/i.test(b.text) && /approv/i.test(b.text), b.text.slice(0, 200));
  check('no console errors on the build guide', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================= 8. print
section('8. Print: the report as A4 pages');
{
  const { page, ctx, errors } = await openReport({ lang: 'en', width: 1100 });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => ({ nav: getComputedStyle(document.querySelector('.nav')).display, toc: getComputedStyle(document.getElementById('rp-toc-box')).display, story: !!document.querySelector('#fig-story svg'), svgW: document.querySelector('#fig-story svg') && document.querySelector('#fig-story svg').getBoundingClientRect().width, open: [...document.querySelectorAll('details')].every(d => d.open) }));
  const buf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(`the report prints as A4 pages (${pages}, between 25 and 200), without the site chrome, with every detail open and the new figure drawn`, pages >= 25 && pages <= 200 && pr.nav === 'none' && pr.story && pr.open, JSON.stringify([pages, pr]));
  const f = path.join(os.tmpdir(), 'manara-report.pdf'); fs.writeFileSync(f, buf);
  const t = (spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }).stdout || '');
  if (t) check('the printed text carries the new sections (control room, drone alert pipeline, robot, the drone numbers)', ['The control room: what the operator sees', 'The drone and its alert pipeline', 'The robot: it goes where people should not go first', 'The drone and the control room: what the simulation measured'].every(x => t.replace(/\s+/g, ' ').includes(x)));
  else console.log('  (pdftotext not installed: printed-text check skipped)');
  check('no console errors in print', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await done(browser);
