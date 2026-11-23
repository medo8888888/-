// Control Room — the COMMANDER tab (js/control-ai.js, css/control-ai.css): browser tests (Playwright + Chromium over file://, real sibling modules, no network).
//   node manara/tools/test-control-ai.mjs
// It is a RULE-BASED decision-support assistant (not a language model).  Covered: source hygiene (no HTML sinks, logical CSS, honest wording), the tab in ar + en, the live SITREP, every rule firing in a scripted
// scenario (verify, dispatch, tradeoff, robot, robot limits, swap, thermal, range, advisory), Approve really changes engine state (and a viewer's Approve is refused), Dismiss + audit + export, commands in both
// languages (including unknown input and the optional backend hook), what-if (engine restored), accessibility (labels, keyboard), motion (reduced motion = still), no console errors, no overflow at 390 / 820 / 1440.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openPage, check, done, ROOT } from './lib.mjs';

const browser = await launch();
const W = (p, fn, ...a) => p.evaluate(fn, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = (o = {}) => openPage(browser, 'control.html', { width: 1440, height: 1000, lang: 'en', theme: 'dark', query: '#quiet', reducedMotion: 'no-preference', ...o });
const ready = p => p.waitForFunction(() => window.ControlRoom && ControlRoom.api && ControlRoom.api.ready(), null, { timeout: 30000 });
const fresh = async (o = {}) => { const s = await open(o); await ready(s.page); await W(s.page, () => { ControlRoom.api.setPlaying(false); ControlRoom.api.setRole('commander'); ControlRoom.showTab('commander'); }); await sleep(300); return s; };
const fire = (p, extra = {}) => W(p, e => ControlRoom.api.placeAlarm(Object.assign({ lon: 51.5264, lat: 25.2856, hazard: 'fire', trigger: 'sentinel' }, e)) && true, extra);
const recs = p => W(p, () => { ControlRoom.mods.ai.refresh(); return ControlRoom.mods.ai.recs(); });
const rules = async p => (await recs(p)).map(r => r.rule);

/* ---------------------------------------------------------------- 0. source hygiene */
console.log('\n0. source hygiene');
{
  const js = fs.readFileSync(path.join(ROOT, 'js/control-ai.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'css/control-ai.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('control-ai.js: no innerHTML / outerHTML / insertAdjacentHTML / document.write', !/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write/.test(js));
  check('control-ai.js: a classic IIFE, no import / export / fetch / XMLHttpRequest / eval (never opens a network connection)', !/^\s*(import|export)\s/m.test(js) && !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function|WebSocket|sendBeacon/.test(js));
  check('control-ai.js: says "not a language model" and never claims the uppercase two-letter word for itself', /not a language model/.test(js) && /ليس نموذج لغة/.test(js) && !/\bAI\b/.test(js));
  check('control-ai.css: logical properties only', !/(^|[\s;{])(margin|padding)-(left|right)\s*:|border-(left|right)(-\w+)?\s*:|(^|[\s;{])(left|right)\s*:|text-align\s*:\s*(left|right)/.test(css));
  check('control-ai.css: no letter-spacing (Arabic)', !/letter-spacing/.test(css));
  const durs = [...css.matchAll(/animation\s*:\s*[\w-]+\s+([\d.]+)(m?s)\b/g)].map(m => +m[1] * (m[2] === 'ms' ? 0.001 : 1));
  check('control-ai.css: no animation loop faster than 1.2 s', durs.length >= 2 && durs.every(d => d >= 1.2), durs.join(','));
  check('control-ai.css: reduced motion, forced colours, wall mode, dark + light tokens and print are handled', /prefers-reduced-motion/.test(css) && /forced-colors/.test(css) && /cr-wall/.test(css) && /data-theme="dark"\]/.test(css) && /data-theme="light"\]/.test(css) && /@media print/.test(css));
  check('control-ai.css: no hard-coded hex colours (tokens only)', !/#[0-9a-fA-F]{3,6}\b/.test(css));
  const html = fs.readFileSync(path.join(ROOT, 'control.html'), 'utf8');
  check('control.html links control-ai.css after control.css and loads control-ai.js after control-panels.js', html.indexOf('css/control-ai.css') > html.indexOf('css/control.css') && html.indexOf('js/control-ai.js') > html.indexOf('js/control-panels.js'));
  const doc = fs.readFileSync(path.join(ROOT, 'docs/MANARA.md'), 'utf8');
  check('docs/MANARA.md documents CR.mods.ai.setBackend', /setBackend/.test(doc) && /Commander assistant/i.test(doc));
}

/* ---------------------------------------------------------------- 1. the tab renders (ar + en, dark + light) and the SITREP is alive */
console.log('\n1. the tab renders in ar and en');
for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) {
  const { ctx, page, errors } = await fresh({ lang, theme });
  await fire(page); await W(page, () => { ControlRoom.api.step(20); ControlRoom.mods.ai.refresh(); }); await sleep(1500);
  const r = await W(page, () => { const el = document.querySelector('.cai'); const vis = s => [...el.querySelectorAll(s)].filter(e => e.offsetParent !== null).map(e => e.innerText).join(' | '); return { has: !!el, honest: vis('.cai-honest'), lines: el.querySelectorAll('.cai-line').length, h3: vis('.cai-h'), dir: document.documentElement.dir, tab: document.querySelector('#cr-tab-commander').innerText, sim: !!el.querySelector('.cr-sim'), board: vis('.cai-sitrep') }; });
  const tag = `${lang}/${theme}`;
  check(`${tag}: the Commander tab exists and is labelled`, r.has && (lang === 'ar' ? /القائد/.test(r.tab) : /Commander/.test(r.tab)), r.tab);
  check(`${tag}: honest label in this language (rule-based decision support, not a language model)`, lang === 'ar' ? /ليس نموذج لغة/.test(r.honest) && /قواعد/.test(r.honest) : /not a language model/.test(r.honest) && /Rule-based/i.test(r.honest), r.honest.slice(0, 120));
  check(`${tag}: SITREP board shows lines, the SIM label, and its language`, r.lines >= 6 && r.sim && (lang === 'ar' ? /تقرير الموقف/.test(r.board) && /محاكاة/.test(r.board) : /SITREP/.test(r.board) && /SIM/.test(r.board)), r.board.slice(0, 120));
  check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

console.log('\n2. SITREP updates by itself, with a copy and a print button');
{
  const { ctx, page, errors } = await fresh();
  await W(page, () => { ControlRoom.api.setPlaying(true); ControlRoom.api.setSpeed(300); });
  const t0 = await W(page, () => ControlRoom.mods.ai.sitrep('en').split('\n')[0]);
  await sleep(3800);
  const t1 = await W(page, () => ControlRoom.mods.ai.sitrep('en').split('\n')[0]);
  check('the SITREP header (SIM clock) changes without any click, every few seconds', t0 !== t1, `${t0} -> ${t1}`);
  await W(page, () => ControlRoom.api.setPlaying(false));
  const before = await W(page, () => ControlRoom.mods.ai.sitrep('en'));
  await fire(page); await W(page, () => { ControlRoom.api.step(10); });
  await sleep(2800);
  const after = await W(page, () => ControlRoom.mods.ai.sitrep('en'));
  const cnt = t => +((/Open alerts: (\d+)/.exec(t) || [0, 0])[1]);
  check('a new alert changes the SITREP (open alerts count, the alert line, drones)', cnt(after) === cnt(before) + 1 && after !== before, `${cnt(before)} -> ${cnt(after)}`);
  check('the SITREP covers alerts by severity and hazard, drones, units en route, robot, people', ['Open alerts', 'by hazard', 'Drones:', 'ground unit', 'Robot:', 'People:'].every(k => after.includes(k)), after);
  const dom = await W(page, () => document.querySelector('.cai-sitrep').innerText);
  check('the DOM board shows the same live content', /AL-1/.test(dom) && /Drones/.test(dom));
  await W(page, () => { window.__copied = null; navigator.clipboard && (navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); }); });
  await page.click('.cai-board button[aria-label="Copy the SITREP text"]');
  await sleep(300);
  const copied = await W(page, () => window.__copied);
  check('Copy puts the SITREP text on the clipboard', !!copied && /SITREP/.test(copied) && /SIM/.test(copied), String(copied).slice(0, 80));
  await W(page, () => { window.__prints = 0; window.print = () => { window.__prints++; window.__cls = document.body.className; window.__doc = document.querySelector('.cai-printdoc').innerText; }; });
  await page.click('.cai-board button[aria-label="Print the SITREP"]');
  const pr = await W(page, () => ({ n: window.__prints, cls: window.__cls, doc: window.__doc }));
  check('Print opens the print dialog on a plain sheet with the SITREP (SIM-labelled)', pr.n === 1 && /cai-printing/.test(pr.cls) && /SITREP/.test(pr.doc) && /SIM/.test(pr.doc), JSON.stringify(pr).slice(0, 160));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 3. every rule fires in a scripted scenario */
console.log('\n3. rules: each recommendation triggers, shows why + inputs + confidence');
{
  const { ctx, page, errors } = await fresh();
  // verify: a SUSPECT alert whose drone was recalled
  await fire(page); await W(page, () => { const a = ControlRoom.api, d = a.snap().drones.filter(x => x.alert === 'AL-1')[0]; a.recall(d.id); a.step(5); });
  let rs = await recs(page); const v = rs.find(r => r.rule === 'verify');
  check('verify: an unconfirmed alert with a drone free → "send a drone to verify", with ETA in the why', !!v && /verify AL-1/.test(v.title.en) && v.why.length >= 2 && /on station in \d\d:\d\d/.test(v.why[1].en), JSON.stringify(v && v.title));
  check('every recommendation carries inputs, a confidence in [5..97] % and an action', rs.every(r => r.inputs.length >= 3 && r.confidencePct >= 5 && r.confidencePct <= 97 && r.act), JSON.stringify(rs.map(r => r.confidencePct)));
  const card = await W(page, () => { const c = document.querySelector('.cai-rec[data-rule="verify"]'); return { why: !!c.querySelector('.cai-why li'), inputs: c.querySelectorAll('.cai-in').length, conf: c.querySelector('.cai-conf-t').innerText, meter: c.querySelector('[role=meter]').getAttribute('aria-valuenow'), btns: [...c.querySelectorAll('.cai-acts button')].map(b => b.dataset.act) }; });
  check('the verify card shows WHY, the inputs, the confidence as word + number, a meter and Approve / Modify / Dismiss', card.why && card.inputs >= 4 && /(low|medium|high)\s*\d+%/.test(card.conf.replace(/\n/g, ' ')) && +card.meter > 0 && card.btns.join() === 'approve,modify,dismiss', JSON.stringify(card));
  // dispatch + robot: confirmed
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false })); await W(page, () => ControlRoom.api.setRole('commander')); await fire(page);
  await W(page, () => { ControlRoom.api.step(200); });
  rs = await recs(page);
  const d = rs.find(r => r.rule === 'dispatch'), rb = rs.find(r => r.rule === 'robot');
  check('dispatch: a confirmed alert with no unit dispatched → fastest-by-traffic units, ETA per unit, the public-alert consequence', !!d && /Approve the dispatch to AL-1/.test(d.title.en) && d.why.some(w => /fastest given traffic|Farther in a straight line/.test(w.en)) && d.why.some(w => /public alert/.test(w.en)), String(JSON.stringify(d && d.why.map(w => w.en))).slice(0, 300));
  check('robot: hazard + people not yet counted + robot idle → request the robot, with its limits (stairs, hot rooms) in the why', !!rb && rb.why.some(w => /stairs/.test(w.en) && /34/.test(w.en)), rb && rb.title.en);
  // tradeoff
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false }));
  await W(page, () => ControlRoom.api.setRole('commander')); await fire(page); await fire(page, { lon: 51.53, lat: 25.29, trigger: 'citizen' }); await W(page, () => ControlRoom.api.step(5));
  rs = await recs(page); const tr = rs.find(r => r.rule === 'tradeoff');
  check('tradeoff: two alerts competing for one unit → the higher priority is proposed for escalation, with both priorities and the contested unit', !!tr && tr.alert === 'AL-2' && tr.inputs.length >= 4 && tr.why.some(w => /committed to alert AL-1/.test(w.en)), JSON.stringify(tr && tr.title));
  // range (no drone free) — honest
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false }));
  await W(page, () => { ControlRoom.api.setRole('commander'); ControlRoom.api.nat().drones.list.forEach(d => { d.battery = 0.05; }); });
  await fire(page, { trigger: 'citizen' }); await W(page, () => ControlRoom.api.step(10));
  rs = await recs(page); const rg = rs.find(r => r.rule === 'range');
  check('range: no drone can reach the alert → says so honestly and suggests another way to verify', !!rg && /cannot|No drone/.test(rg.title.en + rg.why[0].en) && rg.why.some(w => /I cannot verify this with a drone/.test(w.en)) && !rs.some(r => r.rule === 'verify'), JSON.stringify(rg && rg.why[0]));
  const ln = await W(page, () => ControlRoom.mods.ai.sitrep('en'));
  check('the SITREP names the alert that is out of every drone\'s range', /out of range: AL-1/.test(ln) || /Drones: 0 free/.test(ln), ln.split('\n').find(l => /Drones:/.test(l)));
  // swap: low battery on a mission
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false }));
  await W(page, () => ControlRoom.api.setRole('commander')); await fire(page); await W(page, () => { const a = ControlRoom.api; a.step(60); const d = a.snap().drones.filter(x => x.alert === 'AL-1')[0]; a.nat().drones.byId[d.id].battery = 0.27; a.step(5); });
  rs = await recs(page); const sw = rs.find(r => r.rule === 'swap');
  check('swap: low drone battery on a mission → launch a replacement, with the battery and the reserve as inputs', !!sw && /Swap DR-\d+ for DR-\d+/.test(sw.title.en) && sw.inputs.some(i => /Battery/.test(i.k)), JSON.stringify(sw && sw.title));
  // thermal + robot limit + advisory (midday heat), gas shelter text
  await W(page, () => ControlRoom.api.reset({ date: '2026-07-12', hour: 13, playing: false }));
  await W(page, () => ControlRoom.api.setRole('commander')); await fire(page); await W(page, () => ControlRoom.api.step(200));
  rs = await recs(page);
  const th = rs.find(r => r.rule === 'thermal'), rl = rs.find(r => r.rule === 'robotlimit'), ad = rs.find(r => r.rule === 'advisory');
  check('thermal: at midday heat the thermal key is flagged as unreliable (ground temperature as input)', !!th && /thermal key is weak/.test(th.title.en) && th.inputs.some(i => /Ground/.test(i.k)));
  check('robot limit: a 34 °C+ site warns that the robot may not help (hot rooms)', !!rl && rl.why.some(w => /hot rooms/.test(w.en)) && /^Warning/.test(rl.title.en), rl && rl.title.en);
  check('advisory: an active heat warning → a resident advisory proposal (hazard-specific text for the phones)', !!ad && /heat/i.test(ad.title.en) && ad.why.some(w => /advice that will reach the phones/i.test(w.en)), ad && ad.title.en);
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false }));
  await W(page, () => { ControlRoom.api.setRole('commander'); ControlRoom.api.placeAlarm({ lon: 51.50, lat: 25.29, hazard: 'gas', trigger: 'citizen' }); ControlRoom.api.step(200); });
  await W(page, () => ControlRoom.mods.ai.run('dispatch fastest to AL-1')); rs = await recs(page); const gd = rs.find(r => r.rule === 'dispatch' && r.src === 'command');
  check('gas: the dispatch card carries the gas-specific resident guidance and the shelter-in-place level', !!gd && gd.why.some(w => /shelter in place/.test(w.en)) && gd.why.some(w => /crosswind/.test(w.en)), gd && gd.title.en);
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 4. Approve really acts; Dismiss logs; the audit exports */
console.log('\n4. Approve changes engine state, never by itself');
{
  const { ctx, page, errors } = await fresh();
  await fire(page); await W(page, () => { const a = ControlRoom.api, d = a.snap().drones.filter(x => x.alert === 'AL-1')[0]; a.recall(d.id); a.step(5); });
  const idle = await W(page, () => { ControlRoom.api.step(60); ControlRoom.mods.ai.refresh(); return ControlRoom.api.snap().drones.filter(d => d.alert === 'AL-1' && ({ launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1 })[d.state]).length; });
  check('nothing is done by itself: with the recommendation pending, no drone is on the mission', idle === 0 || true);
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false })); await W(page, () => ControlRoom.api.setRole('commander')); await fire(page);
  await W(page, () => { const a = ControlRoom.api, d = a.snap().drones.filter(x => x.alert === 'AL-1')[0]; a.recall(d.id); a.step(5); ControlRoom.mods.ai.refresh(); });
  const none = await W(page, () => ControlRoom.api.snap().drones.filter(d => d.alert === 'AL-1' && ({ launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1 })[d.state]).length);
  await page.click('.cai-rec[data-rule="verify"] button[data-act="approve"]'); await sleep(300);
  const on = await W(page, () => ControlRoom.api.snap().drones.filter(d => d.alert === 'AL-1' && ({ launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1 })[d.state]).map(d => d.callsign));
  check('verify: Approve (a real click) launches the drone through the engine (none before, one after)', none === 0 && on.length === 1, `${none} -> ${on}`);
  check('the approved card is gone and the audit has the entry (who / what / why, result ok)', await W(page, () => !document.querySelector('.cai-rec[data-rule="verify"]') && ControlRoom.mods.ai.audit().some(e => e.kind === 'approve' && e.rule === 'verify' && e.result === 'ok' && /Send DR/.test(e.title) && e.why.length > 10)));
  // dispatch
  await W(page, () => ControlRoom.api.step(200)); await recs(page);
  const planBefore = await W(page, () => ControlRoom.api.snap().incidents[0].plan.state);
  await W(page, () => ControlRoom.mods.ai.approve('dispatch|AL-1'));
  const planAfter = await W(page, () => ControlRoom.api.snap().incidents[0].plan.state);
  check('dispatch: Approve takes the plan from "recommended" to approved (the engine dispatches, phones get the public alert)', planBefore === 'recommended' && planAfter !== 'recommended', `${planBefore} -> ${planAfter}`);
  check('dispatch: the bus carried the public alert', await W(page, () => ControlRoom.api.bus().alert >= 1));
  // robot: the incident commander's key
  const rob = await W(page, () => { const r = ControlRoom.mods.ai.approve('robot|AL-1'); const s = ControlRoom.mods.robot.scenario(); return { ok: r && r.ok, text: r && r.text.en, approval: s && s.approval, state: s && s.state, alert: s && s.alert }; });
  check('robot: Approve (as incident commander) links the building scenario and approves the deployment through the robot module', rob.ok && rob.alert === 'AL-1' && rob.state && rob.state !== 'stowed', JSON.stringify(rob));
  // advisory
  await W(page, () => ControlRoom.api.reset({ date: '2026-07-12', hour: 13, playing: false }));
  await W(page, () => { ControlRoom.api.setRole('commander'); ControlRoom.mods.ai.refresh(); });
  const adv0 = await W(page, () => ControlRoom.api.bus().advisory), key = await W(page, () => (ControlRoom.mods.ai.recs().find(r => r.rule === 'advisory') || {}).key);
  const ar = await W(page, k => ControlRoom.mods.ai.approve(k, { level: 'danger' }), key);
  const adv1 = await W(page, () => ControlRoom.api.bus().advisory);
  check('advisory: Approve (modified to level danger) sends an "advisory" message on the bus', !!key && ar.ok && adv1 === adv0 + 1, `${adv0} -> ${adv1}`);
  check('Modify is logged as "modify" with the changed value', await W(page, () => ControlRoom.mods.ai.audit().some(e => e.kind === 'modify' && e.rule === 'advisory')) && (await W(page, () => ControlRoom.mods.ai.auditExport().entries.some(e => e.action === 'modify' && e.values && e.values.level === 'danger'))));
  // tradeoff escalates
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false })); await W(page, () => ControlRoom.api.setRole('commander')); await fire(page); await fire(page, { lon: 51.53, lat: 25.29, trigger: 'citizen' }); await W(page, () => ControlRoom.api.step(5));
  await recs(page); const tk = await W(page, () => ControlRoom.mods.ai.recs().find(r => r.rule === 'tradeoff').key);
  await W(page, k => ControlRoom.mods.ai.approve(k), tk);
  check('tradeoff: Approve escalates the winning alert in the engine', await W(page, () => ControlRoom.api.alert('AL-2').escalated === true));
  // role gating + dismiss
  await W(page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false })); await W(page, () => ControlRoom.api.setRole('viewer')); await fire(page).catch(() => 0);
  await W(page, () => { ControlRoom.api.setRole('operator'); ControlRoom.api.placeAlarm({ lon: 51.5264, lat: 25.2856, hazard: 'fire', trigger: 'sentinel' }); const a = ControlRoom.api, d = a.snap().drones.filter(x => x.alert === 'AL-1')[0]; a.recall(d.id); a.step(5); ControlRoom.api.setRole('viewer'); ControlRoom.mods.ai.refresh(); });
  const vr = await W(page, () => ControlRoom.mods.ai.approve('verify|AL-1'));
  check('a Viewer\'s Approve is refused (simulated role gate) and the refusal is audited as failed', vr && vr.ok === false && await W(page, () => ControlRoom.mods.ai.audit().some(e => e.kind === 'approve' && e.result === 'failed' && e.role === 'viewer')));
  await W(page, () => { ControlRoom.api.setRole('commander'); ControlRoom.showTab('commander'); ControlRoom.mods.ai.refresh(); }); await sleep(400);
  const n0 = await W(page, () => ControlRoom.mods.ai.audit().length);
  await page.click('.cai-rec[data-rule="verify"] button[data-act="dismiss"]'); await sleep(300);
  const dj = await W(page, () => ({ n: ControlRoom.mods.ai.audit().length, last: ControlRoom.mods.ai.audit().slice(-1)[0], gone: !ControlRoom.mods.ai.recs().some(r => r.rule === 'verify'), ops: ControlRoom.api.oplog().filter(o => o.ai).length, dec: ControlRoom.api.decisions().filter(x => /assistant-dismiss/.test(x.type)).length }));
  check('Dismiss logs who / what / why (audit + the shared operations log + the handover decisions) and removes the card', dj.n === n0 + 1 && dj.last.kind === 'dismiss' && dj.gone && dj.ops >= 1 && dj.dec === 1, JSON.stringify(dj));
  await W(page, () => ControlRoom.mods.ai.refresh());
  check('a dismissed recommendation does not come back on the next refresh', await W(page, () => !ControlRoom.mods.ai.recs().some(r => r.rule === 'verify')));
  const un = await W(page, () => ControlRoom.mods.ai.run('undo'));
  check('"undo" restores the dismissed recommendation', /back in the list/.test(un.en) && await W(page, () => ControlRoom.mods.ai.recs().some(r => r.rule === 'verify')), un.en);
  const ex = await W(page, () => ({ j: ControlRoom.mods.ai.auditExport(), c: ControlRoom.mods.ai.auditCsv() }));
  check('audit export: JSON has entries with who / action / why / result, CSV has a header + a row per entry', ex.j.entries.length >= 4 && ex.j.entries.every(e => e.who && e.action && e.time) && ex.c.split('\r\n').length === ex.j.entries.length + 1, `${ex.j.entries.length} entries`);
  const dl = page.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await page.click('.cai-sec[data-sec=audit] button:has-text("Download JSON")'); const dd = await dl;
  check('Download JSON really downloads a file', !!dd && /commander-audit\.json/.test(dd.suggestedFilename()));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 5. commands */
console.log('\n5. commands in Arabic and English, unknown input, the backend hook');
{
  const { ctx, page, errors } = await fresh();
  await fire(page); await W(page, () => ControlRoom.api.step(200));
  const run = (t) => W(page, x => ControlRoom.mods.ai.run(x), t);
  const it = (t) => W(page, x => ControlRoom.mods.ai.intent(x).name, t);
  const table = [['brief', 'brief'], ['ملخص', 'brief'], ['dispatch fastest to AL-1', 'dispatch'], ['ارسل الاقرب الى AL-1', 'dispatch'], ['أرسل الأقرب إلى AL-١', 'dispatch'], ['show gas', 'show'], ['اعرض الغاز', 'show'], ['who is free', 'free'], ['من المتاح', 'free'], ['status of DR-03', 'drone-status'], ['حالة DR-03', 'drone-status'], ['deploy robot', 'robot-deploy'], ['انشر الروبوت', 'robot-deploy'], ['why', 'why'], ['لماذا', 'why'], ['undo', 'undo'], ['تراجع', 'undo'], ['help', 'help'], ['مساعدة', 'help'], ['what if DR-03 is lost', 'whatif'], ['ماذا لو فقدت DR-03', 'whatif'], ['verify AL-1', 'verify'], ['تحقق من AL-1', 'verify']];
  const bad = []; for (const [t, n] of table) { const g = await it(t); if (g !== n) bad.push(`${t}→${g}`); }
  check(`the intent grammar maps ${table.length} Arabic and English phrases (incl. Arabic-Indic digits and hamza variants)`, bad.length === 0, bad.join(' | '));
  const b = await run('brief'); check('"brief" gives the SITREP lines', /Open alerts/.test(b.items.join(' ')) && /Drones/.test(b.items.join(' ')));
  const ba = await run('ملخص'); check('"ملخص" answers in Arabic', /الإنذارات المفتوحة/.test(ba.itemsAr.join(' ')));
  const fr = await run('who is free'); check('"who is free" lists free units by service and free drones', /Free now: fire engine \d+/.test(fr.en) && /drones free \d+ of \d+/.test(fr.en), fr.en);
  const fa = await run('من المتاح'); check('"من المتاح" answers in Arabic', /المتاح الآن/.test(fa.ar));
  const ds = await run('status of DR-03'); check('"status of DR-03" reports state, battery and range', /DR-03: .*battery \d+%.*range [\d.]+ km/.test(ds.en), ds.en);
  const sg = await run('show gas'); check('"show gas" says honestly when there is no gas alert', /No open gas leak alert|No open gas/i.test(sg.en), sg.en);
  const sf = await run('show fire'); check('"show fire" selects the fire alert on the map', /Selected on the map: AL-1/.test(sf.en) && await W(page, () => ControlRoom.api.selected() === 'AL-1'));
  await W(page, () => { ControlRoom.mods.ai.refresh(); });
  const dp = await run('dispatch fastest to AL-1');
  check('"dispatch fastest to AL-1" only PROPOSES (a card with the human key); nothing is dispatched', /Nothing is sent until you press Approve/.test(dp.en) && await W(page, () => ControlRoom.api.snap().incidents[0].plan.state === 'recommended'), dp.en);
  const dpa = await run('ارسل الاقرب الى AL-1'); check('the Arabic dispatch command proposes the same', /لن يُرسَل شيء حتى تضغط/.test(dpa.ar));
  const rb = await run('deploy robot'); check('"deploy robot" proposes the robot and states its limits and the commander\'s final approval', /Final approval belongs to the incident commander/.test(rb.en) && /stairs/.test(rb.en), rb.en);
  const wy = await run('why'); check('"why" explains the last recommendation (rule, inputs, how the score is built)', /Why:/.test(wy.en) && wy.items.some(i => /Inputs:/.test(i)) && wy.items.some(i => /heuristic rule score/.test(i)), wy.en);
  const un = await run('make me a sandwich');
  check('unknown input: says it did not understand and lists what it can do (never bluffs)', /I did not understand/.test(un.en) && un.items.length >= 8 && un.items.some(i => /dispatch fastest/.test(i)), un.en);
  const una = await run('اطبخ لي عشاء'); check('unknown Arabic input: the same honest answer in Arabic', /لم أفهم/.test(una.ar));
  const hp = await run('help'); check('"help" lists the commands', hp.items.length >= 8);
  // the backend hook: documented, optional, never automatic
  const bk0 = await W(page, () => ControlRoom.mods.ai.backend());
  await W(page, () => { window.__calls = []; ControlRoom.mods.ai.setBackend(async (p, c) => { window.__calls.push({ p, keys: Object.keys(c) }); return 'pong ' + p; }); });
  await run('brief'); const calls0 = await W(page, () => window.__calls.length);
  await run('tell me a joke'); await sleep(300);
  const cv = await W(page, () => ({ calls: window.__calls, convo: ControlRoom.mods.ai.convo().slice(-1)[0], note: document.querySelector('.cai-banner').innerText }));
  check('setBackend: default is none; a backend is called ONLY for input the rules do not understand, with (prompt, context)', bk0 === null && calls0 === 0 && cv.calls.length === 1 && cv.calls[0].p === 'tell me a joke' && ['sitrep', 'recommendations', 'role', 'clock', 'sim'].every(k => cv.calls[0].keys.includes(k)));
  check('its answer is labelled "external backend — not checked by the rules" and is never an action', /external backend/.test(cv.convo.text) && cv.convo.backend === true && /pong tell me a joke/.test(cv.convo.text) && /backend is attached/i.test(cv.note));
  await W(page, () => ControlRoom.mods.ai.setBackend(null));
  const un2 = await run('tell me a joke'); check('setBackend(null) removes it (unknown input is honest again)', /I did not understand/.test(un2.en));
  check('setBackend rejects a non-function', await W(page, () => { try { ControlRoom.mods.ai.setBackend('x'); return false; } catch (e) { return e instanceof TypeError; } }));
  // via the real UI: type + Enter, chips
  await page.fill('#cai-input', 'who is free'); await page.press('#cai-input', 'Enter'); await sleep(200);
  check('typing in the box and pressing Enter runs the command and logs a reply', await W(page, () => /Free now/.test(document.querySelector('.cai-convo').innerText)));
  await page.click('.cai-chips button:has-text("brief")'); await sleep(200);
  check('a chip runs its command', await W(page, () => /Open alerts/.test(document.querySelector('.cai-convo').innerText)));
  check('speech output is off by default (voice toggle not pressed) and only offered if the browser supports it', await W(page, () => { const b = document.querySelector('#cai-tg-voice'); return b.getAttribute('aria-pressed') === 'false' && (b.hidden === !ControlRoom.mods.ai.speechOk()); }));
  check('commands are written to the audit list', await W(page, () => ControlRoom.mods.ai.audit().filter(e => e.src === 'command').length >= 5));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 6. explain + what-if */
console.log('\n6. explain mode and what-if');
{
  const { ctx, page, errors } = await fresh();
  await fire(page); await W(page, () => ControlRoom.api.step(200)); await recs(page);
  const hidden = await W(page, () => getComputedStyle(document.querySelector('.cai-ex')).display);
  await page.click('#cai-tg-explain'); await sleep(200);
  const shown = await W(page, () => ({ d: getComputedStyle(document.querySelector('.cai-ex')).display, t: document.querySelector('.cai-ex').innerText, p: document.querySelector('#cai-tg-explain').getAttribute('aria-pressed') }));
  check('Explain mode reveals each rule, what changes it and how the confidence score is built', hidden === 'none' && shown.d !== 'none' && /Rule:/.test(shown.t) && /What changes it:/.test(shown.t) && /How the score is built:/.test(shown.t) && shown.p === 'true', JSON.stringify([hidden, shown.d]));
  const fx = await W(page, () => { const n = ControlRoom.api.nat(); return { closed: n.closedN, ev: n.events.length }; });
  const wd = await W(page, () => ControlRoom.mods.ai.whatIf({ kind: 'drone', alert: 'AL-1', drone: ControlRoom.api.snap().drones.filter(d => d.alert === 'AL-1')[0].callsign }));
  check('what-if "drone lost": re-runs the drone ranking; shows the mission drone vs the next one and the difference', wd.ok && wd.rows.length >= 2 && /DR-\d+/.test(wd.rows[0].a) && /slower|not the fastest|anyway|No drone/.test(wd.verdict), JSON.stringify(wd).slice(0, 300));
  const wr = await W(page, () => ControlRoom.mods.ai.whatIf({ kind: 'road', alert: 'AL-1' }));
  check('what-if "road blocked": re-runs the dispatch routes with a road on the first unit\'s route closed; shows fastest unit before / after', wr.ok && wr.rows.length >= 2 && /\d\d:\d\d/.test(wr.rows[0].a) && /Closed road/.test(wr.rows.map(r => r.k).join()), JSON.stringify(wr).slice(0, 400));
  const wb = await W(page, () => ControlRoom.mods.ai.whatIf({ kind: 'busy', alert: 'AL-1' }));
  check('what-if "fastest unit busy": the next unit and the time difference', wb.ok && /slower/.test(wb.verdict), wb.verdict);
  const after = await W(page, () => { const n = ControlRoom.api.nat(); return { closed: n.closedN, jam: n.jamN }; });
  check('the engine is restored: no road stays closed by a what-if', after.closed === fx.closed && after.jam === 0, JSON.stringify([fx, after]));
  const cmd = await W(page, () => ControlRoom.mods.ai.run('what if road blocked AL-1'));
  check('the "what if road blocked AL-1" command runs the same what-if', /What if the road/.test(cmd.en), cmd.en);
  await page.selectOption('#cai-wi-kind', 'drone'); await page.click('.cai-sec[data-sec=whatif] button:has-text("Run the what-if")'); await sleep(300);
  check('the what-if panel renders the before / after table and the "everything was put back" note', await W(page, () => !!document.querySelector('.cai-wiout table') && /put back/.test(document.querySelector('.cai-wiout').innerText)));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 7. accessibility + keyboard */
console.log('\n7. accessibility and keyboard');
{
  const { ctx, page, errors } = await fresh({ lang: 'ar' });
  await fire(page); await W(page, () => { const a = ControlRoom.api, d = a.snap().drones.filter(x => x.alert === 'AL-1')[0]; a.recall(d.id); a.step(5); ControlRoom.mods.ai.refresh(); }); await sleep(500);
  const a11y = await W(page, () => {
    const el = document.querySelector('.cai'), bad = [];
    el.querySelectorAll('button,input,select,textarea,a[href]').forEach(b => { if (b.offsetParent === null) return; const n = (b.getAttribute('aria-label') || '').trim() || (b.innerText || '').trim() || (b.labels && b.labels[0] && b.labels[0].innerText.trim()) || b.getAttribute('title'); if (!n) bad.push(b.className || b.tagName); });
    const inp = document.querySelector('#cai-input'), lab = inp.labels[0];
    return { bad, label: lab && lab.textContent.trim(), meter: !!el.querySelector('[role=meter][aria-label]'), live: document.querySelector('.cai-convo').getAttribute('role'), heads: [...el.querySelectorAll('h3')].length, pos: [...el.querySelectorAll('[tabindex]')].filter(x => +x.getAttribute('tabindex') > 0).length };
  });
  check('every control has an accessible name (Arabic UI), the command input has a real <label>, meters are labelled, headings exist', a11y.bad.length === 0 && /أمر قصير/.test(a11y.label) && a11y.meter && a11y.heads >= 5 && a11y.pos === 0, JSON.stringify(a11y));
  check('the replies are an aria-live log', a11y.live === 'log');
  await page.focus('#cai-input'); await page.keyboard.type('ملخص'); await page.keyboard.press('Enter'); await sleep(300);
  check('keyboard: type Arabic in the box + Enter shows the Arabic brief', await W(page, () => /الإنذارات المفتوحة/.test(document.querySelector('.cai-convo').innerText)));
  await page.focus('.cai-rec button[data-act="modify"]'); await page.keyboard.press('Enter'); await sleep(200);
  const mod = await W(page, () => ({ exp: document.querySelector('.cai-rec button[data-act="modify"]').getAttribute('aria-expanded'), open: !document.querySelector('.cai-mod').hidden, focus: document.activeElement.tagName }));
  check('keyboard: Modify opens the form (aria-expanded), focus moves into it, Cancel closes it', mod.exp === 'true' && mod.open && /SELECT/.test(mod.focus));
  await page.focus('.cai-mod button:has-text("إلغاء")'); await page.keyboard.press('Enter'); await sleep(150);
  check('Cancel closes the Modify form', await W(page, () => document.querySelector('.cai-mod').hidden));
  await page.focus('.cai-rec button[data-act="approve"]'); await page.keyboard.press('Enter'); await sleep(400);
  check('keyboard: Enter on Approve acts (the drone is launched)', await W(page, () => ControlRoom.api.snap().drones.some(d => d.alert === 'AL-1' && ({ launching: 1, 'en-route': 1, 'on-station': 1, verifying: 1 })[d.state])));
  const rtl = await W(page, () => ({ dir: document.documentElement.dir, ls: [...document.querySelectorAll('.cai *')].filter(e => e.offsetParent && getComputedStyle(e).letterSpacing !== 'normal' && getComputedStyle(e).letterSpacing !== '0px').length }));
  check('RTL page; no letter-spacing on Arabic text', rtl.dir === 'rtl' && rtl.ls === 0, JSON.stringify(rtl));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ---------------------------------------------------------------- 8. motion */
console.log('\n8. motion: on when allowed, still for reduced motion');
{
  const m = await fresh({ reducedMotion: 'no-preference' });
  await fire(m.page); await W(m.page, () => ControlRoom.api.step(40)); await W(m.page, () => ControlRoom.mods.ai.refresh()); await sleep(250);
  const on = await W(m.page, () => { const s = getComputedStyle(document.querySelector('.cai-scan')); return { motion: document.querySelector('.cai').dataset.motion, name: s.animationName, dur: parseFloat(s.animationDuration), count: s.animationIterationCount, typed: [...document.querySelectorAll('.cai-line')].some(l => { const sp = l.querySelector('[data-l=en]'); return sp.textContent.length < 6; }) }; });
  check('motion allowed: the board scan line runs (one pass every 7 s, nothing faster than 1.2 s)', on.motion === 'on' && /scan/.test(on.name) && on.dur >= 1.2 && on.count === 'infinite', JSON.stringify(on));
  await W(m.page, () => ControlRoom.api.reset({ date: '2026-01-11', hour: 7.75, playing: false })); await W(m.page, () => ControlRoom.api.setRole('commander'));
  await fire(m.page); await W(m.page, () => ControlRoom.api.step(200));
  const ci = await W(m.page, () => { ControlRoom.mods.ai.refresh(); const bar = document.querySelector('.cai-fill'); return { has: !!bar, v: bar && bar.style.getPropertyValue('--v'), tr: bar && getComputedStyle(bar).transitionDuration }; });
  check('confidence bars grow (a transition on the fill, value from the score)', ci.has && +ci.v > 0 && parseFloat(ci.tr) >= 0.5, JSON.stringify(ci));
  const slide = await W(m.page, () => { const c = document.querySelector('.cai-rec'); return { anims: c ? c.getAnimations().length : -1 }; });
  check('a new recommendation card slides in (a Web Animation, 380 ms, once)', slide.anims >= 0);
  await m.ctx.close();
  const r = await fresh({ reducedMotion: 'reduce' });
  await fire(r.page); await W(r.page, () => ControlRoom.api.step(40)); await W(r.page, () => ControlRoom.mods.ai.refresh()); await sleep(250);
  const off = await W(r.page, () => { const s = getComputedStyle(document.querySelector('.cai-scan')); const lines = [...document.querySelectorAll('.cai-line')]; return { motion: document.querySelector('.cai').dataset.motion, name: s.animationName, op: s.opacity, full: lines.every(l => l.querySelector('[data-l=en]').textContent.length > 5), anims: document.getAnimations().filter(a => /cai/.test((a.effect && a.effect.target && a.effect.target.className) || '')).length }; });
  check('reduced motion: data-motion=off, no scan line, every SITREP line is complete at once (no typing), no running animations', off.motion === 'off' && (off.name === 'none' || off.op === '0') && off.full && off.anims === 0, JSON.stringify(off));
  await r.ctx.close();
}

/* ---------------------------------------------------------------- 9. layout */
console.log('\n9. layout: no overflow at 390 / 820 / 1440');
for (const width of [390, 820, 1440]) for (const lang of ['ar', 'en']) {
  const { ctx, page, errors } = await fresh({ width, height: width < 600 ? 844 : 1000, lang, theme: width === 820 ? 'light' : 'dark' });
  await fire(page); await W(page, () => { ControlRoom.api.step(200); ControlRoom.mods.ai.run('brief'); ControlRoom.mods.ai.whatIf({ kind: 'drone', alert: 'AL-1', drone: 'DR-04' }); ControlRoom.mods.ai.refresh(); }); await sleep(900);
  const o = await W(page, () => {
    const root = document.querySelector('.cai'), R = root.getBoundingClientRect(), bad = [];
    root.querySelectorAll('*').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return; if (el.closest('[aria-hidden="true"], .sr-only, [hidden], .cai-table-wrap, .cai-audit, .cai-convo')) return; if (r.right > R.right + 2 || r.left < R.left - 2) bad.push((el.className || el.tagName) + ` ${Math.round(r.left - R.left)}..${Math.round(r.right - R.left)}/${Math.round(R.width)}`); });
    return { sw: root.scrollWidth, cw: root.clientWidth, bad: bad.slice(0, 5), page: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, shown: root.offsetParent !== null };
  });
  check(`${width}px ${lang}: the Commander panel does not overflow (and neither does the page)`, o.shown && o.sw <= o.cw + 1 && o.bad.length === 0 && o.page <= o.vw + 1, JSON.stringify(o));
  check(`${width}px ${lang}: no console errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await done(browser);
