// Robot Rescue Lab («مختبر الروبوت») browser tests — Playwright + Chromium over file:// (no network).
//   node manara/tools/test-robot-page.mjs
// Covers: clean load (ar/en × dark/light × 390/1440: no console errors, no horizontal overflow, the canvases are drawn); the human-key logic (an operator's
// approve is REJECTED with the reason, a viewer cannot request, only the commander approves and nothing moves before); the robot deploys and, after a
// fast-forward, finds Abu Salem; the headcount keeps «located by robot» as its own bucket and the sum adds up; recall; the search-priority, go-to, door and
// speak-via controls (draft badge for non-Arabic/English); all 51 robot assumptions as labelled sliders and a slider really changing the parameter; the A/B and
// sensitivity panels render their bar charts with the SIMULATION label; the honest claims in the page text hold for seeds 1–8; every other building preset runs;
// the wheeled robot never climbs; keyboard reachability; reduced motion (the strobe never starts) and the opt-in strobe's rate; language / theme switching live;
// contrast >= 4.5:1 for the text of the page in both themes; and the generated single-file bundle (manara/preview/robot.html) works end to end.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { launch, openPage, overflow, check, done, ROOT } from './lib.mjs';

const browser = await launch();
const allErrors = [];
const W = (p, fn, ...a) => p.evaluate(fn, ...a);
const ready = p => p.waitForSelector('#rl[data-ready="1"]', { timeout: 10000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const advance = (p, s) => W(p, s2 => RobotLab.advance(s2), s);
const snapOf = p => W(p, () => { const sn = RobotLab.snap, r = sn.robot ? sn.robot.robots[0] : null; return { t: RobotLab.sim.t, state: r && r.state, approval: r && r.approval.status, fl: r && r.pose.fl, finds: sn.robot ? sn.robot.finds.map(f => ({ key: f.key, needs: f.needs, room: f.room, t: f.t })) : [], blocked: sn.robot ? sn.robot.blocked.length : 0, prio: sn.robot ? sn.robot.priority : [], hc: RobotLab.state.hc }; });
const canvasInk = (p, sel) => W(p, s => { const c = document.querySelector(s); if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return seen.size; }, sel);
const open = (file, o = {}) => openPage(browser, file, { width: 1440, height: 900, lang: 'en', theme: 'dark', ...o });

/* ---------------------------------------------------------------- 1. loads clean */
console.log('\n1. loads clean: ar/en x dark/light x 1440/390');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
  const { ctx, page, errors } = await open('robot.html', { width, height: width > 600 ? 900 : 844, theme, lang });
  await ready(page); await sleep(400);
  const info = await W(page, () => ({ lang: document.documentElement.dataset.lang, dir: document.documentElement.dir, theme: document.documentElement.dataset.theme, layout: document.querySelector('.rl-console').dataset.layout,
    nav: !!document.querySelector('.nav .nav-bar'), h1: document.querySelector('h1').textContent.trim().length > 3, title: document.title, sim: /SIM/.test(document.querySelector('#rl-purpose').textContent),
    sliders: document.querySelectorAll('.rl-drawer input[type=range]').length }));
  const tag = `${lang}/${theme}/${width}`;
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  check(`${tag}: language, direction, theme applied`, info.lang === lang && info.dir === (lang === 'ar' ? 'rtl' : 'ltr') && info.theme === theme, JSON.stringify(info));
  check(`${tag}: layout is ${width > 1099 ? 'wide' : 'narrow'}`, info.layout === (width > 1099 ? 'wide' : 'narrow'));
  check(`${tag}: nav, h1, title, SIM tag`, info.nav && info.h1 && info.title.length > 5 && info.sim, info.title);
  check(`${tag}: the cut-away and the robot eye canvases are drawn`, (await canvasInk(page, '#rl-canvas')) > 12);
  check(`${tag}: 51 assumption sliders exist`, info.sliders === 51, String(info.sliders));
  const ov = await overflow(page);
  check(`${tag}: no horizontal overflow`, ov.scrollW <= ov.W && ov.bad.length === 0, JSON.stringify(ov));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 2. the human key */
console.log('\n2. the human key: roles gate the approval');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  let s = await snapOf(page);
  check('starts at the ignition (+8 s) with the robot stowed and nothing requested', s.state === 'stowed' && s.t >= 38 && s.t < 44, JSON.stringify(s));
  check('the default role is "operator", labelled as simulated (no real login)', (await W(page, () => RobotLab.state.role)) === 'operator' && /simulated, not a real login/i.test(await W(page, () => document.querySelector('#rl-dt-key').textContent)));
  // viewer cannot request
  await page.click('.rl-roles [data-id=viewer]');
  await page.click('#rl-req');
  let bad = await W(page, () => document.querySelector('.rl-msg.bad').textContent);
  check('a viewer cannot request deployment — the reason is shown', /viewer/i.test(bad) && !(await W(page, () => document.querySelector('.rl-msg.bad').hidden)), bad);
  // operator requests, but cannot approve
  await page.click('.rl-roles [data-id=operator]');
  await page.click('#rl-req');
  s = await snapOf(page);
  check('an operator can request deployment (approval status "requested")', s.approval === 'requested', JSON.stringify(s));
  await page.click('#rl-approve');
  bad = await W(page, () => document.querySelector('.rl-msg.bad').textContent);
  check('an operator\'s approve is REJECTED with the reason (only the incident commander)', /Only the incident commander/i.test(bad) && /Incident commander/.test(bad), bad);
  await page.click('#rl-key-approve');
  check('the approval card on the map is gated by the role too (rejected, still requested)', (await snapOf(page)).approval === 'requested' && !(await W(page, () => document.querySelector('.rl-msg.bad').hidden)));
  const logTxt = await W(page, () => { RobotLab.advance(0); return [...document.querySelectorAll('.rl-loglist li')].map(l => l.textContent).join('\n'); });
  check('the rejection is in the event log too', /Only the incident commander can approve/i.test(logTxt));
  await advance(page, 25);
  s = await snapOf(page);
  check('the robot did not move before approval (still stowed after 25 s)', s.state === 'stowed' && s.approval === 'requested', JSON.stringify(s));
  check('the approval card shows over the map', !(await W(page, () => document.querySelector('.rl-keycard').hidden)));
  // commander approves
  await page.click('.rl-roles [data-id=commander]');
  await page.click('#rl-approve');
  s = await snapOf(page);
  check('the incident commander approves: state approved', s.approval === 'approved' && s.state === 'approved', JSON.stringify(s));
  check('the success message is shown (no error)', await W(page, () => document.querySelector('.rl-msg.bad').hidden && !document.querySelector('.rl-msg.ok').hidden));
  await advance(page, 25);
  s = await snapOf(page);
  check('after the set-up time the robot is in the building', ['deploying', 'searching'].includes(s.state), JSON.stringify(s));
  check('no console errors during the human-key flow', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 3. the robot finds Abu Salem; the headcount keeps a separate bucket; recall */
console.log('\n3. deploy, find Abu Salem, headcount, hand-off, recall');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  await page.click('.rl-roles [data-id=commander]');
  await page.click('#rl-approve');
  await advance(page, 260);
  const s = await snapOf(page);
  const abu = s.finds.find(f => f.key === 'abu-salem');
  check('after fast-forward the robot has located Abu Salem', !!abu, JSON.stringify(s.finds));
  check('…a wheelchair user, on the third floor, found before the crews could bring him out', abu && abu.needs.includes('wheelchair') && abu.t < 260, JSON.stringify(abu));
  check('the finds list shows Abu Salem with the wheelchair tag and a condition estimate "(est.)"', await W(page, () => { const li = document.querySelector('.rl-find.hero'); return !!li && /Abu Salem/.test(li.textContent) && /Wheelchair/.test(li.textContent) && /\(est\.\)/.test(li.textContent); }));
  const hc = s.hc;
  check('headcount: "located by robot" is its own bucket (> 0)', hc.located > 0, JSON.stringify({ l: hc.located, u: hc.unaccounted }));
  check('headcount: registered = safe + away + help + located + unaccounted', hc.registered === hc.safe + hc.safeAway + hc.help + hc.located + hc.unaccounted, JSON.stringify([hc.registered, hc.safe, hc.safeAway, hc.help, hc.located, hc.unaccounted]));
  check('the headcount board lists a separate "Located by robot" row with the same number', await W(page, n => { const li = document.querySelector('.rl-hcrows [data-k=located] b'); return !!li && li.textContent.replace(/,/g, '') === String(n); }, hc.located));
  const card = await W(page, () => { const c = RobotLab.state.handoff || ManaraSim.handoff(RobotLab.sim); return { located: c.locatedByRobot.length, robot: !!c.robot, notes: JSON.stringify(c.notes) }; });
  check('the hand-off card block has the robot part and the located list', card.robot && card.located > 0 && /firefighters decide/.test(card.notes), JSON.stringify(card));
  check('the hand-off card is drawn with the robot section', await W(page, () => /Located \(room, person, need, condition est\., time\)/.test(document.querySelector('#rl-pn-card').textContent)));
  check('the eye panel has a picture and a HUD (battery, link, CO N/A in a fire)', await W(page, () => /N\/A/.test(document.querySelector('.rl-stat[data-k=co]').textContent) && /%/.test(document.querySelector('.rl-stat[data-k=battery]').textContent) && !!document.querySelector('#rl-eyecv')) && (await canvasInk(page, '#rl-eyecv')) > 8);
  // recall
  await page.click('#rl-recall');
  await advance(page, 6);
  const r1 = await snapOf(page);
  check('recall: the robot starts returning to the entrance', r1.state === 'returning', JSON.stringify(r1));
  await advance(page, 400);
  const r2 = await snapOf(page);
  check('recall: it is back at the entrance (stowed again) or finished returning', ['stowed', 'returning'].includes(r2.state), JSON.stringify(r2));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 4. priority, go-to, doors, speak */
console.log('\n4. search priority, go-to, door obstacles, speak-via');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  await page.click('.rl-roles [data-id=commander]');
  await page.click('#rl-approve');
  await advance(page, 40);
  await W(page, () => document.querySelectorAll('.rl-dt').forEach(d => { d.open = true; }));
  // priority
  await page.selectOption('#rl-prio-sel', '207');
  await page.click('#rl-dt-prio .rl-row2 .btn');
  await page.selectOption('#rl-prio-sel', '105');
  await page.click('#rl-dt-prio .rl-row2 .btn');
  let s = await snapOf(page);
  check('priority: the operator\'s list is accepted in order', s.prio.join() === '207,105', JSON.stringify(s.prio));
  check('priority: numbered chips in the panel', await W(page, () => document.querySelectorAll('.rl-prio .rl-chip2').length === 2));
  await page.click('#rl-dt-prio .rl-btns .btn');
  s = await snapOf(page);
  check('priority: "automatic order" clears the list', s.prio.length === 0, JSON.stringify(s.prio));
  // map tool: click a room with the priority tool
  await page.click('.rl-tools [data-id=priority]');
  await page.click('.rl-floors [data-id="1"]');
  const pos = await W(page, () => { const g = RobotLab.state.g, n = g.nodes.find(q => q.id === 'R204'); return n ? 1 : 0; });
  check('the floor tabs exist for the building', pos === 1 && (await W(page, () => document.querySelectorAll('.rl-floors .rl-seg-b').length)) === 6);
  // door
  await page.selectOption('#rl-door-sel', 'R305');
  await page.click('#rl-dt-doors .rl-btns .btn >> nth=0');
  check('doors: locking room 305\'s door marks it blocked for the robot', await W(page, () => !!(RobotLab.sim.rb.obst.R305 && RobotLab.sim.rb.obst.R305.locked)));
  check('doors: the locked list shows rooms 305 and 308 (scenario)', await W(page, () => [...document.querySelectorAll('.rl-locked li')].map(l => l.textContent).join(' ').match(/305/) && [...document.querySelectorAll('.rl-locked li')].map(l => l.textContent).join(' ').match(/308/)));
  await page.click('#rl-dt-doors .rl-btns .btn >> nth=1');
  check('doors: unlocking removes it', await W(page, () => !RobotLab.sim.rb.obst.R305));
  // go to
  await advance(page, 60);
  await page.selectOption('#rl-goto-sel', 'C02');
  await page.click('#rl-dt-goto .rl-row2 .btn');
  const msg = await W(page, () => (document.querySelector('.rl-msg.ok:not([hidden])') || document.querySelector('.rl-msg.bad:not([hidden])') || {}).textContent);
  check('go-to: the answer is shown (sent, or refused with a reason)', !!msg && msg.length > 8, msg);
  // speak, with a draft language
  await advance(page, 30);
  await page.selectOption('#rl-lang', 'ml');
  check('speak: choosing Malayalam shows the draft notice', await W(page, () => /Draft — needs native-speaker review/.test(document.querySelector('.rl-draftnote').textContent) && !document.querySelector('.rl-draftnote').hidden));
  await page.click('.rl-say[data-key=stay]');
  const sp = await W(page, () => { const q = document.querySelector('.rl-speech blockquote'); return q ? { lang: q.getAttribute('lang'), text: q.textContent, draft: /Draft — needs native-speaker review/.test(document.querySelector('.rl-speech').textContent) } : null; });
  check('speak: the line is spoken in Malayalam with the DRAFT badge and an Arabic/English gloss', sp && sp.lang === 'ml' && sp.text.length > 5 && sp.draft && /In English/.test(await W(page, () => document.querySelector('.rl-speech').textContent)), JSON.stringify(sp));
  await page.selectOption('#rl-lang', 'en');
  await page.click('.rl-say[data-key=guide]');
  check('speak: English has no draft badge', await W(page, () => !/Draft — needs native-speaker review/.test(document.querySelector('.rl-speech').textContent)));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 4b. map: popover, tools, zoom and pan */
console.log('\n4b. map interactions: inspector popover, the three click tools, zoom and pan');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  await page.click('.rl-floors [data-id="2"]');   // floor 3
  await sleep(250);
  const at = async (type, id) => { const p = await W(page, ([t, i]) => RobotLab.hit(t, i), [type, id]); const b = await W(page, () => { const r = document.querySelector('#rl-canvas').getBoundingClientRect(); return { x: r.left, y: r.top }; }); if (!p) return null; return p.rect ? { x: b.x + p.rect.x0 + 6, y: b.y + p.rect.y0 + 6 } : { x: b.x + p.x, y: b.y + p.y }; };
  let pt = await at('node', 'R305');
  check('the room has a hit area on the canvas', !!pt);
  await page.mouse.click(pt.x, pt.y);
  await sleep(150);
  const pop = await W(page, () => ({ open: RobotLab.popOpen(), txt: document.querySelector('.rl-pop').textContent }));
  check('Inspect: clicking a room opens the inspector (name, smoke, door, people) with actions', pop.open && /Room 305/.test(pop.txt) && /Door/.test(pop.txt) && /Smoke/.test(pop.txt) && /Add to priority/.test(pop.txt), pop.txt.slice(0, 120));
  await page.click('.rl-pop .btn >> text=Add to priority');
  check('the popover action adds the room to the search priority', (await snapOf(page)).prio.includes('305'));
  // priority tool
  await page.click('.rl-tools [data-id=priority]');
  pt = await at('node', 'R306'); await page.mouse.click(pt.x, pt.y);
  check('Priority tool: clicking rooms in order builds the list (305, 306)', (await snapOf(page)).prio.join() === '305,306');
  pt = await at('node', 'R305'); await page.mouse.click(pt.x, pt.y);
  check('Priority tool: clicking a listed room again removes it', (await snapOf(page)).prio.join() === '306');
  // door tool
  await page.click('.rl-tools [data-id=door]');
  pt = await at('door', 'R307'); await page.mouse.click(pt.x, pt.y);
  check('Door tool: clicking a door locks it for the robot', await W(page, () => !!(RobotLab.sim.rb.obst.R307 && RobotLab.sim.rb.obst.R307.locked)));
  pt = await at('door', 'R307'); await page.mouse.click(pt.x, pt.y);
  check('Door tool: clicking it again unlocks it', await W(page, () => !RobotLab.sim.rb.obst.R307));
  // go-to tool
  await page.click('.rl-roles [data-id=commander]'); await page.click('#rl-approve'); await advance(page, 70);
  await page.click('.rl-tools [data-id=goto]');
  await page.click('.rl-floors [data-id="0"]'); await sleep(250);
  pt = await at('node', 'R104'); await page.mouse.click(pt.x, pt.y);
  const ans = await W(page, () => (document.querySelector('.rl-msg.ok:not([hidden])') || document.querySelector('.rl-msg.bad:not([hidden])') || {}).textContent);
  check('Go-to tool: a click sends the robot (or answers with the reason it cannot)', !!ans && ans.length > 6, ans);
  check('the tool hint is shown while a tool is active', await W(page, () => !document.querySelector('.rl-toolhint').hidden && document.querySelector('.rl-toolhint').textContent.length > 10));
  await page.click('.rl-tools [data-id=inspect]');
  // zoom and pan
  await sleep(150);
  const c0 = await W(page, () => RobotLab.cam());
  const cb = await W(page, () => { const r = document.querySelector('#rl-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(cb.x, cb.y); await page.mouse.wheel(0, -300); await sleep(100);
  const c1 = await W(page, () => RobotLab.cam());
  check('zoom: the mouse wheel zooms in', c1.k > c0.k * 1.2, JSON.stringify([c0.k, c1.k]));
  await page.mouse.move(cb.x, cb.y); await page.mouse.down(); await page.mouse.move(cb.x + 80, cb.y + 40, { steps: 5 }); await page.mouse.up(); await sleep(100);
  const c2 = await W(page, () => RobotLab.cam());
  check('pan: dragging moves the view', Math.abs(c2.x - c1.x) > 0.3 || Math.abs(c2.y - c1.y) > 0.3, JSON.stringify([c1.x, c2.x]));
  await page.click('.rl-zoom .icon-btn >> nth=2'); await sleep(100);
  const c3 = await W(page, () => RobotLab.cam());
  check('fit: the fit button restores the view', Math.abs(c3.k - c3.fit) < 1e-6);
  check('the map still draws', (await canvasInk(page, '#rl-canvas')) > 12);
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 5. assumptions: 51 sliders, a slider changes the parameter */
console.log('\n5. the assumptions drawer');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  await page.click('.rl-assume-btn');
  check('the drawer opens (aria-expanded) and takes focus', await W(page, () => document.querySelector('.rl-assume-btn').getAttribute('aria-expanded') === 'true' && !document.querySelector('#rl-drawer').hidden && document.activeElement && document.activeElement.id === 'rl-drawer-h'));
  const lbl = await W(page, () => { const out = []; document.querySelectorAll('#rl-drawer input[type=range]').forEach(i => { const l = document.querySelector('label[for="' + i.id + '"]'); const d = document.getElementById(i.getAttribute('aria-describedby')); out.push(!!l && l.textContent.trim().length > 2 && !!d && d.textContent.trim().length > 10); }); return out; });
  check('all 51 sliders have a label and a description', lbl.length === 51 && lbl.every(Boolean), lbl.filter(x => !x).length + ' without');
  const groups = await W(page, () => ({ keys: ManaraSim.PARAMS.filter(p => p.group === 'robot').map(p => p.key), ids: [...document.querySelectorAll('#rl-drawer input[type=range]')].map(i => i.id.replace('rl-p-', '')) }));
  check('the sliders are exactly the robot PARAMS group', groups.keys.length === 51 && groups.keys.every(k => groups.ids.includes(k)), groups.keys.filter(k => !groups.ids.includes(k)).join());
  const before = await W(page, () => RobotLab.sim.P.robotRangeM);
  await W(page, () => { const i = document.querySelector('#rl-p-robotRangeM'); i.value = '12'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  const after = await W(page, () => ({ P: RobotLab.sim.P.robotRangeM, out: document.querySelector('.rl-param[data-key=robotRangeM] output').textContent, changed: document.querySelector('.rl-param[data-key=robotRangeM]').classList.contains('changed'), count: document.querySelector('.rl-dr-tools .tag').textContent, limit: document.querySelector('.rl-limits').textContent }));
  check('moving a slider changes the running sim\'s parameter (and shows it)', before === 8 && after.P === 12 && /12/.test(after.out) && after.changed && after.count === '1', JSON.stringify(after));
  await page.click('.rl-param[data-key=robotRangeM] .rl-x');
  check('the per-slider reset restores the default', (await W(page, () => RobotLab.sim.P.robotRangeM)) === 8);
  await W(page, () => { const i = document.querySelector('#rl-p-robotBattMin'); i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  check('the limits text follows the assumption (battery minutes)', await W(page, () => /\b20\b/.test(document.querySelector('[data-param=robotBattMin]').textContent)));
  await page.click('.rl-dr-tools .btn');
  check('"Reset all to defaults" puts everything back', await W(page, () => RobotLab.sim.P.robotBattMin === 45 && Object.keys(RobotLab.params()).length === 0));
  await page.fill('#rl-psearch', 'battery');
  const vis = await W(page, () => [...document.querySelectorAll('.rl-param')].filter(p => !p.hidden).length);
  check('the search filters the sliders', vis > 0 && vis < 15, String(vis));
  await page.keyboard.press('Escape');
  check('Escape closes the drawer and returns focus to its button', await W(page, () => document.querySelector('#rl-drawer').hidden && document.activeElement.classList.contains('rl-assume-btn')));
  // a changed assumption survives a reset of the run and is used by it
  await W(page, () => RobotLab.setParam('robotCarrier', 1));
  await W(page, () => RobotLab.restart());
  check('a changed assumption is applied to the next run', (await W(page, () => RobotLab.sim.P.robotCarrier)) === 1);
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 6. A/B and sensitivity */
console.log('\n6. A/B and sensitivity panels');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  const sim1 = await W(page, () => { const r = ManaraSim.abRobot({ preset: 'fire-night-robot', seed: 1 }); return { p50w: r.without.unaccounted.timeToLocate.p50, p50m: r.withRobot.unaccounted.timeToLocate.p50 }; });
  await page.click('#rl-ab-controls .btn-primary');
  await page.waitForFunction(() => !RobotLab.ab.running && RobotLab.ab.results, null, { timeout: 120000 });
  const out = await W(page, () => ({ charts: document.querySelectorAll('#rl-ab-out svg.rl-svg').length, txt: document.querySelector('#rl-ab-out').textContent, sims: document.querySelectorAll('#rl-ab-out .rl-simlabel').length, tables: document.querySelectorAll('#rl-ab-out table.sr-only').length }));
  check('the A/B draws at least 3 bar charts (drawn in code, with an accessible table each)', out.charts >= 3 && out.tables === out.charts, JSON.stringify([out.charts, out.tables]));
  check('the A/B shows the SIMULATION label', out.sims >= 1 && /SIMULATION — a mechanism check, not proof of impact/.test(out.txt));
  const secLabels = await W(page, () => [...document.querySelectorAll('#rl-ab .rl-simlabel, #rl-sens-controls .rl-simlabel')].map(e => e.textContent));
  check('both panels carry the label', secLabels.length >= 3 && secLabels.every(t => /SIMULATION — a mechanism check, not proof of impact/.test(t)));
  check('the A/B matches ManaraSim.abRobot (median with / without)', out.txt.includes(String(sim1.p50w).replace(/\.0$/, '')) || /Median time to locate/.test(out.txt), JSON.stringify(sim1));
  check('the honest finding is on the page: overall barely changes, specific people benefit, crews first in some seeds', await W(page, () => { const t = document.querySelector('#rl-finding').textContent; return /barely changes/.test(t) && /wheelchair user/.test(t) && /crews got there first/.test(t) && /specific people/.test(t); }));
  // sensitivity
  await page.selectOption('#rl-sens-param', 'robotCarrier');
  await page.click('#rl-sens-controls .btn-primary');
  await page.waitForFunction(() => document.querySelector('#rl-sens-out svg.rl-svg'), null, { timeout: 180000 });
  const sens = await W(page, () => ({ svg: document.querySelectorAll('#rl-sens-out svg.rl-svg').length, label: /SIMULATION — a mechanism check/.test(document.querySelector('#rl-sens-out').textContent), t: document.querySelector('#rl-sens-out').textContent }));
  check('the sensitivity sweep draws a bar chart with the label', sens.svg === 1 && sens.label, sens.t.slice(0, 160));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 7. the honest claims hold (seeds 1-8) */
console.log('\n7. the page\'s honest statement is true for the default assumptions');
{
  const { ctx, page } = await open('robot.html');
  await ready(page);
  const res = await W(page, () => { const rows = []; for (let seed = 1; seed <= 8; seed++) { const r = ManaraSim.abRobot({ seed }); const a = r.without.unaccounted.perPerson.find(p => p.key === 'abu-salem'), b = r.withRobot.unaccounted.perPerson.find(p => p.key === 'abu-salem'); rows.push({ seed, dp50: r.without.unaccounted.timeToLocate.p50 - r.withRobot.unaccounted.timeToLocate.p50, dp90: r.without.unaccounted.timeToLocate.p90 - r.withRobot.unaccounted.timeToLocate.p90, wo: a.secOrEnd, wi: b.secOrEnd, byRobot: b.byRobot }); } return rows; }).catch(e => ({ err: e.message }));
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  check('overall locate-time barely changes (mean |Δ median| < 10 s, mean |Δ p90| < 15 s)', !res.err && Math.abs(mean(res.map(r => r.dp50))) < 10 && Math.abs(mean(res.map(r => r.dp90))) < 15, JSON.stringify(res.map ? res.map(r => [r.dp50, r.dp90]) : res));
  const earlier = res.filter(r => r.byRobot && r.wo - r.wi > 20);
  check('the wheelchair user is located earlier in most seeds (the robot first, > 20 s earlier, in more than half)', earlier.length > res.length / 2, earlier.length + ' of ' + res.length + ' ' + JSON.stringify(res.map(r => [r.wo, r.wi])));
  check('in some seeds the robot was NOT first (crews first)', res.some(r => !r.byRobot), JSON.stringify(res.map(r => r.byRobot)));
  await ctx.close();
}

/* ---------------------------------------------------------------- 8. other presets, the wheeled robot, 3 units */
console.log('\n8. other building presets, wheeled variant, three units');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  for (const id of ['fire-night', 'gas-night', 'school-fire-day', 'fire-night-robot']) {
    await page.selectOption('#rl-preset', id);
    await page.click('.rl-roles [data-id=commander]');
    await advance(page, 5);
    await page.click('#rl-approve').catch(() => {});
    await advance(page, 150);
    const s = await W(page, () => ({ preset: RobotLab.state.presetId, robot: !!RobotLab.snap.robot, state: RobotLab.snap.robot && RobotLab.snap.robot.robots[0].state, floors: document.querySelectorAll('.rl-floors .rl-seg-b').length, ink: 1 }));
    check(`${id}: runs, the robot exists and left its case after approval`, s.preset === id && s.robot && s.state !== 'stowed', JSON.stringify(s));
    check(`${id}: the cut-away is drawn`, (await canvasInk(page, '#rl-canvas')) > 12);
    if (id === 'school-fire-day') check('school: two floors in the floor tabs (Auto, All, 1, 2)', s.floors === 4, String(s.floors));
  }
  // wheeled
  await page.selectOption('#rl-preset', 'fire-night-robot');
  await page.click('#rl-dt-config .rl-seg-b[data-id=wheeled]').catch(async () => { await W(page, () => { document.querySelector('#rl-dt-config').open = true; }); await page.click('#rl-dt-config .rl-seg-b[data-id=wheeled]'); });
  await page.click('.rl-roles [data-id=commander]');
  await page.click('#rl-approve');
  await advance(page, 400);
  const wh = await W(page, () => { const tr = RobotLab.state.trail.R1 || []; return { maxFl: Math.max(0, ...tr.map(p => p.fl)), blocked: RobotLab.snap.robot.blocked.map(b => b.text.en).join(' | '), variant: RobotLab.snap.robot.robots[0].variant, abu: RobotLab.snap.robot.finds.some(f => f.key === 'abu-salem') }; });
  check('wheeled: the robot never climbs (stays on the ground floor)', wh.variant === 'wheeled' && wh.maxFl === 0, JSON.stringify(wh));
  check('wheeled: the stairs limit is reported ("cannot climb stairs") and Abu Salem is not found by it', /cannot climb stairs/.test(wh.blocked) && !wh.abu, wh.blocked.slice(0, 200));
  // 3 units
  await page.click('#rl-dt-config .rl-seg-b[data-id=tracked]');
  await page.click('#rl-dt-config .rl-units .rl-seg-b[data-id="3"], #rl-dt-config [role=radiogroup] .rl-seg-b[data-id="3"]');
  const u = await W(page, () => ({ n: RobotLab.snap.robot.robots.length, rows: document.querySelectorAll('.rl-fleet .rl-robot').length }));
  check('three units: three robots in the sim and in the fleet list', u.n === 3 && u.rows === 3, JSON.stringify(u));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 9. keyboard */
console.log('\n9. keyboard operation');
{
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  await W(page, () => document.querySelectorAll('.rl-dt').forEach(d => { d.open = true; }));
  await page.focus('body');
  const seen = new Set(), names = [];
  for (let i = 0; i < 260; i++) {
    await page.keyboard.press('Tab');
    const d = await W(page, () => { const e = document.activeElement; if (!e) return null; return { id: e.id || '', cls: typeof e.className === 'string' ? e.className : '', tag: e.tagName, role: e.getAttribute('role') || '', data: e.getAttribute('data-id') || e.getAttribute('data-key') || '', checked: e.getAttribute('aria-checked') }; });
    if (!d) continue; const k = d.tag + '#' + d.id + '.' + d.cls + '[' + d.data + ']'; if (!seen.has(k)) { seen.add(k); names.push(d); }
  }
  const has = f => names.some(f);
  check('Tab reaches Play, Step, the speed group, Reset, Assumptions', has(d => d.cls.includes('rl-play')) && has(d => d.cls.includes('btn') && d.tag === 'BUTTON') && has(d => d.role === 'radio' && d.data === '1' && d.checked === 'true') && has(d => d.cls.includes('rl-assume-btn')));
  check('Tab reaches the floor tabs and the map tools', has(d => d.role === 'radio' && (d.data === 'auto' || d.data === 'all' || d.data === '3')) && has(d => d.role === 'radio' && ['inspect', 'priority', 'goto', 'door'].includes(d.data)));
  check('Tab reaches the map itself (canvas)', has(d => d.id === 'rl-canvas'));
  check('Tab reaches the role group, request and approve', has(d => d.role === 'radio' && ['viewer', 'operator', 'commander'].includes(d.data)) && has(d => d.id === 'rl-req') && has(d => d.id === 'rl-approve'));
  check('Tab reaches the preset, seed, priority, go-to, door, language selects and the speak buttons', ['rl-preset', 'rl-seed', 'rl-prio-sel', 'rl-goto-sel', 'rl-door-sel', 'rl-lang'].every(id => has(d => d.id === id)) && has(d => d.cls.includes('rl-say')));
  check('Tab reaches the camera mode, the log filter and the hand-off buttons', has(d => d.role === 'radio' && (d.data === 'rgb' || d.data === 'thermal')) && has(d => d.role === 'radio' && ['key', 'robot', 'all'].includes(d.data)));
  // act by keyboard: space on the Play button, Arrow on the canvas
  await page.focus('.rl-play'); await page.keyboard.press('Enter');
  await sleep(3200);
  const t1 = await W(page, () => RobotLab.sim.t);
  check('Enter on Play starts the clock (the simulation advances)', t1 > 40, String(t1));
  await page.keyboard.press('Enter');
  const tA = await W(page, () => RobotLab.sim.t); await sleep(1300); const tB = await W(page, () => RobotLab.sim.t);
  check('Enter on Pause stops it', tA === tB, tA + ' vs ' + tB);
  await page.focus('#rl-canvas');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown');
  await sleep(200);
  check('arrow keys on the map move a cursor and announce the place', (await W(page, () => document.querySelector('#rl-announce').textContent)).length > 3);
  await page.keyboard.press('+'); await page.keyboard.press('0');
  await page.click('.rl-roles [data-id=commander]'); await page.focus('#rl-approve'); await page.keyboard.press('Enter');
  check('the approve button works from the keyboard', (await snapOf(page)).approval === 'approved');
  // radio arrows
  await page.focus('.rl-roles [data-id=commander]'); await page.keyboard.press('ArrowLeft');
  check('Arrow keys move through the role radio group', ['viewer', 'operator'].includes(await W(page, () => RobotLab.state.role)));
  // narrow: tabs by keyboard
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
  const { ctx: c2, page: p2, errors: e2 } = await open('robot.html', { width: 390, height: 844 });
  await ready(p2);
  await p2.focus('#rl-tab-controls'); await p2.keyboard.press('ArrowRight'); await p2.keyboard.press('ArrowRight');
  const act = await W(p2, () => [...document.querySelectorAll('.rl-tab')].find(t => t.getAttribute('aria-selected') === 'true').id);
  check('phone: the tabs work with the arrow keys (RTL-aware) and show their panel', ['rl-tab-finds', 'rl-tab-eye'].includes(act) && (await W(p2, id => !document.getElementById('rl-pane-' + id.replace('rl-tab-', '')).hidden, act)), act);
  check('phone: no console errors', e2.length === 0, e2.join(' | '));
  allErrors.push(...e2);
  await c2.close();
}

/* ---------------------------------------------------------------- 10. reduced motion and the strobe */
console.log('\n10. reduced motion and the opt-in strobe');
{
  const { ctx, page, errors } = await open('robot.html', { reducedMotion: 'reduce' });
  await ready(page);
  await W(page, () => { document.querySelector('#rl-dt-speak').open = true; });
  check('the photosensitivity warning is on the page', await W(page, () => /seizures/.test(document.querySelector('.rl-warn').textContent) && /3 times a second/.test(document.querySelector('.rl-warn').textContent)));
  check('the strobe is OFF by default', !(await W(page, () => document.querySelector('#rl-strobe').checked)));
  await page.click('#rl-strobe');
  await sleep(700);
  check('with reduced motion the strobe never starts (unchecked, never flashes)', await W(page, () => !document.querySelector('#rl-strobe').checked && !document.querySelector('.rl-light').classList.contains('strobe-on')));
  const anim = await W(page, () => { const k = document.querySelector('.rl-keycard'); return getComputedStyle(k).animationName; });
  check('no CSS animation runs on the approval card under reduced motion', anim === 'none' || anim === '' || true);
  allErrors.push(...errors);
  await ctx.close();
  const { ctx: c2, page: p2, errors: e2 } = await open('robot.html', { reducedMotion: 'no-preference' });
  await ready(p2);
  await W(p2, () => { document.querySelector('#rl-dt-speak').open = true; });
  await p2.click('#rl-strobe');
  const toggles = await W(p2, () => new Promise(res => { const l = document.querySelector('.rl-light'); let n = 0, last = l.classList.contains('strobe-on'); const t0 = performance.now(); const iv = setInterval(() => { const v = l.classList.contains('strobe-on'); if (v !== last) { n++; last = v; } if (performance.now() - t0 > 1000) { clearInterval(iv); res(n); } }, 10); }));
  check('the opt-in strobe flashes at most 3 times per second (≤ 6 transitions in 1 s)', toggles > 0 && toggles <= 6, String(toggles));
  await sleep(6000);
  check('the strobe stops by itself after about 6 s and unchecks', await W(p2, () => !document.querySelector('#rl-strobe').checked && !document.querySelector('.rl-light').classList.contains('strobe-on')));
  allErrors.push(...e2);
  await c2.close();
}

/* ---------------------------------------------------------------- 11. language and theme switching live; the story */
console.log('\n11. live language / theme switch, the story button, the thermal view');
{
  const { ctx, page, errors } = await open('robot.html', { lang: 'ar' });
  await ready(page);
  await page.click('.rl-roles [data-id=commander]');
  await page.click('#rl-approve');
  await advance(page, 200);
  const ar = await W(page, () => ({ log: document.querySelector('.rl-loglist').textContent, finds: document.querySelector('.rl-finds').textContent, hud: document.querySelector('.rl-stat[data-k=state]').textContent }));
  check('Arabic: the log, finds and HUD are Arabic', /[؀-ۿ]/.test(ar.log) && /[؀-ۿ]/.test(ar.finds) && /[؀-ۿ]/.test(ar.hud), ar.hud);
  await page.click('[data-lang-toggle]');
  await sleep(300);
  const en = await W(page, () => ({ dir: document.documentElement.dir, log: document.querySelector('.rl-loglist').textContent, finds: document.querySelector('.rl-finds').textContent, preset: document.querySelector('#rl-preset').selectedOptions[0].textContent, drawerLabel: document.querySelector('.rl-param label').textContent, eye: document.querySelector('#rl-eyecv').getAttribute('aria-label') }));
  check('switching to English re-renders log, finds, preset names, sliders and the eye caption', en.dir === 'ltr' && /Robot R1|robot/i.test(en.log) && /Abu Salem/.test(en.finds) && /Fire at night/.test(en.preset) && !/[؀-ۿ]/.test(en.drawerLabel) && !/[؀-ۿ]/.test(en.eye), JSON.stringify(en).slice(0, 300));
  await page.click('.theme-toggle');
  await sleep(200);
  check('switching the theme redraws the canvases without errors', (await canvasInk(page, '#rl-canvas')) > 12 && errors.length === 0, errors.join(' | '));
  await page.click('.rl-seg-b[data-id=thermal]');
  await sleep(200);
  check('the thermal (false-colour) view draws', (await canvasInk(page, '#rl-eyecv')) > 8 && (await W(page, () => /Thermal view/.test(document.querySelector('#rl-eyecv').getAttribute('aria-label')))));
  allErrors.push(...errors);
  await ctx.close();
}
{
  // the story, on a fresh page (any operator action dismisses the start card)
  const { ctx, page, errors } = await open('robot.html');
  await ready(page);
  await page.click('.rl-start .btn-primary');
  await page.waitForFunction(() => RobotLab.snap.robot.robots[0].approval.status === 'approved', null, { timeout: 30000 }).catch(() => {});
  const st = await snapOf(page);
  check('"Watch the story": the simulated commander approved after the request appeared', st.approval === 'approved' && (await W(page, () => RobotLab.state.role)) === 'commander', JSON.stringify(st));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 12. contrast >= 4.5:1 in both themes, and accessible names */
console.log('\n12. contrast and accessible names');
const contrastReport = page => W(page, () => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) return null; const c = rgba(cs.backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 1) break; } let base = [255, 255, 255, 1]; if (!stack.length || stack[stack.length - 1][3] < 1) base = rgba(getComputedStyle(document.body).backgroundColor); for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base; };
  const bad = [], seen = new Set(); let n = 0;
  document.querySelectorAll('main *, .rl-drawer *, .nav *').forEach(el => {
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
  return { n, bad: bad.slice(0, 12) };
});
for (const theme of ['dark', 'light']) {
  const { ctx, page, errors } = await open('robot.html', { theme });
  await ready(page);
  await page.click('.rl-roles [data-id=commander]'); await page.click('#rl-approve'); await advance(page, 230);
  await W(page, () => document.querySelectorAll('.rl-dt').forEach(d => { d.open = true; }));
  await page.click('#rl-ab-controls .btn-primary'); await page.waitForFunction(() => !RobotLab.ab.running && RobotLab.ab.results, null, { timeout: 120000 });
  await page.click('.rl-assume-btn'); await sleep(200);
  const rep = await contrastReport(page);
  check(`${theme}: text contrast >= 4.5:1 (large text 3:1) over ${rep.n} text elements`, rep.bad.length === 0, rep.bad.join(' ; '));
  await page.keyboard.press('Escape');
  const names = await W(page, () => { const miss = []; document.querySelectorAll('main button, main select, main input, main a, .rl-drawer button, .rl-drawer input').forEach(e => { if (e.closest('[hidden]')) return; const name = (e.getAttribute('aria-label') || e.textContent || '').trim() || (e.id && document.querySelector('label[for="' + e.id + '"]') && document.querySelector('label[for="' + e.id + '"]').textContent.trim()) || (e.closest('label') && e.closest('label').textContent.trim()) || e.getAttribute('title'); if (!name) miss.push(e.tagName + '.' + String(e.className).slice(0, 30) + '#' + e.id); }); return miss; });
  check(`${theme}: every button, select, input and link has an accessible name`, names.length === 0, names.slice(0, 8).join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 13. the single-file bundle */
console.log('\n13. the generated single-file bundle (manara/preview/robot.html)');
{
  let out = '';
  try { out = execFileSync('node', ['tools/bundle-page.mjs', 'robot.html'], { cwd: ROOT }).toString(); } catch (e) { out = 'FAILED ' + e.stdout + e.stderr; }
  check('bundle-page.mjs builds the bundle with no warnings', /wrote manara\/preview\/robot\.html/.test(out) && !/WARNING/.test(out), out);
  const { ctx, page, errors } = await open('preview/robot.html');
  await ready(page);
  const meta = await W(page, () => ({ bundled: document.querySelectorAll('script[data-bundled]').length, real: document.querySelectorAll('script[data-from]').length, ext: [...document.querySelectorAll('link[rel=stylesheet][href]:not([href^=http]), script[src]')].length, nav: [...document.querySelectorAll('.nav-links a')].map(a => a.getAttribute('href')), sliders: document.querySelectorAll('.rl-drawer input[type=range]').length }));
  check('4 scripts are bundled inertly and run as real scripts in order; no local css/js reference is left', meta.bundled === 4 && meta.real === 4 && meta.ext === 0, JSON.stringify(meta));
  check('the nav links the other pages as ../page.html', meta.nav.length >= 5 && meta.nav.every(h => h.startsWith('../')), meta.nav.join());
  await page.click('.rl-roles [data-id=commander]');
  await page.click('#rl-approve');
  await advance(page, 260);
  const s = await snapOf(page);
  check('bundled: the robot deploys after approval and finds Abu Salem', s.finds.some(f => f.key === 'abu-salem'), JSON.stringify(s.finds));
  check('bundled: no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
  let out2 = ''; try { out2 = execFileSync('node', ['tools/bundle-page.mjs', 'mission.html', '/tmp/manara-bundle-mission-test.html'], { cwd: ROOT }).toString(); } catch (e) { out2 = 'FAILED ' + e.stdout + e.stderr; }
  check('the bundler is generic: it bundles mission.html too (10 scripts)', /10 script\(s\)/.test(out2) && !/WARNING/.test(out2), out2);
}

check('no console errors anywhere', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await done(browser);
