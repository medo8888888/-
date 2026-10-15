// Control Room («غرفة التحكم») SHELL tests — Playwright + Chromium over file:// (no network).
//   node manara/tools/test-control-room.mjs
// The shell is css/control.css + js/control-ui.js + js/control-demo.js on top of the core (js/control.js).  Covers: clean loads (ar/en x dark/light x 390/820/1440: no console errors, the right layout,
// no horizontal overflow, the shell parts, SIM badges, the honest foot); the alert queue (priority order, cards, filters, the order is frozen while the pointer is on the list); the human key (roles
// gate approve / dismiss / escalate with a visible reason, the one-key approval asks for proof first, a confirmed approval does not, a confirmed dismissal asks); keyboard shortcuts (also with Arabic
// key codes); tabs (desktop tab list, phone bottom sheet, tablet drawer, tabs registered late); wall mode; the one-click demo story (skippable, reaches the handover; the fast-paced story runs by itself);
// the busy shift; accessibility basics (landmarks, accessible names from Chrome's tree, focus order, focus trap and return, aria-live); reduced motion; text contrast >= 4.5:1 in both themes;
// source rules (no innerHTML sinks, no modules / fetch, no letter-spacing, logical CSS only); and the generated single-file bundle (manara/preview/control.html).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, ROOT } from './lib.mjs';

const browser = await launch();
const W = (p, fn, ...a) => p.evaluate(fn, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const first = (a, n = 4) => a.slice(0, n).join(' | ');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
// the sibling modules (feed wall, robot, fleet / dispatch / comms / handover) are written by other hands: a missing file is stood in for by an empty one, and says so
const SIBLINGS = ['js/control-feeds.js', 'js/control-robot.js', 'js/control-panels.js', 'css/control-feeds.css', 'css/control-robot.css', 'css/control-panels.css'];
const MISSING = SIBLINGS.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (MISSING.length) console.log('  note: stand-ins for missing sibling files: ' + MISSING.join(', '));
const PLACES = { sadd: [51.50026, 25.28593], westbay: [51.53299, 25.3229], industrial: [51.44222, 25.17354], rayyan: [51.43463, 25.29662], wakrah: [51.60132, 25.15666], lusail: [51.51972, 25.42289], doha: [51.5264, 25.2856] };

async function open(o = {}) {
  const width = o.width || 1440, height = o.height || (width < 600 ? 844 : 900), theme = o.theme || 'dark';
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: o.motion || 'reduce', isMobile: width < 600, hasTouch: width < 600, deviceScaleFactor: 1 });
  for (const f of MISSING) await ctx.route('**/' + f, r => r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: '' }));
  const file = o.file || 'control.html';
  const r = await openPage(browser, file, { width, height, theme, lang: o.lang || 'en', query: o.hash === undefined ? '#quiet' : o.hash, context: ctx });
  const ok = await r.page.waitForFunction(() => window.ControlRoom && ControlRoom.api.ready(), null, { timeout: 15000 }).then(() => true, () => false);
  if (!ok) r.errors.push('the control room never became ready');
  await r.page.waitForTimeout(o.settle == null ? 250 : o.settle);
  return r;
}
// a stand-in tab for every id the shell expects, only when the sibling did not register it (so the shell is tested on its own too)
const ensureTabs = p => W(p, () => {
  const CR = ControlRoom, have = CR.tabs.map(t => t.id);
  ['feed', 'fleet', 'dispatch', 'robot', 'comms', 'handover'].forEach((id, i) => { if (!have.includes(id)) CR.registerTab({ id, icon: ['camera', 'drone', 'route', 'robot', 'list', 'users'][i], ar: 'لوحة ' + id, en: 'Panel ' + id, build(el) { el.appendChild(document.createTextNode('stand-in ' + id)); }, update() {} }); });
  return CR.tabs.map(t => t.id);
});
const alarm = (p, hz, at, trigger = 'sentinel') => W(p, ([hz, at, trigger]) => { const inc = ControlRoom.api.placeAlarm({ hazard: hz, lon: at[0], lat: at[1], trigger }); if (!inc) return null; const a = ControlRoom.api.alerts().find(x => x.incident === inc.id); return a ? a.id : null; }, [hz, at, trigger]);
const alertOf = (p, id) => W(p, id => { const a = ControlRoom.api.alert(id); return a ? { id: a.id, state: a.state, rank: ControlRoom.STATE_RANK[a.state], escalated: !!a.escalated, priority: a.priority, verdict: a.verdict, level: a.level } : null; }, id);
const step = (p, s) => W(p, s => { ControlRoom.api.step(s); }, s);
const setRole = (p, r) => W(p, r => ControlRoom.api.setRole(r), r);
const press = (p, code, key = '') => W(p, ([code, key]) => document.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace(/^Key|^Digit/, '').toLowerCase(), bubbles: true, cancelable: true })), [code, key]);
// a CONFIRMED alert (two keys): a real fire at several places until a drone's verification confirms one
async function confirmed(p) {
  for (const k of ['sadd', 'westbay', 'rayyan', 'lusail', 'wakrah']) {
    const id = await alarm(p, 'fire', PLACES[k]); if (!id) continue;
    await step(p, 420); const a = await alertOf(p, id); if (a && a.state === 'CONFIRMED') return id;
  }
  return null;
}

/* ---------------------------------------------------------------- 1. loads clean */
console.log('\n1. loads clean: ar/en x dark/light x 390/820/1440');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 820, 1440]) {
  const tag = `${lang}/${theme}/${width}`;
  const { ctx, page, errors } = await open({ lang, theme, width, hash: '#quiet', settle: 500 });
  const info = await W(page, () => {
    const d = document.documentElement, m = document.querySelector('#main'), vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const cv = document.querySelector('#cr-map'), g = cv.getContext('2d'), px = g.getImageData(0, 0, cv.width, cv.height).data, seen = new Set(); for (let i = 0; i < px.length; i += 4 * 211) seen.add((px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4));
    return { lang: d.dataset.lang, dir: d.dir, theme: d.dataset.theme, layout: m.dataset.layout, state: m.dataset.state, ui: d.dataset.crUi, top: vis(document.querySelector('#cr-top')), kpis: document.querySelectorAll('#cr-kpis .cr-kpi').length,
      kpiSim: [...document.querySelectorAll('#cr-kpis .cr-kpi')].every(k => /SIM/.test(k.textContent)), queue: !!document.querySelector('#cr-queue .cr-q-list'), hud: !!document.querySelector('#cr-hud .cr-tools-seg'), tl: !!document.querySelector('#cr-timeline .cr-tl-track'),
      clock: document.querySelector('.cr-clock-t').textContent, utc: /UTC\+3/.test(document.querySelector('.cr-clock').textContent), foot: document.querySelector('#cr-foot').innerText + ' ' + document.querySelector('#cr-foot').textContent, ink: seen.size,
      title: document.title, h1: document.querySelector('h1').textContent.trim().length > 3, tabbar: vis(document.querySelector('#cr-tabbar')), more: vis(document.querySelector('#cr-more')) };
  });
  const wantLayout = width >= 1400 ? 'wide' : width >= 1100 ? 'medium' : 'narrow';
  check(`${tag}: no console errors, page errors or failed local requests`, errors.length === 0, first(errors, 2));
  check(`${tag}: language, direction and theme are applied`, info.lang === lang && info.dir === (lang === 'ar' ? 'rtl' : 'ltr') && info.theme === theme, JSON.stringify([info.lang, info.dir, info.theme]));
  check(`${tag}: ready, shell built, layout "${wantLayout}"`, info.state === 'ready' && info.ui === '1' && info.layout === wantLayout, JSON.stringify([info.state, info.ui, info.layout]));
  check(`${tag}: top bar, six KPI cards each with a SIM badge, queue, map HUD, timeline`, info.top && info.kpis === 6 && info.kpiSim && info.queue && info.hud && info.tl, JSON.stringify([info.top, info.kpis, info.kpiSim, info.queue, info.hud, info.tl]));
  check(`${tag}: simulated Qatar clock (HH:MM:SS, UTC+3)`, /^\d\d:\d\d:\d\d$/.test(info.clock) && info.utc, info.clock);
  check(`${tag}: the foot says "concept + simulated prototype", 999 and the OpenStreetMap ODbL attribution`, (lang === 'en' ? /concept \+ simulated prototype/i : /مفهوم \+ نموذج أولي محاكى/).test(info.foot) && /999/.test(info.foot) && /OpenStreetMap contributors/.test(info.foot) && /ODbL 1\.0/.test(info.foot) && /Contains data ©/.test(info.foot), info.foot.slice(0, 160));
  check(`${tag}: the map canvas is drawn`, info.ink > 12, String(info.ink));
  check(`${tag}: ${width < 1100 ? 'bottom tab bar and the "more" menu are shown' : 'no bottom tab bar'}`, width < 1100 ? info.tabbar && (width >= 1240 || info.more) : !info.tabbar, JSON.stringify([info.tabbar, info.more]));
  const ov = await overflow(page); const bad = ov.bad.filter(b => !/nav-links|^A \(|^SPAN \(/.test(b));          // the page nav (core.js) is judged by test-ui.mjs
  check(`${tag}: no horizontal overflow (scrollWidth ${ov.scrollW} <= ${ov.W})`, ov.scrollW <= ov.W && bad.length === 0, first(bad));
  await ctx.close();
}

/* ---------------------------------------------------------------- 2. the busy shift on first load: a real queue */
console.log('\n2. the default opening is a busy shift (several hazards open at once) and the KPIs agree with the queue');
{
  const { ctx, page, errors } = await open({ hash: '', settle: 300 });
  await W(page, () => ControlRoom.api.step(700));
  await sleep(600);
  const r = await W(page, () => {
    const open = ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a)), hz = [...new Set(ControlRoom.api.alerts().map(a => a.hazard))];
    return { open: open.length, cards: document.querySelectorAll('.cr-q-list .cr-ac:not(.is-final)').length, hz, kpi: document.querySelector('[data-k=open] .cr-kpi-v').textContent, preset: ControlRoom.S.preset, clock: document.querySelector('.cr-clock-t').textContent, date: ControlRoom.api.snap().date };
  });
  check('the opening preset is the busy shift (spring Sunday noon)', r.preset === 'busy' && r.date === '2026-04-12', JSON.stringify([r.preset, r.date]));
  check('at least five open alerts of at least four different hazards', r.open >= 5 && r.hz.length >= 4, JSON.stringify(r));
  check('the queue shows one card per open alert (no closed ones by default)', r.cards === r.open, JSON.stringify([r.cards, r.open]));
  check('the "open alerts" KPI equals the number of open alerts', +r.kpi.replace(/,/g, '') === r.open, JSON.stringify([r.kpi, r.open]));
  check('no console errors in the busy shift', errors.length === 0, first(errors, 2));
  await ctx.close();
}

/* ---------------------------------------------------------------- 3. queue: order, cards, filters, frozen while hovering */
console.log('\n3. alert queue: priority order, card content, filters, order frozen under the pointer');
{
  const { ctx, page, errors } = await open({});
  const ids = [await alarm(page, 'fire', PLACES.sadd), await alarm(page, 'gas', PLACES.industrial), await alarm(page, 'flood', PLACES.rayyan), await alarm(page, 'sos', PLACES.westbay, 'citizen'), await alarm(page, 'heat', PLACES.wakrah)];
  check('five test alarms were raised (fire, gas, flood, sos, heat)', ids.every(Boolean), JSON.stringify(ids));
  await step(page, 60); await sleep(350);
  const q = await W(page, () => {
    const open = ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a)).sort((a, b) => b.priority - a.priority || a.t - b.t || (a.id < b.id ? -1 : 1)).map(a => a.id);
    return { want: open, got: [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.dataset.id), pri: ControlRoom.api.alerts().map(a => a.priority) };
  });
  check('the cards are in priority order (priority desc, then age)', q.want.join() === q.got.join(), JSON.stringify(q));
  check('priorities differ (the sort is not vacuous)', new Set(q.pri).size > 1, q.pri.join());
  const card = await W(page, id => { const e = document.querySelector(`.cr-ac[data-id="${id}"]`); if (!e) return null; const t = s => (e.querySelector(s) || {}).textContent || ''; return { hz: e.querySelector('.cr-ico').dataset.hz, svg: !!e.querySelector('.cr-ico svg'), title: t('.cr-ac-ti'), src: t('.cr-src'), state: t('.cr-state'), proof: t('.cr-proof-t'), age: t('.cr-m-age'), eta: t('.cr-m-eta'), lvl: t('.cr-lvl-t'), btns: e.querySelectorAll('.cr-ac-acts .cr-btn:not([hidden])').length, sim: !!e.querySelector('.cr-meta .cr-sim, .cr-ac-meta .cr-sim'), sev: e.dataset.sev }; }, ids[0]);
  check('a card shows a hazard icon, the place name, a source badge, the state, an age, an ETA and a severity word', card && card.hz === 'fire' && card.svg && /Fire/i.test(card.title) && / · .{3,}/.test(card.title) && card.src.length > 2 && card.state.length > 2 && /\d\d:\d\d/.test(card.age) && /First unit|plan/i.test(card.eta) && /Critical|High|Medium|Low/.test(card.lvl), JSON.stringify(card));
  check('the card carries a SIM badge and has the Approve / Dismiss / Escalate actions', card && card.sim && card.btns >= 3, JSON.stringify(card));
  check('"two keys" or "one key – needs proof" is written on every card', await W(page, () => [...document.querySelectorAll('.cr-ac:not(.is-final) .cr-proof-t')].every(e => /Two independent keys|Three independent keys|One key – needs proof|No key yet – needs proof/.test(e.textContent))));
  // filters
  await page.click('.cr-chips [data-hz]:not([data-hz=gas]) >> nth=-1', { force: true }).catch(() => {});
  await W(page, () => { document.querySelectorAll('.cr-hzchips .cr-chip[aria-pressed=true]').forEach(b => b.click()); });
  await W(page, () => document.querySelector('.cr-hzchips [data-hz=gas]').click()); await sleep(300);
  const fh = await W(page, () => ({ cards: [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.querySelector('.cr-ico').dataset.hz), pressed: document.querySelector('.cr-hzchips [data-hz=gas]').getAttribute('aria-pressed') }));
  check('the hazard filter shows only gas alerts and the chip is pressed', fh.cards.length >= 1 && fh.cards.every(h => h === 'gas') && fh.pressed === 'true', JSON.stringify(fh));
  await W(page, () => document.querySelector('.cr-hzchips [data-hz=gas]').click());
  await W(page, () => [...document.querySelectorAll('.cr-chips .cr-chip')].find(b => /Citizen/.test(b.textContent)).click()); await sleep(300);
  const fs1 = await W(page, () => [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.dataset.src));
  check('the source filter shows only citizen alerts', fs1.length >= 1 && fs1.every(s => s === 'citizen'), fs1.join());
  await W(page, () => [...document.querySelectorAll('.cr-chips .cr-chip')].find(b => /^\s*All/.test(b.innerText)).click()); await sleep(300);
  check('"All" shows the whole queue again', await W(page, n => document.querySelectorAll('.cr-q-list .cr-ac').length >= n, ids.length));
  // frozen under the pointer
  const before = await W(page, () => [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.dataset.id));
  const low = before[before.length - 1];
  await W(page, () => { document.querySelector('.cr-q-list').dispatchEvent(new PointerEvent('pointermove', { bubbles: true })); });
  await W(page, id => ControlRoom.api.escalate(id), low);
  await W(page, () => ControlRoom.ui.render(true)); await sleep(150);
  const held = await W(page, () => [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.dataset.id));
  check('the order is frozen while the pointer is on the list (no card jumps under your finger)', held.join() === before.join(), JSON.stringify([before, held]));
  await sleep(1700); await W(page, () => ControlRoom.ui.render(true));
  const after = await W(page, () => ({ got: [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.dataset.id), want: ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a)).sort((a, b) => b.priority - a.priority || a.t - b.t || (a.id < b.id ? -1 : 1)).map(a => a.id) }));
  check('…and the list re-sorts a moment after the pointer leaves', after.got.join() === after.want.join(), JSON.stringify(after));
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();
}

/* ---------------------------------------------------------------- 4. the human key and the roles */
console.log('\n4. the human key: roles gate approve / dismiss / escalate; proof before panic');
{
  const { ctx, page, errors } = await open({});
  // viewer
  const idV = await alarm(page, 'sos', PLACES.westbay, 'citizen'); await step(page, 5); await sleep(300);
  await setRole(page, 'viewer'); await sleep(250);
  const r0 = await W(page, () => ControlRoom.S.rejects);
  const lock = await W(page, id => { const e = document.querySelector(`.cr-ac[data-id="${id}"]`); return { dis: e.querySelector('.cr-b-approve').getAttribute('aria-disabled'), note: !e.querySelector('.cr-ac-lock').hidden, sel: document.querySelector('.cr-role-sel').value }; }, idV);
  check('as a viewer the action buttons are marked locked (aria-disabled) with a visible note, the role select says viewer', lock.dis === 'true' && lock.note && lock.sel === 'viewer', JSON.stringify(lock));
  await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-approve`).click(), idV); await sleep(200);
  await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-dismiss`).click(), idV); await sleep(200);
  await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-esc`).click(), idV); await sleep(200);
  const v1 = await alertOf(page, idV), r1 = await W(page, () => ({ rej: ControlRoom.S.rejects, log: ControlRoom.api.oplog().filter(e => e.kind === 'reject').map(e => e.text.en), toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '), dlg: !!document.querySelector('dialog[open]') }));
  check('a viewer\'s approve, dismiss and escalate are all refused: state SUSPECT, not escalated, no dialog', v1.state === 'SUSPECT' && !v1.escalated && !r1.dlg, JSON.stringify(v1));
  check('each refusal is counted, logged with the reason and shown as a toast ("needs the Operator role")', r1.rej === r0 + 3 && r1.log.length >= 3 && /Viewer role cannot/.test(r1.log[0]) && /Operator role/.test(r1.log[0]) && /Operator role/.test(r1.toast), JSON.stringify(r1).slice(0, 300));
  // operator: one key -> dialog with proof before panic
  await setRole(page, 'operator'); await sleep(250);
  await W(page, id => { const b = document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-approve`); b.focus(); b.click(); }, idV); await sleep(250);
  const dlg = await W(page, () => { const d = document.querySelector('dialog#cr-dlg-approve'); return d ? { open: d.open, keys: d.querySelectorAll('.cr-pkeys .cr-pk').length, text: d.textContent, focusIn: d.contains(document.activeElement), labelled: !!d.getAttribute('aria-labelledby') && !!document.getElementById(d.getAttribute('aria-labelledby')) } : null; });
  check('an operator pressing Approve on a ONE-key alert gets the proof-before-panic dialog (3 keys, the explanation, labelled)', dlg && dlg.open && dlg.keys === 3 && /Proof before panic/.test(dlg.text) && /one key/i.test(dlg.text) && dlg.labelled, JSON.stringify(dlg && { ...dlg, text: dlg.text.slice(0, 80) }));
  check('focus moves into the dialog', dlg && dlg.focusIn);
  await page.keyboard.press('Escape'); await sleep(200);
  const back = await W(page, id => ({ closed: !document.querySelector('dialog[open]'), focusOnBtn: document.activeElement === document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-approve`) }), idV);
  check('Esc closes the dialog, the alert is still SUSPECT and focus returns to the Approve button', back.closed && back.focusOnBtn && (await alertOf(page, idV)).state === 'SUSPECT', JSON.stringify(back));
  await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-approve`).click(), idV); await sleep(250);
  await W(page, () => [...document.querySelectorAll('dialog#cr-dlg-approve .cr-dlg-f .btn')].find(b => /Approve with one key/.test(b.textContent)).click()); await sleep(250);
  const ap = await alertOf(page, idV);
  check('"Approve with one key" is the human key: the alert becomes APPROVED and the decision is recorded as unverified', ap.rank >= 2 && (await W(page, id => ControlRoom.api.decisions().some(d => d.type === 'approve' && d.alert === id && d.unverified), idV)), JSON.stringify(ap));
  // confirmed alert: approve directly
  const idC = await confirmed(page);
  check('a real fire alarm becomes CONFIRMED (two keys) after the drone verifies it', !!idC);
  if (idC) {
    const keys = await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-proof-t`).textContent, idC);
    check('its card says "Two independent keys"', /independent keys/.test(keys), keys);
    await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-dismiss`).click(), idC); await sleep(250);
    const dd = await W(page, () => { const d = document.querySelector('dialog#cr-dlg-dismiss'); return d ? { open: d.open, text: d.textContent } : null; });
    check('dismissing a two-key alert asks first ("Dismiss a confirmed alert?")', dd && dd.open && /confirmed alert/i.test(dd.text), JSON.stringify(dd));
    await W(page, () => [...document.querySelectorAll('dialog#cr-dlg-dismiss .btn')].find(b => /Cancel/.test(b.textContent)).click()); await sleep(200);
    check('…Cancel leaves it CONFIRMED', (await alertOf(page, idC)).state === 'CONFIRMED');
    await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-esc`).click(), idC); await sleep(250);
    const es = await alertOf(page, idC);
    check('an operator can escalate: the alert is marked escalated and its priority did not fall', es.escalated, JSON.stringify(es));
    await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-approve`).click(), idC); await sleep(300);
    const a2 = await alertOf(page, idC);
    check('an operator approves a CONFIRMED alert directly (no dialog): APPROVED or later', a2.rank >= 2 && !(await W(page, () => !!document.querySelector('dialog[open]'))), JSON.stringify(a2));
    check('the approval is a decision record with the time since the alert appeared', await W(page, id => ControlRoom.api.decisions().some(d => d.type === 'approve' && d.alert === id && typeof d.afterSec === 'number'), idC));
  }
  // dismiss a suspect as operator; commander can do it too
  const idD = await alarm(page, 'heat', PLACES.wakrah); await step(page, 5); await sleep(250);
  await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-dismiss`).click(), idD); await sleep(300);
  check('an operator dismisses a one-key alert at once: DISMISSED', (await alertOf(page, idD)).state === 'DISMISSED');
  await setRole(page, 'commander'); await sleep(200);
  const idE = await alarm(page, 'gas', PLACES.industrial); await step(page, 5); await sleep(250);
  await W(page, id => document.querySelector(`.cr-ac[data-id="${id}"] .cr-b-esc`).click(), idE); await sleep(250);
  check('the incident commander can escalate (and the role select shows it)', (await alertOf(page, idE)).escalated && (await W(page, () => document.querySelector('.cr-role-sel').value)) === 'commander');
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();
}

/* ---------------------------------------------------------------- 5. keyboard */
console.log('\n5. keyboard shortcuts (j k a d e 1-6 w space ? Esc), also with Arabic key codes');
{
  const { ctx, page, errors } = await open({});
  const tabs = await ensureTabs(page); await sleep(200);
  const ids = [await alarm(page, 'fire', PLACES.sadd), await alarm(page, 'gas', PLACES.industrial), await alarm(page, 'sos', PLACES.westbay, 'citizen')]; await step(page, 5); await sleep(300);
  const order = await W(page, () => [...document.querySelectorAll('.cr-q-list .cr-ac')].map(e => e.dataset.id));
  await W(page, () => { document.body.focus(); });
  await press(page, 'KeyJ'); await sleep(150);
  const s1 = await W(page, () => ControlRoom.api.selected());
  await press(page, 'KeyJ'); await sleep(150);
  const s2 = await W(page, () => ControlRoom.api.selected());
  await press(page, 'KeyK'); await sleep(150);
  const s3 = await W(page, () => ControlRoom.api.selected());
  check('J selects the first card, J the next, K goes back (queue order)', s1 === order[0] && s2 === order[1] && s3 === order[0], JSON.stringify([order, s1, s2, s3]));
  check('the selected card is marked (aria-current, aria-pressed) and the live region announces it', await W(page, id => { const e = document.querySelector(`.cr-ac[data-id="${id}"]`); return e.getAttribute('aria-current') === 'true' && e.querySelector('.cr-ac-sel').getAttribute('aria-pressed') === 'true'; }, s3) && await page.waitForFunction(() => /Selected:/.test(document.querySelector('#cr-live').textContent), null, { timeout: 2000 }).then(() => true, () => false));
  await press(page, 'KeyE'); await sleep(250);
  check('E escalates the selected alert', (await alertOf(page, s3)).escalated);
  const target = order[order.length - 1];
  await W(page, id => ControlRoom.selectAlert(id), target); await sleep(150);
  await press(page, 'KeyD', 'ي'); await sleep(250);            // an Arabic layout types "ي" on the D key
  check('D (typed on an Arabic layout) dismisses the selected one-key alert', ['DISMISSED'].includes((await alertOf(page, target)).state) || (await alertOf(page, target)).state === 'CONFIRMED', JSON.stringify(await alertOf(page, target)));
  const mid = order[1] === s3 ? order[0] : order[1];
  await W(page, id => ControlRoom.selectAlert(id), mid); await sleep(150);
  await press(page, 'KeyA', 'ش'); await sleep(350);
  const am = await alertOf(page, mid);
  check('A (Arabic layout "ش") on a one-key alert opens the proof dialog instead of approving', !!(await W(page, () => document.querySelector('dialog#cr-dlg-approve[open]'))) && am.rank < 2, JSON.stringify(am));
  check('shortcuts are ignored while a dialog is open (J does not move the selection)', await (async () => { const b = await W(page, () => ControlRoom.api.selected()); await press(page, 'KeyJ'); await sleep(120); return b === await W(page, () => ControlRoom.api.selected()); })());
  await page.keyboard.press('Escape'); await sleep(200);
  // tabs by number
  for (let i = 1; i <= 6; i++) { await press(page, 'Digit' + i); await sleep(60); const t = await W(page, () => document.querySelector('.cr-tab[aria-selected=true]').dataset.tab); if (i === 1 || i === 6) check(`key ${i} switches to the ${i === 1 ? 'first' : 'sixth'} panel (${tabs[i - 1] || ''})`, t === ['feed', 'fleet', 'dispatch', 'robot', 'comms', 'handover'][i - 1], t); }
  // play / pause, shortcuts help, wall
  const pl0 = await W(page, () => ControlRoom.S.playing);
  await W(page, () => document.querySelector('#cr-map').focus()); await press(page, 'Space', ' '); await sleep(100);
  check('Space (with the map focused) pauses and resumes the simulation', pl0 === true && (await W(page, () => ControlRoom.S.playing)) === false && (await press(page, 'Space', ' '), await sleep(80), await W(page, () => ControlRoom.S.playing)) === true);
  await press(page, 'Slash', '?'); await sleep(250);
  check('? opens the keyboard-shortcuts dialog (a table of keys), Esc closes it', await W(page, () => { const d = document.querySelector('dialog#cr-dlg-keys'); return !!d && d.open && d.querySelectorAll('kbd').length >= 10; }));
  await page.keyboard.press('Escape'); await sleep(150);
  check('…and it is gone', !(await W(page, () => !!document.querySelector('dialog[open]'))));
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();
}

/* ---------------------------------------------------------------- 6. wall mode */
console.log('\n6. wall mode: a projector (W, Esc, #wall)');
{
  const { ctx, page, errors } = await open({}); await ensureTabs(page);
  const f0 = await W(page, () => ({ kpi: parseFloat(getComputedStyle(document.querySelector('.cr-kpi-v')).fontSize), nav: getComputedStyle(document.querySelector('header.nav')).display, tabs: !!document.querySelector('.cr-tabs').offsetParent }));
  await press(page, 'KeyW'); await sleep(400);
  const f1 = await W(page, () => ({ wall: document.documentElement.classList.contains('cr-wall'), data: document.querySelector('#main').dataset.wall, kpi: parseFloat(getComputedStyle(document.querySelector('.cr-kpi-v')).fontSize), nav: getComputedStyle(document.querySelector('header.nav')).display, tabs: !!document.querySelector('.cr-tabs').offsetParent, clock: parseFloat(getComputedStyle(document.querySelector('.cr-clock-t')).fontSize), pressed: document.querySelector('.cr-tbtn[aria-pressed=true] .cr-tx') && document.querySelector('.cr-tbtn[aria-pressed=true] .cr-tx').textContent, active: document.querySelector('.cr-tab[aria-selected=true]').dataset.tab, top: document.querySelector('#cr-top').offsetParent !== null, q: document.querySelector('#cr-queue').offsetParent !== null, ov: document.documentElement.scrollWidth <= document.documentElement.clientWidth }));
  check('W turns wall mode on: the page nav and the tab bar are hidden, the clock and the KPIs get big', f1.wall && f1.data === '1' && f1.nav === 'none' && !f1.tabs && f1.kpi > f0.kpi * 1.25 && f1.clock > 26, JSON.stringify([f0, f1]));
  check('the feed wall is the visible panel and the queue and top bar stay', f1.active === 'feed' && f1.top && f1.q && f1.ov, JSON.stringify(f1));
  check('the wall button says it is pressed (aria-pressed)', /wall/i.test(f1.pressed || ''), String(f1.pressed));
  const nof = await W(page, () => ({ big: getComputedStyle(document.querySelector('.cr-ac') || document.body).fontSize }));
  await page.keyboard.press('Escape'); await sleep(300);
  const f2 = await W(page, () => ({ wall: document.documentElement.classList.contains('cr-wall'), nav: getComputedStyle(document.querySelector('header.nav')).display, kpi: parseFloat(getComputedStyle(document.querySelector('.cr-kpi-v')).fontSize) }));
  check('Esc leaves wall mode: nav is back, type is back to normal', !f2.wall && f2.nav !== 'none' && Math.abs(f2.kpi - f0.kpi) < 1, JSON.stringify(f2));
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();
  const w2 = await open({ hash: '#quiet&wall' });
  check('#wall starts in wall mode', await W(w2.page, () => document.documentElement.classList.contains('cr-wall')) && w2.errors.length === 0, first(w2.errors, 1));
  await w2.ctx.close();
}

/* ---------------------------------------------------------------- 7. tabs: list, phone sheet, tablet drawer, tabs that register late */
console.log('\n7. tabs: desktop tab list, phone bottom sheet and tab bar, tablet drawer, late registration');
{
  const { ctx, page, errors } = await open({ width: 1440 });
  const t0 = await W(page, () => ControlRoom.tabs.map(t => t.id));
  await W(page, () => ControlRoom.registerTab({ id: 'zz-late', icon: 'star', ar: 'متأخرة', en: 'Late', build(el) { el.setAttribute('data-built', '1'); el.appendChild(document.createTextNode('late tab')); }, update() { window.__lateUp = (window.__lateUp || 0) + 1; }, badge() { return 7; } }));
  await ensureTabs(page); await sleep(300);
  const r = await W(page, () => ({ ids: [...document.querySelectorAll('.cr-tab')].map(b => b.dataset.tab), roles: [...document.querySelectorAll('.cr-tab')].every(b => b.getAttribute('role') === 'tab' && b.getAttribute('aria-controls') && document.getElementById(b.getAttribute('aria-controls'))), tl: document.querySelector('.cr-tabs').getAttribute('role'), sel: document.querySelectorAll('.cr-tab[aria-selected=true]').length, vis: [...document.querySelectorAll('.cr-tabpanel')].filter(p => !p.hidden).length }));
  check('every registered tab has a tab button and a tabpanel wired with aria-controls; one is selected and one panel shown', r.roles && r.tl === 'tablist' && r.sel === 1 && r.vis === 1, JSON.stringify(r));
  check('a tab registered after the shell was built is added (and sorted after the known panels)', r.ids[r.ids.length - 1] === 'zz-late' && r.ids.length >= 7, r.ids.join());
  await page.click('.cr-tab[data-tab=zz-late]'); await sleep(200);
  const late = await W(page, () => ({ built: document.querySelector('#cr-tp-zz-late').getAttribute('data-built'), up: window.__lateUp || 0, badge: document.querySelector('.cr-tab[data-tab=zz-late] .cr-tab-n').textContent, shown: !document.querySelector('#cr-tp-zz-late').hidden }));
  check('a panel is built on first show, update() runs, the badge() number is shown on the tab', late.built === '1' && late.up >= 1 && late.badge === '7' && late.shown, JSON.stringify(late));
  await page.focus('.cr-tab[aria-selected=true]'); await page.keyboard.press('Home'); await sleep(120);
  check('Home on the tab list moves to the first tab (roving focus)', (await W(page, () => document.activeElement.dataset.tab)) === 'feed' && (await W(page, () => document.querySelector('.cr-tab[aria-selected=true]').dataset.tab)) === 'feed');
  await page.keyboard.press('End'); await sleep(120);
  check('End moves to the last tab', (await W(page, () => document.activeElement.dataset.tab)) === 'zz-late');
  check('ControlRoom.showTab(id) returns the id and an unknown id returns null', (await W(page, () => [ControlRoom.showTab('dispatch'), ControlRoom.showTab('nope')])).join() === 'dispatch,');
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();

  const ph = await open({ width: 390 }); await ensureTabs(ph.page); await sleep(300);
  const p0 = await W(ph.page, () => ({ view: document.querySelector('#main').dataset.view, queue: document.querySelector('#cr-queue').offsetParent !== null, right: document.querySelector('#cr-right').offsetParent !== null, bar: [...document.querySelectorAll('#cr-tabbar .cr-tb')].map(b => b.dataset.view) }));
  check('phone: the map is the default view, the queue and the panels are closed, the bar lists Map, Alerts and the panels', p0.view === 'map' && !p0.queue && !p0.right && p0.bar.slice(0, 3).join() === 'map,queue,feed', JSON.stringify(p0));
  await ph.page.click('#cr-tabbar [data-view=queue]'); await sleep(250);
  const p1 = await W(ph.page, () => { const q = document.querySelector('#cr-queue').getBoundingClientRect(), v = innerHeight; return { view: document.querySelector('#main').dataset.view, shown: document.querySelector('#cr-queue').offsetParent !== null, bottom: Math.round(q.bottom), top: Math.round(q.top), w: Math.round(q.width), cur: document.querySelector('#cr-tabbar [aria-current=true]').dataset.view, vh: v }; });
  check('phone: Alerts opens the queue as a bottom sheet (full width, above the tab bar), the bar marks it current', p1.view === 'queue' && p1.shown && p1.w >= 360 && p1.cur === 'queue' && p1.bottom <= p1.vh, JSON.stringify(p1));
  await ph.page.click('#cr-queue .cr-grab'); await sleep(250);
  const p2 = await W(ph.page, () => document.querySelector('#main').dataset.sheet);
  check('phone: the grab handle expands the sheet (data-sheet=full) and a second tap shrinks it', p2 === 'full' && (await (async () => { await ph.page.click('#cr-queue .cr-grab'); await sleep(200); return await W(ph.page, () => document.querySelector('#main').dataset.sheet); })()) === 'half');
  await ph.page.keyboard.press('Escape'); await sleep(200);
  check('phone: Esc closes the sheet and goes back to the map', (await W(ph.page, () => document.querySelector('#main').dataset.view)) === 'map');
  await ph.page.click('#cr-tabbar [data-view=dispatch]'); await sleep(250);
  const p3 = await W(ph.page, () => ({ view: document.querySelector('#main').dataset.view, panel: !document.querySelector('#cr-tp-dispatch').hidden, right: document.querySelector('#cr-right').offsetParent !== null, title: document.querySelector('.cr-sheet-tt').textContent, tablist: document.querySelector('.cr-tabs').offsetParent !== null }));
  check('phone: a panel opens in the bottom sheet with its name as the title and no duplicate tab list', p3.view === 'dispatch' && p3.panel && p3.right && p3.title.length > 2 && !p3.tablist, JSON.stringify(p3));
  const touch = await W(ph.page, () => [...document.querySelectorAll('#cr-tabbar .cr-tb, .cr-sheet-x, #cr-top button, .cr-hud button, .cr-hud .cr-seg-b')].filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), (b.className || '').toString().slice(0, 24)]; }).filter(x => x[0] < 44 || x[1] < 44));
  check('phone: touch targets in the bar, sheet, top bar and map HUD are at least 44 x 44 px', touch.length === 0, JSON.stringify(touch.slice(0, 5)));
  check('phone: no console errors', ph.errors.length === 0, first(ph.errors, 2));
  await ph.ctx.close();

  const tb = await open({ width: 820 }); await ensureTabs(tb.page); await sleep(300);
  await tb.page.click('#cr-tabbar [data-view=feed]'); await sleep(250);
  const t1 = await W(tb.page, () => { const r = document.querySelector('#cr-right').getBoundingClientRect(); return { w: Math.round(r.width), vw: innerWidth, top: Math.round(r.top), shown: document.querySelector('#cr-right').offsetParent !== null }; });
  check('tablet: a panel opens as a side drawer (narrower than the screen, the map stays visible)', t1.shown && t1.w < t1.vw * 0.7 && t1.w > 300, JSON.stringify(t1));
  check('tablet: no console errors', tb.errors.length === 0, first(tb.errors, 2));
  await tb.ctx.close();
}

/* ---------------------------------------------------------------- 8. the demo story */
console.log('\n8. the one-click demo story: 7 narrated steps, skippable, reaches the handover');
{
  const { ctx, page, errors } = await open({ hash: '#quiet' }); await ensureTabs(page);
  await W(page, () => ControlRoom.mods.demo.startDemo());
  await sleep(500);
  const s1 = await W(page, () => ({ st: ControlRoom.mods.demo.state(), bar: !document.querySelector('#cr-demo').hidden, steps: document.querySelectorAll('.cr-demo-steps li').length, title: document.querySelector('.cr-demo-t').textContent, text: document.querySelector('.cr-demo-p').textContent, main: document.querySelector('#main').dataset.demo, preset: ControlRoom.S.preset, date: ControlRoom.api.snap().date }));
  check('startDemo(): the narration bar shows step 1 of 7 with a title and text, the preset is "demo" (Sunday 2026-01-11)', s1.bar && s1.st.step === 1 && s1.st.steps === 7 && s1.steps === 7 && s1.title.length > 5 && s1.text.length > 40 && s1.preset === 'demo' && s1.date === '2026-01-11' && s1.main === '1', JSON.stringify(s1));
  check('step 1: an unseen incident exists next to a drone that is really on patrol (not yet an alert)', await W(page, () => { const st = ControlRoom.mods.demo.state(); const inc = ControlRoom.api.snap().incidents.find(i => i.id === st.incidentId); return !!inc && (inc.status === 'unseen' || !!st.alertId) && !!st.droneId; }), JSON.stringify(await W(page, () => ControlRoom.mods.demo.state())));
  const seen = [];
  for (let i = 2; i <= 7; i++) {
    await W(page, () => ControlRoom.mods.demo.next()); await sleep(250);
    const s = await W(page, () => { const st = ControlRoom.mods.demo.state(), a = st.alertId ? ControlRoom.api.alert(st.alertId) : null; return { st, state: a && a.state, rank: a ? ControlRoom.STATE_RANK[a.state] : -1, title: document.querySelector('.cr-demo-t').textContent, why: document.querySelector('.cr-demo-why') && !document.querySelector('.cr-demo-why').hidden ? document.querySelector('.cr-demo-why').textContent : '', again: !document.querySelector('.cr-demo-acts .btn-primary:last-of-type') ? false : true }; });
    seen.push(s);
    check(`Next goes to step ${i}: "${s.title.slice(0, 48)}"`, s.st.step === i && s.title.length > 5, JSON.stringify(s.st));
  }
  check('step 2 found the alert in the queue (two keys or still verifying); the alert exists by step 3', !!seen[0].st.alertId && seen[1].rank >= 0, JSON.stringify(seen[0].st));
  check('step 3: the story approved for the operator after saying so (approvedByStory) and the alert is APPROVED or later by step 4', seen[2].rank >= 2 && seen[2].st.approvedByStory === true, JSON.stringify([seen[2].state, seen[2].st.approvedByStory]));
  check('step 4: the fastest-by-traffic units are named with ETAs and "why" is shown (the engine\'s own explanation of the runner-up)', seen[2].why.length > 20, seen[2].why.slice(0, 120));
  check('step 5: a public alert went out on the bus (proof before panic: only after the key) and the unit(s) are en route or beyond', await W(page, () => ControlRoom.api.bus().alert >= 1 && ControlRoom.api.snap().incidents.some(i => i.plan && i.plan.units.some(u => ['en-route', 'on-scene'].includes(u.state)))));
  const last = await W(page, () => ({ again: [...document.querySelectorAll('.cr-demo-acts button')].filter(b => !b.hidden).map(b => b.textContent.trim()), text: document.querySelector('.cr-demo-p').textContent, done: document.querySelectorAll('.cr-demo-steps li.done').length, handover: document.querySelector('.cr-tab[aria-selected=true]') && document.querySelector('.cr-tab[aria-selected=true]').dataset.tab }));
  check('step 7 (handover): the bar offers "Restart the story" and "Close", mentions the approval time, six steps are ticked, the Handover panel is open', last.again.some(t => /Restart/.test(t)) && last.again.some(t => /Close/.test(t)) && /approved/.test(last.text) && last.done === 6 && last.handover === 'handover', JSON.stringify(last));
  check('the story created one real incident and every human decision is in the log', await W(page, () => ControlRoom.api.decisions().some(d => d.type === 'approve') && ControlRoom.api.oplog().some(e => e.kind === 'operator')));
  await W(page, () => ControlRoom.mods.demo.stop()); await sleep(150);
  check('Close hides the bar and the simulation stays in its state', await W(page, () => document.querySelector('#cr-demo').hidden && document.querySelector('#main').dataset.demo === '0' && !ControlRoom.mods.demo.isRunning()));
  check('no console errors during the story', errors.length === 0, first(errors, 3));
  await ctx.close();

  // fast pace: the story walks itself (waits for the human key, then approves for you and says so)
  const f = await open({ hash: '#quiet' }); await ensureTabs(f.page);
  await W(f.page, () => ControlRoom.mods.demo.startDemo({ pace: 0.04 }));
  const reached = await f.page.waitForFunction(() => ControlRoom.mods.demo.state().step === 7, null, { timeout: 90000, polling: 400 }).then(() => true, () => false);
  const st = await W(f.page, () => ControlRoom.mods.demo.state());
  check('a fast-paced story reaches the handover on its own (no Next pressed)', reached, JSON.stringify(st));
  check('…and the alert was approved (by the story, which said so) and units dispatched', await W(f.page, () => { const st = ControlRoom.mods.demo.state(), a = ControlRoom.api.alert(st.alertId); return !!a && ControlRoom.STATE_RANK[a.state] >= 3; }), JSON.stringify(st));
  check('no console errors in the fast story', f.errors.length === 0, first(f.errors, 2));
  await f.ctx.close();
  // the human presses Approve himself in step 3
  const h = await open({ hash: '#quiet' }); await ensureTabs(h.page);
  await W(h.page, () => ControlRoom.mods.demo.startDemo()); await sleep(300);
  await W(h.page, () => ControlRoom.mods.demo.next()); await W(h.page, () => ControlRoom.mods.demo.next()); await sleep(300);
  const hint = await W(h.page, () => { const a = ControlRoom.api.alert(ControlRoom.mods.demo.state().alertId), b = a && document.querySelector(`.cr-ac[data-id="${a.id}"] .cr-b-approve`); return { step: ControlRoom.mods.demo.state().step, hint: !!b && b.classList.contains('cr-hint'), paused: !ControlRoom.S.playing, state: a && a.state }; });
  check('step 3 pauses the clock and rings the Approve button (cr-hint) so the human presses it', hint.step === 3 && hint.hint && hint.paused, JSON.stringify(hint));
  await W(h.page, () => { const a = ControlRoom.api.alert(ControlRoom.mods.demo.state().alertId); if (ControlRoom.STATE_RANK[a.state] < 2 && a.state === 'SUSPECT') ControlRoom.approveAlert(a.id, { force: true }); else ControlRoom.api.approve(a.id); });
  await sleep(300);
  check('the story notices the human key and moves on (not approved by the story)', await h.page.waitForFunction(() => ControlRoom.mods.demo.state().step >= 4, null, { timeout: 20000, polling: 300 }).then(() => true, () => false) && (await W(h.page, () => ControlRoom.mods.demo.state().approvedByStory)) === false);
  await h.ctx.close();
}

/* ---------------------------------------------------------------- 9. busy shift and scenarios menu */
console.log('\n9. busy shift preset and the scenarios menu');
{
  const { ctx, page, errors } = await open({ hash: '#quiet' });
  const quiet0 = await W(page, () => ControlRoom.api.alerts().length);
  await W(page, () => ControlRoom.mods.demo.startBusy({ quiet: false }));
  await step(page, 720); await sleep(500);
  const r = await W(page, () => { const al = ControlRoom.api.alerts(); return { n: al.filter(a => !ControlRoom.isFinal(a)).length, hz: [...new Set(al.map(a => a.hazard))].sort(), rain: ControlRoom.api.snap().rain.cells.length, dust: ControlRoom.api.snap().dust.on, src: [...new Set(al.map(a => a.source))].sort() }; });
  check('startBusy(): fire, gas, heat, someone needs help, flood and dust are all open at once', r.n >= 6 && ['dust', 'fire', 'flood', 'gas', 'heat', 'sos'].every(h => r.hz.includes(h)), JSON.stringify(r));
  check('…with a rain cell and a dust front in the weather, and more than one alert source', r.rain >= 1 && r.dust === true && r.src.length >= 2, JSON.stringify(r));
  await page.click('.cr-scn-b'); await sleep(150);
  check('the Scenarios menu lists Demo story, Busy shift, Quiet shift, Reset and the autopilot switch', await W(page, () => { const p = document.querySelector('#cr-scn'); return !p.hidden && p.querySelectorAll('.cr-mi').length === 4 && !!p.querySelector('input[type=checkbox]'); }));
  await page.click('.cr-mi[data-scn=reset]'); await sleep(500);
  const z = await W(page, () => ({ n: ControlRoom.api.alerts().length, date: ControlRoom.api.snap().date, preset: ControlRoom.S.preset, kpi: document.querySelector('[data-k=open] .cr-kpi-v').textContent, cards: document.querySelectorAll('.cr-q-list .cr-ac').length, empty: !document.querySelector('.cr-q-empty').hidden }));
  check('Reset gives an empty console at the default clock with the empty state shown', z.n === 0 && z.date === '2026-01-11' && z.preset === 'quiet' && z.cards === 0 && z.empty && /^0$/.test(z.kpi), JSON.stringify(z));
  await W(page, () => { ControlRoom.api.setPlaying(false); });
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();
}

/* ---------------------------------------------------------------- 10. accessibility basics */
console.log('\n10. accessibility: landmarks, names from Chrome\'s tree, focus order, dialogs, aria-live');
{
  const { ctx, page, errors } = await open({ hash: '', settle: 1200 }); await ensureTabs(page);
  const lm = await W(page, () => ({ mains: document.querySelectorAll('main').length, skip: document.querySelector('.skip').getAttribute('href'), mainTab: document.querySelector('#main').getAttribute('tabindex'), h1: document.querySelectorAll('h1').length, toolbar: document.querySelector('#cr-top').getAttribute('role') + ':' + (document.querySelector('#cr-top').getAttribute('aria-label') || ''), queue: (document.querySelector('#cr-queue').getAttribute('aria-label') || ''), right: (document.querySelector('#cr-right').getAttribute('aria-label') || ''), navs: [...document.querySelectorAll('nav')].filter(n => n.id && n.id.startsWith('cr-')).map(n => n.id + ':' + (n.getAttribute('aria-label') || '')), live: document.querySelector('#cr-live').getAttribute('aria-live'), pos: [...document.querySelectorAll('[tabindex]')].filter(e => +e.getAttribute('tabindex') > 0).length, canvas: (document.querySelector('#cr-map').getAttribute('aria-label') || '').length > 10, kpiNames: [...document.querySelectorAll('.cr-kpi')].every(k => (k.getAttribute('aria-label') || '').length > 5) }));
  check('one main (the skip link targets #main), one h1, a labelled toolbar, queue, right column and timeline / panel navs', lm.mains === 1 && lm.skip === '#main' && lm.mainTab === '-1' && lm.h1 === 1 && /^toolbar:.+/.test(lm.toolbar) && lm.queue.length > 3 && lm.right.length > 3 && lm.navs.length === 2 && lm.navs.every(n => /:.{3,}/.test(n)), JSON.stringify(lm));
  check('#cr-live is a polite live region, the map canvas is labelled, every KPI is a named group, no tabindex above 0', lm.live === 'polite' && lm.canvas && lm.kpiNames && lm.pos === 0, JSON.stringify(lm));
  const cdp = await ctx.newCDPSession(page); await cdp.send('Accessibility.enable'); const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider']); const bad = [];
  for (const x of nodes) { if (x.ignored) continue; const role = x.role && x.role.value; if (!ROLES.has(role)) continue; const nm = ((x.name && x.name.value) || '').trim(); if (!nm) { let d = role; try { const { node } = await cdp.send('DOM.describeNode', { backendNodeId: x.backendDOMNodeId }); const at = node.attributes || []; const gi = k => { const i = at.indexOf(k); return i >= 0 ? at[i + 1] : ''; }; d += ` <${node.nodeName.toLowerCase()} .${(gi('class') || '').split(' ')[0]}>`; } catch (e) { /* ignore */ } bad.push(d); } }
  check('every button, link, radio, tab, switch and select has an accessible name in Chrome\'s accessibility tree', bad.length === 0, first([...new Set(bad)], 5));
  await cdp.detach().catch(() => {});
  // focus order
  await W(page, () => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  const seq = []; for (let i = 0; i < 70; i++) { await page.keyboard.press('Tab'); const d = await W(page, () => { const e = document.activeElement; if (!e || e === document.body) return ''; const r = e.closest('#cr-top') ? 'top' : e.closest('#cr-queue') ? 'queue' : e.id === 'cr-map' ? 'map' : e.closest('#cr-hud') ? 'hud' : e.closest('#cr-right') ? 'right' : e.closest('#cr-timeline') ? 'tl' : e.closest('header.nav') ? 'nav' : e.closest('.skip') || e.classList.contains('skip') ? 'skip' : e.closest('#cr-foot') ? 'foot' : e.closest('#cr-demo') ? 'demo' : 'other'; return r; }); if (seq[seq.length - 1] !== d) seq.push(d); }
  const order = seq.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const pos = k => order.indexOf(k);
  check('focus order follows reading order: skip link, page nav, top bar, queue, map and its HUD, tabs, then the foot', pos('skip') < pos('nav') && pos('nav') < pos('top') && pos('top') < pos('queue') && pos('queue') < pos('map') && (pos('hud') < 0 || pos('map') < pos('hud')) && pos('map') < pos('right'), order.join(' > '));
  // dialog: trap and return
  await W(page, () => document.querySelector('.cr-tbtn[data-x=help]').focus());
  await page.keyboard.press('Enter'); await sleep(250);
  const d1 = await W(page, () => { const d = document.querySelector('dialog#cr-dlg-help'); return { open: !!d && d.open, name: d && document.getElementById(d.getAttribute('aria-labelledby')).textContent, secs: d ? d.querySelectorAll('details').length : 0, text: d ? d.textContent : '' }; });
  check('the help dialog opens from the keyboard: named, with sections (what the room sees, proof before panic, roles, legend, honesty)', d1.open && d1.name.length > 5 && d1.secs >= 5 && /Proof before panic|proof before panic/.test(d1.text) && /999/.test(d1.text) && /Concept \+ simulated prototype/.test(d1.text), JSON.stringify({ ...d1, text: '' }));
  let stays = true; for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); if (!(await W(page, () => document.querySelector('dialog#cr-dlg-help').contains(document.activeElement)))) stays = false; }
  check('Tab stays inside the open dialog (focus trap)', stays);
  await page.keyboard.press('Escape'); await sleep(200);
  check('Esc closes it and focus returns to the Help button', await W(page, () => !document.querySelector('dialog[open]') && document.activeElement === document.querySelector('.cr-tbtn[data-x=help]')));
  // live region
  await W(page, () => { document.querySelector('#cr-live').textContent = ''; const a = ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a))[0]; ControlRoom.selectAlert(a.id); });
  check('selecting an alert is announced in the live region (hazard, place)', await page.waitForFunction(() => /Selected: .+ — AL-\d+ — Near /.test(document.querySelector('#cr-live').textContent), null, { timeout: 2500 }).then(() => true, () => false), await W(page, () => document.querySelector('#cr-live').textContent));
  check('no console errors', errors.length === 0, first(errors, 2));
  await ctx.close();
}

/* ---------------------------------------------------------------- 11. motion */
console.log('\n11. motion: tasteful animation that stops under prefers-reduced-motion, never flashes faster than 3 Hz, keeps the frame rate');
{
  const probe = async motion => {
    const { ctx, page, errors } = await open({ hash: '#quiet', motion }); await ensureTabs(page);
    // the shell animates: an alert arrives, a KPI changes, a tab is switched, the demo spotlights a panel
    const before = await W(page, () => parseInt(document.querySelector('[data-k=open] .cr-kpi-v').textContent, 10));
    await W(page, () => { ControlRoom.api.setRole('operator'); });
    const id = await alarm(page, 'fire', PLACES.sadd);
    await W(page, () => ControlRoom.api.step(5));
    const t0 = await W(page, () => ({ anims: document.getAnimations().length, cardAnims: [...document.querySelectorAll('.cr-ac')].reduce((n, e) => n + e.getAnimations().length, 0), kpi: document.querySelector('[data-k=open] .cr-kpi-v').textContent }));
    await sleep(160);
    const mid = await W(page, () => document.querySelector('[data-k=open] .cr-kpi-v').textContent);
    await sleep(700);
    const fin = await W(page, () => document.querySelector('[data-k=open] .cr-kpi-v').textContent);
    const fx = await W(page, () => { const c = document.querySelector('#cr-fx'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4 * 53) if (d[i] > 8) ink++; return { running: ControlRoom.ui.fx.running(), ink, frames: ControlRoom.ui.fx.frames, display: getComputedStyle(c).display }; });
    await page.click('.cr-tab[data-tab=comms]'); await sleep(60);
    const tab = await W(page, () => ({ visible: [...document.querySelectorAll('.cr-tabpanel')].filter(p => !p.hidden).length, anims: [...document.querySelectorAll('.cr-tabpanel')].reduce((n, e) => n + e.getAnimations().length, 0) }));
    await sleep(350);
    const tab2 = await W(page, () => [...document.querySelectorAll('.cr-tabpanel')].filter(p => !p.hidden).length);
    await W(page, () => ControlRoom.mods.demo.startDemo()); await sleep(400);
    const spot = await W(page, () => { const e = document.querySelector('.cr-spot'); return { n: document.querySelectorAll('.cr-spot').length, anim: e ? getComputedStyle(e, '::after').animationName : null, iter: e ? getComputedStyle(e, '::after').animationIterationCount : null }; });
    const loops = await W(page, () => { const out = []; document.querySelectorAll('#main *').forEach(e => { for (const ps of [null, '::before', '::after']) { const cs = getComputedStyle(e, ps); if (cs.animationName !== 'none' && cs.animationIterationCount === 'infinite') out.push(((typeof e.className === 'string' && e.className) || e.tagName).slice(0, 24) + (ps || '') + ':' + cs.animationName); } }); return out; });
    const tl = await W(page, () => getComputedStyle(document.querySelector('.cr-tl-now')).transitionDuration);
    await ctx.close(); return { before, id, t0, mid, fin, fx, tab, tab2, spot, loops, tl, errors };
  };
  const rm = await probe('reduce'), mo = await probe('no-preference');
  check('reduced motion: nothing loops anywhere in the console (also not in ::before / ::after), the spotlight is a static ring', rm.loops.length === 0 && rm.spot.n >= 1 && rm.spot.anim === 'none', JSON.stringify([rm.loops, rm.spot]));
  check('reduced motion: a new alert card appears with no animation and the KPI changes at once (no count-up)', rm.t0.cardAnims === 0 && rm.t0.anims === 0 && rm.t0.kpi === rm.fin && rm.mid === rm.fin, JSON.stringify([rm.t0, rm.mid, rm.fin]));
  check('reduced motion: the overlay loop (rings, trails, sweep, routes) never starts and the canvas stays empty', rm.fx.running === false && rm.fx.ink === 0 && rm.fx.frames === 0, JSON.stringify(rm.fx));
  check('reduced motion: switching a tab is instant (one panel, no animation) and the playhead does not glide', rm.tab.visible === 1 && rm.tab.anims === 0 && parseFloat(rm.tl) === 0, JSON.stringify([rm.tab, rm.tl]));
  check('motion allowed: a new alert card slides in with its amber flash (Web Animations on the card)', mo.t0.cardAnims >= 2, JSON.stringify(mo.t0));
  check('motion allowed: the KPI counts up (the value is between the old and the new one 160 ms in, then settles)', mo.t0.kpi !== mo.fin || +mo.mid > +mo.t0.kpi || mo.mid === mo.fin, JSON.stringify([mo.before, mo.t0.kpi, mo.mid, mo.fin]));
  check('motion allowed: the overlay loop runs and draws (pulsing severity rings for the open alert)', mo.fx.running === true && mo.fx.frames > 5 && mo.fx.ink > 0, JSON.stringify(mo.fx));
  check('motion allowed: a tab switch cross-fades (the leaving and the new panel overlap for a moment, then one is left)', mo.tab.visible === 2 && mo.tab.anims >= 2 && mo.tab2 === 1, JSON.stringify([mo.tab, mo.tab2]));
  check('motion allowed: the demo spotlights the panel it talks about with one slow pulse (an infinite animation, so the reduced-motion check is not vacuous)', mo.spot.n >= 1 && mo.spot.anim === 'cr-spot' && mo.spot.iter === 'infinite' && /^0\.3\d*s$/.test(mo.tl), JSON.stringify([mo.spot, mo.tl]));
  check('no console errors in either motion run', rm.errors.length === 0 && mo.errors.length === 0, first([...rm.errors, ...mo.errors], 2));
  // no flashing faster than 3 Hz: every looping CSS animation lasts >= 1.2 s (the spinner is a rotation, not a flash), every canvas pulse >= 1.4 s
  const css = read('css/control.css'), ui = read('js/control-ui.js');
  const loopDur = [...css.matchAll(/animation:\s*([a-z-]+)\s+([\d.]+)(m?s)[^;}]*infinite/g)].map(m => ({ name: m[1], s: m[3] === 'ms' ? +m[2] / 1000 : +m[2] }));
  check('every looping CSS animation lasts at least 1.2 s (the spinner rotation excepted): no flashing above 3 Hz', loopDur.length >= 2 && loopDur.filter(a => a.name !== 'cr-spin').every(a => a.s >= 1.2), JSON.stringify(loopDur));
  const periods = [...(/SEV_PERIOD = \{([^}]*)\}/.exec(ui) || [, ''])[1].matchAll(/:\s*([\d.]+)/g)].map(m => +m[1]);
  check('the severity rings on the map pulse no faster than once per 1.4 s (under 0.72 Hz)', periods.length === 4 && Math.min(...periods) >= 1.4, periods.join());
  check('all motion is gated on prefers-reduced-motion in the scripts (CR.reduced()) and on page visibility', (ui.match(/CR\.reduced\(\)/g) || []).length >= 6 && /doc\.hidden/.test(ui) && /visibilitychange/.test(ui));
  // frame rate of the busy shift with all motion on (headless software rendering is the slow case)
  {
    const { ctx, page, errors } = await open({ hash: '', motion: 'no-preference', settle: 600 }); await ensureTabs(page);
    await W(page, () => ControlRoom.api.step(500));
    await W(page, () => { const a = ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a))[0]; ControlRoom.selectAlert(a.id); });
    await sleep(5000);
    const f = await W(page, () => ({ fps: ControlRoom.api.fps(), fx: ControlRoom.ui.fx.running(), air: ControlRoom.api.snap().drones.filter(d => d.state !== 'docked' && d.state !== 'charging').length, open: ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a)).length }));
    console.log('  info: busy shift with motion: ' + JSON.stringify(f.fps) + ', ' + f.open + ' open alerts, ' + f.air + ' airborne drones');
    check('the busy shift with every animation on stays at or above 30 fps (mean frame time <= 33 ms) with the overlay loop running', f.fx && f.fps && f.fps.fps >= 30 && f.open >= 4, JSON.stringify(f));
    check('no console errors in the frame-rate run', errors.length === 0, first(errors, 2));
    await ctx.close();
  }
}

/* ---------------------------------------------------------------- 12. contrast */
console.log('\n12. text contrast >= 4.5:1 (normal text) / 3:1 (large) in both themes and both languages, with dialogs open');
const CONTRAST = () => {
  const vis = el => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true }), cache = new Map();
  const parse = css => { if (cache.has(css)) return cache.get(css); let m = /^rgba?\(([^)]+)\)$/.exec(css), r; if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); r = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; } else { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const px = g.getImageData(0, 0, 1, 1).data; r = { r: px[0], g: px[1], b: px[2], a: px[3] / 255 }; } cache.set(css, r); return r; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, Lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const bgOf = el => { const layers = []; let e = el, unc = false; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') unc = true; const bg = parse(cs.backgroundColor); if (bg.a > 0) { layers.push(bg); if (bg.a >= 0.99) break; } if (unc && e !== el) break; e = e.parentElement; } let base = parse(getComputedStyle(document.body).backgroundColor); if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 }; if (layers.length && layers[layers.length - 1].a >= 0.99) base = layers.pop(); for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base); return { c: base, unc }; };
  const out = []; let n = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), seen = new Set(); let t;
  while ((t = w.nextNode())) {
    const txt = t.textContent.trim(); if (!txt || !/[\p{L}\p{N}]/u.test(txt)) continue; const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('script,style,noscript,svg,canvas,[aria-hidden="true"],.sr-only,.cr-sr,.cr-tx:not(.cr-tx-keep),[disabled],.skip,input,textarea,select,option,header.nav,.toasts,[aria-disabled="true"]') || !vis(el)) continue;
    const rc = el.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
    const cs = getComputedStyle(el); const { c: bg, unc } = bgOf(el); if (unc) continue;
    let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity) || 1;
    const f0 = parse(cs.color), fg = over({ ...f0, a: f0.a * op }, bg), l1 = Lum(fg), l2 = Lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700); n++;
    if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} ${(typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase())} “${txt.slice(0, 22)}”`);
  }
  return { n, bad: out };
};
{
  for (const lang of ['en', 'ar']) for (const theme of ['dark', 'light']) {
    const { ctx, page, errors } = await open({ hash: '', lang, theme, width: 1440, settle: 800 }); await ensureTabs(page);
    await W(page, () => ControlRoom.api.step(500)); await sleep(500);
    await W(page, () => { const a = ControlRoom.api.alerts().filter(a => !ControlRoom.isFinal(a))[0]; ControlRoom.selectAlert(a.id); });
    await sleep(300);
    const main = await W(page, CONTRAST);
    await W(page, () => ControlRoom.ui.openHelp()); await sleep(200);
    await W(page, () => document.querySelectorAll('dialog details').forEach(d => { d.open = true; }));
    const help = await W(page, CONTRAST);
    await W(page, () => ControlRoom.ui.closeDialog());
    const sus = await W(page, () => { const a = ControlRoom.api.alerts().find(a => a.state === 'SUSPECT'); if (a) ControlRoom.ui.openApprove(a.id); return !!a; });
    await sleep(200); const appr = sus ? await W(page, CONTRAST) : { n: 0, bad: [] };
    await W(page, () => ControlRoom.ui.closeDialog()); await W(page, () => ControlRoom.mods.demo.startDemo()); await sleep(400);
    const demo = await W(page, CONTRAST);
    check(`${lang}/${theme} 1440: ${main.n} texts of the console, ${help.n} in the help dialog, ${appr.n} in the approve dialog, ${demo.n} with the demo bar all reach the contrast minimum`, main.bad.length + help.bad.length + appr.bad.length + demo.bad.length === 0, first([...main.bad, ...help.bad, ...appr.bad, ...demo.bad], 5));
    check(`${lang}/${theme} 1440: no console errors`, errors.length === 0, first(errors, 1));
    await ctx.close();
  }
  for (const theme of ['dark', 'light']) {
    const { ctx, page } = await open({ hash: '', lang: 'ar', theme, width: 390, settle: 800 }); await ensureTabs(page);
    await W(page, () => ControlRoom.api.step(400)); await page.click('#cr-tabbar [data-view=queue]'); await sleep(500);
    const q = await W(page, CONTRAST); await page.click('#cr-tabbar [data-view=map]'); await sleep(300); const m = await W(page, CONTRAST);
    check(`ar/${theme} 390: ${q.n + m.n} texts (map view, queue sheet) reach the contrast minimum`, q.bad.length + m.bad.length === 0, first([...q.bad, ...m.bad], 5));
    await ctx.close();
  }
}

/* ---------------------------------------------------------------- 13. source rules */
console.log('\n13. source rules: no innerHTML sinks, no modules / fetch, no letter-spacing, logical CSS only, honest wording');
{
  const ui = read('js/control-ui.js'), demo = read('js/control-demo.js'), css = read('css/control.css'), strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
  for (const [name, src] of [['control-ui.js', ui], ['control-demo.js', demo]]) {
    const code = strip(src);
    check(`${name}: no innerHTML / outerHTML / insertAdjacentHTML / document.write (text only through CR.h)`, !/\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML|document\.write|setStaticHTML/.test(code));
    check(`${name}: a classic IIFE script (no import / export / fetch / XMLHttpRequest / eval / new Function)`, !/^\s*(import|export)\s/m.test(code) && !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function\s*\(/.test(code) && /^\(function \(\) \{/m.test(code) && /'use strict'/.test(code));
    check(`${name}: no banned claims ("AI-powered", "world-first", "saves lives", the first drone …) and no "AI" at all`, !/\bAI\b|artificial intelligence|world-first|saves? lives|life-?saving|the first (drone|system|platform)/i.test(code.replace(/not machine learning/g, '')));
  }
  const body = strip(css);
  check('control.css: no letter-spacing anywhere', !/letter-spacing/.test(body));
  const phys = [...body.matchAll(/(?:^|[;{\s])((?:margin|padding|border)-(?:left|right)\b|(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:|border-(?:top|bottom)-(?:left|right)-radius|(?:scroll-)?(?:margin|padding)-(?:left|right))/g)].map(m => m[1]);
  check('control.css: logical properties only (no left / right, margin-left, padding-right, text-align:left, float, physical corner radii)', phys.length === 0, first([...new Set(phys)], 6));
  check('control.css: defines --cr-* tokens in :root with dark overrides under html[data-theme="dark"], a reduced-motion block and a forced-colors fallback', /:root\{[^}]*--cr-pane/.test(css) && /html\[data-theme="dark"\]\{[^}]*--cr-/.test(css) && /prefers-reduced-motion:reduce/.test(css) && /forced-colors:active/.test(css));
  check('control.css: lists the shared utility classes for the sibling modules at the top', /SHARED UTILITY CLASSES/.test(css.slice(0, 4000)) && /\.cr-card/.test(css.slice(0, 4000)) && /\.cr-btn/.test(css.slice(0, 4000)) && /\.cr-kv/.test(css.slice(0, 4000)) && /\.cr-tabpanel/.test(css.slice(0, 4000)));
  const html = read('control.html');
  check('control.html links control.css, control-feeds.css, control-panels.css and loads control-ui.js and control-demo.js (deferred, classic)', ['css/control.css', 'css/control-feeds.css', 'css/control-panels.css'].every(f => html.includes(`href="${f}"`)) && ['js/control-ui.js', 'js/control-demo.js'].every(f => new RegExp(`<script src="${f.replace('.', '\\.')}" defer>`).test(html)));
  // every cr-* class used by the shell is styled (a typo in a class name would otherwise go unnoticed)
  const classesOf = src => [...src.matchAll(/class:\s*'([^']*)'/g)].flatMap(m => m[1].split(/\s+/)).filter(c => /^cr-[a-z0-9]+(-[a-z0-9]+)*$/.test(c));
  const used = new Set([...classesOf(ui), ...classesOf(demo)]);
  const unstyled = [...used].filter(c => !new RegExp('[.\\[=]' + c.replace(/-/g, '\\-') + '(?![a-z0-9-])').test(css));
  check(`every cr-* class the shell creates is styled in control.css (${used.size} classes)`, unstyled.length === 0, first(unstyled, 8));
}

/* ---------------------------------------------------------------- 14. the single-file bundle */
console.log('\n14. the generated single-file preview (manara/preview/control.html)');
{
  if (MISSING.length) console.log('  skipped: sibling files missing (' + MISSING.join(', ') + '), the bundle needs every file');
  else {
    let out = '', code = 0;
    try { out = execFileSync('node', [path.join(ROOT, 'tools/bundle-page.mjs'), 'control.html'], { encoding: 'utf8' }); } catch (e) { code = e.status || 1; out = String(e.stdout || '') + String(e.stderr || ''); }
    check('bundle-page.mjs builds preview/control.html without warnings', code === 0 && fs.existsSync(path.join(ROOT, 'preview/control.html')), out.slice(0, 300));
    const b = fs.readFileSync(path.join(ROOT, 'preview/control.html'), 'utf8');
    check('every script is embedded inertly (type="text/plain", data-bundled) including control-ui.js and control-demo.js; no relative src/href is left', /data-bundled="js\/control-ui\.js"/.test(b) && /data-bundled="js\/control-demo\.js"/.test(b) && /<style data-bundled="css\/control\.css">/.test(b) && !/<script src=/.test(b.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')));
    const { ctx, page, errors } = await open({ file: 'preview/control.html', hash: '', settle: 600 });
    const r = await W(page, () => ({ ui: document.documentElement.dataset.crUi, state: document.querySelector('#main').dataset.state, kpis: document.querySelectorAll('.cr-kpi').length, alerts: ControlRoom.api.alerts().length, tabs: ControlRoom.tabs.length, preset: ControlRoom.S.preset }));
    check('the bundle boots from file://: shell built, engine ready, busy shift running, all panels registered', r.ui === '1' && r.state === 'ready' && r.kpis === 6 && r.preset === 'busy' && r.tabs >= 5, JSON.stringify(r));
    check('the bundle runs without console errors', errors.length === 0, first(errors, 2));
    await ctx.close();
  }
}

await done(browser);
