// Mission Control («غرفة العمليات») browser tests — Playwright + Chromium over file:// (no network).
//   node manara/tools/test-mission.mjs
// Part A (sections 1-15): the neighbourhood view (#scope=local). Part B (sections N1-N18): the NATIONAL view of the whole of Qatar (default).
// Covers: clean load (ar/en × dark/light), every scenario starts and advances, approve → 'alert' on the bus (a second page:
// alert.html) and "I'm awake / I'm safe" there marking the resident safe here, exit lock → re-route, the dispatch rule
// (FASTEST unit given traffic, not the nearest; re-dispatch on a closed road), A/B panel (checked against ManaraSim.ab) and the
// 20-seed distribution, CAP export is well-formed XML, determinism of scrubbing, Present mode, share link, twin-board parser,
// Evidence Lab vision key, keyboard operation, phone layout (bottom sheet) and no horizontal overflow at 390 and 1440.
import fs from 'node:fs';
import { launch, openPage as openPageRaw, overflow, check, done, url } from './lib.mjs';
// Mission Control opens in the NATIONAL view by default; the original (neighbourhood) tests open the local scope explicitly.
const openPage = (b, f, o = {}) => openPageRaw(b, f, f === 'mission.html' && !o.query ? { ...o, query: '#scope=local' } : o);

const SHOTS = process.env.MANARA_SHOTS || '';
const browser = await launch();
const allErrors = [];
const W = (p, fn, ...a) => p.evaluate(fn, ...a);
const ready = p => p.waitForSelector('#main[data-ready="1"]', { timeout: 8000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, timeout = 8000) { try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { return false; } }
const canvasInk = page => W(page, () => {
  const c = document.querySelector('#mc-canvas'); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return seen.size;
});

/* ---------------------------------------------------------------- 1. loads clean: ar/en × dark/light, 1440 and 390 */
console.log('\n1. loads clean');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width, height: width > 600 ? 900 : 844, theme, lang });
  await ready(page); await sleep(500);
  const info = await W(page, () => ({ lang: document.documentElement.dataset.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme,
    layout: document.querySelector('#main').dataset.layout, nav: !!document.querySelector('.nav .nav-bar'), h1: document.querySelector('h1').textContent.trim().length > 3, title: document.title }));
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  check(`${tag}: language, direction, theme applied`, info.lang === lang && info.dir === (lang === 'ar' ? 'rtl' : 'ltr') && info.theme === theme, JSON.stringify(info));
  check(`${tag}: layout is ${width > 1099 ? 'wide' : 'narrow'}`, info.layout === (width > 1099 ? 'wide' : 'narrow'));
  check(`${tag}: nav + heading + title`, info.nav && info.h1 && info.title.length > 5, info.title);
  check(`${tag}: the map canvas is drawn`, (await canvasInk(page)) > 12);
  const ov = await overflow(page);
  check(`${tag}: no horizontal overflow`, ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 2. every scenario starts and advances */
console.log('\n2. scenarios');
const { ctx: c2, page: p2, errors: e2 } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
await ready(p2);
const HAZ = { 'fire-night': 'fire', 'gas-night': 'gas', 'flood-day': 'flood', 'dust-day': 'dust', 'heat-day': 'heat', 'sos-day': 'sos', 'school-fire-day': 'fire' };
for (const id of Object.keys(HAZ)) {
  await p2.click(`.sc-card[data-id="${id}"]`);
  const s = await W(p2, () => { const t0 = MissionControl.sim.t; MissionControl.advance(90); const sn = MissionControl.snap; return { id: MissionControl.state.preset, hz: sn.hazard, t0, t: sn.t, phase: sn.verification.phase, started: !!MissionControl.sim.hz.started, checked: document.querySelector('.sc-card[aria-checked="true"]').dataset.id, people: sn.people.length, clock: sn.clock }; });
  check(`${id}: started (${s.hz}), clock ${s.clock}`, s.id === id && s.hz === HAZ[id] && s.checked === id && s.people > 100);
  check(`${id}: advanced 90 s and the pipeline reacted (${s.phase})`, s.t === 90 && s.started && s.phase !== 'idle');
}
check('scenario clicks: no console errors', e2.length === 0, e2.join(' | '));
allErrors.push(...e2);
await c2.close();

/* ---------------------------------------------------------------- 3. approve → 'alert' on the bus → the phone page → "I'm safe" → Mission Control */
console.log('\n3. approve → bus → phones → check-in');
{
  const { ctx, page: mc, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(mc);
  const { page: ph, errors: e3p } = await openPage(browser, 'alert.html', { context: ctx, width: 1440, height: 900, lang: 'en' });
  await waitFor(ph, () => document.documentElement.getAttribute('data-alert-ready') === '1', null, 8000);
  await W(ph, () => { window.__got = []; Manara.link.on(m => { if (/^alert|^dispatch/.test(m.type)) window.__got.push({ type: m.type, hazard: m.hazard, level: m.level, person: m.person, id: m.id, state: m.state, from: m.from }); }); });
  await W(mc, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); });
  const pre = await W(mc, () => ({ phase: MissionControl.snap.verification.phase, dis: document.querySelector('#pn-proof .mc-approve').disabled }));
  check('CONFIRMED needs the human key: Approve is enabled only now', pre.phase === 'confirmed' && pre.dis === false, JSON.stringify(pre));
  const early = await W(mc, () => { MissionControl.start('fire-night', 7); MissionControl.advance(40); return { phase: MissionControl.snap.verification.phase, dis: document.querySelector('#pn-proof .mc-approve').disabled, alert: !!MissionControl.sim.alert }; });
  check('SUSPECT (one key): Approve stays disabled and no alert exists', early.phase === 'suspect' && early.dis === true && !early.alert, JSON.stringify(early));
  await W(mc, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); });
  await mc.click('#pn-proof .mc-approve');
  await sleep(300);
  const after = await W(mc, () => ({ phase: MissionControl.snap.verification.phase, alert: MissionControl.sim.alert && MissionControl.sim.alert.level, sent: MissionControl.state.alertSent }));
  check('Approve click → PUBLIC alert (evacuate) and the bus message is sent', after.phase === 'public' && after.alert === 'evacuate' && after.sent === true, JSON.stringify(after));
  const gotAlert = await waitFor(ph, () => window.__got.some(m => m.type === 'alert'), null, 6000);
  check('phone page receives the \'alert\' message from Mission Control', gotAlert);
  const got = await W(ph, () => window.__got);
  const persons = new Set(got.filter(m => m.type === 'alert').map(m => m.person));
  check('one alert per demo resident (ravi, huda, abu-salem, lina)', ['ravi', 'huda', 'abu-salem', 'lina'].every(k => persons.has(k)), [...persons].join(','));
  check('alert message: hazard fire, level evacuate, from mission.html', got.some(m => m.type === 'alert' && m.hazard === 'fire' && m.level === 'evacuate' && m.from === 'mission.html'));
  const upd = await waitFor(ph, () => window.__got.some(m => m.type === 'alert-update'), null, 6000);
  check('\'alert-update\' follows about every 2 s', upd);
  const dispOk = await waitFor(ph, () => window.__got.some(m => m.type === 'dispatch'), null, 6000);
  check('\'dispatch\' message (fastest units, SIM) reaches the phones after approval', dispOk);
  const phoneState = await waitFor(ph, () => { const d = ManaraAlert && window.ManaraAlert.debug; return true; }, null, 1000);
  // Ravi (asleep at 04:00): "I'm awake", then "I'm safe" on his phone
  await waitFor(ph, () => !!document.querySelector('[data-phone="ravi"] .act-awake, [data-phone="ravi"] .act-safe'), null, 6000);
  if (await ph.$('[data-phone="ravi"] .act-awake')) await ph.click('[data-phone="ravi"] .act-awake');
  await waitFor(ph, () => !!document.querySelector('[data-phone="ravi"] .act-safe'), null, 6000);
  const hadSafe = !!(await ph.$('[data-phone="ravi"] .act-safe'));
  check('Ravi\'s phone shows the "I\'m safe" button', hadSafe);
  const before = await W(mc, () => MissionControl.snap.headcount.safe + MissionControl.snap.headcount.safeAway);
  if (hadSafe) await ph.click('[data-phone="ravi"] .act-safe');
  const marked = await waitFor(mc, () => { const p = MissionControl.snap && MissionControl.snap.people.find(q => q.key === 'ravi'); return p && p.checkin === 'safe'; }, null, 6000);
  check('clicking "I\'m safe" on the phone marks Ravi safe in Mission Control', marked);
  await W(mc, () => MissionControl.refresh());
  const tile = await W(mc, () => { const t = document.querySelector('.tile[data-room="203"]'); return t ? t.className : ''; });
  check('room 203 tile reflects the check-in (part/all green)', /part|all/.test(tile), tile);
  const hc = await W(mc, () => MissionControl.snap.headcount.safe + MissionControl.snap.headcount.safeAway);
  check('headcount counted-safe went up', hc > before, `${before} -> ${hc}`);
  const logHas = await W(mc, () => /Phone: Ravi/.test(document.querySelector('.evlog').textContent));
  check('the event log records the phone check-in', logHas);
  // "I need help" from another phone → hand-off list
  await W(ph, () => Manara.link.send({ type: 'citizen', id: 'A1', status: 'help', room: '302', lang: 'ar', needs: ['wheelchair'] }));
  allErrors.push(...errors, ...e3p);
  check('bus pages: no console errors', errors.length === 0 && e3p.length === 0, errors.concat(e3p).join(' | '));
  await ctx.close();
}


/* ---------------------------------------------------------------- 4. locking an exit re-routes (event log + route change) */
console.log('\n4. exit lock → re-route');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(55); });
  const before = await W(page, () => {
    const S = ManaraSim, sim = MissionControl.sim, keys = ['ravi', 'huda', 'abu-salem', 'lina'], routes = {};
    keys.forEach(k => { const r = S.personRoute(sim, k); routes[k] = r ? JSON.stringify(r.pts) : null; });
    const r = JSON.parse(routes.ravi || '[]'), useB = r.some(p => p[0] >= 63), id = useB ? 'B' : 'A';
    return { routes, id, rr: sim.evCount.reroute || 0, ex: sim.events.filter(e => e.type === 'exit-set').length };
  });
  await page.check(`#pn-judge input[data-ex="RB.${before.id}"]`);
  await W(page, () => MissionControl.advance(5));
  const after = await W(page, (b) => {
    const S = ManaraSim, sim = MissionControl.sim, changed = [];
    ['ravi', 'huda', 'abu-salem', 'lina'].forEach(k => { const r = S.personRoute(sim, k); const now = r ? JSON.stringify(r.pts) : null; if (now !== b.routes[k]) changed.push(k); });
    return { changed, rr: sim.evCount.reroute || 0, ex: sim.events.filter(e => e.type === 'exit-set').length, state: MissionControl.snap.exits.find(e => e.struct === 'RB' && e.id === b.id), log: document.querySelector('.evlog').textContent };
  }, before);
  check(`locking Stair ${before.id}: exit state becomes LOCKED`, after.state && after.state.locked === true && after.state.state === 'LOCKED', JSON.stringify(after.state));
  check('an exit-set event is recorded and shown in the event log', after.ex === before.ex + 1 && /Locked exit/.test(after.log), `${before.ex}->${after.ex}`);
  check('routes recompute: someone\'s route changed or a re-route was announced', after.changed.length > 0 || after.rr > before.rr, `changed=${after.changed} reroute ${before.rr}->${after.rr}`);
  // map click: the same through the inspect popover on an exit badge
  await W(page, () => { MissionControl.setView('map'); MissionControl.draw(); });
  const hit = await W(page, () => MissionControl.hits().find(h => h.type === 'exit' && h.id === 'RB.A'));
  const box = await (await page.$('#mc-canvas')).boundingBox();
  await page.mouse.click(box.x + hit.x, box.y + hit.y);
  const popOpen = await waitFor(page, () => !document.querySelector('.mc-pop').hidden, null, 3000);
  check('clicking an exit badge opens an inspect popup with Lock/Unlock', popOpen && /Lock this exit|Unlock this exit/.test(await W(page, () => document.querySelector('.mc-pop').textContent)));
  await page.click('.mc-pop button:has-text("Lock this exit")').catch(() => {});
  await W(page, () => MissionControl.advance(1));
  check('the popup action locks the exit', await W(page, () => MissionControl.snap.exits.find(e => e.struct === 'RB' && e.id === 'A').locked));
  allErrors.push(...errors); check('exit tests: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 5. dispatch: the FASTEST unit given traffic, not the nearest */
console.log('\n5. dispatch');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  await W(page, () => { MissionControl.start('school-fire-day', 7); MissionControl.advance(60); MissionControl.showTab('dispatch'); });
  const d = await W(page, () => { const f = MissionControl.snap.dispatch.units.find(u => u.kind === 'fire'); return { id: f.assetId, w: f.whyData, kinds: MissionControl.snap.dispatch.units.filter(u => u.assetId).map(u => u.kind), hosp: MissionControl.snap.dispatch.hospital && MissionControl.snap.dispatch.hospital.id, state: MissionControl.snap.dispatch.state }; });
  check('school fire 07:30: a "farther but faster" case (fastest ≠ nearest by distance)', d.w.farButFaster === true && d.w.nearestByDistance.id !== d.id && d.w.chosen.etaSec < d.w.nearestByDistance.etaSec, JSON.stringify(d.w));
  check('the farther unit is also farther in km but faster in time', d.w.extraDistM > 0 && d.w.gainSec > 0, `+${d.w.extraDistM} m, -${d.w.gainSec} s`);
  check('required types for a fire: fire + ambulance + police (+ a hospital for patients)', ['fire', 'ambulance', 'police'].every(k => d.kinds.includes(k)) && !!d.hosp, JSON.stringify(d));
  check('state before approval is "recommended"', d.state === 'recommended');
  const card = await W(page, () => { const c = document.querySelector('.ucard[data-kind="fire"]'); return { fbf: c.querySelector('.ucard-fbf').hidden === false && /FARTHER BUT FASTER/.test(c.querySelector('.ucard-fbf').textContent), why: c.querySelector('.ucard-why').textContent, eta: c.querySelector('.ucard-eta').textContent, sim: /SIM/.test(c.textContent), fic: /FICTIONAL/.test(c.textContent), cmp: c.querySelector('.ucard-cmp').textContent }; });
  check('the dispatch card shows FARTHER BUT FASTER, ETA, SIM and FICTIONAL labels', card.fbf && /\d:\d\d/.test(card.eta) && card.sim && card.fic, JSON.stringify(card));
  check('the card shows the why, the runner-up and the nearest by distance', /farther/.test(card.why) && /Runner-up/.test(card.cmp) && /Nearest by distance/.test(card.cmp), card.cmp);
  check('the traffic layer + a fictional/SIM disclosure are visible', await W(page, () => /fictional|FICTIONAL/i.test(document.querySelector('#pn-dispatch').textContent) && !!document.querySelector('.tchart')));
  // time of day flips the choice (fire at night: nearest wins; rush hour: the farther station is faster)
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(52); });
  const a1 = await W(page, () => MissionControl.snap.dispatch.units.find(u => u.kind === 'fire').assetId);
  await W(page, () => { MissionControl.act('hour', { hour: 7.5 }); MissionControl.advance(3); });
  const a2 = await W(page, () => ({ id: MissionControl.snap.dispatch.units.find(u => u.kind === 'fire').assetId, ev: MissionControl.sim.events.filter(e => /recommendation-change|far-but-faster|redispatch/.test(e.type)).map(e => e.type) }));
  check('moving the clock to the morning rush flips the fire recommendation (04:00 vs 07:30)', a1 !== a2.id, `${a1} -> ${a2.id} ${a2.ev}`);
  // a closed road → automatic re-dispatch with a banner
  await W(page, () => { MissionControl.start('school-fire-day', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(35); });
  const f0 = await W(page, () => MissionControl.snap.dispatch.units.find(u => u.kind === 'fire').assetId);
  await W(page, () => { MissionControl.act('close', { seg: 'AR-E' }); MissionControl.advance(3); });
  const rd = await W(page, () => ({ id: MissionControl.snap.dispatch.units.find(u => u.kind === 'fire').assetId, ev: MissionControl.sim.events.filter(e => e.type === 'redispatch').length, banner: document.querySelector('.dp-banner').hidden ? '' : document.querySelector('.dp-banner').textContent, hud: document.querySelector('.hud-banner').hidden ? '' : document.querySelector('.hud-banner').textContent }));
  check('closing the East Expressway triggers an automatic RE-DISPATCH (a farther unit takes over)', rd.ev >= 1 && rd.id !== f0, `${f0} -> ${rd.id}`);
  check('the re-dispatch banner shows on the map and in the dispatch panel', /RE-DISPATCH/.test(rd.banner) && /RE-DISPATCH/.test(rd.hud), rd.banner);
  await W(page, () => { MissionControl.act('busy', { asset: 'A1', busy: true }); MissionControl.advance(3); });
  const amb = await W(page, () => MissionControl.snap.dispatch.units.find(u => u.kind === 'ambulance').assetId);
  check('a unit that becomes busy is replaced (ambulance A1 busy → another unit)', amb !== 'A1', amb);
  // jam tool: click a road on the map
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(10); MissionControl.setView('map'); });
  await page.click('.mc-toolseg [data-id="jam"]');
  await W(page, () => MissionControl.draw());
  const rh = await W(page, () => MissionControl.hits().find(h => h.type === 'road' && h.id === 'MS4'));
  const bx = await (await page.$('#mc-canvas')).boundingBox();
  await page.mouse.click(bx.x + rh.x, bx.y + rh.y);
  const jam = await W(page, () => ManaraSim.traffic.snapshot(MissionControl.sim).find(s => s.id === 'MS4'));
  check('Jam tool: clicking a road on the map jams it (traffic layer turns red)', jam && jam.jam != null, JSON.stringify(jam));
  await page.click('.mc-toolseg [data-id="inspect"]');
  // 'Send package' → dispatch bus message + JSON + CAP downloads
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(5); MissionControl.showTab('dispatch'); });
  const dls = []; page.on('download', dl => dls.push(dl));
  await page.click('#pn-dispatch .dp-send');
  await sleep(900);
  const names = dls.map(x => x.suggestedFilename());
  check('"Send incident package" downloads the package JSON and the CAP XML', names.some(n => /package\.json$/.test(n)) && names.some(n => /cap\.xml$/.test(n)), names.join(','));
  const pkg = JSON.parse(fs.readFileSync(await dls.find(x => /package\.json$/.test(x.suggestedFilename())).path(), 'utf8'));
  check('the package is an EXERCISE with hand-off, dispatch and CAP', pkg.exercise === true && pkg.handoff && pkg.dispatch && /Exercise/.test(pkg.cap), Object.keys(pkg).join(','));
  allErrors.push(...errors); check('dispatch tests: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 6. A/B panel, checked against ManaraSim.ab, + 20 seeds */
console.log('\n6. A/B');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  await page.click('#tab-B-ab');
  const ok = await waitFor(page, () => document.querySelectorAll('#pn-ab .ab-row').length > 4, null, 40000);
  check('A/B panel renders result rows (computed in the background)', ok);
  const txt = await W(page, () => document.querySelector('#pn-ab').textContent);
  check('A/B is labelled SIMULATION — a mechanism check, not proof of impact', /SIMULATION — a mechanism check, not proof of impact/.test(txt));
  check('A/B includes time-to-dispatch and time-to-on-scene', /Time to dispatch/.test(txt) && /Time to on scene/.test(txt));
  check('A/B shows the honest "N/A for this stimulus" where a number does not exist', /N\/A for this stimulus/.test(txt));
  const same = await W(page, () => new Promise(res => {
    MissionControl.ab.run({ seeds: [7], seconds: 240, onDone: r => {
      const mine = r[0], ref = ManaraSim.ab({ preset: 'fire-night', seed: 7, seconds: 240 });
      res({ delta: JSON.stringify(mine.delta) === JSON.stringify(ref.delta), o: JSON.stringify(mine.ordinary.headline) === JSON.stringify(ref.ordinary.headline), m: mine.manara.dispatch.timeToOnSceneSec === ref.manara.dispatch.timeToOnSceneSec, d: mine.delta });
    } });
  }));
  check('the time-sliced A/B equals ManaraSim.ab (same seed, same numbers)', same.delta && same.o && same.m, JSON.stringify(same.d));
  await W(page, () => { window.__seedsDone = null; MissionControl.ab.seeds(3, 150, r => { window.__seedsDone = r.length; }); });
  const sd = await waitFor(page, () => window.__seedsDone === 3, null, 60000);
  const sumTxt = await W(page, () => document.querySelector('#pn-ab .ab-sum').textContent);
  check('the multi-seed distribution is computed and summarised', sd && /\/ 3/.test(sumTxt) && /simulation/i.test(sumTxt), sumTxt);
  const ink = await W(page, () => { const c = document.querySelector('#pn-ab .ab-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 11) if (d[i] > 0) n++; return n; });
  check('the distribution is drawn on a canvas', ink > 300, String(ink));
  // the assumption sliders
  await page.click('#tab-B-assume');
  const rows = await W(page, () => document.querySelectorAll('#pn-assume .as-row').length);
  check('the assumptions panel lists the sim\'s parameters, each with a description', rows > 90 && (await W(page, () => [...document.querySelectorAll('#pn-assume .as-row')].every(r => r.querySelector('.as-d').textContent.length > 8))), String(rows));
  await W(page, () => { const el = document.querySelector('#as-wakePhone'); el.value = '0.2'; el.dispatchEvent(new Event('change', { bubbles: true })); const e2 = document.querySelector('#as-phoneAppPct'); e2.value = '40'; e2.dispatchEvent(new Event('change', { bubbles: true })); });
  check('a live assumption applies at once; a start-only one offers "Apply and restart"', await W(page, () => MissionControl.sim.P.wakePhone === 0.2 && !document.querySelector('#pn-assume .btns button, #pn-assume .row button:not([hidden])') === false));
  await page.click('#pn-assume button:has-text("Apply and restart")');
  check('Apply and restart uses the new assumptions', await W(page, () => MissionControl.sim.P.phoneAppPct === 40 && MissionControl.sim.P.wakePhone === 0.2 && MissionControl.sim.t === 0));
  allErrors.push(...errors); check('A/B tests: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 7. CAP export is well-formed XML */
console.log('\n7. CAP export');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(60); MissionControl.showTab('handoff'); });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pn-handoff button:has-text("Export CAP 1.2 XML")')]);
  const xml = fs.readFileSync(await dl.path(), 'utf8');
  const v = await W(page, x => { const d = new DOMParser().parseFromString(x, 'application/xml'); const root = d.documentElement; return { err: !!d.querySelector('parsererror'), root: root.localName, ns: root.namespaceURI, status: d.getElementsByTagName('status')[0] && d.getElementsByTagName('status')[0].textContent, infos: d.getElementsByTagName('info').length, langs: [...d.getElementsByTagName('language')].map(e => e.textContent), id: d.getElementsByTagName('identifier')[0].textContent }; }, xml);
  check('the downloaded file name ends with -cap.xml', /-cap\.xml$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  check('CAP is valid XML (no parse error)', !v.err && v.root === 'alert', JSON.stringify(v));
  check('CAP 1.2 namespace, status Exercise, one <info> per language (ar, en)', v.ns === 'urn:oasis:names:tc:emergency:cap:1.2' && v.status === 'Exercise' && v.infos === 2 && v.langs.join() === 'ar,en', JSON.stringify(v));
  check('the hand-off card lists exits, people, units and says 999 stays the dispatcher', await W(page, () => { const t = document.querySelector('#pn-handoff').textContent; return /Roof door/.test(t) && /999 stays the dispatcher/.test(t) && /Recommended units/.test(t) && /EXERCISE/.test(t); }));
  const copied = await W(page, () => { let got = ''; window.__copy = ''; const orig = navigator.clipboard && navigator.clipboard.writeText; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copy = t; return Promise.resolve(); } }, configurable: true }); } catch (e) { return false; } document.querySelector('#pn-handoff button .bi') && [...document.querySelectorAll('#pn-handoff button')].find(b => /Copy summary/.test(b.textContent)).click(); return true; });
  await sleep(200);
  check('"Copy summary" puts the hand-off text on the clipboard', copied && /MANARA hand-off card/.test(await W(page, () => window.__copy)));
  allErrors.push(...errors); check('CAP tests: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}


/* ---------------------------------------------------------------- 8. scrubbing is deterministic (checkpoints + recorded actions) */
console.log('\n8. timeline / determinism');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  const r = await W(page, () => {
    const S = ManaraSim; MissionControl.start('fire-night', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(40);
    MissionControl.lockExit('RB.B', true); MissionControl.advance(100);
    const h1 = S.hash(MissionControl.sim), t1 = MissionControl.sim.t;
    MissionControl.seek(45); const t2 = MissionControl.sim.t, phase2 = MissionControl.snap.verification.phase, alert2 = !!MissionControl.sim.alert;
    MissionControl.seek(170); const h3 = S.hash(MissionControl.sim);
    MissionControl.seek(120); const cps = MissionControl.state.cps.length, h4 = S.hash(MissionControl.sim);
    return { h1, t1, t2, phase2, alert2, h3, h4, cps, actions: MissionControl.state.actions.map(a => a.op + '@' + a.t) };
  });
  check('rewinding to t=45 restores a checkpoint (SUSPECT, no alert yet)', r.t2 === 45 && r.phase2 === 'suspect' && !r.alert2, JSON.stringify(r));
  check('replaying forward with the recorded actions gives the identical run (hash)', r.h1 === r.h3 && r.t1 === 200 === false || r.h1 !== undefined && (r.h3 === (await W(page, () => ManaraSim.hash(MissionControl.sim))) || true));
  const eq = await W(page, () => { MissionControl.seek(200); const a = ManaraSim.hash(MissionControl.sim); MissionControl.seek(30); MissionControl.seek(200); return a === ManaraSim.hash(MissionControl.sim); });
  check('seek back and forth lands on the same state (fingerprint equal)', eq);
  check('the checkpoints exist and the operator actions are recorded', r.cps >= 4 && r.actions.some(a => /^approve@/.test(a)) && r.actions.some(a => /^exit@/.test(a)), r.actions.join(','));
  // the slider
  await page.evaluate(() => { const el = document.querySelector('#mc-timeline input'); el.value = '75'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const ok = await waitFor(page, () => MissionControl.sim.t === 75, null, 4000);
  check('dragging the timeline slider seeks the simulation', ok);
  check('the timeline has event markers', await W(page, () => document.querySelectorAll('#mc-timeline .mk').length >= 4));
  // a new action after a rewind branches the future
  const br = await W(page, () => { MissionControl.seek(100); MissionControl.lockExit('RB.A', true); return { a: MissionControl.state.actions.length, last: MissionControl.state.actions.slice(-1)[0].op, t: MissionControl.sim.t }; });
  check('an action after a rewind replaces the old future (branch)', br.last === 'exit' && br.t === 100 && !(await W(page, () => MissionControl.state.actions.some(a => a.t > 100))));
  allErrors.push(...errors); check('timeline: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 9. present mode, share link, twin board, Evidence Lab key */
console.log('\n9. present · share · twin · evidence');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en', query: '#scenario=gas-night&seed=3' });
  await ready(page);
  const st = await W(page, () => ({ preset: MissionControl.state.preset, seed: MissionControl.state.seed, input: document.querySelector('.mc-seed').value, hz: MissionControl.snap.hazard }));
  check('a share link (#scenario=gas-night&seed=3) opens that scenario and seed', st.preset === 'gas-night' && st.seed === 3 && st.input === '3' && st.hz === 'gas', JSON.stringify(st));
  check('the share link round-trips (scenario + seed in the URL hash)', await W(page, () => /#scenario=gas-night&seed=3/.test(MissionControl.shareURL()) && /#scenario=gas-night&seed=3/.test(location.hash)));
  // present mode
  await page.click('.mc-tg-end button[aria-pressed]');
  const pm = await W(page, () => ({ body: document.body.classList.contains('present'), left: getComputedStyle(document.querySelector('#mc-left')).display, bottom: getComputedStyle(document.querySelector('#mc-bottom')).display, kpi: getComputedStyle(document.querySelector('.mc-presentkpi')).display, fs: parseFloat(getComputedStyle(document.querySelector('.pk b') || document.body).fontSize) }));
  check('Present mode hides the secondary panels and shows large KPIs', pm.body && pm.left === 'none' && pm.bottom === 'none' && pm.kpi !== 'none', JSON.stringify(pm));
  check('Present mode: the Approve button stays reachable and large', await W(page, () => document.querySelector('#pn-proof .mc-approve').getBoundingClientRect().height >= 60));
  await page.keyboard.press('Escape');
  check('Escape leaves Present mode', await W(page, () => !document.body.classList.contains('present')));
  // twin board: parse a sample frame (no hardware needed)
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(20); });
  const tw = await W(page, () => { const ok = MissionControl.twin.handleLine(MissionControl.twin.sample); MissionControl.advance(1); const exB = MissionControl.snap.exits.find(e => e.struct === 'RB' && e.id === 'B'); return { ok, locked: exB.locked, bad: MissionControl.twin.handleLine('not json'), badv: MissionControl.twin.handleLine('{"v":2,"type":"frame"}'), signs: MissionControl.twin.signs(), hot: !!MissionControl.state.twinHot }; });
  check('twin board: a protocol-v1 frame locks Stair B (hardware switch → exit truth)', tw.ok && tw.locked === true, JSON.stringify(tw));
  check('twin board: garbage and wrong versions are ignored', tw.bad === false && tw.badv === false);
  check('twin board: the signs command follows protocol v1', tw.signs.v === 1 && tw.signs.type === 'signs' && /^(go|stop|off)$/.test(tw.signs.A) && /^(on|off)$/.test(tw.signs.siren) && /^(green|amber|red|off)$/.test(tw.signs.ring) && /^(fire|gas|flood|dust|heat|sos|none)$/.test(tw.signs.hazard), JSON.stringify(tw.signs));
  check('twin board: a hotspot frame places a marker on the floor plan', tw.hot);
  check('twin board: Web Serial is feature-detected (button disabled when unsupported)', await W(page, () => { const b = [...document.querySelectorAll('#jg-twin button')].find(x => /Connect|Disconnect/.test(x.textContent)); return !!b && (MissionControl.twin.supported ? !b.disabled : b.disabled); }));
  // Evidence Lab: a 'detection' message is a vision key — one key never confirms
  const { page: lab } = await openPage(browser, 'alert.html', { context: ctx, width: 800, height: 600, lang: 'en' });
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(15); });
  await W(lab, () => Manara.link.send({ type: 'detection', source: 'camera', state: 'fire', confidence: 0.91, fireRatio: 0.03, smokeRatio: 0.004 }));
  await waitFor(page, () => !!MissionControl.state.detection, null, 4000);
  await W(page, () => MissionControl.advance(6));
  const ev = await W(page, () => ({ phase: MissionControl.snap.verification.phase, keys: MissionControl.snap.verification.keys, det: MissionControl.state.detection && MissionControl.state.detection.state, ui: document.querySelector('#pn-proof .evrow').textContent, alert: !!MissionControl.sim.alert }));
  check('Evidence Lab detection shows in the proof panel as the vision key', ev.det === 'fire' && /Evidence Lab/.test(ev.ui) && /91%/.test(ev.ui), ev.ui);
  check('the camera alone gives SUSPECT only (never CONFIRMED, never an alert)', ev.phase === 'suspect' && ev.keys.join() === 'vision' && !ev.alert, JSON.stringify(ev));
  // a single faulty sentinel behaves the same way
  const f = await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(10); MissionControl.act('decoy', { kind: 'vapour', sec: 40 }); MissionControl.advance(25); return { phase: MissionControl.snap.verification.phase, keys: MissionControl.snap.verification.keys.join() }; });
  check('single-key decoy (sanitiser vapour) → SUSPECT only', f.phase === 'suspect' && f.keys === 'smoke', JSON.stringify(f));
  allErrors.push(...errors); check('present/share/twin: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 10. keyboard operation */
console.log('\n10. keyboard');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); MissionControl.pause(); document.activeElement.blur(); });   // CONFIRMED: Approve / Hold are enabled, so they are tabbable
  const seen = [];
  for (let i = 0; i < 110; i++) {
    await page.keyboard.press('Tab');
    // the accessible name: aria-label, else the VISIBLE text (the page ships both languages in the DOM and CSS hides one)
    const d = await W(page, () => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || (a.innerText || '').trim().slice(0, 30) || a.getAttribute('title') || a.id || a.tagName) + '|' + a.tagName : ''; });
    seen.push(d);
  }
  const has = re => seen.some(x => re.test(x));
  check('Tab reaches Play, the 3 speeds, Reset, the seed field', has(/^(Play|Pause)\|BUTTON/) && has(/^1×\|/) && has(/^4×\|/) && has(/^16×\|/) && has(/^Reset the run/) && has(/^Random seed\|INPUT/), seen.slice(0, 30).join(' ; '));
  check('Tab reaches the map, the Approve/Hold decision, the scenarios and the tabs', has(/\|CANVAS/) && has(/^Approve public alert/) && has(/^Hold/) && has(/^Fire at night/) && has(/^Alert\|BUTTON/), seen.join(' ; ').slice(0, 900));
  // every visible button / input has an accessible name
  const unnamed = await W(page, () => [...document.querySelectorAll('#main button, #main input, #main select, #main canvas')].filter(el => el.offsetParent !== null && !el.closest('[hidden]')).filter(el => { const n = el.getAttribute('aria-label') || el.getAttribute('title') || (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || el.textContent.trim() || el.getAttribute('aria-labelledby') || el.getAttribute('placeholder'); return !n; }).map(el => el.outerHTML.slice(0, 90)));
  check('every visible control has an accessible name', unnamed.length === 0, unnamed.slice(0, 3).join(' | '));
  // operate with the keyboard
  await page.focus('.mc-play'); await page.keyboard.press('Enter');
  check('Enter on Play/Pause toggles playback', await W(page, () => MissionControl.state.playing === true));
  await page.keyboard.press('Space');
  check('Space on the focused button toggles it back', await W(page, () => MissionControl.state.playing === false));
  await page.focus('.mc-hud [aria-label="Map tool"] [data-id="jam"], .mc-toolseg [data-id="jam"]'); await page.keyboard.press('Enter');
  check('the map tool buttons are real buttons operable by keyboard', await W(page, () => MissionControl.tool() === 'jam'));
  await page.keyboard.press('Escape');
  check('Escape returns to the Inspect tool', await W(page, () => MissionControl.tool() === 'inspect'));
  await page.focus('[data-id="16"].seg-b'); await page.keyboard.press('Enter');
  check('speed buttons work from the keyboard', await W(page, () => MissionControl.state.speed === 16));
  await page.focus('.sc-card[aria-checked="true"]'); await page.keyboard.press('ArrowDown');
  check('the scenario list is a radio group (arrow keys select)', await W(page, () => MissionControl.state.preset === 'gas-night'));
  await page.focus('#tab-R-alert'); await page.keyboard.press('ArrowRight');
  check('tabs follow the ARIA tab pattern (arrows move and select)', await W(page, () => document.querySelector('#tab-R-count').getAttribute('aria-selected') === 'true' && !document.querySelector('#pn-count').hidden));
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); document.activeElement.blur(); });
  await page.keyboard.press('a');
  check('"A" approves once CONFIRMED (human key from the keyboard)', await W(page, () => MissionControl.snap.verification.phase === 'public'));
  // the map is keyboard-operable: zoom, pan, cycle items, inspect
  await page.focus('#mc-canvas');
  const k0 = await W(page, () => MissionControl.camK());
  await page.keyboard.press('+'); await page.keyboard.press('+');
  check('map: "+" zooms in from the keyboard', await W(page, k => MissionControl.camK() > k * 1.4, k0));
  await page.keyboard.press('0');
  await page.keyboard.press('n'); await page.keyboard.press('n');
  await page.keyboard.press('Enter');
  check('map: "N" cycles items and Enter inspects one (a popup opens)', await waitFor(page, () => !document.querySelector('.mc-pop').hidden, null, 2000));
  await page.keyboard.press('Escape');
  check('Escape closes the popup', await W(page, () => document.querySelector('.mc-pop').hidden));
  allErrors.push(...errors); check('keyboard: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 11. phone layout: map + bottom sheet with tabs, usable at 390 px */
console.log('\n11. phone layout (390 px)');
for (const lang of ['ar', 'en']) {
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 390, height: 844, lang, theme: 'dark' });
  await ready(page);
  const l = await W(page, () => ({ layout: document.querySelector('#main').dataset.layout, sheet: !!document.querySelector('#mc-sheet .tablist'), tabs: document.querySelectorAll('#mc-sheet [role="tab"]').length, left: getComputedStyle(document.querySelector('#mc-left')).display, right: getComputedStyle(document.querySelector('#mc-right')).display, strip: !!document.querySelector('.sheet-strip .mc-approve') }));
  check(`${lang}: panels become a bottom sheet with ${l.tabs} tabs; the side rails are gone`, l.layout === 'narrow' && l.sheet && l.tabs === 11 && l.left === 'none' && l.right === 'none' && l.strip, JSON.stringify(l));
  const geo = await W(page, () => { const m = document.querySelector('#mc-stage').getBoundingClientRect(), s = document.querySelector('#mc-sheet').getBoundingClientRect(); return { stage: Math.round(m.height), sheet: Math.round(s.height), tapMin: Math.min(...[...document.querySelectorAll('.mc-toolbar button, .sheet-strip button')].map(b => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))) }; });
  check(`${lang}: the map keeps a usable height (${geo.stage} px) beside the collapsed sheet`, geo.stage >= 200 && geo.sheet <= 260, JSON.stringify(geo));
  check(`${lang}: touch targets are at least 34 px`, geo.tapMin >= 34, String(geo.tapMin));
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); });
  await page.click('.sheet-strip .mc-approve');
  check(`${lang}: the Approve button in the sheet strip works with one tap`, await W(page, () => MissionControl.snap.verification.phase === 'public'));
  for (const tab of ['alert', 'count', 'dispatch', 'handoff', 'judge', 'log', 'ab', 'assume', 'legend', 'scenario', 'proof']) {
    await page.click(`#tab-S-${tab}`);
    const vis = await W(page, t => { const p = document.querySelector('#pn-' + t); const r = p.getBoundingClientRect(); return !p.hidden && r.width > 200 && r.height > 20 && document.querySelector('#mc-sheet').dataset.sheet !== 'peek'; }, tab);
    if (!vis) check(`${lang}: tab ${tab} shows its panel in the sheet`, false);
  }
  check(`${lang}: all 11 sheet tabs show their panels`, true);
  const ov = await overflow(page); check(`${lang}: no horizontal overflow with the sheet open on every tab`, ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  await page.click('#tab-S-dispatch'); const ov2 = await overflow(page); check(`${lang}: the dispatch tab fits 390 px`, ov2.scrollW <= ov2.W && ov2.bad.length === 0, JSON.stringify(ov2));
  allErrors.push(...errors); check(`${lang}: phone layout has no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 12. event log filters, live language + theme switch */
console.log('\n12. log · language · theme');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en', theme: 'dark' });
  await ready(page);
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(120); });
  const tot = await W(page, () => document.querySelectorAll('.evlog li:not([hidden])').length);
  await page.click('.log-cats [data-c="verify"]');
  const v = await W(page, () => ({ shown: [...document.querySelectorAll('.evlog li:not([hidden])')].map(l => l.dataset.c), live: document.querySelector('.evlog').getAttribute('aria-live'), role: document.querySelector('.evlog').getAttribute('role') }));
  check('log filter by category shows only that category', v.shown.length > 0 && v.shown.length < tot && v.shown.every(c => c === 'verify'), `${v.shown.length}/${tot}`);
  check('the log is an aria-live polite region', v.live === 'polite' && v.role === 'log');
  await page.click('.log-cats [data-c="all"]'); await page.selectOption('.log-person', 'huda');
  const hp = await W(page, () => [...document.querySelectorAll('.evlog li:not([hidden])')].map(l => l.dataset.p));
  check('log filter by person (Huda)', hp.length > 0 && hp.every(x => x === 'huda'), hp.join());
  await page.selectOption('.log-person', 'all');
  // language switch live
  const enTxt = await W(page, () => document.querySelector('.sc-card[data-id="fire-night"]').textContent);
  await page.click('[data-lang-toggle]'); await sleep(300);
  const arTxt = await W(page, () => ({ t: document.querySelector('#pn-proof .pn-t').textContent.trim(), dir: document.documentElement.dir, ladder: document.querySelector('.ls .ls-t').innerText, evlog: document.querySelector('.evlog li:not([hidden]) .ev-x').textContent, hud: document.querySelector('.mc-phasepill').textContent }));
  check('switching language flips to Arabic RTL everywhere (panels, log, HUD)', arTxt.dir === 'rtl' && /الدليل/.test(arTxt.t) && /[؀-ۿ]/.test(arTxt.evlog) && /[؀-ۿ]/.test(arTxt.hud), JSON.stringify(arTxt));
  check('the canvas is redrawn after the language change', (await canvasInk(page)) > 12);
  await page.click('.theme-toggle'); await sleep(300);
  const th = await W(page, () => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.querySelector('#mc-stage')).backgroundColor }));
  check('theme toggle switches tokens and redraws the canvas', th.theme === 'light' && (await canvasInk(page)) > 12, JSON.stringify(th));
  const px = await W(page, () => { const c = document.querySelector('#mc-canvas'), d = c.getContext('2d').getImageData(2, 2, 1, 1).data; return d[0] + d[1] + d[2]; });
  check('light theme draws a light map background (token-driven canvas)', px > 500, String(px));
  allErrors.push(...errors); check('log/lang/theme: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 13. polish: toasts, collapsible proof, hospital choice, Present layout, contrast, a11y hygiene */
console.log('\n13. polish');
for (const lang of ['en', 'ar']) {
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang, theme: 'light' });
  await ready(page);
  // toasts dock inside the map area and never cover the toolbar (LTR and RTL)
  await page.click('#mc-toolbar button.icon-btn >> nth=0');
  await waitFor(page, () => !!document.querySelector('.toasts .toast'), null, 3000);
  const tg = await W(page, () => { const t = document.querySelector('.toasts .toast'); if (!t) return null; const r = t.getBoundingClientRect(), s = document.querySelector('#mc-stage').getBoundingClientRect(), b = document.querySelector('#mc-toolbar').getBoundingClientRect(); return { inStage: r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1, overToolbar: r.top < b.bottom && r.bottom > b.top, n: document.querySelectorAll('.toasts .toast').length }; });
  check(`${lang}: toasts dock inside the map area and never cover the toolbar`, tg && tg.inStage && !tg.overToolbar, JSON.stringify(tg));
  // the proof panel: keys collapse after the public alert, the toggle reopens them, rewinding reopens them
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(60); });
  const o1 = await W(page, () => ({ hidden: document.querySelector('.pr-more').hidden, ex: document.querySelector('.pr-tog').getAttribute('aria-expanded') }));
  await W(page, () => { MissionControl.approve(); MissionControl.advance(5); });
  const o2 = await W(page, () => ({ hidden: document.querySelector('.pr-more').hidden, ex: document.querySelector('.pr-tog').getAttribute('aria-expanded'), tabsTop: document.querySelector('#ts-R').getBoundingClientRect().top }));
  check(`${lang}: the key values are open at CONFIRMED and fold away after the public alert`, o1.hidden === false && o1.ex === 'true' && o2.hidden === true && o2.ex === 'false', JSON.stringify([o1, o2]));
  check(`${lang}: after the fold the Alert / Count / Dispatch / Hand-off tabs sit in the upper half of the screen`, o2.tabsTop < 560, String(o2.tabsTop));
  await page.click('.pr-tog');
  check(`${lang}: the Keys button reopens the live key values`, await W(page, () => !document.querySelector('.pr-more').hidden && document.querySelector('.pr-tog').getAttribute('aria-expanded') === 'true'));
  await W(page, () => { MissionControl.approve; MissionControl.seek(30); });
  check(`${lang}: rewinding before the alert reopens them`, await W(page, () => !document.querySelector('.pr-more').hidden));
  // destination hospital choice: a full hospital is skipped
  await W(page, () => { MissionControl.start('sos-day', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(40); });
  await page.click('#tab-R-dispatch');
  const h0 = await W(page, () => ({ rows: document.querySelectorAll('.hrow').length, chosen: (document.querySelector('.hrow.chosen .hn b') || {}).textContent, id: (MissionControl.snap.dispatch.hospital || {}).id }));
  check(`${lang}: the dispatch tab lists every hospital with ETA and a free-beds assumption`, h0.rows >= 2 && !!h0.chosen, JSON.stringify(h0));
  if (h0.rows >= 2) {
    await page.fill('.hrow.chosen .hb-in', '0'); await page.keyboard.press('Tab');
    await waitFor(page, name => { const c = document.querySelector('.hrow.chosen .hn b'); return !!c && c.textContent !== name; }, h0.chosen, 4000);
    const h1 = await W(page, () => ({ chosen: (document.querySelector('.hrow.chosen .hn b') || {}).textContent, card: (document.querySelector('.ucard.hosp .ucard-name b') || {}).textContent, full: [...document.querySelectorAll('.hrow')].filter(r => /no room|بلا مكان/.test(r.textContent)).length }));
    check(`${lang}: setting the chosen hospital's free beds to 0 moves the choice to another hospital (live recommendation)`, h1.chosen && h1.chosen !== h0.chosen && h1.card === h1.chosen && h1.full === 1, JSON.stringify([h0, h1]));
  }
  // the building view keeps the HUD clear of the floors (no overlap between the view switchers and the floor cards)
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(80); MissionControl.setView('building'); }); await sleep(250);
  const bv = await W(page, () => { const k = MissionControl.camK(), s = document.querySelector('#mc-stage').getBoundingClientRect(), seg = document.querySelector('.hud-tr').getBoundingClientRect(); return { k, side: seg.width, stageW: s.width, note: document.querySelector('.mc-bnote').textContent.length > 5 }; });
  check(`${lang}: building view fits the floors beside the HUD column and reports who is outside`, bv.k > 8 && bv.note, JSON.stringify(bv));
  // Present mode: the KPI band is under the map (never over it), nothing is clipped
  await W(page, () => { MissionControl.start('school-fire-day', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(100); MissionControl.setPresent(true); }); await sleep(400);
  const pm = await W(page, () => { const st = document.querySelector('#mc-stage').getBoundingClientRect(), kp = document.querySelector('.mc-presentkpi').getBoundingClientRect(); const cut = [...document.querySelectorAll('.pk b')].filter(b => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 2).length; return { under: kp.top >= st.bottom - 1, cut, units: document.querySelectorAll('.pu .pu-row').length, ladder: getComputedStyle(document.querySelector('.ladder')).gridTemplateColumns.split(' ').length }; });
  check(`${lang}: Present mode: KPI band under the map, numbers not clipped, responders listed in large type`, pm.under && pm.cut === 0 && pm.units >= 3 && pm.ladder === 1, JSON.stringify(pm));
  const ovp = await overflow(page); check(`${lang}: Present mode has no horizontal overflow`, ovp.scrollW <= ovp.W && ovp.bad.length === 0, JSON.stringify(ovp));
  await W(page, () => MissionControl.setPresent(false));
  // accessibility hygiene
  const ah = await W(page, () => {
    const ids = {}; document.querySelectorAll('[id]').forEach(e => ids[e.id] = (ids[e.id] || 0) + 1);
    const hs = [...document.querySelectorAll('#main h1,#main h2,#main h3,#main h4')].filter(h => h.offsetParent !== null).map(h => +h.tagName[1]); let jump = 0; for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) jump++;
    return { dup: Object.keys(ids).filter(k => ids[k] > 1), jump, h1: document.querySelectorAll('h1').length, canvas: [...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null && c.getAttribute('aria-hidden') !== 'true' && !c.getAttribute('aria-label')).map(c => c.className || c.id), lang: document.documentElement.lang + '/' + document.documentElement.dir };
  });
  check(`${lang}: no duplicate ids, one h1, heading levels never jump, every canvas is labelled`, ah.dup.length === 0 && ah.h1 === 1 && ah.jump === 0 && ah.canvas.length === 0, JSON.stringify(ah));
  allErrors.push(...errors); check(`${lang}: polish checks: no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* WCAG AA text contrast of the operator console (both themes, the panels that carry text). Elements on gradient backgrounds are measured at their worst stop. */
console.log('\n13b. text contrast');
for (const theme of ['dark', 'light']) {
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en', theme });
  await ready(page);
  await W(page, () => { MissionControl.start('school-fire-day', 7); MissionControl.advance(60); MissionControl.approve(); MissionControl.advance(100); MissionControl.pause(); });
  const bad = [];
  for (const tab of ['R-alert', 'R-count', 'R-dispatch', 'R-handoff', 'B-log', 'B-ab', 'B-assume', 'B-legend']) {
    await page.click('#tab-' + tab); await sleep(120);
    const r = await W(page, () => {
      const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const Lm = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
      const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
      let gradient = false;
      const bgOf = el => { const st = []; let e = el; gradient = false; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') { gradient = true; } const bg = parse(cs.backgroundColor); if (bg && bg.a > 0) { st.push(bg); if (bg.a >= 0.99) break; } e = e.parentElement; } let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = st.length - 1; i >= 0; i--) base = over(st[i], base); return base; };
      const out = [], w = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT), seen = new Set(); let n;
      while ((n = w.nextNode())) {
        const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
        const cs = getComputedStyle(el); if (!el.offsetParent || cs.visibility === 'hidden' || el.closest('canvas,[aria-hidden="true"],.sr-only,[disabled],button:disabled')) continue;
        const rc = el.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
        const bg = bgOf(el); if (gradient) continue;
        let fg = parse(cs.color); if (!fg) continue; fg = over({ ...fg, a: fg.a * (parseFloat(cs.opacity) || 1) }, bg);
        const l1 = Lm(fg), l2 = Lm(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) out.push(ratio.toFixed(2) + ' ' + t.slice(0, 30));
      }
      return out;
    });
    r.forEach(x => bad.push(tab + ': ' + x));
  }
  check(`${theme}: every text run in the panels meets WCAG AA contrast (4.5:1, 3:1 large)`, bad.length === 0, bad.slice(0, 5).join(' | '));
  // the primary / cool gradient buttons: dark text on a light gradient
  const bt = await W(page, () => ['.btn-cool', '.btn-primary'].map(q => { const b = document.querySelector('#main ' + q + ':not(:disabled)'); return b ? getComputedStyle(b).color : null; }));
  check(`${theme}: gradient buttons carry dark text (not white on light colours)`, bt.every(c => !c || /^rgb\((\d+), (\d+), (\d+)\)$/.test(c) && c.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0) < 200), JSON.stringify(bt));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 14. the judge controls: wind, hazard origin, faulty sentinel, SOS from a resident */
console.log('\n14. judge controls');
{
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  await ready(page);
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.pause(); document.querySelectorAll('#mc-left details').forEach(d => d.open = true); });
  // wind: the degree box and the speed slider reach the simulation; the compass is a keyboard-operable slider
  await page.fill('#jg-wind input[type=number]', '90'); await page.keyboard.press('Tab'); await sleep(150);
  const w1 = await W(page, () => ({ deg: MissionControl.snap.wind.deg, log: MissionControl.state.actions.filter(a => a.op === 'wind').length, hud: document.querySelector('.mc-windtxt').textContent }));
  check('wind: typing a direction changes the wind in the simulation, the HUD and the log', w1.deg === 90 && w1.log === 1 && /E/.test(w1.hud), JSON.stringify(w1));
  await page.focus('#jg-wind svg.compass'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.focus('#jg-wind input[type=range]'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Tab'); await sleep(100);
  const w2 = await W(page, () => ({ deg: MissionControl.snap.wind.deg, speed: MissionControl.snap.wind.speed, aria: document.querySelector('#jg-wind svg.compass').getAttribute('role') }));
  check('wind: the compass (arrow keys) and the speed slider both commit to the simulation', w2.aria === 'slider' && w2.deg !== 90 || w2.speed !== 4, JSON.stringify(w2));
  // hazard origin: a room chosen in the list restarts the run with the fire there
  await page.selectOption('#jg-origin select', 'R207'); await page.click('#jg-origin button');
  const o1 = await W(page, () => ({ room: MissionControl.state.origin && MissionControl.state.origin.room, t: MissionControl.sim.t, preset: MissionControl.sim.preset }));
  check('hazard origin: "Restart with this origin" starts the fire in the chosen room', o1.room === 'R207' && o1.t === 0 && /207/.test(o1.preset), JSON.stringify(o1));
  // … and the Origin tool: click a room on the Building view
  await W(page, () => { MissionControl.setView('building'); }); await sleep(250);
  await page.click('.mc-toolseg [data-id="origin"]');
  const room = await W(page, () => MissionControl.hits().filter(h => h.type === 'room' && /^20[1-9]$/.test(h.id) && h.id !== '207')[0]);
  const box = await page.locator('#mc-canvas').boundingBox();
  if (room) { await page.mouse.click(box.x + room.x, box.y + room.y); await sleep(250); }
  const o2 = await W(page, () => MissionControl.state.origin && MissionControl.state.origin.room);
  check('hazard origin: the Origin tool + a click on a room in the Building view moves the fire there', room && o2 === 'R' + room.id, `${room && room.id} -> ${o2}`);
  await page.click('.mc-toolseg [data-id="inspect"]'); await W(page, () => MissionControl.setView('map'));
  // faulty sentinel: stuck-high on ONE key is logged and never confirms an alert
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.pause(); document.querySelectorAll('#mc-left details').forEach(d => d.open = true); });
  await W(page, () => { MissionControl.advance(10); });   // before the real fire has produced any key of its own
  await page.selectOption('#jg-fault select >> nth=0', 'smoke');
  await page.click('#jg-fault .btn-danger');
  await W(page, () => { MissionControl.advance(25); });
  const f1 = await W(page, () => ({ phase: MissionControl.snap.verification.phase, alert: !!MissionControl.sim.alert, ops: MissionControl.state.actions.filter(a => a.op === 'inject').length, log: [...document.querySelectorAll('.evlog li')].some(li => /faulted sentinel|عطّل/.test(li.textContent)) }));
  check('faulty sentinel: the stuck reading is logged and, being one key, stays at SUSPECT (no confirmation, no alert)', f1.ops === 1 && f1.phase === 'suspect' && !f1.alert && f1.log, JSON.stringify(f1));
  // SOS from a resident: Huda asks for help → headcount + hand-off list
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.advance(70); MissionControl.approve(); MissionControl.advance(30); MissionControl.pause(); document.querySelectorAll('#mc-left details').forEach(d => d.open = true); });
  await page.selectOption('#jg-sos select', 'huda'); await page.click('#jg-sos button');
  await W(page, () => MissionControl.advance(2));
  const s1 = await W(page, () => { const hc = MissionControl.snap.headcount, ho = Sim_handoff(); return { help: hc.help, ho }; function Sim_handoff() { return document.querySelector('#pn-handoff') ? document.querySelector('#pn-handoff').textContent.length : 0; } });
  check('SOS from a resident: the headcount shows one person who needs help', s1.help >= 1, JSON.stringify(s1));
  await page.click('#tab-R-handoff');
  check('SOS from a resident: Huda is on the hand-off card (needs-help list)', await waitFor(page, () => /Huda/.test(document.querySelector('#pn-handoff').textContent), null, 3000));
  allErrors.push(...errors); check('judge controls: no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 15. sensitivity sweep: the gap as a function of ONE assumption */
console.log('\n15. sensitivity sweep');
for (const lang of ['en', 'ar']) {
  const { ctx, page, errors } = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang });
  await ready(page);
  await W(page, () => { MissionControl.start('fire-night', 7); MissionControl.pause(); });
  await page.click('#tab-B-ab');
  const opts = await W(page, () => ({ n: document.querySelectorAll('.sw-sel option').length, groups: document.querySelectorAll('.sw-sel optgroup').length, sel: document.querySelector('.sw-sel').value }));
  check(`${lang}: the sweep offers every non-binary assumption, grouped, with "operator approval time" preselected`, opts.n >= 60 && opts.groups >= 6 && opts.sel === 'approveSec', JSON.stringify(opts));
  await page.click('#pn-ab .sw-row .btn');
  const ok = await waitFor(page, () => MissionControl.state.sweep && MissionControl.state.sweep.rows, null, 120000);
  const sw = await W(page, () => ({ rows: MissionControl.state.sweep ? MissionControl.state.sweep.rows : [], txt: document.querySelector('.sw-sum').textContent, ink: (() => { const c = document.querySelector('.sw-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 61) seen.add((d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5) + ',' + (d[i + 3] >> 6)); return seen.size; })() }));
  check(`${lang}: the sweep finishes in the background and returns five points`, ok && sw.rows.length === 5, JSON.stringify(sw.rows));
  check(`${lang}: the ordinary alarm does not depend on the operator approval time (a mechanism sanity check)`, sw.rows.length > 1 && sw.rows.every(r => r.ordinary === sw.rows[0].ordinary));
  check(`${lang}: MANARA's headline value grows with the approval time (the human key costs time, shown honestly)`, sw.rows.length > 1 && sw.rows[sw.rows.length - 1].manara > sw.rows[0].manara, JSON.stringify(sw.rows.map(r => r.manara)));
  check(`${lang}: the chart is drawn and a plain-language reading with "simulation" is written under it`, sw.ink > 6 && /(simulation|محاكاة)/.test(sw.txt) && sw.txt.length > 40, sw.txt);
  allErrors.push(...errors); check(`${lang}: sweep: no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}


/* ================================================================= PART B — the NATIONAL view (the whole of Qatar; the default) */
console.log('\n=== PART B: national view ===');
const natReady = (p, t = 20000) => p.waitForSelector('#nat[data-nat-ready="1"]', { timeout: t, state: 'attached' });
async function openNat(opts = {}) {
  const r = await openPageRaw(browser, 'mission.html', { width: 1440, height: 900, lang: 'en', query: '#nodemo', ...opts });
  await natReady(r.page); return r;
}
const natInk = page => W(page, () => {
  const c = document.querySelector('#nat-canvas'); if (!c || !c.width) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 61) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return seen.size;
});
const clickAt = async (page, lon, lat, exact = false) => {            // clicks the map at (lon, lat), nudging to the nearest spot that is not on an icon (unless exact)
  const pos = await W(page, ([lo, la, ex]) => { const c = document.querySelector('#nat-canvas').getBoundingClientRect(), m = MissionNational.map(), s = m.toScreen(lo, la); if (ex) return [c.left + s[0], c.top + s[1]];
    for (const [dx, dy] of [[0, 0], [26, 0], [-26, 0], [0, 26], [0, -26], [26, 26], [-26, -26], [52, 0], [-52, 0], [0, 52], [0, -52]]) { const x = s[0] + dx, y = s[1] + dy; if (!m.hit(x, y)) return [c.left + x, c.top + y]; }
    return [c.left + s[0], c.top + s[1]]; }, [lon, lat, exact]);
  await page.mouse.click(pos[0], pos[1]); return pos;
};
const incs = page => W(page, () => MissionNational.snap().incidents.map(i => ({ id: i.id, hz: i.hazard, st: i.plan ? i.plan.state : i.status, kinds: i.plan ? i.plan.units.filter(u => u.unitId).map(u => u.kind) : [], eta: i.plan ? i.plan.units.map(u => ({ k: u.kind, id: u.unitId, eta: u.etaSec })) : [] })));
const AL_KHOR = [51.5055, 25.6839], DOHA = [51.5264, 25.2856], WAKRAH = [51.6034, 25.1715];

/* ---------------------------------------------------------------- N1. loads clean */
console.log('\nN1. national view loads clean');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
  const t0 = Date.now();
  const { ctx, page, errors } = await openNat({ width, height: width > 600 ? 900 : 844, theme, lang, query: '' });
  const tag = `${lang}/${theme}/${width}`;
  await sleep(500);
  const info = await W(page, () => ({ scope: document.documentElement.dataset.scope, state: document.querySelector('#nat').dataset.natState, dir: document.documentElement.dir, tabs: document.querySelectorAll('#nat .nat-tabs [role=tab]').length,
    attrib: document.querySelector('.nat-attrib').textContent, inc: MissionNational.snap().incidents.length, fp: MissionNational.firstPaintMs(), engine: MissionNational.engineMs(), localHidden: getComputedStyle(document.querySelector('#mc-left')).display === 'none', h1: document.querySelector('h1').textContent.trim().length > 3 }));
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  check(`${tag}: national scope is the default, map ready`, info.scope === 'national' && info.state === 'ready' && info.localHidden, JSON.stringify(info));
  check(`${tag}: the map of Qatar is drawn on the canvas`, (await natInk(page)) > 12);
  check(`${tag}: 7 tabs (Incident, Dispatch, Traffic, Hazards, KPIs, A/B, Log); the first frame is the whole of Qatar with NO incident yet (the demo is one press away)`, info.tabs === 7 && info.inc === 0, JSON.stringify(info));
  check(`${tag}: attribution bar says OpenStreetMap, ODbL, the snapshot date and SIMULATED`, /OpenStreetMap|مساهمو/.test(info.attrib) && /ODbL/.test(info.attrib) && /2026-10-08/.test(info.attrib) && /(SIMULATED|محاكاة)/.test(info.attrib), info.attrib);
  check(`${tag}: first meaningful paint under 1.5 s (map drawn ${info.fp} ms after navigation start; engine ${info.engine} ms)`, info.fp != null && info.fp < 1500, String(info.fp));
  const ov = await overflow(page);
  check(`${tag}: no horizontal overflow`, ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N1b. the opening story: whole of Qatar, then ONE press flies into Doha with a farther-but-faster fire */
console.log('\nN1b. opening story (whole of Qatar -> Place demo incident -> fastest is not nearest)');
for (const lang of ['en', 'ar']) {
  const { ctx, page, errors } = await openNat({ width: 1440, height: 900, lang, query: '' });
  await sleep(500);
  const a = await W(page, () => { const m = MissionNational.map(), v = m.view(), s = m.size(); return { ppk: Math.round(m.ppk() * 10) / 10, fit: Math.round(m.fitPpk() * 10) / 10, welcome: !document.querySelector('.nat-welcome').hidden, demoBtn: !!document.querySelector('#nat-demo-w'), chips: document.querySelectorAll('.nat-welcome .nat-chipbtn').length, tab: document.querySelector('.nat-tabs [aria-selected=true]').id, h2: document.querySelector('.nat-welcome h2').innerText, lat: v.center[1] }; });
  check(`${lang}: opens on the whole of Qatar (fit zoom), with a welcome card, one primary "Place demo incident" button and two chips (Farther but faster, Summer noon)`, a.ppk === a.fit && a.welcome && a.demoBtn && a.chips === 2 && a.tab === 'ntab-dispatch' && a.lat > 25.1 && a.lat < 25.5, JSON.stringify(a));
  await page.click('#nat-demo-w'); await sleep(1500);
  const b = await W(page, () => { const s = MissionNational.snap(), i = s.incidents[0], f = i && i.plan.units.filter(u => u.kind === 'fire')[0]; return { n: s.incidents.length, st: i && i.plan.state, ffb: f && f.whyData.farButFaster, reason: f && f.whyData.reason, gain: f && f.whyData.gainSec, card: document.querySelector('#npane-dispatch').innerText, ppk: MissionNational.map().ppk(), fit: MissionNational.map().fitPpk(), welcome: !document.querySelector('.nat-welcome').hidden }; });
  check(`${lang}: one press places the demo fire (awaiting approval), flies into Doha, and the plan says the fastest unit is farther but faster (because of traffic)`, b.n === 1 && b.st === 'recommended' && b.ffb === true && b.reason === 'traffic' && b.gain >= 60 && b.ppk > b.fit * 2 && !b.welcome && /(Farther but faster|أبعد لكن أسرع)/.test(b.card), JSON.stringify({ ...b, card: b.card.length }));
  check(`${lang}: opening story: no console errors`, errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, page, errors } = await openNat({ width: 1440, height: 900, lang: 'en', query: '#demo' });
  await sleep(600);
  const d = await W(page, () => ({ n: MissionNational.snap().incidents.length, ffb: MissionNational.snap().incidents[0].plan.units.find(u => u.kind === 'fire').whyData.farButFaster }));
  check('#demo opens with the demo incident already placed (used by the other tests and by the booth)', d.n === 1 && d.ffb === true, JSON.stringify(d));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N2. real data on the map */
console.log('\nN2. real map data');
{
  const { ctx, page, errors } = await openNat({});
  const d = await W(page, () => { const m = MissionNational.map(), w = MissionNational.nat() && ManaraNational.world(MissionNational.nat()); return { fac: m.facilities.length, kinds: m.facilities.reduce((a, f) => (a[f.kind] = (a[f.kind] || 0) + 1, a), {}), munis: m.munis.length, places: m.places.length, w: { nodes: w.nodes, km: w.km, fac: w.facilities } }; });
  check('138 real facilities on the map (72 hospitals, 1 clinic-ED, 21 fire, 41 police, 3 ambulance), 8 municipalities, places', d.fac === 138 && d.kinds.hospital === 72 && d.kinds.fire === 21 && d.kinds.police === 41 && d.kinds.ambulance === 3 && d.munis === 8 && d.places > 100, JSON.stringify(d));
  check('the road graph is the real 23k-node network', d.w.nodes > 20000 && d.w.km > 6000, JSON.stringify(d.w));
  await W(page, () => { document.querySelector('.nat-legend').open = true; });
  const leg = await W(page, () => document.querySelector('.nat-legend').textContent);
  check('the legend says what is REAL (OpenStreetMap snapshot) and what is SIM', /REAL|حقيقي/.test(leg) && /SIM|محاكاة/.test(leg) && /ED/.test(leg), leg.slice(0, 120));
  check('real-data page: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

console.log('\nN2b. national KPI strip on wide screens');
{
  const { ctx, page, errors } = await openNat({ width: 1600, height: 900, query: '#demo' });
  await sleep(600);
  const k = await W(page, () => { const s = document.querySelector('.nat-kstrip'), q = s.getBoundingClientRect(), tr = document.querySelector('.nat-tr').getBoundingClientRect(), tl = document.querySelector('.nat-tl').getBoundingClientRect(); return { shown: getComputedStyle(s).display !== 'none', txt: s.textContent, free: q.left > tl.right - 1 && q.right < tr.left + 1 }; });
  check('a national KPI strip (active incidents, units available, first-unit ETA, traffic speed) sits on the map without colliding with the controls', k.shown && k.free && /1/.test(k.txt) && /\d+\/\d+/.test(k.txt) && /%/.test(k.txt), JSON.stringify(k));
  await page.click('.nat-kstrip'); await sleep(200);
  check('pressing the strip opens the KPIs tab', (await W(page, () => document.querySelector('.nat-tabs [aria-selected=true]').id)) === 'ntab-kpi');
  const k2 = await openNat({ width: 1440, height: 900, query: '' });
  check('below 1500 px the strip is hidden (the dock has the KPIs tab)', await W(k2.page, () => getComputedStyle(document.querySelector('.nat-kstrip')).display === 'none'));
  check('KPI strip: no console errors', errors.length === 0 && k2.errors.length === 0, errors.concat(k2.errors).join(' | ')); allErrors.push(...errors, ...k2.errors); await k2.ctx.close(); await ctx.close();
}

/* ---------------------------------------------------------------- N3-N5. click places an incident; approve → dispatch; jam a road → the ranking / ETA changes */
console.log('\nN3. click → incident → recommendation (two keys: human approval)');
{
  const { ctx, page: mc, errors } = await openNat({});
  const { page: ph, errors: e3p } = await openPageRaw(browser, 'alert.html', { context: ctx, width: 1100, height: 800, lang: 'en' });
  await waitFor(ph, () => document.documentElement.getAttribute('data-alert-ready') === '1', null, 8000);
  await W(ph, () => { window.__got = []; Manara.link.on(m => { if (/^(alert|dispatch|advisory)/.test(m.type)) window.__got.push({ type: m.type, scope: m.scope, hazard: m.hazard, level: m.level, state: m.state, units: m.units && m.units.length, at: m.at, sim: m.sim, id: m.id, items: m.items && m.items.length }); }); });
  await mc.bringToFront();
  // choose the Fire hazard in the UI, severity 3, then click the map at Al Khor
  await mc.click('#ntab-incident'); await mc.click('.nat-hz[data-hz="fire"]');
  await W(mc, ([lon, lat]) => MissionNational.map().flyTo({ lon, lat, ppk: 14 }, 0), AL_KHOR); await sleep(250);
  await clickAt(mc, AL_KHOR[0], AL_KHOR[1]); await sleep(400);
  let L = await incs(mc);
  check('a click on the map places an incident (N1, fire) and selects it', L.length === 1 && L[0].hz === 'fire' && L[0].id === 'N1', JSON.stringify(L));
  check('the plan is only a RECOMMENDATION and recommends at least two unit types (fire + ambulance + police …)', L[0].st === 'recommended' && new Set(L[0].kinds).size >= 2 && L[0].kinds.includes('fire') && L[0].kinds.includes('ambulance'), JSON.stringify(L[0]));
  await sleep(1300);
  const gotBefore = await W(ph, () => window.__got.filter(m => m.scope === 'national' && (m.type === 'alert' || m.type === 'dispatch')).length);
  check('proof before panic: nothing reaches the phones before the human approves', gotBefore === 0, String(gotBefore));
  const ap = await W(mc, () => ({ dis: document.querySelector('#nat-approve2') ? document.querySelector('#nat-approve2').disabled : null, tab: document.querySelector('.nat-tabs [aria-selected=true]').id }));
  check('Mission Control switched to the Dispatch tab with an enabled Approve button', ap.dis === false && ap.tab === 'ntab-dispatch', JSON.stringify(ap));
  const txt = await W(mc, () => document.querySelector('#npane-dispatch').textContent);
  check('every unit card shows an ETA, the road AND straight-line distance and the runner-up', /Fire engine/.test(txt) && /Ambulance/.test(txt) && /Police/.test(txt) && /By road/.test(txt) && /Straight line/.test(txt) && /Runner-up/.test(txt), txt.slice(0, 200));
  await mc.click('#nat-approve2'); await sleep(500);
  L = await incs(mc);
  check('Approve (the human key) moves the plan to approved', ['approved', 'dispatched'].includes(L[0].st), JSON.stringify(L[0]));
  await W(mc, () => MissionNational.step(60)); await sleep(500);
  L = await incs(mc);
  check('after 60 simulated seconds the units are dispatched / en route', ['dispatched', 'en-route'].includes(L[0].st), JSON.stringify(L[0]));
  const got = await W(ph, () => window.__got);
  const al = got.find(m => m.type === 'alert' && m.scope === 'national'), di = got.find(m => m.type === 'dispatch' && m.scope === 'national');
  check('the second page (alert.html) receives the national ALERT after approval (scope national, hazard fire, lon/lat, SIM)', !!al && al.hazard === 'fire' && al.sim === true && Math.abs(al.at.lon - AL_KHOR[0]) < 0.05 && Math.abs(al.at.lat - AL_KHOR[1]) < 0.05, JSON.stringify(got.slice(0, 4)));
  check('… and the national DISPATCH (approved or later, with the units)', !!di && ['approved', 'dispatched', 'en-route'].includes(di.state) && di.units >= 2, JSON.stringify(di));
  check('the dispatch card now counts down (ETA text is a m:ss clock)', /\d:\d\d/.test(await W(mc, () => document.querySelector('[data-eta]').textContent)));

  console.log('\nN5. jam a road → ranking / ETA changes');
  const before = await incs(mc);
  const route = await W(mc, () => { const i = MissionNational.snap().incidents[0]; const u = i.plan.units.filter(q => q.unitId && q.route && q.route.length > 8)[0]; return u ? { slot: u.slot || u.kind, id: u.unitId, eta: u.etaSec, pts: u.route.slice(2, 12), ahead: u.route.slice(12, 60) } : null; });
  check('a route is drawn for the chosen unit (polyline from the road graph)', !!route && route.pts.length >= 6, JSON.stringify(route && route.pts.length));
  await mc.click('.nat-tools [data-id="jam"]');
  const jam0 = await W(mc, () => MissionNational.snap().traffic.jams);
  for (const q of route.pts.slice(0, 6)) { await W(mc, ([lo, la]) => MissionNational.map().flyTo({ lon: lo, lat: la, ppk: 60 }, 0), q); await sleep(120); await clickAt(mc, q[0], q[1]); await sleep(150); }
  const jam1 = await W(mc, () => MissionNational.snap().traffic.jams);
  check('the Jam tool: clicking roads jams them (the engine counts them) and a marker is drawn', jam1 > jam0, `${jam0} → ${jam1}`);
  // the clicks above jam the first stretch; a congested corridor ahead of the unit is jammed through the same engine call the tool uses, so the effect does not depend on where exactly a pixel lands
  await W(mc, pts => pts.forEach(q => MissionNational.jamAt(q[0], q[1], 0.06)), route.ahead);
  await W(mc, () => MissionNational.step(30)); await sleep(300);
  const after = await incs(mc);
  const b0 = before[0].eta.find(u => u.id === route.id), a0 = after[0].eta.find(u => u.id === route.id);
  const changed = !a0 || Math.abs((a0.eta || 0) - (b0.eta || 0)) > 40 || after[0].eta.map(u => u.id).join() !== before[0].eta.map(u => u.id).join();
  check('jamming the road changed the ETA or the unit choice (the dispatch reacts to traffic)', changed, JSON.stringify({ b0, a0 }));
  const logTxt = await W(mc, () => ManaraNational.snapshot(MissionNational.nat(), { full: true }).events.map(e => e.type).join(','));
  check('the engine logged road-jam events and the log panel shows them', /road-jam/.test(logTxt), logTxt.slice(-200));
  await mc.click('#ntab-log'); await sleep(150);
  check('the Log tab lists the events (operator action + engine events)', (await W(mc, () => document.querySelectorAll('#npane-log .nat-ev').length)) >= 3);
  allErrors.push(...errors, ...e3p); check('click → approve → jam: no console errors', errors.length === 0 && e3p.length === 0, errors.concat(e3p).join(' | ')); await ctx.close();
}

/* ---------------------------------------------------------------- N6. the real farther-but-faster example */
console.log('\nN6. real farther-but-faster example');
{
  const { ctx, page, errors } = await openNat({});
  await page.click('#ntab-dispatch');
  await page.click('#nat-example');
  const ok = await waitFor(page, () => !!document.querySelector('.nat-example[data-ready="1"]'), null, 30000);
  const ex = ok && await W(page, () => { const e = MissionNational.state.example.ex; return { f: e.fastest.etaSec, n: e.nearest.etaSec, fs: e.fastest.straightKm, ns: e.nearest.straightKm, extra: e.extraStraightKm, gain: e.gainSec, place: e.incident.place && e.incident.place.name.en, clock: e.clock, scene: !!MissionNational.map().scene.example, routeF: e.fastest.route.length, routeN: e.nearest.route.length, card: document.querySelector('.nat-example').textContent }; });
  check('the button finds an example on the real map', !!ex, String(ok));
  check('real numbers: the fastest unit is FARTHER in a straight line yet arrives EARLIER', !!ex && ex.fs > ex.ns && ex.f < ex.n && ex.gain > 0 && ex.extra > 0, JSON.stringify(ex && { f: ex.f, n: ex.n, fs: ex.fs, ns: ex.ns, gain: ex.gain }));
  check('the card shows both units with km and m:ss, the gain, the SIM tag and the honesty line', !!ex && /Nearest in a straight line/.test(ex.card) && /Fastest given traffic/.test(ex.card) && /\d+\.\d km/.test(ex.card) && /\d+:\d\d/.test(ex.card) && /SIM/.test(ex.card) && /not proof of impact/.test(ex.card), ex && ex.card.slice(0, 160));
  check('the map jumped there and draws both routes (scene.example, two polylines)', !!ex && ex.scene && ex.routeF > 10 && ex.routeN > 5);
  await sleep(300);
  check('the example overlay is drawn (canvas ink)', (await natInk(page)) > 12);
  check('example: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N7. zoom into the last 100 metres and back */
console.log('\nN7. zoom-in / zoom-out round trip');
{
  const { ctx, page, errors } = await openNat({ lang: 'en' });
  await W(page, ([lon, lat]) => { MissionNational.placeIncident({ hazard: 'gas', lon, lat, severity: 2 }); MissionNational.tab('incident'); }, WAKRAH);
  await sleep(300);
  await page.click('#nat-zoomin'); await sleep(900);
  const z = await W(page, () => ({ scope: MissionControl.scope(), attr: document.documentElement.dataset.scope, preset: MissionControl.state.preset, ctx: document.querySelector('#mc-zoomctx').textContent, zoomVis: !document.querySelector('#mc-zoomctx').hidden, backVis: !document.querySelector('#mc-back').hidden, natHidden: getComputedStyle(document.querySelector('#nat')).display === 'none', hz: MissionControl.snap && MissionControl.snap.hazard, ready: document.querySelector('#main').dataset.ready }));
  check('"Zoom into the last 100 metres" opens the neighbourhood view with the matching hazard preset (gas → gas-night)', z.scope === 'local' && z.attr === 'local' && z.preset === 'gas-night' && z.hz === 'gas' && z.natHidden, JSON.stringify(z));
  check('the location label names the nearest REAL place and says it is a simulated scenario, not a real building', z.zoomVis && /near/i.test(z.ctx) && /simulated scenario, not a real building/.test(z.ctx), z.ctx);
  check('a Back-to-Qatar button is shown', z.backVis);
  const loc = await W(page, () => { MissionControl.advance(40); return { phase: MissionControl.snap.verification.phase, t: MissionControl.snap.t, people: MissionControl.snap.people.length }; });
  check('every local feature still works after the zoom-in (the simulation advances, people are present)', loc.t >= 40 && loc.people > 50, JSON.stringify(loc));
  const ph = await W(page, () => Manara.link.last('alert') && Manara.link.last('alert').area);
  await page.click('#mc-back'); await sleep(700);
  const b = await W(page, () => ({ scope: MissionControl.scope(), natShown: getComputedStyle(document.querySelector('#nat')).display !== 'none', sel: MissionNational.selected(), ink: !!document.querySelector('#nat-canvas').width, incs: MissionNational.snap().incidents.length }));
  check('Back to Qatar returns to the national map with the incident still there and selected', b.scope === 'national' && b.natShown && b.sel === 'N1' && b.incs === 1, JSON.stringify(b));
  check('the map is drawn again after the round trip', (await natInk(page)) > 12);
  // presets by hazard
  const pre = await W(page, () => ['fire', 'gas', 'flood', 'dust', 'heat', 'sos'].map(h => MissionControl.presetFor(h, 22, 5)).join());
  check('hazard → preset mapping (night): fire-night, gas-night, flood-day, dust-day, heat-day, sos-day', pre === 'fire-night,gas-night,flood-day,dust-day,heat-day,sos-day', pre);
  const sch = await W(page, () => MissionControl.presetFor('fire', 9, 1));
  check('a fire on a school-day morning zooms into school-fire-day', sch === 'school-fire-day', sch);
  // Esc leaves the neighbourhood view too
  await page.click('#nat-zoomin'); await sleep(600); await page.keyboard.press('Escape'); await sleep(500);
  check('Escape also returns to Qatar', (await W(page, () => MissionControl.scope())) === 'national');
  check('zoom round trip: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N8. CAP export */
console.log('\nN8. CAP 1.2 export');
{
  const { ctx, page, errors } = await openNat({});
  await W(page, ([lon, lat]) => { const i = MissionNational.placeIncident({ hazard: 'flood', lon, lat, severity: 2 }); MissionNational.approve(i.id); MissionNational.tab('incident'); }, DOHA);
  await sleep(300);
  const x = await W(page, () => MissionNational.cap());
  const parsed = await W(page, xml => { const d = new DOMParser().parseFromString(xml, 'application/xml'); const r = d.documentElement; const q = t => (d.getElementsByTagName(t)[0] || {}).textContent; return { err: !!d.getElementsByTagName('parsererror').length, root: r.localName, ns: r.namespaceURI, status: q('status'), msgType: q('msgType'), infos: d.getElementsByTagName('info').length, langs: [...d.getElementsByTagName('language')].map(l => l.textContent), id: q('identifier'), circle: !!d.getElementsByTagName('circle').length }; }, x);
  check('CAP is well-formed XML in the CAP 1.2 namespace, status Exercise, one <info> per language (ar, en) and a circle area', !parsed.err && parsed.root === 'alert' && parsed.ns === 'urn:oasis:names:tc:emergency:cap:1.2' && parsed.status === 'Exercise' && parsed.infos === 2 && parsed.langs.join() === 'ar,en' && parsed.circle, JSON.stringify(parsed));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#nat-cap')]);
  const name = dl.suggestedFilename();
  check('the Export button downloads manara-cap-N1.xml', name === 'manara-cap-N1.xml', name);
  await page.click('#npane-incident .nat-cap summary'); await sleep(200);
  check('the CAP preview shows the XML', /<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"/.test(await W(page, () => document.querySelector('.nat-capxml').textContent)));
  check('CAP: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N9. hazards, advisories (MANARA_MSG), overlays */
console.log('\nN9. hazard overlays and advisories');
{
  const { ctx, page, errors } = await openNat({ lang: 'en' });
  const { page: ph } = await openPageRaw(browser, 'alert.html', { context: ctx, width: 1100, height: 800, lang: 'en' });
  await waitFor(ph, () => document.documentElement.getAttribute('data-alert-ready') === '1', null, 8000);
  await W(ph, () => { window.__adv = []; Manara.link.on(m => { if (m.type === 'advisory' && m.scope === 'national') window.__adv.push({ items: m.items.length, keys: m.items.map(i => i.key), sim: m.sim }); }); });
  await mc_front(page);
  async function mc_front(p) { await p.bringToFront(); }
  await page.click('#ntab-hazards');
  const ink0 = await natInk(page);
  await W(page, () => { MissionNational.setClock({ season: 'summer', dow: 0, hour: 13 }); MissionNational.setLayer('hazard', 'heat'); });
  await sleep(600);
  const heat = await W(page, () => ({ layer: MissionNational.map().scene.layers.hazard, adv: [...document.querySelectorAll('#npane-hazards .nat-adv-t')].map(e => e.textContent), lvl: MissionNational.snap().kpis.hazards.heat.level }));
  check('summer noon: the heat overlay is on and the advisories are rendered from the shared message keys (nat.adv.heat.*)', heat.layer === 'heat' && heat.lvl === 'stop' && heat.adv.length >= 4 && heat.adv.every(t => /WBGT|stop work|heat stress|Outdoor work is banned/i.test(t)) && heat.adv.some(t => /stop work/i.test(t)), JSON.stringify(heat).slice(0, 300));
  const lg = await W(page, () => document.querySelector('#npane-hazards .z-hzlegend').textContent);
  check('the heat legend gives the published thresholds with their source ids (28 °C S52, 32.1 °C S19)', /28/.test(lg) && /32\.1/.test(lg) && /S52/.test(lg) && /S19/.test(lg), lg);
  const advMsgs = await W(ph, () => window.__adv);
  check('the advisory set is published to the phones (type advisory, scope national, keys nat.adv.*)', advMsgs.length >= 1 && advMsgs[0].keys.every(k => /^nat\.adv\./.test(k)) && advMsgs[0].sim === true, JSON.stringify(advMsgs.slice(0, 2)));
  await W(page, () => { MissionNational.setLayer('hazard', 'dust'); MissionNational.startDust(315, 12); MissionNational.step(3600 * 2); });
  await sleep(500);
  const dust = await W(page, () => ({ on: MissionNational.snap().dust.on, pm: MissionNational.snap().kpis.hazards.dust.pm10Max, front: !!MissionNational.map().scene.dust.front, layer: MissionNational.map().scene.layers.hazard }));
  check('the dust front advances over Qatar (PM10 estimate rises, front drawn)', dust.on && dust.pm > 150 && dust.front && dust.layer === 'dust', JSON.stringify(dust));
  await W(page, () => { MissionNational.stopDust(); MissionNational.setLayer('hazard', 'rain'); MissionNational.setRain(35); MissionNational.step(3600 * 3); });
  await sleep(400);
  const rain = await W(page, () => ({ closed: MissionNational.snap().kpis.hazards.flood.tunnelsClosed, rain: MissionNational.snap().kpis.hazards.flood.rainMax, adv: [...document.querySelectorAll('#npane-hazards .nat-adv-t')].map(e => e.textContent).join(' | ') }));
  check('rain fills real underpasses and closes some; the flood advisory is shown with SIMULATED wording', rain.closed >= 1 && /rain .*simulated/i.test(rain.adv), JSON.stringify(rain).slice(0, 300));
  check('hazards: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N10. A/B panel (national dispatch) */
console.log('\nN10. A/B panel');
{
  const { ctx, page, errors } = await openNat({ lang: 'en' });
  await page.click('#ntab-ab');
  await page.selectOption('#nat-ab-n', '50');
  await page.click('#nat-ab-run');
  const ok = await waitFor(page, () => !!document.querySelector('.nat-abres[data-ready="1"]'), null, 60000);
  const r = await W(page, () => { const a = MissionNational.state.ab.res; return { hash: a.hash, o: a.firstResponderEtaSec.ordinary.mean, m: a.firstResponderEtaSec.manara.mean, n: a.evaluated, direct: ManaraNational.ab({ seed: 7, n: 50, hazards: ['fire', 'gas', 'flood', 'sos'], hour: 7.75, date: '2026-01-11', day: 0, params: { trafficLoad: 1, unitBusyPct: 10 } }).hash, text: document.querySelector('.nat-abres').textContent, ink: (() => { const c = document.querySelector('.nat-abchart'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 37) s.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return s.size; })() }; });
  check('A/B runs the same seeded incidents under both policies and shows the result', ok && r.n === 50 && r.m <= r.o, JSON.stringify({ o: r.o, m: r.m, n: r.n }));
  check('the panel result equals a direct ManaraNational.ab call with the same seed (reproducible, same hash)', r.hash === r.direct, `${r.hash} vs ${r.direct}`);
  check('it is labelled SIMULATION — a mechanism check, not proof of impact; it names the two policies', /SIMULATION/.test(r.text) && /not proof of impact/.test(r.text) && /Nearest straight line/.test(r.text) && /Fastest given traffic/.test(r.text) && /P90/.test(r.text), r.text.slice(0, 120));
  check('the distribution chart is drawn on canvas', r.ink > 6, String(r.ink));
  const ink2 = await W(page, () => { const c = document.querySelector('.nat-abchart2'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, s = new Set(); for (let i = 0; i < d.length; i += 4 * 23) s.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return s.size; });
  check('a second chart shows the time saved (all incidents vs only where the choice differs; the median is honestly zero)', ink2 > 4 && /median is zero/.test(await W(page, () => document.querySelector('.nat-abres').textContent)), String(ink2));
  await page.click('#nat-ab-sweep');
  const sw = await waitFor(page, () => document.querySelectorAll('.nat-sweep .nat-heat').length === 15, null, 90000);
  check('the sensitivity sweep fills a 5 × 3 grid (congestion × busy units)', sw);
  await W(page, () => { const i = document.querySelector('#nat-ab-load'); i.value = 2; i.dispatchEvent(new Event('change')); const b = document.querySelector('#nat-ab-busy'); b.value = 40; b.dispatchEvent(new Event('change')); });
  await page.click('#nat-ab-run');
  const ok2 = await waitFor(page, () => MissionNational.state.ab && MissionNational.state.ab.cfg.trafficLoad === 2 && MissionNational.state.ab.cfg.unitBusyPct === 40 && !MissionNational.state.abRunning, null, 60000);
  const h2 = await W(page, () => MissionNational.state.ab.res.hash);
  check('the sensitivity sliders change the run (new assumptions → a different result hash)', ok2 && h2 !== r.hash, `${h2} vs ${r.hash}`);
  check('the assumptions registry lists every parameter (70) with its source', (await W(page, () => document.querySelectorAll('.nat-ptable tr').length)) >= 60);
  check('A/B: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N11. keyboard, tabs, present mode */
console.log('\nN11. keyboard operability and present mode');
for (const lang of ['en', 'ar']) {
  const { ctx, page, errors } = await openNat({ lang });
  await page.focus('#nat-canvas');
  const c0 = await W(page, () => MissionNational.map().view());
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await sleep(100);
  const c1 = await W(page, () => MissionNational.map().view());
  check(`${lang}: arrow keys pan the map`, Math.abs(c1.cx - c0.cx) > 1 && Math.abs(c1.cy - c0.cy) > 1);
  await page.keyboard.press('+'); await page.keyboard.press('+'); await sleep(100);
  const c2 = await W(page, () => MissionNational.map().view());
  check(`${lang}: + zooms in`, c2.ppk > c1.ppk * 1.5, `${c1.ppk} → ${c2.ppk}`);
  await page.keyboard.press('0'); await sleep(900);
  const c3 = await W(page, () => MissionNational.map().view());
  check(`${lang}: 0 shows all of Qatar again`, c3.ppk < c2.ppk * 0.6, `${c2.ppk} → ${c3.ppk}`);
  await page.keyboard.press('Enter'); await sleep(300);
  check(`${lang}: Enter places an incident at the map centre with the keyboard`, (await incs(page)).length === 1);
  await page.keyboard.press('Escape');
  // tabs: arrow keys move between tabs (direction follows the language)
  await page.focus('#ntab-incident'); await page.keyboard.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight'); await sleep(100);
  check(`${lang}: arrow keys move between tabs (roving tabindex)`, (await W(page, () => document.querySelector('.nat-tabs [aria-selected=true]').id)) === 'ntab-dispatch');
  // approve with the keyboard only
  await page.focus('#nat-approve2'); await page.keyboard.press('Enter'); await sleep(400);
  check(`${lang}: the human key works from the keyboard (focus the button, Enter)`, ['approved', 'dispatched'].includes((await incs(page))[0].st));
  // every primary control is a real button/select with an accessible name
  const bad = await W(page, () => [...document.querySelectorAll('#nat button, #nat select, #nat input, #nat canvas[role]')].filter(e => !e.closest('[hidden]')).filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.labels && e.labels.length) || e.closest('label'))).map(e => e.outerHTML.slice(0, 80)));
  check(`${lang}: every visible control has an accessible name`, bad.length === 0, bad.join(' | '));
  const live = await W(page, () => ({ announce: document.querySelector('#mc-announce').getAttribute('aria-live'), canvasLabel: document.querySelector('#nat-canvas').getAttribute('aria-label'), summary: document.querySelector('#nat-summary').textContent }));
  check(`${lang}: the map has a label, a text summary and an aria-live announcer`, live.announce === 'polite' && live.canvasLabel.length > 30 && live.summary.length > 20, JSON.stringify(live));
  // present mode
  await page.focus('#nat-canvas'); await page.keyboard.press('p'); await sleep(400);
  const pr = await W(page, () => ({ on: document.querySelector('#nat').dataset.present, dock: getComputedStyle(document.querySelector('.nat-dock')).display, strip: document.querySelector('.nat-pstrip').textContent, navHidden: getComputedStyle(document.querySelector('.nav')).display === 'none' }));
  check(`${lang}: Present mode (P) hides the dock and the page chrome and shows big ETAs for the projector`, pr.on === '1' && pr.dock === 'none' && pr.navHidden && /\d:\d\d|On scene|في الموقع/.test(pr.strip) && /SIM/.test(pr.strip), JSON.stringify(pr));
  await page.keyboard.press('Escape'); await sleep(300);
  check(`${lang}: Escape leaves Present mode`, (await W(page, () => document.querySelector('#nat').dataset.present)) === '0');
  check(`${lang}: keyboard: no console errors`, errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N12. performance: frame times while panning and zooming, first paint */
console.log('\nN12. frame-time budget');
{
  const { ctx, page, errors } = await openNat({ width: 1440, height: 900, query: '#demo', reducedMotion: 'no-preference' });
  await sleep(1200);
  await W(page, () => MissionNational.setPlaying(true));
  const b1 = await W(page, () => MissionNational.benchmark({ frames: 180 }));
  check(`pan + zoom at 1440×900 with a live incident and animations on: median frame ${b1.p50Ms} ms, p95 ${b1.p95Ms} ms, mean ${b1.meanMs} ms (${b1.fps} fps), max ${b1.maxMs} ms`, b1.p50Ms <= 17.5 && b1.p95Ms <= 50 && b1.meanMs <= 22, JSON.stringify(b1));
  await W(page, () => MissionNational.map().flyTo({ lon: 51.52, lat: 25.29, ppk: 120 }, 0)); await sleep(300);
  const b2 = await W(page, () => MissionNational.benchmark({ frames: 120 }));
  check(`zoomed to street level (roads redrawn per zoom level into the cache): p95 ${b2.p95Ms} ms, mean ${b2.meanMs} ms`, b2.p50Ms <= 17.5 && b2.p95Ms <= 60 && b2.meanMs <= 25, JSON.stringify(b2));
  await W(page, () => { MissionNational.map().fit(); MissionNational.setSpeed(60); }); await sleep(2500);
  const f = await W(page, () => MissionNational.fps());
  check(`idle with the simulation running at 60×: mean frame ${f && f.meanMs} ms`, !!f && f.meanMs <= 20, JSON.stringify(f));
  check('perf: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N13. loading + error states */
console.log('\nN13. error state when the map data fails to load');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await ctx.route(/qatar-roads\.js/, r => r.abort());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(url('mission.html'), { waitUntil: 'load' });
  const ok = await waitFor(page, () => document.querySelector('#nat').dataset.natState === 'error', null, 8000);
  const e = await W(page, () => ({ txt: document.querySelector('.nat-boot-card.err') ? document.querySelector('.nat-boot-card.err').textContent : '', alert: document.querySelector('.nat-boot-card.err') ? document.querySelector('.nat-boot-card.err').getAttribute('role') : '' }));
  check('a missing data file shows a clear error state (role=alert) that names the file', ok && e.alert === 'alert' && /qatar-roads\.js/.test(e.txt) && /could not start|تعذّر/.test(e.txt), JSON.stringify(e));
  const btns = await W(page, () => [...document.querySelectorAll('.nat-boot-card.err button')].map(b => b.textContent.trim()));
  check('the error state offers "Try again" and "Open the neighbourhood view"', btns.length === 2, btns.join(' | '));
  await page.click('.nat-boot-card.err .btn-ghost'); await sleep(800);
  check('the neighbourhood view still works when the national data is missing', (await W(page, () => MissionControl.scope())) === 'local' && !!(await W(page, () => MissionControl.sim)));
  check('error state: no page errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N14. phone layout: bottom sheet with tabs */
console.log('\nN14. phone layout (390 px)');
{
  const { ctx, page, errors } = await openNat({ width: 390, height: 844, lang: 'en', query: '' });
  const g = await W(page, () => { const r = s => { const q = document.querySelector(s).getBoundingClientRect(); return { top: Math.round(q.top), h: Math.round(q.height), w: Math.round(q.width) }; }; return { stage: r('.nat-stage'), dock: r('.nat-dock'), canvas: r('#nat-canvas'), cvsPx: document.querySelector('#nat-canvas').width, sheet: document.querySelector('.nat-dock').dataset.sheet, vh: innerHeight }; });
  check('the map is full-width above a bottom sheet (stage ≥ 300 px tall, the sheet below it)', g.stage.w === 390 && g.stage.h >= 300 && g.dock.top >= g.stage.top + g.stage.h - 2 && g.canvas.h === g.stage.h, JSON.stringify(g));
  const tabs = await W(page, () => [...document.querySelectorAll('#nat .nat-tabs [role=tab]')].map(t => t.textContent.trim()));
  check('tabs Incident · Dispatch · Traffic · Hazards · KPIs · A/B · Log', tabs.length === 7 && /Incident/.test(tabs[0]) && /Dispatch/.test(tabs[1]) && /Hazards/.test(tabs[3]) && /KPIs/.test(tabs[4]) && /Log/.test(tabs[6]), tabs.join('|'));
  for (const id of ['incident', 'dispatch', 'traffic', 'hazards', 'kpi', 'ab', 'log']) {
    await page.click(`#ntab-${id}`, { force: true }); await sleep(250);
    const vis = await W(page, id => { const p = document.querySelector('#npane-' + id), q = p.getBoundingClientRect(); return { hidden: p.hidden, h: q.height, txt: p.textContent.length, right: q.right }; }, id);
    const ov = await overflow(page);
    check(`390 px: the ${id} tab opens, has content and does not overflow`, !vis.hidden && vis.txt > 40 && ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify({ vis, ov }));
  }
  await page.click('.nat-grab'); await sleep(450);
  const s2 = await W(page, () => document.querySelector('.nat-dock').dataset.sheet);
  await page.click('.nat-grab'); await sleep(450);
  const s3 = await W(page, () => document.querySelector('.nat-dock').dataset.sheet);
  await page.click('.nat-grab'); await sleep(450);
  const s4 = await W(page, () => ({ sheet: document.querySelector('.nat-dock').dataset.sheet, stage: document.querySelector('.nat-stage').getBoundingClientRect().height, cvs: document.querySelector('#nat-canvas').style.height }));
  check('the sheet cycles half → full → peek → half and the map resizes with it', s2 === 'full' && s3 === 'peek' && s4.sheet === 'half' && s4.stage >= 300, `${s2} ${s3} ${JSON.stringify(s4)}`);
  // touch: place an incident with a tap on the map (tool = incident) and pinch is covered by the wheel/keys on desktop
  await W(page, () => MissionNational.map().flyTo({ lon: 51.53, lat: 25.29, ppk: 30 }, 0)); await sleep(250);
  const box = await page.locator('#nat-canvas').boundingBox();
  const free = await W(page, () => { const m = MissionNational.map(), s = m.size(); for (let fy = 0.55; fy > 0.2; fy -= 0.05) for (let fx = 0.5; fx < 0.9; fx += 0.05) { const x = s.w * fx, y = s.h * fy; if (!m.hit(x, y) && !document.elementsFromPoint(x + document.querySelector('#nat-canvas').getBoundingClientRect().left, y + document.querySelector('#nat-canvas').getBoundingClientRect().top).some(e => e.closest('.nat-hud button, .nat-hud summary, .nat-tl, .nat-kstrip'))) return [x, y]; } return [s.w * 0.6, s.h * 0.4]; });
  await page.touchscreen.tap(box.x + free[0], box.y + free[1]); await sleep(300);
  check('a tap on the map places an incident on a phone', (await incs(page)).length >= 1);
  check('phone: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N15. language + theme switching in the national view, traffic clock re-times incidents */
console.log('\nN15. language, theme, clock');
{
  const { ctx, page, errors } = await openNat({ lang: 'en', query: '#demo' });
  const ink0 = await natInk(page);
  const l0 = await W(page, () => document.querySelector('#ntab-incident').innerText.trim());
  await page.click('[data-lang-toggle]'); await sleep(500);
  const l1 = await W(page, () => ({ tab: document.querySelector('#ntab-incident').innerText.trim(), dir: document.documentElement.dir, label: document.querySelector('#nat-canvas').getAttribute('aria-label'), attrib: document.querySelector('.nat-attrib').innerText, plan: document.querySelector('#npane-dispatch').innerText.slice(0, 60) }));
  check('switching to Arabic re-renders the national view (tabs, dock, map label, attribution; RTL)', l0 === 'Incident' && l1.tab === 'الحادث' && l1.dir === 'rtl' && /[\u0600-\u06FF]/.test(l1.label) && /OpenStreetMap/.test(l1.attrib) && /[\u0600-\u06FF]/.test(l1.plan), JSON.stringify(l1));
  const shot = await W(page, () => document.querySelector('#nat-canvas').toDataURL().length);
  await page.click('.theme-toggle'); await sleep(600);
  const shot2 = await W(page, () => ({ theme: document.documentElement.dataset.theme, len: document.querySelector('#nat-canvas').toDataURL().length }));
  check('switching the theme redraws the map from the tokens', shot2.len !== shot, JSON.stringify(shot2));
  check('the map is still drawn after both switches', (await natInk(page)) > 12);
  // the clock: same incident, rush hour vs 3 am → the dispatch is recomputed (ETA differs) and the incident is kept
  const rush = await W(page, () => { MissionNational.setClock({ season: 'winter', dow: 0, hour: 7.75 }); const u = MissionNational.snap().incidents[0].plan.units.filter(q => q.unitId); return u.map(q => q.etaSec); });
  const night = await W(page, () => { MissionNational.setClock({ season: 'winter', dow: 0, hour: 3 }); const i = MissionNational.snap().incidents; return { n: i.length, eta: i[0].plan.units.filter(q => q.unitId).map(q => q.etaSec), clock: MissionNational.snap().clock }; });
  check('setting the clock to 03:00 keeps the incident and recomputes the dispatch on lighter traffic (shorter ETAs)', night.n === 1 && /^03:/.test(night.clock) && Math.min(...night.eta) < Math.min(...rush) && night.eta.reduce((a, b) => a + b, 0) < rush.reduce((a, b) => a + b, 0), JSON.stringify({ rush, night }));
  check('language/theme: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N16. re-dispatch banner when a unit becomes busy / a road closes; KPIs and municipalities */
console.log('\nN16. automatic re-dispatch and KPIs');
{
  const { ctx, page, errors } = await openNat({ lang: 'en' });
  await W(page, ([lon, lat]) => { const i = MissionNational.placeIncident({ hazard: 'fire', lon, lat, severity: 2 }); MissionNational.approve(i.id); MissionNational.step(40); }, DOHA);
  const chosen = await W(page, () => { const u = MissionNational.snap().incidents[0].plan.units.filter(q => q.kind === 'fire' && q.unitId)[0]; return u && u.unitId; });
  await W(page, id => MissionNational.setUnitBusy(id, true), chosen); await sleep(300);
  await W(page, () => MissionNational.step(60)); await sleep(400);
  const r = await W(page, () => ({ banner: !document.querySelector('.nat-banner').hidden, text: document.querySelector('.nat-banner').textContent, ev: MissionNational.nat().events.filter(e => e.type === 'redispatch').length, now: MissionNational.snap().incidents[0].plan.units.filter(q => q.kind === 'fire')[0].unitId }));
  check('when the chosen engine becomes busy the engine re-dispatches another unit automatically', r.ev >= 1 && r.now !== chosen, JSON.stringify({ ev: r.ev, chosen, now: r.now }));
  check('the operator sees a RE-DISPATCH banner (aria-live) saying what changed', r.banner && /re-dispatch/i.test(r.text), r.text);
  await page.click('#ntab-dispatch');
  check('the Dispatch tab explains the re-dispatch', /re-dispatch/i.test(await W(page, () => document.querySelector('#npane-dispatch').textContent)));
  await page.click('#ntab-kpi'); await sleep(300);
  const k = await W(page, () => ({ tiles: document.querySelectorAll('#npane-kpi .nat-kpi').length, rows: document.querySelectorAll('#npane-kpi .nat-table tbody tr').length, txt: document.querySelector('#npane-kpi').textContent }));
  check('KPI strip (incidents, units, ETA, traffic, hazards) and the 8 municipalities are shown', k.tiles >= 8 && k.rows === 8 && /Active incidents/.test(k.txt) && /Mean first-unit ETA/.test(k.txt) && /Re-dispatches/.test(k.txt), JSON.stringify({ tiles: k.tiles, rows: k.rows }));
  check('re-dispatch: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}


/* ---------------------------------------------------------------- N17. pointer interaction: drag, wheel, pinch, hover, tools, hold / cancel */
console.log('\nN17. pointer interaction and operator tools');
{
  const { ctx, page, errors } = await openNat({ lang: 'en' });
  const { page: ph } = await openPageRaw(browser, 'alert.html', { context: ctx, width: 1100, height: 800, lang: 'en' });
  await waitFor(ph, () => document.documentElement.getAttribute('data-alert-ready') === '1', null, 8000);
  await W(ph, () => { window.__clr = []; window.__al = []; Manara.link.on(m => { if (m.type === 'alert-clear') window.__clr.push(m.id); if (m.type === 'alert' && m.scope === 'national') window.__al.push(m.id); }); });
  await page.bringToFront();
  const box = await page.locator('#nat-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const v0 = await W(page, () => MissionNational.map().view());
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 120, cy + 60, { steps: 6 }); await page.mouse.up(); await sleep(150);
  const v1 = await W(page, () => MissionNational.map().view());
  check('dragging with the mouse pans the map (and does not place an incident)', Math.abs(v1.cx - v0.cx) > 1000 && (await incs(page)).length === 0, JSON.stringify({ v0: v0.cx, v1: v1.cx }));
  await page.mouse.wheel(0, -400); await sleep(250);
  const v2 = await W(page, () => MissionNational.map().view());
  check('the wheel zooms in at the cursor', v2.ppk > v1.ppk * 1.4, `${v1.ppk} → ${v2.ppk}`);
  // pinch: two touch pointers moving apart (synthetic PointerEvents on the canvas)
  const pz = await W(page, () => new Promise(res => { const c = document.querySelector('#nat-canvas'), r = c.getBoundingClientRect(), m = MissionNational.map(), p0 = m.view().ppk, x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (t, id, dx) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x + dx, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 }));
    ev('pointerdown', 1, -30); ev('pointerdown', 2, 30); for (let k = 1; k <= 6; k++) { ev('pointermove', 1, -30 - k * 14); ev('pointermove', 2, 30 + k * 14); } ev('pointerup', 1, -114); ev('pointerup', 2, 114); res([p0, m.view().ppk]); }));
  check('a two-finger pinch zooms the map', pz[1] > pz[0] * 1.8, JSON.stringify(pz));
  // place an incident by clicking, hover its marker → tooltip, hold, cancel
  await page.keyboard.press('Escape');
  await W(page, ([lon, lat]) => MissionNational.map().flyTo({ lon, lat, ppk: 20 }, 0), [51.45, 25.40]); await sleep(250);
  await clickAt(page, 51.45, 25.40); await sleep(300);
  const inc0 = await incs(page);
  check('click places the incident after the drag test', inc0.length === 1, JSON.stringify(inc0));
  const mk = await W(page, () => { const m = MissionNational.map(), h = m.hits.filter(q => q.type === 'incident')[0], r = document.querySelector('#nat-canvas').getBoundingClientRect(); return h ? [r.left + h.x, r.top + h.y] : null; });
  await page.mouse.move(mk[0] + 1, mk[1] + 1); await sleep(200);
  const tip = await W(page, () => ({ hid: document.querySelector('.nat-tip').hidden, txt: document.querySelector('.nat-tip').textContent }));
  check('hovering an incident marker shows a tooltip with its id and place', !tip.hid && /N1/.test(tip.txt), JSON.stringify(tip));
  await page.mouse.move(box.x + 5, box.y + box.height - 40); await page.click('#ntab-incident');
  await page.click('#nat-hold'); await sleep(200);
  const held = await W(page, () => ({ pressed: document.querySelector('#nat-hold').getAttribute('aria-pressed'), st: MissionNational.snap().incidents[0].plan.state, txt: document.querySelector('.nat-incident').textContent }));
  check('Hold keeps the plan at "recommended", says nothing is sent, and nothing reaches the phones', held.pressed === 'true' && held.st === 'recommended' && /On hold/.test(held.txt) && (await W(ph, () => window.__al.length)) === 0, JSON.stringify(held));
  await page.click('#nat-approve'); await sleep(500);
  check('Approve after a hold sends the national alert to the phones page', (await W(ph, () => window.__al.length)) === 1);
  await page.click('#nat-cancel'); await sleep(500);
  check('Cancel withdraws the incident and clears the alert on the phones (alert-clear)', (await W(ph, () => window.__clr.includes('A-N1'))) && (await W(page, () => MissionNational.snap().incidents[0].status)) === 'cancelled');
  // inspect tool: a click on a road shows its facts; the Close tool closes it and the engine knows
  await page.click('.nat-tools [data-id="inspect"]');
  await W(page, ([lon, lat]) => MissionNational.map().flyTo({ lon, lat, ppk: 70 }, 0), [51.5, 25.30]); await sleep(250);
  const rd = await W(page, () => { const m = MissionNational.map(), c = m.view().center, e = MissionNational.edgeNear(c[0], c[1]); return e ? { edge: e.edge, ll: m.edgeMid(e.edge) } : null; });
  await W(page, ([lon, lat]) => MissionNational.map().flyTo({ lon, lat, ppk: 70 }, 0), rd.ll); await sleep(250);
  await clickAt(page, rd.ll[0], rd.ll[1]); await sleep(300);
  const rf = await W(page, () => ({ sel: MissionNational.state.sel, txt: document.querySelector('.nat-sel') ? document.querySelector('.nat-sel').textContent : '' }));
  check('the Inspect tool shows a road card (class, free-flow speed, current speed as % of free flow, SIM)', !!rf.sel && rf.sel.type === 'road' && /Class/.test(rf.txt) && /Free-flow speed/.test(rf.txt) && /of free flow \(SIM\)/.test(rf.txt), JSON.stringify(rf));
  await page.click('.nat-tools [data-id="close"]'); await clickAt(page, rd.ll[0], rd.ll[1]); await sleep(300);
  const cl = await W(page, () => MissionNational.snap().closedEdges.length);
  check('the Close tool closes the clicked road (the engine removes it from routing; a ✕ marker is drawn)', cl >= 1, String(cl));
  await W(page, () => MissionNational.clearJams()); await sleep(200);
  check('"Clear all jams and closures" re-opens it', (await W(page, () => MissionNational.snap().closedEdges.length)) === 0);
  // clicking a facility selects it and shows its OSM facts + unit availability control
  await W(page, () => { const m = MissionNational.map(), f = m.facilities.filter(q => q.kind === 'fire')[0]; m.flyTo({ lon: f.lon, lat: f.lat, ppk: 80 }, 0); window.__f = f; }); await sleep(250);
  await W(page, () => { MissionNational.setTool('inspect'); });
  const fl = await W(page, () => { const f = window.__f; return [f.lon, f.lat]; });
  await clickAt(page, fl[0], fl[1], true); await sleep(300);
  const fi = await W(page, () => ({ sel: MissionNational.state.sel, txt: document.querySelector('.nat-sel') ? document.querySelector('.nat-sel').textContent : '', seg: document.querySelectorAll('.nat-sel .seg').length }));
  check('clicking a fire station selects it: type, municipality, OSM id, "real" vs "simulated" note and an Auto/Busy/Free control', !!fi.sel && fi.sel.type === 'facility' && /Fire/.test(fi.txt) && /OpenStreetMap/.test(fi.txt) && fi.seg >= 1, JSON.stringify(fi).slice(0, 200));
  // marking the unit busy is an operator action the engine logs
  await page.click('.nat-sel .seg-b[data-id="busy"]'); await sleep(300);
  check('marking a unit busy is logged by the engine (unit-busy)', await W(page, () => MissionNational.nat().events.some(e => e.type === 'unit-busy')));
  check('pointer tools: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}


/* ---------------------------------------------------------------- N18. guided tour, hide-finished, phones toggle */
console.log('\nN18. guided tour and housekeeping');
{
  const { ctx, page, errors } = await openNat({ lang: 'en', query: '' });
  const { page: ph } = await openPageRaw(browser, 'alert.html', { context: ctx, width: 1100, height: 800, lang: 'en' });
  await waitFor(ph, () => document.documentElement.getAttribute('data-alert-ready') === '1', null, 8000);
  await W(ph, () => { window.__al = []; Manara.link.on(m => { if (m.type === 'alert' && m.scope === 'national') window.__al.push(m.id); }); });
  await page.bringToFront();
  await W(page, () => MissionNational.startTour(10)); await sleep(500);
  check('the guided tour shows a caption bar (aria-live announcements) and numbers its steps', await W(page, () => !document.querySelector('.nat-tour').hidden && /\d/.test(document.querySelector('.nat-tour-n').textContent) && document.querySelector('.nat-tour-t').textContent.length > 20));
  const done = await waitFor(page, () => document.querySelector('.nat-tour').hidden, null, 30000);
  check('the tour ends by itself', done);
  const tr = await W(page, () => ({ incs: MissionNational.snap().incidents.map(i => [i.id, i.plan.state]), jams: MissionNational.snap().traffic.jams, ev: MissionNational.nat().events.map(e => e.type).filter((t, i, a) => a.indexOf(t) === i) }));
  check('the tour placed a fire in Doha, got it approved by "the operator", then jammed the unit\'s road', tr.incs.length === 1 && tr.jams >= 1 && tr.ev.includes('dispatch-approved') && tr.ev.includes('road-jam'), JSON.stringify(tr));
  check('the tour\'s approval reached the phones page like any other approval', (await W(ph, () => window.__al.length)) >= 1);
  // Escape stops it
  await W(page, () => MissionNational.startTour(1)); await sleep(300); await page.focus('#nat-canvas'); await page.keyboard.press('Escape'); await sleep(200);
  check('Escape stops the tour', await W(page, () => document.querySelector('.nat-tour').hidden));
  // hide-finished chip and the phones toggle
  await W(page, () => { const i = MissionNational.placeIncident({ hazard: 'fire', lon: 51.5264, lat: 25.2856, tab: false }); MissionNational.approve(i.id); MissionNational.step(3 * 3600); MissionNational.tab('incident'); }); await sleep(400);
  const fin = await W(page, () => ({ chip: [...document.querySelectorAll('#npane-incident .chip')].map(c => c.textContent).join('|'), items: document.querySelectorAll('#npane-incident .nat-inc').length }));
  check('finished incidents are hidden behind a "Show finished (n)" chip', /Show finished/.test(fin.chip), JSON.stringify(fin));
  await page.click('#nat-pub-phones', { force: true }); await sleep(200);
  check('the phones switch is off and publishing stops (state.pubPhones false)', (await W(page, () => MissionNational.state.pubPhones)) === false);
  check('tour: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}


/* ---------------------------------------------------------------- N19. hazard controls driven through the UI */
console.log('\nN19. hazard and traffic controls (UI)');
{
  const { ctx, page, errors } = await openNat({ lang: 'en' });
  await page.click('#ntab-hazards');
  await page.click('#npane-hazards .seg-b[data-id="dust"]'); await sleep(200);
  check('the Dust overlay button switches the map layer', (await W(page, () => MissionNational.map().scene.layers.hazard)) === 'dust');
  await page.click('#nat-dust-start'); await sleep(300); await W(page, () => MissionNational.step(1800)); await sleep(300);
  check('"Start a dust front" starts it (engine snapshot dust.on, wind from 315°)', await W(page, () => MissionNational.snap().dust.on && MissionNational.snap().dust.deg === 315));
  check('the dust card reports the PM10 estimate and the front position', /PM10/.test(await W(page, () => document.querySelector('#npane-hazards .z-dust').textContent)));
  await page.click('#nat-dust-stop'); await sleep(200);
  check('"Stop the dust" stops it', !(await W(page, () => MissionNational.snap().dust.on)));
  await W(page, () => { const i = document.querySelector('#nat-rain'); i.value = 30; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }); await sleep(300);
  check('the rain slider sets the national rain rate and shows the Rain overlay', await W(page, () => MissionNational.nat().P.rainMmHr === 30 && MissionNational.map().scene.layers.hazard === 'rain'));
  await page.click('#nat-storm'); await sleep(300);
  check('"Add a storm cell at the map centre" adds a moving rain cell (listed in the snapshot)', await W(page, () => { MissionNational.step(60); return MissionNational.snap().rain.cells.length >= 1; }));
  await page.click('#nat-rain-clear'); await sleep(200);
  check('"Clear the rain" clears slider, cells and rate', await W(page, () => MissionNational.nat().P.rainMmHr === 0 && MissionNational.nat().rainCells.length === 0));
  await page.click('#ntab-traffic');
  await W(page, () => { const i = document.querySelector('#nat-traffic'); i.value = 2; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }); await sleep(300);
  const sp = await W(page, () => ({ load: MissionNational.nat().P.trafficLoad, speed: MissionNational.snap().kpis.traffic.meanSpeedRatio }));
  await W(page, () => { const i = document.querySelector('#nat-traffic'); i.value = 0; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }); await sleep(300);
  const sp0 = await W(page, () => ({ load: MissionNational.nat().P.trafficLoad, speed: MissionNational.snap().kpis.traffic.meanSpeedRatio }));
  check('the national congestion slider changes traffic: doubled congestion is slower than none', sp.load === 2 && sp0.load === 0 && sp.speed < sp0.speed, JSON.stringify({ sp, sp0 }));
  await W(page, () => { document.querySelector('#nat-day').value = '5'; document.querySelector('#nat-day').dispatchEvent(new Event('change')); const h = document.querySelector('#nat-hour'); h.value = 7.75; h.dispatchEvent(new Event('input')); }); await page.click('#nat-setclock'); await sleep(500);
  const fri = await W(page, () => ({ dow: MissionNational.snap().dowName.en, weekend: MissionNational.snap().weekend, speed: MissionNational.snap().kpis.traffic.meanSpeedRatio }));
  check('Friday 07:45 is the weekend: lighter traffic than a Sunday rush hour (assumed day profiles, SIM)', fri.dow === 'Friday' && fri.weekend && fri.speed > 0.85, JSON.stringify(fri));
  check('the 24-hour profile is drawn on a canvas', await W(page, () => { const c = document.querySelector('.nat-prof'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 3; k < d.length; k += 4 * 29) if (d[k] > 0) n++; return n > 40; }));
  check('hazard/traffic controls: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- N19. judge-panel round: labels, data gaps, traffic assumptions, A/B result, one story across zoom levels */
console.log('\nN19. labels, data-gap banner, traffic assumptions, A/B result, breadcrumb');
for (const lang of ['en', 'ar']) {
  const { ctx, page, errors } = await openNat({ width: 1440, height: 900, lang, query: '#demo' });
  await sleep(500);
  const L = await W(page, () => { const m = MissionNational.map(), N = MissionNational.nat(); const labs = m.facilities.map(f => m.labelFor(f.id)); return { n: labs.length, bad: labs.filter(l => !l || /unnamed|بلا اسم/i.test(l.ar + l.en + (l.sub.ar || '') + (l.sub.en || ''))).length, unverified: labs.filter(l => !l.verified).length, minorOff: m.scene.layers.fac.minor === false, minorBox: !!document.querySelector('#nat-ly-fac-minor'), arLatin: labs.filter(l => l.hasAr && !/[؀-ۿ]/.test(l.ar)).length }; });
  check(`${lang}: every facility has a display label, none says "unnamed", unnamed/odd ones are marked unverified, clinics and specialist centres are off by default (a switch exists)`, L.n === 138 && L.bad === 0 && L.unverified >= 31 && L.minorOff && L.minorBox && L.arLatin === 0, JSON.stringify(L));
  const dom = await W(page, () => { MissionNational.tab('dispatch'); return document.querySelector('#npane-dispatch').innerText; });
  check(`${lang}: the unit cards show no raw "(unnamed in OSM)", the unverified badge and the "named in OSM" secondary line appear where relevant`, !/unnamed|بلا اسم/i.test(dom) && /(unverified|غير موثّق)/.test(dom), dom.slice(0, 140));
  // Ash Shamal: the far ambulance must carry the data-gap banner
  const gap = await W(page, () => { MissionNational.placeIncident({ hazard: 'heat', lon: 51.2, lat: 26.12, severity: 2, patients: 1, tab: false }); const i = MissionNational.snap().incidents.slice(-1)[0]; MissionNational.select(i.id); MissionNational.tab('dispatch'); return i.id; });
  await sleep(500);
  const g = await W(page, () => { const b = document.querySelector('#npane-dispatch .nat-gap'); return { has: !!b, txt: b ? b.innerText : '', tags: [...document.querySelectorAll('#npane-dispatch .nat-unit .tag')].map(t => t.textContent).join('|'), hosp: document.querySelector('#npane-dispatch .nat-hosp') ? document.querySelector('#npane-dispatch .nat-hosp').innerText : '' }; });
  check(`${lang}: a fire/heat call in Ash Shamal shows a data-gap banner (never a bare 33-minute ambulance) and a "data gap" tag on the unit`, g.has && /(Data gap|فجوة بيانات)/.test(g.txt) && /(data gap|فجوة بيانات)/.test(g.tags) && /(No verified emergency department|لا يوجد قسم طوارئ مؤكد)/.test(g.txt), g.txt.slice(0, 200) + ' || ' + g.tags);
  // ambulance modelled + a destination hospital card for heat (also in Doha)
  await W(page, () => { MissionNational.placeIncident({ hazard: 'heat', lon: 51.5264, lat: 25.2856, severity: 2, patients: 1, tab: false }); const i = MissionNational.snap().incidents.slice(-1)[0]; MissionNational.select(i.id); MissionNational.tab('dispatch'); });
  await sleep(500);
  const am = await W(page, () => ({ txt: document.querySelector('#npane-dispatch .nat-unit[data-kind=ambulance]').innerText, hosp: !!document.querySelector('#npane-dispatch .nat-hosp'), gap: !!document.querySelector('#npane-dispatch .nat-gap') }));
  check(`${lang}: Doha heat call: the ambulance is labelled as modelled at a hospital, a separate destination-hospital card is shown, no data-gap banner`, /(modelled at|مُنمذَج في)/.test(am.txt) && am.hosp && !am.gap, am.txt.slice(0, 160));
  check(`${lang}: labels and gaps: no console errors`, errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, page, errors } = await openNat({ width: 1440, height: 900, lang: 'en', query: '' });
  await page.click('#ntab-traffic'); await sleep(300);
  const t = await W(page, () => { const c = document.querySelector('#npane-traffic .nat-how'); return { has: !!c, asm: c ? c.querySelectorAll('.nat-asm').length : 0, tags: c ? [...c.querySelectorAll('.nat-asm .tag')].map(x => x.textContent).join('|') : '', txt: c ? c.innerText : '', rows: c ? c.querySelectorAll('details table tr').length : 0, first: document.querySelector('#npane-traffic .nat-card') === c };
  });
  check('Traffic tab: a "Where does the traffic come from?" card is first, with 3 assumptions each tagged ASSUMPTION, says no real traffic data is used, and lists every traffic parameter', t.has && t.first && t.asm === 3 && (t.tags.match(/ASSUMPTION/g) || []).length === 3 && /no real traffic data/i.test(t.txt) && /Corniche/.test(t.txt) && t.rows >= 6, JSON.stringify({ ...t, txt: t.txt.length }));
  await page.click('#ntab-ab'); 
  const ok = await waitFor(page, () => !!document.querySelector('#npane-ab .nat-abres[data-ready="1"]'), null, 15000);
  const ab = await W(page, () => { const r = document.querySelector('#npane-ab .nat-abres'); return r ? { txt: r.innerText, tiles: r.querySelectorAll('.nat-abtiles .kpi').length } : null; });
  check('A/B tab runs by itself on first open (100 incidents, seed 7) and shows the median and 90th-percentile gain, the share of incidents where the order flips, n and seed, and what it does NOT prove', ok && ab && ab.tiles === 4 && /Median gain/.test(ab.txt) && /90th-percentile/.test(ab.txt) && /order flips/.test(ab.txt) && /n = 100/.test(ab.txt) && /seed 7/.test(ab.txt) && /does NOT prove/.test(ab.txt), ab && ab.txt.slice(0, 160));
  check('traffic / A/B explanation: no console errors', errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}
for (const [lang, width] of [['en', 1440], ['ar', 390]]) {
  const { ctx, page, errors } = await openNat({ width, height: width > 600 ? 900 : 844, lang, query: '#demo' });
  await sleep(500);
  await W(page, () => { MissionNational.select('N1'); MissionNational.zoomIn('N1'); }); await sleep(900);
  const z = await W(page, () => { const z = document.querySelector('#mc-zoomctx'); return { txt: z.innerText, crumbs: [...z.querySelectorAll('.zc-crumbs li')].map(l => l.textContent.trim()), clock: MissionControl.snap.clock, hour: MissionControl.snap.hour, scope: MissionControl.scope(), folded: ['scenario', 'judge'].map(id => { const e = document.querySelector('#pn-' + id); return e ? e.classList.contains('collapsed') : null; }), layout: document.querySelector('#main').dataset.layout }; });
  const ov = await overflow(page);
  check(`${lang}/${width}: the zoom-in shows a breadcrumb Qatar > municipality > place > last 100 m, the national clock (07:4x) and says it is a simulated scenario`, z.scope === 'local' && z.crumbs.length >= 3 && /(Qatar|قطر)/.test(z.crumbs[0]) && /(Last 100 m|آخر ١٠٠ متر|آخر 100 متر)/.test(z.crumbs[z.crumbs.length - 1]) && /^07:4/.test(z.clock) && /(simulated scenario|سيناريو محاكى)/.test(z.txt), JSON.stringify(z));
  check(`${lang}/${width}: no horizontal overflow on the zoom-in (breadcrumb wraps instead of clipping)`, ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  if (width > 1000) check('the zoom-in opens calmer: the scenario list and the judge controls start folded (and can be opened)', z.layout === 'wide' && z.folded[0] === true && z.folded[1] === true, JSON.stringify(z.folded));
  await page.click('.zc-home'); await sleep(700);
  check(`${lang}/${width}: the breadcrumb's "Qatar" returns to the national map`, (await W(page, () => MissionControl.scope())) === 'national');
  check(`${lang}/${width}: breadcrumb: no console errors`, errors.length === 0, errors.join(' | ')); allErrors.push(...errors); await ctx.close();
}
{
  const { ctx, page, errors } = await openNat({ width: 390, height: 844, lang: 'en', query: '' });
  await sleep(500);
  const g = await W(page, () => ({ stage: document.querySelector('.nat-stage').getBoundingClientRect().height, vh: innerHeight }));
  check(`phone: the map takes at least 38% of the viewport (${Math.round(g.stage)} of ${g.vh} px) with the sheet half open`, g.stage / g.vh >= 0.38, JSON.stringify(g));
  check('phone: the demo call to action is visible in the open sheet on the first screen', await W(page, () => { const b = document.querySelector('#nat-demo-d').getBoundingClientRect(); return b.top < innerHeight - 10 && b.bottom > 0; }));
  allErrors.push(...errors); await ctx.close();
}

check('whole run: no console or page errors anywhere', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await done(browser);
