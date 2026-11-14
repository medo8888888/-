// Control Room PANELS («الأسطول · الإرسال · الاتصالات · التسليم») browser tests — Playwright + Chromium over file:// (no network).
//   node manara/tools/test-control-panels.mjs
// Covers js/control-panels.js + css/control-panels.css inside the real console (control.html: js/control.js core + js/control-ui.js shell, hash #quiet = an empty console, the default engine: seed 7,
// Sunday 2026-01-11 07:45, so the demo fire in Al Thumama has a "farther but faster" winner):
//   1 loads clean in ar/en x dark/light x 1440/390, every tab draws, no console errors, no horizontal overflow at 390 / 820 / 1440
//   2 FLEET     lists every drone of the engine, filter + sort, payload icons, range / ETA to the selected alert, launch / reassign / recall change the engine state, the role lock, charging queue, coverage honesty
//   3 DISPATCH  the plan of the selected alert: winner + runner-up + ETA + why, "farther but faster" flagged exactly where the engine says so (and "nearest and fastest" where it is), time-of-day traffic,
//               the jam toggle changes the plan, re-dispatch history, per-unit status, hold / cancel, CAP 1.2 download, a preview for an alert with no incident, the 999 reminder
//   4 COMMS     logs operator actions, bus messages sent and received (alert / dispatch / robot-find / citizen / detection ...), drone announcements; filter, search, export, broadcast composer
//   5 HANDOVER  decisions with who / when / why, open incidents, committed units, SIM labels, notes, copy / download, print CSS (a print clone + @media print)
//   6 honesty and safety: no innerHTML sinks, logical CSS only, hostile bus text stays text, no bare "AI", the 999 / concept / SIM wording
//   7 contrast >= 4.5:1 and accessible names in both themes
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, overflow, check, done, ROOT } from './lib.mjs';

const browser = await launch();
const W = (p, fn, ...a) => p.evaluate(fn, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = (o = {}) => openPage(browser, 'control.html', { width: 1440, height: 900, lang: 'en', theme: 'dark', query: '#quiet', ...o });
const ready = async p => { await p.waitForFunction(() => window.ControlRoom && ControlRoom.api.ready(), null, { timeout: 25000 }); await W(p, () => ControlRoom.api.setPlaying(false)); };
const tab = async (p, id) => { await W(p, i => ControlRoom.showTab(i), id); await p.waitForSelector(`#cr-tp-${id} .cp[data-tab="${id}"] .cp-zone`, { timeout: 8000 }); await p.waitForFunction(i => !document.querySelector('#cr-tp-' + i).hidden, id); await sleep(80); };
// the demo fire of Mission Control (Al Thumama, Sunday 07:45) as a simulated alarm; returns the alert id (selected)
const demo = (p, o = {}) => W(p, o2 => { const CR = ControlRoom, D = ManaraNational.DEMO, inc = CR.api.placeAlarm({ hazard: o2.hazard || 'fire', lon: o2.lon || D.lon, lat: o2.lat || D.lat, severity: 2 }); CR.api.step(o2.step == null ? 30 : o2.step); const a = CR.api.alerts().find(x => x.incident === inc.id); CR.api.select(a.id, { fly: false }); return a.id; }, o);
const approve = (p, id) => W(p, i => { ControlRoom.api.approve(i); return ControlRoom.api.approve(i); }, id);
const step = (p, s) => W(p, x => { ControlRoom.api.step(x); ControlRoom.mods.panels.refresh(); }, s);
const secOf = t => { const m = /(\d+):(\d\d)/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const txt = (p, sel) => W(p, s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const allErrors = [];
const real = errs => errs.filter(e => !/favicon/.test(e));

/* ---------------------------------------------------------------- 1. loads clean, every tab draws, no overflow */
console.log('\n1. loads clean: ar/en x dark/light x 1440/390, the four tabs, no overflow');
const panelOverflow = (p, id) => W(p, i => { const pn = document.querySelector('#cr-tp-' + i), r0 = pn.getBoundingClientRect(), bad = []; pn.querySelectorAll('.cp *').forEach(e => { if (e.closest('svg, [hidden], [aria-hidden=true], .sr-only') && e.tagName !== 'svg') return; const r = e.getBoundingClientRect(); if (r.width && (r.right > r0.right + 1.5 || r.left < r0.left - 1.5)) bad.push((e.className && String(e.className).slice(0, 30)) || e.tagName); }); return { w: Math.round(r0.width), bad: [...new Set(bad)].slice(0, 6) }; }, id);
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
  const { ctx, page, errors } = await open({ width, height: width > 600 ? 900 : 844, lang, theme });
  await ready(page);
  const aid = await demo(page);
  const tag = `${lang}/${theme}/${width}`;
  const seen = {};
  for (const id of ['fleet', 'dispatch', 'comms', 'handover']) {
    await tab(page, id);
    seen[id] = await W(page, i => { const p = document.querySelector('#cr-tp-' + i); return { cp: !!p.querySelector('.cp'), n: p.querySelectorAll('.cp-zone').length, len: p.textContent.length, sim: !!p.querySelector('.cr-sim'), vis: p.getClientRects().length > 0 }; }, id);
    const ov = await overflow(page), po = await panelOverflow(page, id);
    check(`${tag} ${id}: no horizontal overflow (the page does not scroll sideways; nothing of the panel sticks out)`, ov.scrollW <= ov.W && po.bad.length === 0, JSON.stringify({ ov, po }));
  }
  check(`${tag}: the four tabs are registered, built, visible and carry a SIM badge`, Object.values(seen).every(s => s.cp && s.n >= 1 && s.len > 300 && s.sim && s.vis), JSON.stringify(seen));
  check(`${tag}: language, direction and theme applied`, await W(page, ([l, t]) => document.documentElement.dataset.lang === l && document.documentElement.dir === (l === 'ar' ? 'rtl' : 'ltr') && document.documentElement.dataset.theme === t, [lang, theme]));
  check(`${tag}: no console errors`, real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}
{
  for (const [lang, theme] of [['en', 'dark'], ['ar', 'light']]) {
    const { ctx, page, errors } = await open({ width: 820, height: 1000, lang, theme });
    await ready(page); await demo(page);
    for (const id of ['fleet', 'dispatch', 'comms', 'handover']) { await tab(page, id); const ov = await overflow(page), po = await panelOverflow(page, id); check(`${lang}/${theme}/820 ${id}: no horizontal overflow`, ov.scrollW <= ov.W && po.bad.length === 0, JSON.stringify({ ov, po })); }
    check(`${lang}/${theme}/820: no console errors`, real(errors).length === 0, real(errors).join(' | '));
    await ctx.close();
  }
}

/* ---------------------------------------------------------------- 2. FLEET */
console.log('\n2. FLEET: every drone, launch / reassign / recall, role lock, range, coverage, charging queue');
{
  const { ctx, page, errors } = await open();
  await ready(page); await tab(page, 'fleet');
  const f = await W(page, () => ({ ids: ControlRoom.api.drones().map(d => d.id), dom: [...document.querySelectorAll('#cr-tp-fleet .cp-drone')].map(e => e.dataset.drone), kpi: document.querySelector('#cr-tp-fleet .cp-kpi b').textContent, aed: ControlRoom.api.drones().filter(d => d.aed).length, kit: [...document.querySelectorAll('#cr-tp-fleet .cp-drone .cp-pl.kit')].filter(e => !e.hidden).length, pl: [...document.querySelectorAll('#cr-tp-fleet .cp-drone')].every(e => e.querySelectorAll('.cp-pl').length >= 4), nm: [...document.querySelectorAll('#cr-tp-fleet .cp-drone .cp-d-cs')].every(e => /^DR-\d\d$/.test(e.textContent)) }));
  check('the board lists every drone of the engine (same ids, once each)', f.ids.length >= 20 && f.dom.length === f.ids.length && f.ids.every(i => f.dom.includes(i)) && new Set(f.dom).size === f.dom.length, `${f.dom.length} of ${f.ids.length}`);
  check('the first KPI is the fleet total', +f.kpi === f.ids.length, f.kpi);
  check('every card shows the payload icons (camera, thermal, speaker, light); the first-aid kit only on the drones that carry one', f.pl && f.kit === f.aed && f.aed > 0 && f.nm, JSON.stringify({ pl: f.pl, kit: f.kit, aed: f.aed }));
  // filter chips and sort
  const chips = await W(page, () => [...document.querySelectorAll('#cr-tp-fleet .chip[data-f]')].map(c => [c.dataset.f, +c.querySelector('.cp-fc').textContent, c.getAttribute('aria-pressed')]));
  const eng = await W(page, () => ControlRoom.api.drones().reduce((m, d) => (m[d.state] = (m[d.state] || 0) + 1, m), {}));
  check('filter chips carry live counts that match the engine (all / docked / patrol / charging / fault)', chips.find(c => c[0] === 'all')[1] === f.ids.length && chips.find(c => c[0] === 'docked')[1] === (eng.docked || 0) && chips.find(c => c[0] === 'patrol')[1] === (eng.patrol || 0) && chips.find(c => c[0] === 'charging')[1] === (eng.charging || 0), JSON.stringify({ chips, eng }));
  await page.click('#cr-tp-fleet .chip[data-f="patrol"]');
  const pat = await W(page, () => [...document.querySelectorAll('#cr-tp-fleet .cp-drone:not([hidden])')].map(e => e.dataset.state));
  check('the "Patrol" filter shows only patrolling drones and marks itself pressed', pat.length === (eng.patrol || 0) && pat.every(s => s === 'patrol') && (await W(page, () => document.querySelector('#cr-tp-fleet .chip[data-f="patrol"]').getAttribute('aria-pressed'))) === 'true', pat.join());
  await page.click('#cr-tp-fleet .chip[data-f="all"]');
  await page.selectOption('#cr-tp-fleet .cp-sort', 'battery');
  const ord = await W(page, () => ({ dom: [...document.querySelectorAll('#cr-tp-fleet .cp-drone')].map(e => e.dataset.drone), want: ControlRoom.api.drones().slice().sort((a, b) => b.batteryPct - a.batteryPct || (a.callsign < b.callsign ? -1 : 1)).map(d => d.id) }));
  check('sorting by battery puts the fullest battery first (the engine order)', JSON.stringify(ord.dom) === JSON.stringify(ord.want), ord.dom.slice(0, 3).join());
  await page.selectOption('#cr-tp-fleet .cp-sort', 'id');
  check('no alert selected: the board says how to see the range, and no launch is offered as possible', /pick one in the queue/i.test(await txt(page, '#cr-tp-fleet .cp-ctx')) && (await W(page, () => [...document.querySelectorAll('#cr-tp-fleet .cp-launch')].every(b => b.getAttribute('aria-disabled') === 'true'))));

  // an alert: the nearest drone launches by itself (a drone may launch to verify on its own)
  const aid = await demo(page); await tab(page, 'fleet');
  const al = await W(page, i => { const a = ControlRoom.api.alert(i); return { drone: a.droneId, inQ: ControlRoom.mods.panels.rankMap(a) }; }, aid);
  check('the engine launched the nearest drone to verify by itself', !!al.drone);
  const rg = await W(page, () => ({ ok: [...document.querySelectorAll('#cr-tp-fleet .cp-drone .cp-rg.ok')].map(e => e.closest('.cp-drone').dataset.drone), txt: [...document.querySelectorAll('#cr-tp-fleet .cp-drone .cp-rg.ok')].map(e => e.textContent), ctx: document.querySelector('#cr-tp-fleet .cp-ctx').textContent }));
  const rank = Object.keys(al.inQ);
  check('"to the alert": exactly the drones the engine can send show a time and a distance (mm:ss · km), the others say why not', rg.ok.length === rank.length && rg.ok.every(i => rank.includes(i)) && rg.txt.every(t => /\d+:\d\d/.test(t) && /km/.test(t)) && rg.ok.length > 0 && rg.ctx.includes(aid), JSON.stringify({ rg: rg.ok.length, rank: rank.length }));
  const mine = await W(page, d => { const c = document.querySelector(`#cr-tp-fleet .cp-drone[data-drone="${d}"]`); return { chip: c.querySelector('.cp-chip') && c.querySelector('.cp-chip').textContent, mine: c.classList.contains('mine'), state: c.dataset.state }; }, al.drone);
  check('the assigned drone shows its alert and is highlighted', mine.chip === aid && mine.mine && ['launching', 'en-route'].includes(mine.state), JSON.stringify(mine));
  // recall
  await page.click(`#cr-tp-fleet .cp-drone[data-drone="${al.drone}"] [data-fk^="r:"]`);
  const rc = await W(page, d => ({ eng: ControlRoom.api.drones().find(x => x.id === d).state, dom: document.querySelector(`#cr-tp-fleet .cp-drone[data-drone="${d}"]`).dataset.state }), al.drone);
  check('Recall: the drone goes home — engine state and the card change to "returning"', rc.eng === 'returning' && rc.dom === 'returning', JSON.stringify(rc));
  // launch another one
  const pick = await W(page, () => { const e = [...document.querySelectorAll('#cr-tp-fleet .cp-drone:not([hidden]) .cp-launch')].find(b => b.getAttribute('aria-disabled') !== 'true'); return e ? e.closest('.cp-drone').dataset.drone : null; });
  check('a launchable drone is offered for the selected alert', !!pick);
  await page.click(`#cr-tp-fleet .cp-drone[data-drone="${pick}"] .cp-launch`);
  const ln = await W(page, ([d, i]) => ({ eng: ControlRoom.api.drones().find(x => x.id === d).state, dom: document.querySelector(`#cr-tp-fleet .cp-drone[data-drone="${d}"]`).dataset.state, assigned: ControlRoom.api.alert(i).droneId }), [pick, aid]);
  check('Launch: the chosen drone takes off for the alert (engine state, card and the alert\'s drone change)', ['launching', 'en-route'].includes(ln.eng) && ln.dom === ln.eng && ln.assigned === pick, JSON.stringify(ln));
  // reassign: another drone while this one is still on its way
  const pick2 = await W(page, p0 => { const e = [...document.querySelectorAll('#cr-tp-fleet .cp-drone:not([hidden]) .cp-launch')].find(b => b.getAttribute('aria-disabled') !== 'true' && b.closest('.cp-drone').dataset.drone !== p0); return e ? { id: e.closest('.cp-drone').dataset.drone, label: e.textContent } : null; }, pick);
  check('while the first drone is still on its way the launch button of the others reads "Reassign here"', pick2 && /Reassign here/.test(pick2.label), JSON.stringify(pick2));
  await page.click(`#cr-tp-fleet .cp-drone[data-drone="${pick2.id}"] .cp-launch`);
  const ra = await W(page, ([a, b, i]) => { const d = id => ControlRoom.api.drones().find(x => x.id === id).state; return { a: d(a), b: d(b), assigned: ControlRoom.api.alert(i).droneId, dec: ControlRoom.api.decisions().some(x => x.type === 'reassign') }; }, [pick, pick2.id, aid]);
  check('Reassign: the new drone launches and the old one (not yet on station) is recalled (back on its pad or returning); a "reassign" decision is logged', ['launching', 'en-route'].includes(ra.b) && !['launching', 'en-route', 'on-station'].includes(ra.a) && ra.assigned === pick2.id && ra.dec, JSON.stringify(ra));
  // role lock
  await W(page, () => ControlRoom.api.setRole('viewer')); await sleep(150);
  const lk = await W(page, () => { const b = [...document.querySelectorAll('#cr-tp-fleet .cp-drone:not([hidden]) .cp-launch')].find(x => x.getAttribute('aria-disabled') !== 'true'); return { has: !!b, locked: b && b.getAttribute('data-locked'), lockIcon: b && getComputedStyle(b.querySelector('.cp-lock')).display !== 'none', rej0: ControlRoom.S.rejects, id: b && b.closest('.cp-drone').dataset.drone }; });
  check('a viewer sees the lock on the launch buttons', lk.has && lk.locked === 'operator' && lk.lockIcon, JSON.stringify(lk));
  await page.click(`#cr-tp-fleet .cp-drone[data-drone="${lk.id}"] .cp-launch`);
  const lk2 = await W(page, id => ({ st: ControlRoom.api.drones().find(x => x.id === id).state, rej: ControlRoom.S.rejects, log: ControlRoom.api.oplog().filter(e => e.kind === 'reject').length }), lk.id);
  check('a viewer\'s launch is refused with a logged reason (the drone stays put, the rejection is counted)', lk2.st !== 'launching' && lk2.st !== 'en-route' && lk2.rej > lk.rej0 && lk2.log >= 1, JSON.stringify(lk2));
  await W(page, () => ControlRoom.api.setRole('operator'));
  // coverage honesty
  const cov = await txt(page, '#cr-tp-fleet .cp-cov');
  const live = await W(page, () => ControlRoom.mods.panels.coverageLive(true));
  check('the coverage card says honestly that about a third of incidents are out of range, with a live sampled figure (SIM)', /about a third of incidents are out of range of every drone/i.test(cov) && live.pct >= 0 && live.pct <= 100 && live.n === 120 && /SIM/.test(cov) && new RegExp('Right now: a drone can reach\\s*' + live.pct).test(cov.replace(/\s+/g, ' ')) || /Right now/.test(cov), `${live.pct}% | ${cov.slice(0, 160)}`);
  await W(page, () => { document.querySelector('#cr-tp-fleet .cp-cov-more summary').click(); }); await sleep(100);
  check('before measuring, the documented run is shown and labelled (seed 7, 150 incidents): 33 % out of range, drone first 90 %, 244 s vs 440 s', /33\s?%/.test(await txt(page, '#cr-tp-fleet .cp-fe')) && /90\s?%/.test(await txt(page, '#cr-tp-fleet .cp-fe')) && /244 s \/ 440 s/.test(await txt(page, '#cr-tp-fleet .cp-fe')) && /SIM/.test(await txt(page, '#cr-tp-fleet .cp-fe')));
  await page.click('#cp-cov-run');
  await page.waitForFunction(() => /Measured now/.test((document.querySelector('#cr-tp-fleet .cp-fe') || {}).textContent || ''), null, { timeout: 40000 });
  const fe = await W(page, () => ControlRoom.mods.panels.state.cov);
  check('"Measure now" runs the engine\'s A/B: the coverage gap is real (> 0 % out of range) and where a drone can reach it is first in most incidents (SIM)', fe.fe && fe.fe.noDroneAvailablePct > 0 && fe.fe.noDroneAvailablePct < 70 && fe.fe.droneFirstPct >= 75 && fe.fe.droneEtaSec.p50 < fe.fe.firstGroundEtaSec.p50, JSON.stringify({ out: fe.fe.noDroneAvailablePct, first: fe.fe.droneFirstPct, d: fe.fe.droneEtaSec.p50, g: fe.fe.firstGroundEtaSec.p50 }));
  // charging queue: fly sorties, let them come home
  await step(page, 1500); await tab(page, 'fleet');
  const q = await W(page, () => { const k = ControlRoom.api.snap().kpis.drones; return { n: document.querySelectorAll('#cr-tp-fleet .cp-q-i').length, want: k.charging + k.fault, charging: k.charging, txt: [...document.querySelectorAll('#cr-tp-fleet .cp-q-i .cp-q-eta')].map(e => e.textContent) }; });
  check('the charging and repair queue lists every charging or faulted drone with the time to ready (mm:ss)', q.charging > 0 && q.n === q.want && q.txt.every(t => /\d+:\d\d|min|ready|repair/.test(t)), JSON.stringify(q));
  const stateMatch = await W(page, () => ControlRoom.api.drones().every(d => document.querySelector(`#cr-tp-fleet .cp-drone[data-drone="${d.id}"]`).dataset.state === d.state));
  check('after 25 simulated minutes every card still shows the engine state of its drone', stateMatch);
  check('FLEET: no console errors', real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 3. DISPATCH */
console.log('\n3. DISPATCH: the fastest unit (not the nearest), runner-up, why, traffic, jam, history, status, hold / cancel, CAP');
{
  const { ctx, page, errors } = await open();
  await ready(page);
  await tab(page, 'dispatch');
  check('no alert: the tab asks to select one and still carries the 999 reminder', /No alert selected/.test(await txt(page, '#cr-tp-dispatch .cp-z-sel')) && /999/.test(await txt(page, '#cr-tp-dispatch .cp-999')) && /never replaces the 999 dispatcher/.test(await txt(page, '#cr-tp-dispatch .cp-999')));
  const aid = await demo(page); await tab(page, 'dispatch'); await sleep(150);
  const eng = await W(page, i => { const a = ControlRoom.api.alert(i), inc = ControlRoom.api.snap().incidents.find(x => x.id === a.incident); return { inc: inc.id, state: inc.plan.state, units: inc.plan.units.map(u => ({ slot: u.slot, kind: u.kind, id: u.unitId, name: u.name.en, ffb: !!(u.whyData && u.whyData.farButFaster), nearest: u.nearestByStraight && u.nearestByStraight.unitId, ru: u.runnerUp && { name: u.runnerUp.name.en, eta: u.runnerUp.etaSec }, why: u.why.en, gain: u.whyData && u.whyData.gainSec, eta: u.etaSec, chosenEta: u.whyData && u.whyData.chosen && u.whyData.chosen.etaSec, delay: u.whyData && u.whyData.chosen && u.whyData.chosen.delaySec })) }; }, aid);
  const ui = await W(page, () => [...document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot]')].map(c => ({ slot: c.dataset.slot, kind: c.dataset.kind, unit: c.dataset.unit, name: (c.querySelector('.cp-u-n') || {}).textContent, ffb: (c.querySelector('[data-ffb]') || {}).textContent || null, nf: /Nearest and fastest/.test(c.textContent), ru: (c.querySelector('.cp-ru') || {}).textContent || null, why: (c.querySelector('.cp-why-t') || {}).textContent || null, eta: (c.querySelector('[data-eta]') || {}).textContent, facts: [...c.querySelectorAll('.cp-kv')].map(k => [k.querySelector('.k').textContent, k.querySelector('.v').textContent]) })));
  check('the plan is shown for the selected alert: one card per service the hazard needs (fire, ambulance, police, rescue for a fire)', ui.length === eng.units.length && eng.units.map(u => u.slot).every(s => ui.some(c => c.slot === s)) && ['fire', 'ambulance', 'police'].every(k => ui.some(c => c.kind === k)), JSON.stringify(ui.map(c => c.slot)));
  check('each card shows the unit the engine chose (the winner), once', eng.units.every(u => { const c = ui.find(x => x.slot === u.slot); return c && c.unit === u.id && c.name === u.name; }), JSON.stringify(ui.map(c => c.name)));
  const ffbAll = eng.units.filter(u => u.ffb), nearAll = eng.units.filter(u => !u.ffb && u.nearest === u.id);
  check('THE PROPERTY: in this case the fastest unit is NOT the nearest in a straight line for at least one service (engine: farButFaster and nearestByStraight differ from the winner)', ffbAll.length >= 1 && ffbAll.every(u => u.nearest && u.nearest !== u.id), JSON.stringify(ffbAll.map(u => [u.slot, u.name])));
  check('…and the card is flagged "Farther but faster by mm:ss (+km)" for exactly those units, with the gain the engine computed', eng.units.every(u => { const c = ui.find(x => x.slot === u.slot); return u.ffb ? c.ffb && /^Farther but faster by \d+:\d\d/.test(c.ffb) && secOf(c.ffb) === Math.round(u.gain) : !c.ffb; }), JSON.stringify(ui.map(c => [c.slot, c.ffb])));
  check('…and where the winner IS the nearest it says "Nearest and fastest" instead (a control: the flag is not shown everywhere)', nearAll.length >= 1 && nearAll.every(u => ui.find(c => c.slot === u.slot).nf), JSON.stringify(nearAll.map(u => [u.slot, u.name])));
  check('the runner-up is shown with its name, ETA and the seconds it loses to the winner', eng.units.filter(u => u.ru).every(u => { const c = ui.find(x => x.slot === u.slot); return c.ru && c.ru.includes(u.ru.name) && secOf(c.ru) === Math.round(u.ru.eta) && /\+\d+:\d\d/.test(c.ru); }), JSON.stringify(ui.map(c => c.ru)));
  check('"Why this unit?" carries the engine\'s own sentence (farther by km but faster by mm:ss because of the congestion on ...)', eng.units.every(u => ui.find(c => c.slot === u.slot).why === u.why) && /farther \(straight line\) but .* faster because/.test(ui.find(c => c.slot === 'fire').why), ui.find(c => c.slot === 'fire').why);
  const f0 = ui.find(c => c.slot === 'fire'), factVal = (c, k) => (c.facts.find(x => x[0] === k) || [])[1];
  check('ETA by traffic: free-flow ETA < ETA with traffic, the delay is the difference, and the ETA text is the engine\'s plan ETA', secOf(factVal(f0, 'Free-flow ETA')) < secOf(factVal(f0, 'With traffic')) && Math.abs(secOf(factVal(f0, 'With traffic')) - secOf(factVal(f0, 'Free-flow ETA')) - secOf(factVal(f0, 'Traffic delay'))) <= 1 && secOf(f0.eta) === Math.round(eng.units[0].eta) && /km/.test(factVal(f0, 'Route length')) && /km/.test(factVal(f0, 'Straight line')) && /^\d+$/.test(factVal(f0, 'Congested segments')), JSON.stringify(f0.facts));
  check('route length (road) is longer than the straight line, as it must be', parseFloat(factVal(f0, 'Route length')) > parseFloat(factVal(f0, 'Straight line')));
  check('every unit starts as "Recommended" (nothing is sent before the human key) and the stepper is on step 1', ui.length > 0 && (await W(page, () => [...document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot] .tag')].filter(t => /Recommended/.test(t.textContent)).length)) === ui.length && (await txt(page, '#cr-tp-dispatch .cp-steps li.now')) === 'Recommended');
  // traffic card
  const tr = await W(page, () => { const s = ControlRoom.api.snap(); return { poly: document.querySelector('#cr-tp-dispatch .cp-spark polyline').getAttribute('points').split(' ').length, txt: document.querySelector('#cr-tp-dispatch .cp-trf').textContent.replace(/\s+/g, ' '), pressure: Math.round(s.traffic.pressure * 100), clock: s.clock.slice(0, 5), day: s.dayType }; });
  check('the traffic card draws the day\'s pressure curve with the time now and shows the pressure from the engine for this time of day', tr.poly === 49 && new RegExp('Peak pressure now\\s*' + tr.pressure + ' ?%').test(tr.txt) && tr.txt.includes(tr.clock) && /Working day/.test(tr.txt) && /simulated by stated rules/.test(tr.txt), JSON.stringify(tr));
  // drone before ground
  const ey = await txt(page, '#cr-tp-dispatch .cp-eyes-c');
  check('"drone before the ground unit": the drone ETA, the first ground unit and the lead are shown, with the documented SIM measurement (90 %, 244 s vs 440 s)', (await W(page, () => document.querySelectorAll('#cr-tp-dispatch .cp-eye').length)) === 3 && /DR-\d\d/.test(ey) && /90 %/.test(ey) && /244 s vs 440 s/.test(ey) && /SIM/.test(ey), ey.slice(0, 200));
  // the time of day changes the ETA (03:00 vs 07:45): same place, quiet roads
  const eta0745 = secOf(factVal(f0, 'With traffic')), pr0745 = tr.pressure;
  await W(page, () => ControlRoom.api.reset({ hour: 3, playing: false })); await W(page, () => ControlRoom.api.setPlaying(false));
  const aid3 = await demo(page); await tab(page, 'dispatch'); await sleep(200);
  const night = await W(page, () => ({ clock: ControlRoom.api.snap().clock.slice(0, 5), pr: Math.round(ControlRoom.api.snap().traffic.pressure * 100), f: [...document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot="fire"] .cp-kv')].map(k => [k.querySelector('.k').textContent, k.querySelector('.v').textContent]) }));
  const etaNight = secOf((night.f.find(x => x[0] === 'With traffic') || [])[1]);
  check('time-varying traffic: the same fire at 03:00 has a lower peak pressure and a faster fire unit than at 07:45 (the rush hour)', /^0[3]:/.test(night.clock) && night.pr < pr0745 && etaNight < eta0745, JSON.stringify({ night, eta0745, pr0745, etaNight }));
  await W(page, () => ControlRoom.api.reset({ hour: 7.75, playing: false })); await W(page, () => ControlRoom.api.setPlaying(false));

  // the jam toggle changes the plan
  const aid2 = await demo(page); await tab(page, 'dispatch'); await sleep(200);
  const before = await W(page, () => ControlRoom.mods.panels.plan().plan.units.filter(u => u.unitId).map(u => [u.slot, u.unitId, (u.whyData && u.whyData.chosen && u.whyData.chosen.etaSec) || u.etaSec]));
  check('the jam switch is offered while the plan is a recommendation', await W(page, () => !!document.querySelector('#cp-jam') && !document.querySelector('#cp-jam').checked));
  await page.click('#cp-jam');
  const jm = await W(page, () => ({ jams: Object.keys(ControlRoom.S.jams).length, ops: ControlRoom.api.oplog().filter(e => /jammed a road/.test(e.text.en)).length, fx: !!document.querySelector('#cr-tp-dispatch .cp-fx'), checked: document.querySelector('#cp-jam').checked, dec: ControlRoom.api.decisions().some(d => d.type === 'jam') }));
  check('jam: six segments of the first unit\'s route are jammed through the console (logged, on the map), a decision is recorded and the before / now card appears', jm.jams >= 4 && jm.ops === jm.jams && jm.fx && jm.checked && jm.dec, JSON.stringify(jm));
  await step(page, 60); await sleep(150);
  const after = await W(page, () => ({ units: ControlRoom.mods.panels.plan().plan.units.filter(u => u.unitId).map(u => [u.slot, u.unitId, (u.whyData && u.whyData.chosen && u.whyData.chosen.etaSec) || u.etaSec]), ev: ControlRoom.api.nat().events.filter(e => /recommendation-change|redispatch/.test(e.type)).length, hist: document.querySelectorAll('#cr-tp-dispatch .cp-hist li').length, chg: document.querySelectorAll('#cr-tp-dispatch .cp-fx-r.chg').length, fxTxt: document.querySelector('#cr-tp-dispatch .cp-fx').textContent.replace(/\s+/g, ' '), plan: ControlRoom.api.snap().incidents[0].plan.state }));
  const changed = after.units.some((u, i) => !before[i] || u[1] !== before[i][1] || Math.abs(u[2] - before[i][2]) >= 5);
  check('jam → the engine re-evaluates: the plan changes (another unit wins, or the ETA moves) and a recommendation-change event is recorded', changed && after.ev >= 1, JSON.stringify({ before, after: after.units, ev: after.ev }));
  check('the before / now card shows the unit that changed, and the re-dispatch history lists the change', after.chg >= 1 && /Before/.test(after.fxTxt) && /Now/.test(after.fxTxt) && after.hist >= 1, JSON.stringify({ chg: after.chg, hist: after.hist }));
  const winners = await W(page, () => [...document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot]')].map(c => [c.dataset.slot, c.dataset.unit]));
  check('the cards follow the new plan (same winners as the engine)', winners.every(([s, id]) => after.units.some(u => u[0] === s && u[1] === id)), JSON.stringify(winners));
  await page.click('#cp-jam');
  const off = await W(page, () => ({ jams: Object.keys(ControlRoom.S.jams).length, fx: !!document.querySelector('#cr-tp-dispatch .cp-fx'), checked: document.querySelector('#cp-jam').checked }));
  check('the switch off clears exactly the jams it set and removes the before / now card', off.jams === 0 && !off.fx && !off.checked, JSON.stringify(off));

  // hold, then approve; per-unit status
  const held = await W(page, i => { document.querySelector('#cp-hold').click(); return { dec: ControlRoom.api.decisions().some(d => d.type === 'hold'), tag: /On hold/.test(document.querySelector('#cr-tp-dispatch .cp-z-sel').textContent), btn: document.querySelector('#cp-hold').getAttribute('aria-pressed') }; }, aid2);
  check('Hold: the dispatch is put on hold (a decision, a visible "On hold", nothing is sent)', held.dec && held.tag && held.btn === 'true' && (await W(page, () => ControlRoom.api.snap().incidents[0].plan.state)) === 'recommended', JSON.stringify(held));
  await page.click('#cp-approve'); await sleep(250);
  check('Approve on an unconfirmed alert opens the shell\'s confirmation dialog (proof before panic: one key only needs a second look)', await W(page, () => { const d = document.querySelector('#cr-dlg-approve'); return !!d && (d.open || d.hasAttribute('open')); }));
  await page.keyboard.press('Escape'); await sleep(150);
  await approve(page, aid2); await step(page, 12); await sleep(150);
  const ap = await W(page, () => ({ plan: ControlRoom.api.snap().incidents.slice(-1)[0].plan.state, held: /On hold/.test(document.querySelector('#cr-tp-dispatch .cp-z-sel').textContent), tags: [...document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot] > .cp-tags .tag')].filter(t => /Assigned|Turning out/.test(t.textContent)).length, now: document.querySelector('#cr-tp-dispatch .cp-steps li.now').textContent }));
  check('after the human key the hold is gone, the stepper moves on and units are "Assigned" / "Turning out"', ap.plan !== 'recommended' && !ap.held && ap.tags >= 2 && /Approved|Dispatched/.test(ap.now), JSON.stringify(ap));
  await step(page, 420); await sleep(150);
  const en = await W(page, () => ({ tags: [...document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot]')].map(c => [c.dataset.kind, (c.querySelector('.cp-mini li.now') || {}).textContent]), eng: ControlRoom.api.snap().incidents.slice(-1)[0].plan.units.map(u => [u.kind, u.state]) }));
  check('per-unit status follows the engine: assigned → en route → on scene (the police unit, the nearest, arrives first)', en.tags.every(t => t[1]) && en.eng.some(u => u[1] === 'en-route' || u[1] === 'on-scene') && en.tags.some(t => t[1] === 'En route' || t[1] === 'On scene') && en.eng.every(u => { const t = en.tags.find(x => x[0] === u[0]); return u[1] === 'en-route' ? t[1] === 'En route' : u[1] === 'on-scene' ? t[1] === 'On scene' : true; }), JSON.stringify(en));
  // cancel: needs the incident commander once units are committed
  const rej0 = await W(page, () => ControlRoom.S.rejects);
  await page.click('#cp-cancel');
  const c1 = await W(page, i => ({ rej: ControlRoom.S.rejects, st: ControlRoom.api.nat().incidents.find(x => x.id === ControlRoom.api.alert(i).incident).status }), aid2);
  check('Cancel the dispatch by an operator is refused (it needs the incident commander): logged, the incident goes on', c1.rej === rej0 + 1 && c1.st !== 'cancelled', JSON.stringify(c1));
  await W(page, () => ControlRoom.api.setRole('commander')); await sleep(150);
  const clr0 = await W(page, () => ControlRoom.api.bus().clear);
  await page.click('#cp-cancel'); await sleep(200);
  const c2 = await W(page, i => ({ st: ControlRoom.api.nat().incidents.find(x => x.id === ControlRoom.api.alert(i).incident).status, dec: ControlRoom.api.decisions().some(d => d.type === 'cancel'), clear: ControlRoom.api.bus().clear }), aid2);
  check('Cancel by the incident commander stands the units down (incident cancelled, a decision, the phones are told "all clear")', c2.st === 'cancelled' && c2.dec && c2.clear > clr0, JSON.stringify(c2));
  await W(page, () => ControlRoom.api.setRole('operator'));

  // CAP export
  const aid4 = await demo(page, { lon: 51.4435, lat: 25.3548 }); await tab(page, 'dispatch'); await sleep(200);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#cp-cap')]);
  const cap = fs.readFileSync(await dl.path(), 'utf8');
  check('CAP 1.2 export: a downloaded XML with status Exercise, both languages, the incident and the units', /^<\?xml/.test(cap) && /urn:oasis:names:tc:emergency:cap:1\.2/.test(cap) && /<status>Exercise<\/status>/.test(cap) && /xml:lang|<language>ar/.test(cap) && /<language>en/.test(cap) && /MANARA-EXERCISE/.test(cap) && /manara-cap-N\d+\.xml/.test(dl.suggestedFilename()), dl.suggestedFilename() + ' ' + cap.slice(0, 120));
  check('exporting is an operator action in the log', await W(page, () => ControlRoom.api.oplog().some(e => /CAP 1\.2/.test(e.text.en))));

  // an alert with no incident: the engine's PURE recommendation as a preview
  const pv = await W(page, () => { const CR = ControlRoom, r = ManaraNational.launchDrone(CR.api.nat(), 'nearest', { lon: 51.52, lat: 25.42, hazard: 'fire' }, { by: 'operator' }); CR.api.step(5); const a = CR.api.alerts().find(x => x.id === r.alert); CR.api.select(a.id, { fly: false }); return { id: a.id, inc: a.incident }; });
  await sleep(250);
  const pvui = await W(page, () => ({ txt: document.querySelector('#cr-tp-dispatch .cp-z-sel').textContent, units: document.querySelectorAll('#cr-tp-dispatch .cp-unit[data-slot]').length, route: document.querySelectorAll('#cr-tp-dispatch .cp-unit [data-fk^="rt:"]').length, jam: !!document.querySelector('#cp-jam'), appr: !!document.querySelector('#cp-approve') }));
  check('an alert with no incident yet shows a labelled PREVIEW of the engine\'s recommendation (nothing reserved): units, no route button, no jam switch, Approve available', !pv.inc && /Preview/.test(pvui.txt) && /reserves no unit/.test(pvui.txt) && pvui.units >= 2 && pvui.route === 0 && !pvui.jam && pvui.appr, JSON.stringify(pvui));
  check('DISPATCH: no console errors', real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 4. COMMS */
console.log('\n4. COMMS: the unified log, bus messages in and out, announcements, filter, search, export, broadcast');
{
  const { ctx, page, errors } = await open();
  await ready(page);
  const aid = await demo(page); await approve(page, aid); await step(page, 330);
  await tab(page, 'comms');
  // announcements through a drone speaker (a drone on station)
  const dr = await W(page, i => { const a = ControlRoom.api.alert(i); const d = ControlRoom.api.drones().find(x => x.id === a.droneId); return { id: a.droneId, state: d && d.state }; }, aid);
  check('the verifying drone is on station (so its speaker can be used)', ['on-station', 'verifying'].includes(dr.state), JSON.stringify(dr));
  await W(page, d => ControlRoom.api.announce(d, 'identify', 'ar'), dr.id); await step(page, 5);
  // messages from OTHER tabs arrive over the same bus (the 'storage' event is how Manara.link delivers when BroadcastChannel is unavailable)
  const msgs = [{ type: 'citizen', id: 'A-N1', status: 'safe', room: 'R12' }, { type: 'detection', state: 'fire', confidence: 0.91, source: 'camera' }, { type: 'robot-find', id: 'RF-1', person: 'abu-salem', room: 'bedroom' }, { type: 'drone-status', id: 'DS-9' }, { type: 'dispatch', id: 'D-N1', state: 'approved' }];
  await W(page, ms => ms.forEach((m, i) => window.dispatchEvent(new StorageEvent('storage', { key: 'manara-bus', newValue: JSON.stringify(Object.assign({ _k: 'test-' + i, from: m.type === 'detection' ? 'detect.html' : m.type === 'citizen' ? 'alert.html' : 'robot.html', ts: Date.now() }, m)) }))), msgs);
  await step(page, 5);
  const ent = await W(page, () => { const P = ControlRoom.mods.panels, e = P.entries(); return { n: e.length, cats: e.reduce((m, x) => (m[x.cat] = (m[x.cat] || 0) + 1, m), {}), types: e.filter(x => x.msgType).map(x => x.msgType), dom: document.querySelectorAll('#cr-tp-comms .cp-ev').length, chipSum: [...document.querySelectorAll('#cr-tp-comms .chip[data-cat]:not([data-cat="all"]) .cp-fc')].reduce((s, x) => s + +x.textContent, 0), chipAll: +document.querySelector('#cr-tp-comms .chip[data-cat="all"] .cp-fc').textContent }; });
  check('the log collects operator actions, the engine\'s drone comms, bus messages sent to the phones, phone replies, detector results, robot finds and announcements', ['operator', 'flow', 'drone', 'voice', 'bus', 'phone', 'robot', 'detect'].every(c => ent.cats[c] >= 1), JSON.stringify(ent.cats));
  check('bus messages are logged with their type: alert and dispatch sent to the phones; robot-find, drone-status and dispatch received', ['alert', 'dispatch', 'robot-find', 'drone-status'].every(t => ent.types.includes(t)), ent.types.join());
  check('the filter chips count every entry exactly once (all = sum of the categories) and the list shows them', ent.chipAll === ent.n && ent.chipSum === ent.n && ent.dom === Math.min(ent.n, 120), JSON.stringify({ n: ent.n, all: ent.chipAll, sum: ent.chipSum, dom: ent.dom }));
  const lines = await W(page, () => [...document.querySelectorAll('#cr-tp-comms .cp-ev')].map(e => ({ cat: e.dataset.cat, t: e.querySelector('time').textContent, x: e.querySelector('.cp-ev-x p').textContent })));
  check('entries are newest first and carry the simulated clock time (hh:mm:ss)', lines.every(l => /^\d\d:\d\d:\d\d$/.test(l.t)) && lines.map(l => l.t).join() === lines.map(l => l.t).slice().sort().reverse().join());
  check('the operator\'s approval and the drone announcement (with the phrase it spoke) are in the log', lines.some(l => l.cat === 'operator' && /approved alert/.test(l.x)) && lines.some(l => l.cat === 'voice' && /Voice announcement via DR-\d\d \(Arabic\)/.test(l.x)));
  // filter
  await page.click('#cr-tp-comms .chip[data-cat="phone"]');
  const ph = await W(page, () => ({ rows: [...document.querySelectorAll('#cr-tp-comms .cp-ev')].map(e => e.dataset.cat), cnt: document.querySelector('#cr-tp-comms .cp-count').textContent, pressed: document.querySelector('#cr-tp-comms .chip[data-cat="phone"]').getAttribute('aria-pressed') }));
  check('filter "Resident phones" shows only phone messages ("I\'m safe" from the phone tab) and the count line says how many', ph.rows.length >= 1 && ph.rows.every(c => c === 'phone') && ph.pressed === 'true' && /Showing \d+ of \d+/.test(ph.cnt), JSON.stringify(ph));
  await page.click('#cr-tp-comms .chip[data-cat="robot"]');
  check('filter "Robot" shows the robot-find message from the robot page', await W(page, () => { const r = [...document.querySelectorAll('#cr-tp-comms .cp-ev')]; return r.length >= 1 && r.every(e => e.dataset.cat === 'robot') && r.some(e => /robot-find/.test(e.textContent)); }));
  await page.click('#cr-tp-comms .chip[data-cat="all"]');
  // search
  await page.fill('#cp-q', 'AL-1');
  const sr = await W(page, () => ({ n: document.querySelectorAll('#cr-tp-comms .cp-ev').length, ok: [...document.querySelectorAll('#cr-tp-comms .cp-ev')].every(e => /AL-1/i.test(e.textContent)) }));
  check('search "AL-1" keeps only entries that mention the alert', sr.n >= 3 && sr.ok, JSON.stringify(sr));
  await page.fill('#cp-q', 'zzzqqq-no-such-text');
  check('a search with no match says so', /No entries match/.test(await txt(page, '#cr-tp-comms .cp-z-list')));
  await page.fill('#cp-q', 'robot-find');
  check('search finds a message type', (await W(page, () => document.querySelectorAll('#cr-tp-comms .cp-ev').length)) >= 1);
  await page.fill('#cp-q', '');
  // typing in the search box does not trigger the console's one-key shortcuts
  await page.focus('#cp-q'); await page.keyboard.type('adejkw 1');
  check('typing in the search field never triggers the console shortcuts (a / d / e / j / k / w / 1 …)', await W(page, i => ControlRoom.api.alert(i).state !== 'DISMISSED' && !document.documentElement.classList.contains('cr-wall') && ControlRoom.api.selected() === i, aid));
  await page.fill('#cp-q', '');
  // selected-alert filter
  await page.click('label.switch:has(#cp-selonly)');
  const so = await W(page, i => { const inc = ControlRoom.api.alert(i).incident, all = ControlRoom.mods.panels.entries().length, f = ControlRoom.mods.panels.filtered(); return { n: document.querySelectorAll('#cr-tp-comms .cp-ev').length, ok: f.every(e => e.alert === i || e.inc === inc), f: f.length, all }; }, aid);
  check('"Selected alert only" keeps only the entries that belong to the selected alert (or its incident) and fewer than the whole log', so.n >= 2 && so.ok && so.f < so.all, JSON.stringify(so));
  await page.click('label.switch:has(#cp-selonly)');
  // export (filtered) as a text file
  await page.click('#cr-tp-comms .chip[data-cat="operator"]');
  const nOp = await W(page, () => ControlRoom.mods.panels.filtered().length);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#cp-export')]);
  const exp = fs.readFileSync(await dl.path(), 'utf8'), body = exp.split('\n').filter(l => /^\[\d\d:\d\d:\d\d\]/.test(l));
  check('Export: a .txt file with a SIMULATION header, the filter, and exactly the filtered entries as "[clock] [type] text"', /manara-comms-.*\.txt$/.test(dl.suggestedFilename()) && /SIMULATION/.test(exp) && /Filter: Operator/.test(exp) && /999 stays the dispatcher/.test(exp) && body.length === nOp && body.every(l => /\[Operator\]/.test(l)), `${dl.suggestedFilename()} ${body.length}/${nOp}`);
  await page.click('#cr-tp-comms .chip[data-cat="all"]');
  check('exporting is itself logged as an operator action', await W(page, () => ControlRoom.api.oplog().some(e => /exported the comms log/.test(e.text.en))));

  // the broadcast composer
  const bc = await W(page, () => ({ zones: document.querySelectorAll('#cp-bc-zone option').length, munis: [...document.querySelectorAll('#cp-bc-zone option')].filter(o => /municipality/.test(o.textContent)).length, ar: document.querySelector('#cp-bc-ar').value, en: document.querySelector('#cp-bc-en').value }));
  check('the composer offers the selected alert\'s surroundings, the 8 municipalities and the named places', bc.munis === 8 && bc.zones >= 100, JSON.stringify({ z: bc.zones, m: bc.munis }));
  check('the AR and EN texts are filled from the reviewed MANARA_MSG template (Arabic letters in AR, Latin in EN)', /[\u0600-\u06ff]{3}/.test(bc.ar) && /[A-Za-z]{4}/.test(bc.en) && bc.ar.length > 20 && bc.en.length > 20, bc.en.slice(0, 80));
  await page.selectOption('#cp-bc-hz', 'gas');
  const gas = await W(page, () => document.querySelector('#cp-bc-en').value);
  check('changing the hazard changes the template text', gas !== bc.en && /gas|smell|leak/i.test(gas), gas.slice(0, 80));
  await page.selectOption('#cp-bc-zone', 'm:doha'); await page.selectOption('#cp-bc-lv', 'warning');
  const nBus = await W(page, () => ControlRoom.api.bus().alert);
  await W(page, () => ControlRoom.api.setRole('viewer')); await sleep(100);
  await page.click('#cp-bc-send');
  check('a viewer cannot broadcast (refused and logged)', (await W(page, () => ControlRoom.api.bus().alert)) === nBus && (await W(page, () => ControlRoom.api.oplog().filter(e => e.kind === 'reject').length)) >= 1);
  await W(page, () => ControlRoom.api.setRole('operator')); await sleep(100);
  await page.click('#cp-bc-send');
  check('the first press only asks for confirmation (nothing is sent yet)', (await W(page, () => ControlRoom.api.bus().alert)) === nBus && /Press again to confirm/.test(await txt(page, '#cp-bc-send')));
  await page.click('#cp-bc-send'); await sleep(150);
  const sent = await W(page, () => ({ bus: ControlRoom.api.bus().alert, last: Manara.link.last('alert'), log: ControlRoom.api.oplog().filter(e => /Manual broadcast/.test(e.text.en)).length, dec: ControlRoom.api.decisions().some(d => d.type === 'broadcast') }));
  check('the second press sends a bus alert to the phones: scope national, SIM, marked as a broadcast, zone Doha, shelter level, hazard gas', sent.bus === nBus + 1 && sent.last && sent.last.broadcast === true && sent.last.scope === 'national' && sent.last.sim === true && /^B-\d+$/.test(sent.last.id) && sent.last.hazard === 'gas' && sent.last.level === 'shelter' && /Doha/.test(sent.last.area.en) && /الدوحة/.test(sent.last.area.ar) && Math.abs(sent.last.at.lon - 51.52) < 0.2, JSON.stringify(sent.last).slice(0, 220));
  check('the broadcast and its texts are logged (bus entry, operator text, decision)', sent.log >= 1 && sent.dec);
  // a drone-speaker announcement from the composer
  const v0 = await W(page, () => ControlRoom.mods.panels.entries().filter(e => e.cat === 'voice').length);
  await page.selectOption('#cp-dv-key', 'move-away'); await page.selectOption('#cp-dv-lang', 'both');
  const dvInfo = await txt(page, '.cp-say');
  await page.click('#cp-dv-send'); await sleep(200);
  const v1 = await W(page, () => ControlRoom.mods.panels.entries().filter(e => e.cat === 'voice').map(e => e.text.en));
  check('a drone-speaker announcement in Arabic and English: two logged announcements using the engine\'s reviewed phrase', v1.length === v0 + 2 && /Move away from the building/.test(v1.join(' ')) && /It will say/.test(dvInfo), JSON.stringify({ v0, v1: v1.slice(-2), dvInfo }));
  check('COMMS: no console errors', real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 5. HANDOVER */
console.log('\n5. HANDOVER: decisions (who / when / why), open incidents, committed units, SIM labels, notes, copy / download, print');
{
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx0.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  const { ctx, page, errors } = await open({ context: ctx0, lang: 'en' });
  await ready(page);
  const aid = await demo(page); await approve(page, aid);
  const aid2 = await demo(page, { lon: 51.4435, lat: 25.3548, hazard: 'gas', step: 10 });
  await W(page, i => ControlRoom.api.dismiss(i), aid2); await W(page, i => ControlRoom.api.escalate(i), aid);
  await step(page, 90); await tab(page, 'handover'); await sleep(250);
  const R = await W(page, () => { const r = document.querySelector('#cr-tp-handover .cp-report'); return { txt: r.textContent.replace(/\s+/g, ' '), sims: r.querySelectorAll('.cr-sim').length, nums: r.querySelectorAll('.cp-rep-n').length, open: [...r.querySelectorAll('[data-alert]')].map(e => e.dataset.alert), dec: [...r.querySelectorAll('li[data-type]')].map(e => ({ type: e.dataset.type, role: e.querySelector('.tag').textContent, time: e.querySelector('time').textContent, why: /Why:/.test(e.textContent), text: e.querySelector('p').textContent })), sections: [...r.querySelectorAll('h5')].map(h => h.querySelector('[data-l="en"]').textContent.trim()), risks: r.querySelectorAll('.risks .risk').length, committed: r.querySelectorAll('.cp-rep-s:nth-of-type(5) li').length }; });
  check('the report has every section: numbers, open incidents, decisions, units still committed, drones, outstanding risks', ['The numbers of the shift (all SIM)', 'Open incidents', 'Decisions (who / when / why)', 'Units still committed', 'Drones', 'Outstanding risks'].every(s => R.sections.includes(s)), R.sections.join(' | '));
  check('every number of the shift is labelled SIM (a SIM badge, "(all SIM)", the simulation disclaimer) and there are at least 14 of them', R.sims >= 1 && /\(all SIM\)/.test(R.txt) && /Simulation \(SIM\): no real incident, no real unit, no real resident/.test(R.txt) && R.nums >= 14, JSON.stringify({ sims: R.sims, nums: R.nums }));
  check('open incidents lists the open alert; the dismissed one is not open', R.open.includes(aid) && !R.open.includes(aid2), R.open.join());
  const by = t => R.dec.filter(d => d.type === t);
  check('decisions carry who (the simulated role), when (the simulated clock hh:mm:ss) and why: approve, dismiss, escalate, launch', ['approve', 'dismiss', 'escalate'].every(t => by(t).length >= 1) && R.dec.every(d => /^\d\d:\d\d:\d\d$/.test(d.time) && /Operator|Viewer|Incident commander/.test(d.role)) && by('approve').every(d => d.why) && by('dismiss').every(d => d.why), JSON.stringify(R.dec.map(d => [d.type, d.role, d.time])));
  check('the approval says WHY (one key only: not yet confirmed), and the dismissal shows the hidden simulation truth only as an after-the-fact line', /Approved on one key|The alert was confirmed/.test(R.txt) && /After the event \(the simulation truth hidden from the operator\)/.test(R.txt));
  const com = await W(page, () => ({ rows: [...document.querySelectorAll('#cr-tp-handover .cp-report .cp-rep-s')].find(s => /Units still committed/.test(s.querySelector('h5').textContent)).querySelectorAll('li').length, eng: ControlRoom.api.snap().units.filter(u => u.assigned || u.state !== 'idle').length }));
  check('units still committed match the engine (every unit that is assigned or not idle)', com.rows === com.eng && com.rows >= 3, JSON.stringify(com));
  check('outstanding risks are listed with a severity (or the honest "no outstanding risk found, not a guarantee")', R.risks >= 1);
  // text, copy, download
  const T = await W(page, () => ControlRoom.mods.panels.handoverText());
  check('"copy as text" content: a titled plain-text report with SIM, numbers, open incidents, decisions with why, committed units, risks, the 999 line', /^SHIFT HANDOVER — MANARA Control Room — SIMULATION \(SIM\)/.test(T) && /== NUMBERS \(all SIM\)/.test(T) && /== OPEN INCIDENTS \(1\)/.test(T) && /== DECISIONS \(who \/ when \/ why\)/.test(T) && /why: /.test(T) && /== UNITS STILL COMMITTED/.test(T) && /== OUTSTANDING RISKS/.test(T) && /999 stays the dispatcher/.test(T) && T.includes(aid), T.slice(0, 160));
  await page.click('#cp-copy-ho'); await sleep(300);
  const clip = await W(page, async () => { try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR ' + e.message; } });
  check('the "Copy as text" button puts the report on the clipboard (and says so)', /^SHIFT HANDOVER/.test(clip) && (await W(page, () => [...document.querySelectorAll('.toast')].some(t => /copied/i.test(t.textContent)))), clip.slice(0, 60));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#cp-dl-ho')]);
  const dtxt = fs.readFileSync(await dl.path(), 'utf8');
  check('"Download (.txt)": the same report as a file', /manara-handover-.*\.txt$/.test(dl.suggestedFilename()) && /^SHIFT HANDOVER/.test(dtxt) && /SIM/.test(dtxt), dl.suggestedFilename());
  // notes
  await page.fill('#cp-ho-notes', 'Check the road jam on Salwa Road before 08:00.'); await sleep(900);
  check('the outgoing operator\'s notes go into the report and into the text', /Check the road jam on Salwa Road/.test(await txt(page, '#cr-tp-handover .cp-rep-notes')) && /NOTES FROM THE OUTGOING OPERATOR/.test(await W(page, () => ControlRoom.mods.panels.handoverText())));
  check('the notes field kept the focus while the report refreshed', await W(page, () => document.activeElement && document.activeElement.id === 'cp-ho-notes'));
  // print
  const css = fs.readFileSync(path.join(ROOT, 'css/control-panels.css'), 'utf8');
  check('the stylesheet has an @media print block that shows only the print clone, a forced-colors block and a reduced-motion block', /@media print\s*\{[\s\S]*body\.cp-printing>\*:not\(#cp-print\)\{display:none!important\}/.test(css) && /@media \(forced-colors:active\)/.test(css) && /@media \(prefers-reduced-motion:reduce\)/.test(css));
  await page.click('#cp-print-btn');
  const pr = await W(page, () => ({ printed: window.__printed, clone: !!document.querySelector('#cp-print .cp-report'), body: document.body.classList.contains('cp-printing'), txt: (document.querySelector('#cp-print') || {}).textContent || '' }));
  check('Print: the button builds a print clone of the report and calls window.print()', pr.printed === 1 && pr.clone && pr.body && /Shift handover report/.test(pr.txt) && /Decisions/.test(pr.txt), JSON.stringify({ printed: pr.printed, clone: pr.clone }));
  const screenOnly = await W(page, () => getComputedStyle(document.querySelector('#cp-print')).display);
  await page.emulateMedia({ media: 'print' }); await sleep(150);
  const pm = await W(page, () => { const cs = e => getComputedStyle(document.querySelector(e)); return { print: cs('#cp-print').display, main: cs('#main').display, nav: cs('.nav').display, top: document.querySelector('#cr-top') ? 'in-main' : '', color: cs('#cp-print .cp-rep-i').color, bg: cs('#cp-print .cp-report').backgroundColor, bodyBg: cs('body').backgroundColor, h5: cs('#cp-print h5').borderBlockEndStyle }; });
  check('print media: only the report is displayed (the console and nav are hidden), in black on white, with section rules', screenOnly === 'none' && pm.print === 'block' && pm.main === 'none' && pm.nav === 'none' && pm.color === 'rgb(0, 0, 0)' && pm.bodyBg === 'rgb(255, 255, 255)' && pm.h5 === 'solid', JSON.stringify({ screenOnly, pm }));
  const pdf = await page.pdf({ format: 'A4', printBackground: false });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('a PDF of the print layout renders (headless Chromium): a valid PDF of 1+ pages', pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 4000 && pages >= 1, `${pdf.length} bytes, ${pages} page(s)`);
  await page.emulateMedia({ media: 'screen' });
  await W(page, () => window.dispatchEvent(new Event('afterprint')));
  check('after printing the clone is removed and the console is back', await W(page, () => !document.querySelector('#cp-print') && !document.body.classList.contains('cp-printing')) && (await W(page, () => getComputedStyle(document.querySelector('#main')).display)) !== 'none');
  await page.click('#cp-print-btn'); await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check('HANDOVER: no console errors', real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 6. honesty and safety */
console.log('\n6. honesty and safety: no innerHTML sinks, logical CSS only, hostile bus text stays text, wording');
{
  const js = fs.readFileSync(path.join(ROOT, 'js/control-panels.js'), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n'), css = fs.readFileSync(path.join(ROOT, 'css/control-panels.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('no innerHTML / outerHTML / insertAdjacentHTML / document.write / eval / new Function / fetch / XHR / import / export in js/control-panels.js', !/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new Function|\bfetch\s*\(|XMLHttpRequest|^\s*(import|export)\s/m.test(js));
  check('a classic IIFE script that attaches to window.ControlRoom (no modules, no libraries, no CDN)', /^\(function \(\) \{\s*'use strict';/m.test(js) && /window\.ControlRoom|win = window, doc = document, CR = win\.ControlRoom/.test(js) && !/https?:\/\//.test(js.replace(/\/\/.*$/gm, '')));
  check('css/control-panels.css: logical properties only (no margin/padding/border -left/-right, no left/right offsets, no text-align left/right, no width/height pairs set as physical offsets)', !/(margin|padding|border)-(left|right)|[;{\s](left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/.test(css), (css.match(/(margin|padding|border)-(left|right)|[;{\s](left|right)\s*:|text-align\s*:\s*(left|right)/g) || []).join(' '));
  check('no letter-spacing anywhere in the panels\' CSS (Arabic)', !/letter-spacing/.test(css));
  const { ctx, page, errors } = await open({ lang: 'ar' });
  await ready(page); const aid = await demo(page); await tab(page, 'comms');
  await W(page, () => { window.__xss = 0; const evil = '<img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script>'; window.dispatchEvent(new StorageEvent('storage', { key: 'manara-bus', newValue: JSON.stringify({ _k: 'evil-1', type: 'alert', from: '<b>evil</b>.html', id: evil, hazard: evil, level: '"><svg onload=window.__xss=3>' }) })); ControlRoom.api.step(5); });
  await sleep(300);
  const ev = await W(page, () => ({ xss: window.__xss, img: document.querySelectorAll('#cr-tp-comms img, #cr-tp-comms svg[onload], #cr-tp-comms script').length, b: document.querySelectorAll('#cr-tp-comms .cp-log b').length, txt: [...document.querySelectorAll('#cr-tp-comms .cp-ev')].find(e => /evil|<img/.test(e.textContent)) ? [...document.querySelectorAll('#cr-tp-comms .cp-ev')].find(e => /evil|<img/.test(e.textContent)).textContent : '' }));
  check('hostile bus text is shown as plain text (no element, no script, no handler ran)', ev.xss === 0 && ev.img === 0 && ev.b === 0 && /<img src=x/.test(ev.txt), JSON.stringify(ev));
  await W(page, () => ControlRoom.mods.panels.coverageRun()); await page.waitForFunction(() => ControlRoom.mods.panels.state.cov, null, { timeout: 40000 });
  const panelsText = {};
  for (const id of ['fleet', 'dispatch', 'comms', 'handover']) { await tab(page, id); panelsText[id] = await txt(page, '#cr-tp-' + id); }
  const all = Object.values(panelsText).join(' ');
  check('the Arabic panels contain Arabic text and the standing honesty words: «999», «محاكاة», «مفهوم»', /[\u0600-\u06ff]{4}/.test(all) && /999/.test(all) && /محاكاة/.test(all) && /مفهوم/.test(all));
  check('no panel claims "AI", deep learning or artificial intelligence; the detector is called rule-based computer vision where it is named', !/\bAI\b|deep learning|artificial intelligence|ذكاء اصطناعي|تعلّم عميق/i.test(all) && /رؤية حاسوبية بقواعد|كاشف الرؤية/.test(panelsText.comms));
  await page.close(); await ctx.close();
  const { ctx: c2, page: p2 } = await open({ lang: 'en' }); await ready(p2); await demo(p2);
  const wording = {}; for (const id of ['fleet', 'dispatch', 'comms', 'handover']) { await tab(p2, id); wording[id] = await txt(p2, '#cr-tp-' + id); }
  check('FLEET says concept + simulated prototype + SIM; DISPATCH says MANARA never replaces the 999 dispatcher and calls the farther-but-faster result a SIM; COMMS says 999 stays the dispatcher; HANDOVER says no real incident', /concept with a simulated prototype/i.test(wording.fleet) && /SIM/.test(wording.fleet) && /never replaces the 999 dispatcher/.test(wording.dispatch) && /simulated by stated rules/.test(wording.dispatch) && /999 stays the dispatcher/.test(wording.comms) && /no real incident, no real unit, no real resident/.test(wording.handover));
  check('no claim of real integration: no "live", "real-time traffic" or "official" claims in the panels', !/real-time traffic|live traffic|official service|integrated with (the )?(police|hospital|999)/i.test(Object.values(wording).join(' ')));
  await c2.close();
}

/* ---------------------------------------------------------------- 7. contrast and accessible names */
console.log('\n7. contrast >= 4.5:1 and accessible names, both themes');
const contrastReport = (page, id) => W(page, i => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) return null; const c = rgba(cs.backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 1) break; } let base = [255, 255, 255, 1]; if (!stack.length || stack[stack.length - 1][3] < 1) base = rgba(getComputedStyle(document.body).backgroundColor); for (let k = stack.length - 1; k >= 0; k--) base = over(stack[k], base); return base; };
  const bad = [], seen = new Set(); let n = 0;
  document.querySelectorAll('#cr-tp-' + i + ' *').forEach(el => {
    if (el.closest('canvas, svg, [hidden], .sr-only, [aria-hidden=true]') || el.matches('option, optgroup, script, style')) return;
    const own = [...el.childNodes].filter(c => c.nodeType === 3 && c.textContent.trim().length > 1); if (!own.length) return;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return; if (el.disabled || el.closest('[disabled]')) return;
    const bg = bgOf(el); if (!bg) return;
    let fg = rgba(cs.color); fg = over(fg, bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5; n++;
    if (ratio < need - 0.01) { const k = (el.className || el.tagName) + '|' + Math.round(ratio * 10); if (!seen.has(k)) { seen.add(k); bad.push(`${el.tagName}.${String(el.className).slice(0, 40)} "${own[0].textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)} (need ${need})`); } }
  });
  return { n, bad: bad.slice(0, 10) };
}, id);
for (const theme of ['dark', 'light']) for (const lang of ['en', 'ar']) {
  const { ctx, page, errors } = await open({ theme, lang });
  await ready(page); const aid = await demo(page); await approve(page, aid); await step(page, 60);
  for (const id of ['fleet', 'dispatch', 'comms', 'handover']) {
    await tab(page, id);
    if (id === 'fleet') await W(page, () => { document.querySelector('#cr-tp-fleet .cp-cov-more summary').click(); });
    if (id === 'dispatch') await W(page, () => document.querySelectorAll('#cr-tp-dispatch .cp-why').forEach(d => { d.open = true; }));
    await sleep(120);
    const rep = await contrastReport(page, id);
    check(`${theme}/${lang} ${id}: text contrast >= 4.5:1 (large text 3:1) over ${rep.n} text elements`, rep.bad.length === 0, rep.bad.join(' ; '));
    const names = await W(page, i => { const miss = []; document.querySelectorAll(`#cr-tp-${i} button, #cr-tp-${i} select, #cr-tp-${i} input, #cr-tp-${i} textarea, #cr-tp-${i} summary`).forEach(e => { if (e.closest('[hidden]')) return; const name = (e.getAttribute('aria-label') || e.textContent || '').trim() || (e.id && document.querySelector('label[for="' + e.id + '"]') && document.querySelector('label[for="' + e.id + '"]').textContent.trim()) || (e.closest('label') && e.closest('label').textContent.trim()) || e.getAttribute('title'); if (!name) miss.push(e.tagName + '.' + String(e.className).slice(0, 30) + '#' + e.id); }); return miss; }, id);
    check(`${theme}/${lang} ${id}: every button, select, input and summary has an accessible name`, names.length === 0, names.slice(0, 8).join(' | '));
  }
  check(`${theme}/${lang}: no console errors`, real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 8. keyboard: the panels are reachable and operable without a pointer */
console.log('\n8. keyboard');
{
  const { ctx, page, errors } = await open();
  await ready(page); const aid = await demo(page); await tab(page, 'fleet');
  await page.focus('#cr-tp-fleet .chip[data-f="all"]');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const reach = await W(page, () => ({ a: document.activeElement.tagName, cls: String(document.activeElement.className), inPanel: !!document.activeElement.closest('#cr-tp-fleet') }));
  check('Tab moves through the fleet controls (chips, sort, then the drone cards) inside the panel', reach.inPanel && /BUTTON|SELECT/.test(reach.a), JSON.stringify(reach));
  await page.focus('#cr-tp-fleet .chip[data-f="docked"]'); await page.keyboard.press('Enter');
  check('a filter chip works with the keyboard (Enter) and keeps the focus', await W(page, () => document.querySelector('#cr-tp-fleet .chip[data-f="docked"]').getAttribute('aria-pressed') === 'true' && document.activeElement.dataset.f === 'docked'));
  await page.keyboard.press('Space'); await page.click('#cr-tp-fleet .chip[data-f="all"]');
  await tab(page, 'dispatch'); await page.focus('#cp-hold'); await page.keyboard.press('Enter'); await sleep(150);
  check('Hold works with the keyboard and the focus stays on the button after the zone is redrawn', await W(page, () => ControlRoom.api.decisions().some(d => d.type === 'hold') && document.activeElement && document.activeElement.id === 'cp-hold'));
  check('KEYBOARD: no console errors', real(errors).length === 0, real(errors).join(' | '));
  allErrors.push(...errors); await ctx.close();
}

check('no console error on any page of the whole run', real(allErrors).length === 0, real(allErrors).slice(0, 4).join(' | '));
await done(browser);
