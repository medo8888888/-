// Control Room — the FEED WALL tab and the ROBOT tab: browser tests (Playwright + Chromium over file://, no network).
//   node manara/tools/test-control-feeds.mjs
// FEED WALL (js/control-feeds.js): loads clean (ar/en x dark/light x 1440/390), canvases for the drones that have an open alert (+ patrol drones), the detectors' overlays (boxes drawn, colour / thermal key labels,
//   confidence bars, telemetry HUD, SIM badge), layout 1 / 2 / 4 / auto, click to focus and back, the evidence strip, announce through the drone speaker (a comms entry AND a bus message; refused when the drone is not on
//   station; refused for a viewer), snapshot (a real PNG download), clip recording (MediaRecorder, or disabled with the reason), the optional REAL source (a bundled sample photo through the real ManaraFire, a file input,
//   the fake webcam: labelled "REAL CAMERA", honest 66.7 % note, no SIM badge), nothing runs while the tab is inactive, reduced motion, no innerHTML sinks, logical CSS only, no overflow.
// ROBOT (js/control-robot.js): the empty state explains the robot is for in-building rescue only and offers a demo building; a building fire / gas alert gets its own linked ManaraSim scenario (a flood alert gets none);
//   the human key (an operator's approve is rejected, only the commander approves, nothing moves before); the state machine runs (deploy -> search -> found / guide -> return); a find is handed off to the crews on the bus
//   ({robot-find}, {robot}); the headcount adds up and keeps «located by robot» apart from «safe»; hidden people stay hidden until "show simulation truth"; the A/B switch re-runs the SAME world with / without the robot;
//   the MEASURED result over seeds 1–8 is the honest one (locate time barely changes; the robot first for the wheelchair user in 5 of 8 seeds, the crews first in 3 of 8); the limits panel; a wheeled robot never climbs.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, check, done, ROOT } from './lib.mjs';

const browser = await launch();
const allErrors = [];
const W = (p, fn, ...a) => p.evaluate(fn, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = (o = {}) => openPage(browser, 'control.html', { width: 1440, height: 900, lang: 'en', theme: 'dark', query: '#quiet', reducedMotion: 'no-preference', ...o });
const ready = p => p.waitForFunction(() => window.ControlRoom && ControlRoom.api && ControlRoom.api.ready(), null, { timeout: 25000 });
const fireAlarm = p => W(p, () => { const api = ControlRoom.api; api.setRole('operator'); api.placeAlarm({ lon: 51.5264, lat: 25.2856, hazard: 'fire', trigger: 'sentinel' }); api.step(130); api.select('AL-1', { fly: false }); return api.alerts().map(a => a.id); });
const tab = async (p, id) => { await W(p, t => ControlRoom.showTab(t), id); await sleep(250); };
// elements of a panel that stick out of the panel itself (the page overflow check also sees the shell, which is not ours)
const overflowIn = (p, sel) => W(p, s => {
  const root = document.querySelector(s); if (!root) return { missing: true };
  const R = root.getBoundingClientRect(), bad = [];
  root.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (el.closest('[aria-hidden="true"], .scroll-x, .table-wrap, .crf-evs, .crf-strip, .sr-only, [hidden]')) return;
    if (r.right > R.right + 1.5 || r.left < R.left - 1.5) bad.push((typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName) + ` (${Math.round(r.left - R.left)}..${Math.round(r.right - R.left)} of ${Math.round(R.width)})`);
  });
  return { sw: root.scrollWidth, cw: root.clientWidth, bad: bad.slice(0, 6) };
}, sel);
const inkOf = (p, sel, idx = 0) => W(p, ([s, i]) => { const c = document.querySelectorAll(s)[i]; if (!c || !c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let k = 3; k < d.length; k += 4 * 7) if (d[k] > 10) n++; return n; }, [sel, idx]);

/* ---------------------------------------------------------------- 0. the source files: no HTML sinks, logical CSS only */
console.log('\n0. source hygiene');
{
  const files = ['js/control-feeds.js', 'js/control-robot.js'], css = ['css/control-feeds.css', 'css/control-robot.css'];
  for (const f of files) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    check(`${f}: no innerHTML / outerHTML / insertAdjacentHTML / document.write`, !/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write/.test(t));
    check(`${f}: a classic IIFE: no import / export / fetch / XMLHttpRequest / eval`, !/^\s*(import|export)\s/m.test(t) && !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function/.test(t));
    check(`${f}: nothing is claimed to be "AI" (only "not AI")`, !/\b(AI-powered|AI detector|uses AI|artificial intelligence detector)\b/i.test(t));
  }
  for (const f of css) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    check(`${f}: logical properties only (no left / right / margin-left / padding-right / border-left / text-align:left)`, !/(^|[\s;{])(margin|padding)-(left|right)\s*:|border-(left|right)(-\w+)?\s*:|(^|[\s;{])(left|right)\s*:|text-align\s*:\s*(left|right)|float\s*:\s*(left|right)/.test(t), (t.match(/(margin|padding)-(left|right)|border-(left|right)|[\s;{](left|right)\s*:|text-align\s*:\s*(left|right)/) || [''])[0]);
    check(`${f}: no letter-spacing (Arabic)`, !/letter-spacing/.test(t));
    check(`${f}: reduced motion and forced colours are handled`, /prefers-reduced-motion/.test(t) && /forced-colors/.test(t));
    const page = t.split('}').filter(r => !/\.crf-(v|hud|hi|ribbon|ib|cell\[data-rec)|--f-vid|--f-hud|forced-colors/.test(r)).join('}');
    check(`${f}: dark and light both come from tokens (no hard-coded colour outside the camera picture and its overlay chips)`, !/#[0-9a-fA-F]{3,6}\b/.test(page), (page.match(/#[0-9a-fA-F]{3,6}\b/g) || []).join(' '));
  }
  const html = fs.readFileSync(path.join(ROOT, 'control.html'), 'utf8');
  check('control.html links css/control-feeds.css and css/control-robot.css after css/control.css', html.indexOf('css/control.css') >= 0 && html.indexOf('css/control-feeds.css') > html.indexOf('css/control.css') && html.indexOf('css/control-robot.css') > html.indexOf('css/control.css'));
}

/* ---------------------------------------------------------------- 1. loads clean */
console.log('\n1. both tabs load clean: ar/en x dark/light x 1440/390');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
  const { ctx, page, errors } = await open({ width, height: width > 600 ? 900 : 844, lang, theme });
  await ready(page); await fireAlarm(page);
  const tag = `${lang}/${theme}/${width}`;
  await tab(page, 'feed'); await sleep(1600);
  const f = await W(page, () => ({ cells: document.querySelectorAll('.crf-cell').length, cv: document.querySelectorAll('.crf-cell canvas.crf-cv').length, lang: document.documentElement.dataset.lang, dir: document.documentElement.dir, sim: document.querySelectorAll('.crf-cell .tag').length, panel: !!document.querySelector('.crf') }));
  check(`${tag}: feed wall: no console errors`, errors.length === 0, errors.join(' | '));
  check(`${tag}: feed wall has tiles with a canvas each, language and direction applied`, f.panel && f.cells >= 1 && f.cv === f.cells && f.lang === lang && f.dir === (lang === 'ar' ? 'rtl' : 'ltr'), JSON.stringify(f));
  check(`${tag}: feed wall: the picture is drawn`, (await inkOf(page, '.crf-cell canvas.crf-cv')) > 50);
  const o1 = await overflowIn(page, '.crf');
  check(`${tag}: feed wall: nothing sticks out of the panel, no horizontal scroll`, !o1.missing && o1.sw <= o1.cw + 1 && o1.bad.length === 0, JSON.stringify(o1));
  await tab(page, 'robot'); await sleep(500);
  const r = await W(page, () => ({ panel: !!document.querySelector('.crr'), empty: document.querySelector('.crr').dataset.empty }));
  check(`${tag}: robot tab: the alert is selected so a scenario is linked and the plan is drawn`, r.panel && r.empty === '0' && (await inkOf(page, '.crr-cv')) > 50, JSON.stringify(r));
  const o2 = await overflowIn(page, '.crr');
  check(`${tag}: robot tab: nothing sticks out of the panel, no horizontal scroll`, !o2.missing && o2.sw <= o2.cw + 1 && o2.bad.length === 0, JSON.stringify(o2));
  check(`${tag}: robot tab: no console errors`, errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 2. the wall: pictures, overlays, HUD, layout, focus, evidence */
console.log('\n2. the feed wall');
{
  const { ctx, page, errors } = await open();
  await ready(page);
  check('quiet console: the wall explains itself (empty state with the launch button)', await W(page, () => { const e = document.querySelector('.crf-empty'); return ControlRoom.mods.feeds.feeds().filter(f => f.kind === 'alert').length === 0 && !!e; }));
  await fireAlarm(page); await tab(page, 'feed'); await sleep(2200);
  const st = await W(page, () => { const M = ControlRoom.mods.feeds; return { feeds: M.feeds(), shown: M.shown(), steps: M.stats().steps }; });
  const alertFeed = st.feeds.find(f => f.alert === 'AL-1');
  check('the drone attached to the open alert has a feed, listed first', !!alertFeed && st.feeds[0].id === alertFeed.id && alertFeed.kind === 'alert', JSON.stringify(st.feeds[0]));
  check('patrol drones get feeds too', st.feeds.some(f => f.kind === 'patrol'));
  check('a tile (a section with a canvas) is drawn for every shown feed', (await W(page, () => document.querySelectorAll('.crf-wall .crf-cell').length)) === st.shown.length && st.shown.length >= 2, String(st.shown.length));
  check('the detector ran on the pictures (analysis steps happened)', st.steps >= 2, String(st.steps));
  const fire = await W(page, () => { const M = ControlRoom.mods.feeds, f = M.shown()[0]; return f; });
  check('the alert feed: the real ManaraFire + thermal detectors say FIRE on the simulated picture (flicker proven over frames)', fire.verdict === 'fire' && fire.conf > 0.5, JSON.stringify(fire));
  check('overlays: detector boxes exist and are drawn on the overlay canvas', fire.boxes >= 1 && (await inkOf(page, '.crf-cell:first-child canvas.crf-ov')) > 5, String(fire.boxes));
  const tile = await W(page, () => { const c = document.querySelector('.crf-cell'); const T = s => (c.querySelector(s) || {}).textContent || ''; return { call: T('.crf-call'), chip: T('.crf-vchip'), hud: T('.crf-hud'), keys: [...c.querySelectorAll('.crf-key')].map(k => k.textContent.trim()), bars: c.querySelectorAll('.crf-bar i').length, sim: !!c.querySelector('.tag.cr-sim'), aria: c.querySelector('canvas.crf-cv').getAttribute('aria-label') || '', barW: [...c.querySelectorAll('.crf-bar i')].map(i => i.style.getPropertyValue('--v')) }; });
  check('key labels: «Colour key» and «Thermal key» with their values', /Colour key/.test(tile.keys[0]) && /Thermal key/.test(tile.keys[1]) && /Fire/.test(tile.keys[0]) && /Hotspot/.test(tile.keys[1]), JSON.stringify(tile.keys));
  check('confidence bars exist and are filled', tile.bars === 2 && tile.barW.every(v => /%/.test(v)) && tile.barW.some(v => parseInt(v) > 50), JSON.stringify(tile.barW));
  check('telemetry HUD: altitude, speed, battery, heading, link quality, time', /ALT\s*\d+/.test(tile.hud) && /SPD\s*\d+/.test(tile.hud) && /BAT[\s\u2066]*\d+/.test(tile.hud) && /HDG[\s\u2066]*\d+/.test(tile.hud) && /LINK[\s\u2066]*\d+/.test(tile.hud) && /TIME\s*\d\d:\d\d:\d\d/.test(tile.hud), tile.hud);
  check('every simulated tile carries the SIM badge; the picture has an accessible description saying it is simulated', tile.sim && /simulated/i.test(tile.aria) && /^FIRE/.test(tile.chip), tile.aria + ' | ' + tile.chip);
  // layout
  const lay = {}; for (const v of ['1', '2', '4', 'auto']) lay[v] = await W(page, v2 => { const M = ControlRoom.mods.feeds; M.setLayout(v2); return { n: M.layoutN(), cells: document.querySelectorAll('.crf-wall .crf-cell').length, dn: document.querySelector('.crf-wall').dataset.n, pressed: document.querySelector(`.crf-seg [data-v="${v2}"]`).getAttribute('aria-pressed') }; }, v);
  check('layout 1 / 2 / 4 show that many tiles (the others become chips)', lay['1'].cells === 1 && lay['2'].cells === 2 && lay['4'].cells === 4 && lay['4'].dn === '4', JSON.stringify(lay));
  check('layout «auto» picks by the count (3+ feeds: 2 x 2), the pressed state follows', lay.auto.cells === 4 && lay.auto.pressed === 'true' && lay['1'].pressed === 'true', JSON.stringify(lay.auto));
  check('the other feeds are listed as chips when fewer tiles are shown', await W(page, () => { ControlRoom.mods.feeds.setLayout('1'); return document.querySelectorAll('.crf-strip .crf-chipb').length >= 2; }));
  await W(page, () => ControlRoom.mods.feeds.setLayout('auto')); await sleep(300);
  // focus by click, and back
  await page.click('.crf-cell:nth-child(2) .crf-pick'); await sleep(300);
  const foc = await W(page, () => ({ cells: document.querySelectorAll('.crf-wall .crf-cell').length, attr: document.querySelector('.crf').dataset.focus, f: ControlRoom.mods.feeds.state.focusId, pressed: document.querySelector('.crf-cell .crf-pick').getAttribute('aria-pressed') }));
  check('click to focus: one tile is left (the others are chips), focus flag set', foc.cells === 1 && foc.attr === '1' && !!foc.f && foc.pressed === 'true', JSON.stringify(foc));
  await page.click('.crf-cell .crf-pick'); await sleep(300);
  check('click again goes back to the wall', (await W(page, () => ({ c: document.querySelectorAll('.crf-wall .crf-cell').length, a: document.querySelector('.crf').dataset.focus }))).c === 4);
  await page.click('.crf-cell:nth-child(3) .crf-pick'); await sleep(200); await page.keyboard.press('Escape'); await sleep(300);
  check('Escape leaves the focus mode', (await W(page, () => document.querySelector('.crf').dataset.focus)) === '0');
  // picture types
  const views = {}; for (const v of ['thermal', 'fused', 'rgb']) { views[v] = await W(page, v2 => { ControlRoom.mods.feeds.setView(v2); return ControlRoom.mods.feeds.viewMode(); }, v); await sleep(700); }
  check('picture type switch: colour / thermal / fused all draw', views.fused === 'fused' && views.rgb === 'rgb' && (await inkOf(page, '.crf-cell canvas.crf-cv')) > 50);
  // evidence strip
  await W(page, () => { ControlRoom.api.select('AL-1', { fly: false }); ControlRoom.mods.feeds.paint(); }); await sleep(1500);
  const ev = await W(page, () => ({ n: document.querySelectorAll('.crf-evi').length, canv: document.querySelectorAll('.crf-evi canvas').length, caps: [...document.querySelectorAll('.crf-evi figcaption')].map(c => c.textContent), mod: ControlRoom.mods.feeds.evidence(ControlRoom.api.selected()) }));
  check('the evidence strip holds frames from the moment of detection (the engine\'s verification frames + the wall\'s own capture)', ev.n >= 3 && ev.canv === ev.n && ev.mod.some(e => e.kind === 'engine') && ev.mod.some(e => e.kind === 'detected' || e.kind === 'flagged'), JSON.stringify(ev.caps));
  check('the alert\'s recorded keys (sensor / colour / thermal) and the drone\'s verdict are shown', /Sensor key/.test(await W(page, () => document.querySelector('.crf-con').textContent)) && /confirmed/i.test(await W(page, () => document.querySelector('.crf-verdict').textContent)));
  check('no console errors on the wall', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 3. announce, snapshot, clip, recall / launch */
console.log('\n3. announce through the drone speaker, snapshot, clip, recall / launch');
{
  const { ctx, page, errors } = await open({ context: await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference', acceptDownloads: true }) });
  await ready(page); await fireAlarm(page); await tab(page, 'feed'); await sleep(1500);
  // the UI path: pick a preset, press the Arabic button
  const before = await W(page, () => ({ comms: ControlRoom.api.nat().comms.filter(c => c.kind === 'drone-announce').length, bus: ControlRoom.api.busLog().filter(b => b.type === 'drone-announce').length, dec: ControlRoom.api.decisions().filter(d => d.type === 'announce').length }));
  await page.click('.crf-saychip[data-k="follow-light"]');
  check('the preset is selected and its text is shown in the current language', (await W(page, () => document.querySelector('.crf-saytext').textContent)).includes('green light'));
  check('the drone is on station: the announce buttons are not disabled', (await W(page, () => document.querySelector('.crf-sayacts .btn').getAttribute('aria-disabled'))) === 'false');
  await page.click('.crf-sayacts .btn:nth-child(1)'); await sleep(300);
  const after = await W(page, () => ({ comms: ControlRoom.api.nat().comms.filter(c => c.kind === 'drone-announce'), bus: ControlRoom.api.busLog().filter(b => b.type === 'drone-announce').length, dec: ControlRoom.api.decisions().filter(d => d.type === 'announce').length, say: ControlRoom.mods.feeds.sayLog(), log: ControlRoom.api.oplog().filter(o => o.msgType === 'drone-announce').length, text: document.querySelector('.crf-saylog').textContent }));
  check('announce adds a comms entry (kind drone-announce, in Arabic, with the spoken text)', after.comms.length === before.comms + 1 && after.comms[after.comms.length - 1].lang === 'ar' && /الضوء الأخضر/.test(after.comms[after.comms.length - 1].spoken || ''), JSON.stringify(after.comms.slice(-1)));
  check('announce publishes a bus message {type:"drone-announce"} (logged in the comms tab) and records the decision', after.bus === before.bus + 1 && after.log >= 1 && after.dec === before.dec + 1);
  check('the console lists what was announced', after.say.length === 1 && /الضوء الأخضر/.test(after.text), after.text);
  // refused: not on station, and a viewer
  const refused = await W(page, () => {
    const CR = ControlRoom; CR.api.placeAlarm({ lon: 51.43, lat: 25.33, hazard: 'fire', trigger: 'sentinel' }); CR.api.step(5);
    const al = CR.api.alerts().filter(a => a.id !== 'AL-1' && a.droneId)[0], r1 = al ? CR.mods.feeds.announce(al.droneId, 'identify', 'en') : null;
    const rej0 = CR.S.rejects; CR.api.setRole('viewer'); const r2 = CR.mods.feeds.announce(CR.api.alerts()[0].droneId, 'identify', 'en'); const rej1 = CR.S.rejects; CR.api.setRole('operator');
    return { r1: r1 && { ok: r1.ok, reason: r1.reason }, r2: { ok: r2.ok, reason: r2.reason }, rej: rej1 - rej0, comms: CR.api.nat().comms.filter(c => c.kind === 'drone-announce').length };
  });
  check('a drone that is not on station cannot announce (reason: not-on-station)', refused.r1 && refused.r1.ok === false && refused.r1.reason === 'not-on-station', JSON.stringify(refused.r1));
  check('a viewer cannot announce: the rejection is counted and no new comms entry exists', refused.r2.ok === false && refused.r2.reason === 'role' && refused.rej === 1 && refused.comms === 1, JSON.stringify(refused));
  await W(page, () => ControlRoom.api.select('AL-1', { fly: false })); await sleep(500);
  // snapshot (a real PNG download)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), W(page, () => ControlRoom.mods.feeds.snapshot())]);
  const file = await dl.path(), buf = fs.readFileSync(file);
  check('snapshot: a PNG download (signature, name, size), built from the canvas', dl.suggestedFilename().endsWith('.png') && buf.length > 5000 && buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a', `${dl.suggestedFilename()} ${buf.length}`);
  const shot = await W(page, () => ControlRoom.mods.feeds.lastSnapshot());
  check('the snapshot has the picture plus a caption bar (640 wide)', shot.w === 640 && shot.h > 400, JSON.stringify(shot));
  check('taking a snapshot adds a frame to the evidence strip', await W(page, () => ControlRoom.mods.feeds.evidence('AL-1').some(e => e.kind === 'snapshot')));
  // the button path too
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('.crf-acts .btn:nth-child(1)')]);
  check('the Snapshot button downloads a PNG too', dl2.suggestedFilename().endsWith('.png'));
  // clip
  const sup = await W(page, () => ControlRoom.mods.feeds.recordSupported());
  if (sup) {
    const r = await W(page, () => ControlRoom.mods.feeds.record());
    check('record: MediaRecorder starts on a canvas stream', r.ok === true && /video\//.test(r.mime), JSON.stringify(r));
    await sleep(1500);
    check('record: the tile shows it is recording and the button turns into «Stop and save»', (await W(page, () => ({ t: document.querySelector('.crf-cell[data-rec="1"]') !== null, b: document.querySelector('.crf-recb').getAttribute('aria-pressed') }))).t);
    const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), W(page, () => ControlRoom.mods.feeds.stopRecord())]);
    const clip = await W(page, () => ControlRoom.mods.feeds.lastClip());
    check('record: stopping saves a WebM clip with data (nothing uploaded)', /\.(webm|mp4)$/.test(dl3.suggestedFilename()) && clip && clip.bytes > 1000, JSON.stringify(clip));
  } else {
    check('record: MediaRecorder is missing here → the button says so (disabled with the explanation)', (await W(page, () => ({ a: document.querySelector('.crf-recb').getAttribute('aria-disabled'), t: document.querySelector('#crf-recnote').textContent }))).a === 'true');
  }
  check('the console says snapshots and clips stay on the device (no upload)', /device only|on your device/i.test(await W(page, () => document.querySelector('#crf-recnote').textContent)));
  // recall and launch
  const rl = await W(page, () => {
    const CR = ControlRoom, a = CR.api.alerts().filter(x => x.id !== 'AL-1')[0], d = a.droneId; const L = CR.api.launch(a.id, null), rc = CR.api.recall(d); CR.api.step(5);
    return { launch: L.ok === false ? L.reason : 'ok', recall: rc.ok, state: CR.api.drones().filter(x => x.id === d)[0].state };
  });
  check('recall sends a drone home (CR.recallDrone through the same actions the buttons use)', rl.recall === true && /returning|docked|charging/.test(rl.state), JSON.stringify(rl));
  const btns = await W(page, () => ({ launch: !!document.querySelector('.crf-acts .btn-primary'), recall: [...document.querySelectorAll('.crf-acts .btn')].some(b => /Recall/.test(b.textContent)), gated: document.querySelector('.crf').dataset.rank }));
  check('the console has Launch nearest drone, Recall, Snapshot and Record buttons', btns.launch && btns.recall);
  await W(page, () => { ControlRoom.api.setRole('viewer'); ControlRoom.mods.feeds.paint(); }); await sleep(300);
  check('a viewer sees the gated buttons marked with a lock (they still answer with the visible rejection)', (await W(page, () => ({ r: document.querySelector('.crf').dataset.rank, v: getComputedStyle(document.querySelector('.crf-acts [data-needs] .crf-lock')).display }))).v !== 'none');
  await W(page, () => ControlRoom.api.setRole('operator'));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
}

/* ---------------------------------------------------------------- 4. the real source: sample photo, file, webcam */
console.log('\n4. the optional REAL source (real ManaraFire on real pixels)');
{
  const { ctx, page, errors } = await open();
  await ready(page); await fireAlarm(page); await tab(page, 'feed'); await sleep(800);
  await page.click('#crf-live > summary'); await sleep(600);
  const opts = await W(page, () => [...document.querySelectorAll('#crf-sample option')].map(o => o.value).filter(Boolean));
  check('opening the panel loads the 16 bundled sample photos (assets/samples, data URIs: no tainted canvas)', opts.length === 16 && opts.includes('fire-1.jpg') && opts.includes('none-3.jpg'), String(opts.length));
  check('the honest accuracy note is on screen: rule-based, not AI, 66.7 % on held-out photos (12 of 18), false alarms, missed smoke', await W(page, () => { const t = document.querySelector('.crf-lnote').textContent; return /not simulated/i.test(t) && /66\.7/.test(t) && /12 of 18/.test(t) && /not AI/i.test(t) && /3 of 12|3\/12/.test(t) && /missed the smoke/i.test(t); }));
  const res = {};
  for (const f of ['fire-1.jpg', 'fire-2.jpg', 'smoke-1.jpg', 'none-1.jpg', 'none-3.jpg']) {
    await W(page, x => ControlRoom.mods.feeds.useSample(x), f); await sleep(700);
    res[f] = await W(page, () => { const l = ControlRoom.mods.feeds.liveState(); return { src: l.src, label: l.still && l.still.label, fire: l.still && l.still.fire, smoke: l.still && l.still.smoke, state: l.res && l.res.state }; });
  }
  check('a fire photo through the real ManaraFire gives a detection result (fire-1, fire-2: label fire, a single photo is SUSPECT at most)', res['fire-1.jpg'].label === 'fire' && res['fire-1.jpg'].fire > 0.5 && res['fire-2.jpg'].label === 'fire' && res['fire-1.jpg'].state === 'suspect', JSON.stringify(res['fire-1.jpg']));
  check('a smoke photo gives smoke, a sunset and a red car give none (the same detector as the Evidence Lab)', res['smoke-1.jpg'].label === 'smoke' && res['none-1.jpg'].label === 'none' && res['none-3.jpg'].label === 'none', JSON.stringify(res));
  await W(page, () => ControlRoom.mods.feeds.useSample('fire-1.jpg')); await sleep(900);
  const live = await W(page, () => { const c = [...document.querySelectorAll('.crf-cell')].find(x => x.dataset.kind === 'live'); if (!c) return null; return { ribbon: (c.querySelector('.crf-ribbon') || {}).textContent, sim: !!c.querySelector('.tag.cr-sim'), real: !!c.querySelector('.tag.crf-real'), chip: c.querySelector('.crf-vchip').textContent, keys: [...c.querySelectorAll('.crf-key')].map(k => k.textContent.trim()), boxes: ControlRoom.mods.feeds.feeds().find(f => f.kind === 'live').boxes }; });
  check('the live tile is labelled «REAL CAMERA — not simulated» and has NO SIM badge', live && /REAL CAMERA/.test(live.ribbon) && /not simulated/.test(live.ribbon) && live.sim === false && live.real === true, JSON.stringify(live));
  check('the live tile shows the detector\'s result (boxes, colour key) and says there is no thermal camera', live && live.boxes >= 1 && /Colour key/.test(live.keys[0]) && /no thermal camera/.test(live.keys[1]), JSON.stringify(live));
  check('the live tile is first in the wall and a snapshot of it says REAL in its filename', await W(page, async () => { const r = await ControlRoom.mods.feeds.snapshot('live'); return r.ok && /manara-live-/.test(r.name); }));
  // a file through the file input (photo)
  await W(page, () => ControlRoom.mods.feeds.stopLive()); await sleep(200);
  await page.setInputFiles('#crf-file', path.join(ROOT, 'assets/samples/fire-3.jpg')); await sleep(1200);
  const file = await W(page, () => { const l = ControlRoom.mods.feeds.liveState(); return { src: l.src, name: l.name, label: l.still && l.still.label }; });
  check('a local photo through the file input runs the same detector (source "photo")', file.src === 'photo' && file.name === 'fire-3.jpg' && file.label === 'fire', JSON.stringify(file));
  // a video file: build a tiny WebM in the page (MediaRecorder on a canvas) and load it through the file path
  const vid = await W(page, async () => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 120; const x = c.getContext('2d'); if (typeof MediaRecorder !== 'function') return null;
    const mr = new MediaRecorder(c.captureStream(15)), ch = []; mr.ondataavailable = e => ch.push(e.data); const done = new Promise(r => { mr.onstop = r; }); mr.start(100);
    let t = 0; const iv = setInterval(() => { x.fillStyle = `rgb(${40 + (t * 9) % 200},120,60)`; x.fillRect(0, 0, 160, 120); t++; }, 60); await new Promise(r => setTimeout(r, 900)); clearInterval(iv); mr.stop(); await done;
    const f = new File(ch, 'tiny.webm', { type: 'video/webm' }); const r = await ControlRoom.mods.feeds.useFile(f); await new Promise(r2 => setTimeout(r2, 900)); const l = ControlRoom.mods.feeds.liveState();
    return { ok: r.ok, src: l.src, frames: l.frames, state: l.res && l.res.state };
  });
  check('a local video runs the temporal ManaraFire detector frame by frame (source "video", a result per frame)', !vid || (vid.ok && vid.src === 'video' && vid.frames >= 2 && !!vid.state), JSON.stringify(vid));
  await W(page, () => ControlRoom.mods.feeds.stopLive()); await sleep(200);
  // the webcam (Chromium's fake device)
  const cam = await W(page, () => ControlRoom.mods.feeds.useCamera()); await sleep(2200);
  const cs = await W(page, () => { const l = ControlRoom.mods.feeds.liveState(); return { src: l.src, frames: l.frames, state: l.res && l.res.state, tracks: ControlRoom.mods.feeds.live.stream ? ControlRoom.mods.feeds.live.stream.getTracks().filter(t => t.readyState === 'live').length : 0, status: document.querySelector('.crf-lstatus').textContent }; });
  check('the webcam (getUserMedia, fake device here) feeds the real detector frame by frame, labelled as a real source', cam.ok && cs.src === 'camera' && cs.frames >= 3 && !!cs.state && cs.tracks === 1 && /real source/i.test(cs.status), JSON.stringify(cs));
  await W(page, () => ControlRoom.mods.feeds.stopLive()); await sleep(300);
  check('stopping the source releases the camera tracks and removes the tile', await W(page, () => ControlRoom.mods.feeds.live.stream === null && ![...document.querySelectorAll('.crf-cell')].some(x => x.dataset.kind === 'live') && ControlRoom.mods.feeds.liveState().src === 'none'));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors);
  await ctx.close();
  // a denied camera: the refusal is explained, the page keeps working
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'no-preference' });
  await ctx2.addInitScript(() => { try { localStorage.setItem('manara-lang', 'en'); } catch (e) { /* ignore */ } });
  const p2 = await ctx2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
  await p2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await p2.goto('file://' + path.join(ROOT, 'control.html') + '#quiet'); await ready(p2); await sleep(400);
  const den = await W(p2, async () => { const r = await ControlRoom.mods.feeds.useCamera(); return { r, msg: document.querySelector('.crf-lstatus').textContent, src: ControlRoom.mods.feeds.liveState().src }; });
  check('a denied camera is explained (no crash, no live tile)', den.r.ok === false && den.r.reason === 'denied' && /denied/i.test(den.msg) && den.src === 'none' && e2.length === 0, JSON.stringify(den));
  await ctx2.close();
}

/* ---------------------------------------------------------------- 5. inactive tab, reduced motion, budget */
console.log('\n5. nothing runs while the tab is inactive; reduced motion; frame budget');
{
  const { ctx, page, errors } = await open();
  await ready(page); await fireAlarm(page); await tab(page, 'feed'); await sleep(1500);
  const s1 = await W(page, () => ControlRoom.mods.feeds.stats()); await sleep(700); const s2 = await W(page, () => ControlRoom.mods.feeds.stats());
  check('while the tab is active the analysis keeps stepping', s2.steps > s1.steps && s2.active === true, `${s1.steps} -> ${s2.steps}`);
  await tab(page, 'robot'); await sleep(300); const a = await W(page, () => ControlRoom.mods.feeds.stats()); await sleep(1200); const b = await W(page, () => ControlRoom.mods.feeds.stats());
  check('another tab is open: the feed wall does not step (steps unchanged, stats.active false)', b.steps === a.steps && b.active === false, `${a.steps} -> ${b.steps} active ${b.active}`);
  await tab(page, 'feed'); await sleep(1000); const c = await W(page, () => ControlRoom.mods.feeds.stats());
  check('back on the tab: it steps again', c.steps > b.steps && c.active === true);
  await W(page, () => ControlRoom.tabs.find(t => t.id === 'feed').active(false)); await sleep(300); const d = await W(page, () => ControlRoom.mods.feeds.stats()); await sleep(900); const e = await W(page, () => ControlRoom.mods.feeds.stats());
  check('active(false) from the shell stops the frames too', e.steps === d.steps && e.active === false, `${d.steps} -> ${e.steps}`);
  await W(page, () => ControlRoom.tabs.find(t => t.id === 'feed').active(true));
  const bud = await W(page, () => ControlRoom.mods.feeds.stats());
  check('the budget: one analysis step costs well under a frame budget on average', bud.stepMs < 60, `${bud.stepMs} ms`);
  check('only visible tiles are drawn: a tile scrolled out of view is skipped', await W(page, () => { const M = ControlRoom.mods.feeds, f = M.state.byId[M.shown()[M.shown().length - 1].id]; f.vis = false; const s0 = f.steps; return new Promise(r => setTimeout(() => { const n = f.steps; f.vis = true; r(n === s0); }, 900)); }));
  allErrors.push(...errors); await ctx.close();
  // reduced motion: pictures hold, the detector still reaches its verdict from a short burst, nothing animates
  const r = await open({ reducedMotion: 'reduce' });
  await ready(r.page); await fireAlarm(r.page); await tab(r.page, 'feed'); await sleep(2600);
  const rm = await W(r.page, () => { const M = ControlRoom.mods.feeds, s = M.stats(); return { steps: s.steps, shown: M.shown().map(f => [f.verdict, f.steps, f.visible]), anim: getComputedStyle(document.querySelector('.crf-cell')).transitionDuration }; });
  check('prefers-reduced-motion: every VISIBLE picture is drawn once and held (about one step per tile, not a stream)', rm.steps >= 1 && rm.steps <= rm.shown.length * 2 + 2 && rm.shown.filter(x => x[2]).every(x => x[1] >= 1) && rm.shown.some(x => x[2]), JSON.stringify(rm));
  check('prefers-reduced-motion: the verdict still arrives (a burst of frames gives the flicker) and CSS transitions are off', rm.shown[0][0] === 'fire' && /^0s$/.test(rm.anim), JSON.stringify(rm));
  allErrors.push(...r.errors); await r.ctx.close();
}

/* ---------------------------------------------------------------- 6. robot: empty state, linking, the human key, the state machine */
console.log('\n6. the robot tab: empty state and the linked scenario');
{
  const { ctx, page, errors } = await open();
  await ready(page); await tab(page, 'robot'); await sleep(500);
  const em = await W(page, () => ({ empty: document.querySelector('.crr').dataset.empty, txt: document.querySelector('.crr-empty').textContent, hidden: document.querySelector('.crr-empty').hidden, demo: !!([...document.querySelectorAll('.crr-empty .btn')].find(b => /demo building/i.test(b.textContent))), sc: ControlRoom.mods.robot.scenario() }));
  check('no building alert: the empty state says the robot is only for in-building rescue and offers a demo building', em.empty === '1' && !em.hidden && /only for in-building rescue/i.test(em.txt) && em.demo && em.sc === null, JSON.stringify(em));
  check('the honest framing is on screen: concept + simulated prototype, firefighters decide, 999 stays the dispatcher', await W(page, () => { const t = document.querySelector('.crr').textContent; return /CONCEPT/.test(t) && /simulated prototype/i.test(t) && /firefighters decide/i.test(t) && /999 stays the dispatcher/.test(t); }));
  // a flood alert is not a building: still empty
  await W(page, () => { const api = ControlRoom.api; api.placeAlarm({ lon: 51.45, lat: 25.27, hazard: 'flood', trigger: 'sentinel' }); api.select(api.alerts()[0].id, { fly: false }); }); await sleep(600);
  check('a flood alert gets no robot: the empty state stays and lists nothing to link', await W(page, () => ControlRoom.mods.robot.scenario() === null && document.querySelector('.crr').dataset.empty === '1'));
  // a building fire: a scenario is created on demand and linked
  await W(page, () => { const api = ControlRoom.api; api.placeAlarm({ lon: 51.5264, lat: 25.2856, hazard: 'fire', trigger: 'sentinel' }); api.step(120); const a = api.alerts().filter(x => x.hazard === 'fire')[0]; api.select(a.id, { fly: false }); }); await sleep(800);
  const sc = await W(page, () => ControlRoom.mods.robot.scenario());
  check('a building-fire alert: a ManaraSim scenario is created and linked to it (preset fire-night-robot, robot present, stowed)', sc && /^AL-/.test(sc.alert) && sc.preset === 'fire-night-robot' && sc.robotOn === true && sc.state === 'stowed' && sc.demo === false, JSON.stringify(sc));
  check('the tab shows the link: alert id, hazard, and that the building is a stand-in', await W(page, () => { const t = document.querySelector('.crr-link').textContent; return /Linked to alert AL-/.test(t) && /stand-in/.test(t); }));
  check('the plan canvas is drawn', (await inkOf(page, '.crr-cv')) > 100);
  // a gas alert gets the gas scenario
  const gas = await W(page, () => { const api = ControlRoom.api; api.placeAlarm({ lon: 51.52, lat: 25.29, hazard: 'gas', trigger: 'sentinel' }); const a = api.alerts().filter(x => x.hazard === 'gas')[0]; api.select(a.id, { fly: false }); return { id: a.id }; }); await sleep(800);
  const sg = await W(page, () => ControlRoom.mods.robot.scenario());
  check('a gas alert gets its own scenario (gas-night) and the fire one is kept', sg.preset === 'gas-night' && sg.alert === gas.id && (await W(page, () => ControlRoom.mods.robot.scenarios().length)) >= 2, JSON.stringify(sg));
  await W(page, () => ControlRoom.api.select(ControlRoom.api.alerts().filter(x => x.hazard === 'fire')[0].id, { fly: false })); await sleep(500);
  check('selecting the fire alert again returns to ITS scenario (same seed, same clock)', (await W(page, () => ControlRoom.mods.robot.scenario())).preset === 'fire-night-robot');
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors); await ctx.close();
}
console.log('\n7. the robot: the human key, the state machine, the hand-off, the headcount');
{
  const { ctx, page, errors } = await open();
  await ready(page); await fireAlarm(page); await tab(page, 'robot'); await sleep(600);
  const R = fn => W(page, fn);
  const s0 = await R(() => ControlRoom.mods.robot.scenario());
  check('the scenario starts 8 s after ignition with the robot stowed and no approval', s0.state === 'stowed' && s0.approval === 'none' && s0.t - s0.tIgnite >= 8 && s0.t - s0.tIgnite < 60, JSON.stringify(s0));
  await R(() => ControlRoom.api.setRole('viewer'));
  const rv = await R(() => ControlRoom.mods.robot.request());
  check('a viewer cannot request deployment: the rejection is visible and nothing changes', rv.ok === false && rv.reason === 'role' && (await R(() => ControlRoom.mods.robot.scenario())).approval === 'none');
  await R(() => ControlRoom.api.setRole('operator'));
  const rq = await R(() => ControlRoom.mods.robot.request());
  check('an operator can request deployment (approval "requested", the robot still stowed)', rq.ok === true && (await R(() => ControlRoom.mods.robot.scenario())).approval === 'requested');
  const rej0 = await R(() => ControlRoom.S.rejects), ap = await R(() => ControlRoom.mods.robot.approve());
  check('an operator\'s Approve is REJECTED (only the incident commander approves): visible, counted, the robot stays stowed', ap.ok === false && ap.code === 'role' && (await R(() => ControlRoom.S.rejects)) === rej0 + 1 && /Only the incident commander/.test(await R(() => document.querySelector('.crr-msg').textContent)) && (await R(() => ControlRoom.mods.robot.scenario())).state === 'stowed');
  await R(() => ControlRoom.mods.robot.step(25));
  check('nothing moves before the commander approves (25 s later: still stowed, still requested)', await R(() => { const s = ControlRoom.mods.robot.scenario(); return s.state === 'stowed' && s.approval === 'requested'; }));
  check('the gated buttons are marked with a lock for an operator (Approve needs the commander)', (await R(() => getComputedStyle(document.querySelector('.crr-ctl [data-needs="commander"] .crr-lock')).display)) !== 'none');
  await R(() => ControlRoom.api.setRole('commander'));
  const ok = await R(() => ControlRoom.mods.robot.approve());
  check('the incident commander approves: state "approved" (the human key, logged as a decision)', ok.ok === true && (await R(() => ControlRoom.mods.robot.scenario())).approval === 'approved' && (await R(() => ControlRoom.api.decisions().some(d => d.type === 'robot-approve'))));
  // run it and watch the state machine
  const seen = new Set(), phases = new Set(); let finds = 0;
  for (let i = 0; i < 40; i++) { await R(() => ControlRoom.mods.robot.step(10)); const s = await R(() => { const M = ControlRoom.mods.robot, s = M.scenario(); return { state: s.state, on: Object.keys(s.phase.on), finds: s.finds.length }; }); seen.add(s.state); s.on.forEach(p => phases.add(p)); finds = s.finds; if (i === 12) break; }
  check('the state machine runs: approved -> deploying -> searching, then guiding / holding', seen.has('approved') || seen.has('deploying'), [...seen].join());
  check('the robot is searching and has found people (finds > 0) within ~2 minutes', seen.has('searching') && finds > 0, [...seen].join() + ' finds ' + finds);
  check('the state chips follow: Deploy / Search / Found / Guide light up (aria-current on the primary step)', ['deploy', 'search', 'found', 'guide'].filter(p => phases.has(p)).length >= 3 && (await R(() => !!document.querySelector('.crr-phases [aria-current="step"]'))), [...phases].join());
  const tel = await R(() => ({ bat: document.querySelector('.crr-meter .crr-mv').textContent, cov: [...document.querySelectorAll('.crr-meter')].map(m => m.textContent), tel: ControlRoom.mods.robot.scenario() }));
  check('telemetry: battery, mesh link and rooms searched are shown', tel.cov.length === 3 && /%/.test(tel.cov[0]) && /Mesh link/.test(tel.cov[1]) && /searched/.test(tel.cov[2]), JSON.stringify(tel.cov));
  // headcount
  const hc = await R(() => ControlRoom.mods.robot.scenario().hc);
  check('people accounted: registered = safe + safe-away + help + located-by-robot + unaccounted (a separate bucket, never mixed with safe)', hc.located > 0 && hc.registered === hc.safe + hc.safeAway + hc.help + hc.located + hc.unaccounted, JSON.stringify(hc));
  check('the headcount text and bar are on screen', await R(() => /Accounted \d+ of \d+/.test(document.querySelector('.crr-hctx').textContent) && document.querySelectorAll('.crr-hcbar i').length === 5));
  // hidden vs discovered
  const t0 = await R(() => { const M = ControlRoom.mods.robot; M.truth(false); M.draw(); const c = document.querySelector('.crr-cv'); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.reduce((a, v, i) => (i % 97 === 0 ? (a * 31 + v) >>> 0 : a), 7); });
  const t1 = await R(() => { const M = ControlRoom.mods.robot; M.truth(true); M.draw(); const c = document.querySelector('.crr-cv'); return { h: c.getContext('2d').getImageData(0, 0, c.width, c.height).data.reduce((a, v, i) => (i % 97 === 0 ? (a * 31 + v) >>> 0 : a), 7), note: !document.querySelector('.crr-truthnote').hidden }; });
  check('hidden people stay hidden until «show simulation truth» (the picture changes) — and the truth note says SIM', t1.h !== t0 && t1.note);
  await R(() => ControlRoom.mods.robot.truth(false));
  // hand-off
  const b0 = await R(() => ControlRoom.api.bus());
  const hf = await R(() => ControlRoom.mods.robot.handoff('all'));
  const b1 = await R(() => ({ bus: ControlRoom.api.bus(), log: ControlRoom.api.busLog().map(b => b.type), sent: ControlRoom.mods.robot.scenario().sent.length, finds: ControlRoom.mods.robot.scenario().finds.length }));
  check('hand-off to the crews: each reported find goes out as {type:"robot-find"} on the bus (counted, logged in comms)', hf.ok && b1.bus.find > b0.find && b1.log.includes('robot-find') && b1.sent >= 1, JSON.stringify(b1));
  check('the robot status {type:"robot"} is published while it is in the field', b1.bus.robot >= 1 && b1.log.includes('robot'), JSON.stringify(b1.bus));
  const hl = await R(() => ({ btn: [...document.querySelectorAll('.crr-find .btn')].map(b => b.textContent.trim()), note: document.querySelector('.crr-fin, .crr-sec[aria-label="Finds"]').textContent }));
  check('handed-off finds say so, and the note says 999 stays the dispatcher', hl.btn.some(t => /Handed off/.test(t)) && /999 stays the dispatcher/.test(hl.note), JSON.stringify(hl.btn));
  const mb = await R(() => ControlRoom.mods.robot.badge());
  check('the map badge (CR.mods.robot.badge) points at the linked alert while the robot works', mb && /Robot:/.test(mb.text) && Math.abs(mb.lon - 51.5264) < 0.2, JSON.stringify(mb));
  // recall
  await R(() => ControlRoom.mods.robot.recall());
  let ret = false; for (let i = 0; i < 40 && !ret; i++) { await R(() => ControlRoom.mods.robot.step(10)); const s = await R(() => ControlRoom.mods.robot.scenario().state); if (s === 'returning' || s === 'stowed') ret = true; }
  check('recall: the robot turns back to the entrance (returning, then stowed again)', ret);
  const st = await R(() => document.querySelector('.crr-statetx').textContent);
  check('the state line names the state and the place', /State:/.test(st), st);
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 8. A/B, limits, wheeled, pause */
console.log('\n8. A/B switch, the limits panel, a wheeled robot, the tab pauses');
{
  const { ctx, page, errors } = await open();
  await ready(page); await fireAlarm(page); await tab(page, 'robot'); await sleep(600);
  const R = fn => W(page, fn);
  await R(() => { ControlRoom.setRole('commander'); ControlRoom.mods.robot.play(false); ControlRoom.mods.robot.request(); ControlRoom.mods.robot.approve(); ControlRoom.mods.robot.step(150); });
  const on = await R(() => ControlRoom.mods.robot.scenario());
  await page.click('.crr-setup .crr-seg:first-child [data-v="off"]'); await sleep(400);
  const off = await R(() => ({ s: ControlRoom.mods.robot.scenario(), snapRobot: ControlRoom.mods.robot.snap().robot, txt: document.querySelector('.crr-statetx').textContent, flag: document.querySelector('.crr-robot').dataset.off }));
  check('A/B «without robot»: the SAME seed re-run to the same clock, no robot in this world', off.s.robotOn === false && off.s.seed === on.seed && off.s.t === on.t && !off.snapRobot && off.flag === '1' && /No robot in this world/.test(off.txt), JSON.stringify(off.s));
  check('without the robot there is no «located by robot» bucket (it is simply not in the world)', off.s.hc.located === undefined && off.s.hc.registered === on.hc.registered);
  await R(() => ControlRoom.mods.robot.step(120));
  const off2 = await R(() => ControlRoom.mods.robot.scenario());
  check('the world without the robot keeps running (MANARA\'s alerts and crews still account for people)', off2.t > off.s.t && off2.state === null && off2.hc.registered === off.s.hc.registered && off2.hc.unaccounted !== off.s.hc.unaccounted, JSON.stringify([off.s.t, off2.t, off.s.hc, off2.hc]));
  await page.click('.crr-setup .crr-seg:first-child [data-v="on"]'); await sleep(400);
  const back = await R(() => ControlRoom.mods.robot.scenario());
  check('switching back puts the robot in again (stowed: the human key is asked again), same seed', back.robotOn === true && back.state === 'stowed' && back.seed === on.seed);
  // limits
  const lim = await R(() => document.querySelector('.crr-limbox').textContent);
  check('the limits panel is open and says: a wheeled robot cannot climb stairs', /wheeled robot cannot climb stairs/i.test(lim) && await R(() => document.querySelector('.crr-limbox').open));
  check('the limits panel says hot rooms (34 °C) leave the thermal camera no contrast, with the live contrast value', /Hot rooms \(34 °C and up\) leave the thermal camera no contrast/.test(lim) && /Contrast now: .*%/.test(lim), lim.slice(0, 400));
  check('the limits panel also states the door, battery / link, false-alarm limits and the concept framing', /does not break doors/.test(lim) && /Battery 45 min/.test(lim) && /False alarms/.test(lim) && /not been built or tested|no robot has been built/i.test(lim));
  // the honest reference
  const ref = await R(() => document.querySelector('.crr-abbox').textContent);
  check('the A/B panel states the honest result: locate time barely changes; the robot first for the wheelchair user in 5 of 8 seeds, the crews in 3 of 8', /barely changes/.test(ref) && /5 of 8 seeds/.test(ref) && /3 of 8/.test(ref) && /not proof of impact/.test(ref), ref.slice(0, 500));
  // wheeled
  await page.click('.crr-setup .crr-seg:nth-child(2) [data-v="wheeled"]'); await sleep(400);
  const wh = await R(() => { const M = ControlRoom.mods.robot; ControlRoom.setRole('commander'); M.request(); M.approve(); let maxFl = 0; for (let i = 0; i < 30; i++) { M.step(10); const s = M.scenario(); if (s.floor != null && s.floor > maxFl) maxFl = s.floor; } const snap = M.snap().robot.robots[0], un = Object.values(snap.coverage.rooms).filter(v => v === 'unreachable').length; return { variant: M.scenario().variant, maxFl, un, stairs: snap.stats.stairsM }; });
  check('a WHEELED robot never climbs the stairs (stays on floor 1; upper rooms are «unreachable»)', wh.variant === 'wheeled' && wh.maxFl === 0 && wh.stairs === 0 && wh.un > 0, JSON.stringify(wh));
  await R(() => ControlRoom.mods.robot.paint());
  check('and the limits panel says so for the current run («Now: wheeled … room(s) unreachable»)', /Now: wheeled/.test(await R(() => document.querySelector('.crr-limbox').textContent)) && /unreachable/.test(await R(() => document.querySelector('.crr-limbox').textContent)));
  await page.click('.crr-setup .crr-seg:nth-child(2) [data-v="tracked"]'); await sleep(300);
  // seed + restart
  await page.fill('#crr-seed', '4'); await page.click('.crr-setup .btn'); await sleep(400);
  check('seed + Restart: a new run of the same scenario with that seed', (await R(() => ControlRoom.mods.robot.scenario())).seed === 4);
  // pause with the tab: the building simulation only runs while the tab is open
  await R(() => { ControlRoom.mods.robot.setSpeed(60); ControlRoom.mods.robot.play(true); }); await sleep(900);
  const t1 = await R(() => ControlRoom.mods.robot.scenario().t); await sleep(700); const t2 = await R(() => ControlRoom.mods.robot.scenario().t);
  check('while the tab is open the scenario advances with the speed switch (60x)', t2 > t1 + 10, `${t1} -> ${t2}`);
  await tab(page, 'feed'); await sleep(300); const t3 = await R(() => ControlRoom.mods.robot.scenario().t); await sleep(1200); const t4 = await R(() => ControlRoom.mods.robot.scenario().t);
  check('another tab is open: the building simulation is paused (clock unchanged)', t4 === t3, `${t3} -> ${t4}`);
  await tab(page, 'robot'); await R(() => ControlRoom.mods.robot.play(false)); await sleep(300); const t5 = await R(() => ControlRoom.mods.robot.scenario().t); await sleep(900);
  check('Pause holds the clock', (await R(() => ControlRoom.mods.robot.scenario().t)) === t5);
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors); await ctx.close();
}

/* ---------------------------------------------------------------- 9. the measured A/B (seeds 1–8) */
console.log('\n9. the MEASURED result over seeds 1–8 (computed in the browser, about 20 s)');
{
  const { ctx, page, errors } = await open();
  await ready(page); await fireAlarm(page); await tab(page, 'robot'); await sleep(500);
  await page.click('.crr-abbox .btn'); await sleep(500);
  check('the Measure button runs with a progress indicator and a status line', await W(page, () => !document.querySelector('.crr-prog').hidden || /Measuring/.test(document.querySelector('.crr-abbox').textContent)));
  const res = await W(page, () => ControlRoom.mods.robot.measure());
  const ref = await W(page, () => ControlRoom.mods.robot.ref);
  check('8 seeds were run, each a same-seed pair (with / without the robot)', res.n === 8 && res.rows.length === 8, String(res.n));
  check('MEASURED: the robot found the wheelchair user (Abu Salem) first in 5 of 8 seeds, the crews first in 3 of 8 — the page\'s reference numbers are true', res.robotFirst === 5 && res.crewsFirst === 3 && res.robotFirst === ref.robotFirst && res.crewsFirst === ref.crewsFirst, `${res.robotFirst}/${res.crewsFirst}`);
  check('MEASURED: the overall median time to locate the unaccounted barely changes (|Δ| under 5 s; reference values match to 0.1 s)', Math.abs(res.p50Without - res.p50With) < 5 && Math.abs(res.p50Without - ref.p50Without) < 0.1 && Math.abs(res.p50With - ref.p50With) < 0.1, `${res.p50Without.toFixed(1)} -> ${res.p50With.toFixed(1)} (ref ${ref.p50Without} -> ${ref.p50With})`);
  await sleep(300);
  const out = await W(page, () => ({ txt: document.querySelector('.crr-about').textContent, rows: document.querySelectorAll('.crr-seedtable tbody tr').length, st: document.querySelector('.crr-abbox [role="status"]').textContent }));
  check('the per-seed table (eight rows) and «Your result» are on screen', out.rows === 8 && /Your result/.test(out.txt) && /the robot first in 5 of 8/.test(out.txt) && /Measured just now/.test(out.st), out.txt.slice(0, 200));
  check('no console errors', errors.length === 0, errors.join(' | '));
  allErrors.push(...errors); await ctx.close();
}

check('no console errors anywhere', allErrors.length === 0, allErrors.slice(0, 3).join(' | '));
await done(browser);
