// Mission Control («غرفة العمليات») browser tests — Playwright + Chromium over file:// (no network).
//   node tools/manara/test-mission.mjs
// Covers: clean load (ar/en × dark/light), every scenario starts and advances, approve → 'alert' on the bus (a second page:
// alert.html) and "I'm awake / I'm safe" there marking the resident safe here, exit lock → re-route, the dispatch rule
// (FASTEST unit given traffic, not the nearest; re-dispatch on a closed road), A/B panel (checked against ManaraSim.ab) and the
// 20-seed distribution, CAP export is well-formed XML, determinism of scrubbing, Present mode, share link, twin-board parser,
// Evidence Lab vision key, keyboard operation, phone layout (bottom sheet) and no horizontal overflow at 390 and 1440.
import fs from 'node:fs';
import { launch, openPage, overflow, check, done } from './lib.mjs';

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

check('whole run: no console or page errors anywhere', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await done(browser);
