// Browser test of the tournament board (site/yanabee/tournament.html, js/tournament.js).
//   node tools/yanabee/test-tournament-ui.mjs        (build first: python3 tools/yanabee/build.py)
// Covers: the local demo end to end (12 teams -> groups -> 18 results -> final round -> podium; chess draw -> 12 -> 6 -> 3 -> round
// robin -> final -> podium; overview), tie decisions (draw + manual order, football and chess), forfeits, undo (20 deep), share link
// round trip (read-only snapshot, local state untouched), JSON export/import, print, persistence, blocked storage, the backend modes
// against an in-memory fake Supabase (public + polling + not published, admin publish + conflict flow, non-admin sees no manager
// controls, leader / parent see their team, no chess labels or child names in any payload), 390px, dark theme, keyboard, ARIA,
// console errors and the hosts the page talks to.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const PAGE_URL = 'file://' + path.join(ROOT, 'site/yanabee/tournament.html');
const FAKE = 'https://fake.supabase.test';

let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const section = t => console.log('\n' + t);

// the engine, loaded in node, to compute fixtures and craft states
const Y = (() => { const m = { exports: {} }; new Function('module', fs.readFileSync(path.join(ROOT, 'site/yanabee/js/tournament-engine.js'), 'utf8'))(m); return m.exports; })();
const NAMES = ['الأمل', 'النور', 'الفجر', 'الينابيع', 'البشائر', 'الرواد', 'السلام', 'الوفاء', 'الإبداع', 'العزيمة', 'الصدق', 'الأمانة'];
const TEAMS = NAMES.map((name, i) => ({ id: 't' + (i + 1), name }));
const IDS = TEAMS.map(t => t.id);
const GROUPS = [['t1', 't2', 't3', 't4'], ['t5', 't6', 't7', 't8'], ['t9', 't10', 't11', 't12']];
const base = () => Y.setGroups(Y.setTeams(Y.emptyState(), TEAMS), GROUPS);
const res = (s, a, b, sa, sb) => Y.setResult(s, { a, b, sa, sb });
const strong = (s, ids) => { for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) s = res(s, ids[i], ids[j], 1, 0); return s; };
const groupsDone = s => GROUPS.reduce((acc, g) => strong(acc, g), s);

function chessDone(s) {
  s = Y.setChessPairs(s, 'r1', [['t1', 't2'], ['t3', 't4'], ['t5', 't6'], ['t7', 't8'], ['t9', 't10'], ['t11', 't12']]);
  Y.chess(s).r1.matches.forEach(m => { s = Y.setChessWinner(s, 'r1', m.index, m.a); });
  s = Y.setChessPairs(s, 'r2', [['t1', 't3'], ['t5', 't7'], ['t9', 't11']]);
  Y.chess(s).r2.matches.forEach(m => { s = Y.setChessWinner(s, 'r2', m.index, m.a); });
  s = Y.setChessRR(s, 't1', 't5', 't1'); s = Y.setChessRR(s, 't1', 't9', 't1'); s = Y.setChessRR(s, 't5', 't9', 't5');
  return Y.setChessFinal(s, 't5');
}
const finalDone = s => { const q = Y.football(s).final; q.rounds.forEach(r => r.matches.forEach(m => { s = res(s, m.a, m.b, q.teams.indexOf(m.a) < q.teams.indexOf(m.b) ? 1 : 0, q.teams.indexOf(m.a) < q.teams.indexOf(m.b) ? 0 : 1); })); return s; };
const FULL = chessDone(finalDone(groupsDone(base())));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

/* ------------------------------------------------------------------ fake Supabase (in memory) */
function makeBackend(init = {}) {
  const B = {
    state: init.state || null, at: init.state ? (init.at || '2026-11-09T10:00:00.000001+00:00') : null, n: 1,
    approved: init.approved || [], mine: init.mine || [], children: init.children || [], fail: false,
    log: [], publishes: [], profiles: { 'tok-admin': { id: 'u-admin', role: 'admin', email: 'a@x.test', full_name: 'الإدارة' }, 'tok-leader': { id: 'u-lead', role: 'leader', email: 'l@x.test', full_name: 'قائد' }, 'tok-parent': { id: 'u-par', role: 'parent', email: 'p@x.test', full_name: 'ولي أمر' } }
  };
  B.bump = () => { B.n++; B.at = `2026-11-09T10:00:${String(B.n).padStart(2, '0')}.${String(100000 + B.n * 7).slice(0, 6)}+00:00`; };
  B.set = state => { B.state = state; B.bump(); };
  B.handler = async route => {
    const req = route.request(), url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const auth = (req.headers().authorization || '').replace('Bearer ', '');
    const who = B.profiles[auth] || null;
    let body = null; try { body = req.postDataJSON(); } catch (e) { body = null; }
    B.log.push({ method: req.method(), path: url.pathname, search: url.search, body, who: who && who.id });
    const json = (status, obj) => route.fulfill({ status, headers: cors, body: JSON.stringify(obj) });
    if (B.fail) return json(500, { message: 'boom' });
    const p = url.pathname;
    if (p === '/rest/v1/tournament_state' && req.method() === 'GET') {
      // like PostgREST for `?limit=1` (an array): an empty table is a plain 200 [] — never a 406
      if (!B.state) return json(200, []);
      return json(200, [{ state: B.state, updated_at: B.at }]);
    }
    if (p === '/rest/v1/rpc/publish_state') {
      if (!who || who.role !== 'admin') return json(403, { code: '42501', message: 'permission_denied' });
      B.publishes.push(body);
      const st = JSON.parse(JSON.stringify(body.state));
      if (Array.isArray(st.teams)) st.teams.forEach(t => { delete t.chess; });
      if (B.state === null) {
        if (body.prev !== null) return json(200, { ok: false, conflict: true, updated_at: null });
      } else if (body.prev !== B.at) return json(200, { ok: false, conflict: true, updated_at: B.at });
      B.state = st; B.bump();
      return json(200, { ok: true, conflict: false, updated_at: B.at });
    }
    if (p === '/rest/v1/profiles') return who ? json(200, who) : json(401, { message: 'jwt' });
    if (p === '/rest/v1/teams') return json(200, B.approved);
    if (p === '/rest/v1/rpc/my_team') return json(200, who && who.id === 'u-lead' ? B.mine : []);
    if (p === '/rest/v1/my_children') return json(200, who && who.id === 'u-par' ? B.children : []);
    if (p.startsWith('/auth/v1/')) return json(401, { message: 'no' });
    return json(404, { message: 'unknown ' + p });
  };
  return B;
}

/* ------------------------------------------------------------------ page helpers */
async function open(o = {}) {
  const { viewport = { width: 1280, height: 900 }, backend = null, token = null, state = null, dark = false, blockStorage = false, stubPrint = true, hash = '', ctx: shared = null, ...rest } = o;
  const ctx = shared || await browser.newContext({ viewport, reducedMotion: 'reduce', ...rest });
  const p = await ctx.newPage();
  const errs = [], hosts = new Set();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::|Failed to load resource/.test(m.text() + (m.location() && m.location().url || ''))) errs.push(m.text()); });
  p.on('request', r => { try { const u = new URL(r.url()); if (u.protocol === 'http:' || u.protocol === 'https:') hosts.add(u.host); } catch (e) { /* ignore */ } });
  await p.route('**/fonts.g*/**', r => r.abort());
  if (backend) await p.route(FAKE + '/**', backend.handler);
  await p.addInitScript(({ cfg, token, state, dark, blockStorage, stubPrint }) => {
    try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ }
    if (blockStorage) {
      const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
      Storage.prototype.setItem = boom; Storage.prototype.getItem = boom; Storage.prototype.removeItem = boom;
    } else {
      if (dark) { try { localStorage.setItem('yanabee-theme', 'dark'); } catch (e) { /* ignore */ } }
      if (token) localStorage.setItem('yanabee-session-v1', JSON.stringify({ access_token: token, refresh_token: 'r-' + token, expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'u-' + token, email: 'x@x.test' } }));
      if (state && !sessionStorage.getItem('tn-seeded')) { localStorage.setItem('yanabee-tournament-v1', JSON.stringify({ v: 1, state })); sessionStorage.setItem('tn-seeded', '1'); }
    }
    if (cfg) { const c = { url: 'https://fake.supabase.test', anonKey: 'anon-key-for-tests' }; Object.defineProperty(window, 'YB_CONFIG', { get: () => c, set: () => {}, configurable: true }); }
    if (stubPrint) window.print = () => { window.__printed = (window.__printed || 0) + 1; window.__printClass = document.body.className; };
  }, { cfg: !!backend, token, state, dark, blockStorage, stubPrint });
  await p.goto(PAGE_URL + hash);
  await p.waitForFunction(() => window.__yanabeeTournament && window.__yanabeeTournament.mode() !== 'boot', null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(250);
  return { ctx, p, errs, hosts };
}
const ST = p => p.evaluate(() => window.__yanabeeTournament.state());
const MODE = p => p.evaluate(() => window.__yanabeeTournament.mode());
const tab = async (p, id) => { await p.click('#tn-t-' + id); await p.waitForTimeout(60); };
const txt = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const count = (p, sel) => p.locator(sel).count();
const vis = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const toast = p => p.evaluate(() => [...document.querySelectorAll('.tn-toast')].map(e => e.textContent.replace(/[​\s]+/g, ' ').trim()).join(' | '));
const over = p => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const lsGet = (p, k) => p.evaluate(key => localStorage.getItem(key), k);
const yes = async p => { await p.click('.tn-dlg [data-ok]'); await p.waitForTimeout(80); };
const names = ids => ids.map(id => TEAMS.find(t => t.id === id).name);

async function demoDraw(p) {
  await tab(p, 'setup');
  await p.click('[data-act=demo]');
  await p.click('[data-act=draw-groups]');
  await p.waitForTimeout(80);
}
async function fillFx(p, key, sa, sb, press = true) {
  const f = p.locator(`form.tn-fx[data-key="${key}"]`);
  await f.locator('input[name=sa]').fill(String(sa));
  await f.locator('input[name=sb]').fill(String(sb));
  if (press) await f.locator('input[name=sb]').press('Enter');
}

/* ================================================================== 0. source */
section('source');
{
  const js = fs.readFileSync(path.join(ROOT, 'site/yanabee/js/tournament.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'site/yanabee/css/tournament.css'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'site/yanabee/tournament.html'), 'utf8');
  check('page loads css comp + tournament and the five scripts in order', /css\/comp\.css[\s\S]*css\/tournament\.css/.test(html) && /js\/comp\.js[\s\S]*js\/yb-config\.js[\s\S]*js\/yb-api\.js[\s\S]*js\/tournament-engine\.js[\s\S]*js\/tournament\.js/.test(html));
  check('script never calls fetch / XHR / WebSocket itself (all network goes through YB)', !/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(js));
  check('script has no absolute http(s) URL', !/https?:\/\//.test(js.replace(/\/\/.*$/gm, '')));
  check('no module syntax in the classic script', !/^\s*(import|export)\s/m.test(js));
  check('player labels (team.chess) are only ever deleted, never read or rendered', (js.match(/\bt\.chess\b/g) || []).length === 1 && /delete t\.chess/.test(js));
  check('print rules are light colours and scoped to body.print-tournament', /body\.print-tournament/.test(css) && /@media print/.test(css));
  check('format document section (c-format) is still in the page', /id="c-format"/.test(html) && /يتم تقسيم الـ 12 فرقة إلى 3 مجموعات/.test(html) && /نظام الكأس/.test(html));
  const words = JSON.parse(/<script type="application\/json" id="tn-words">([\s\S]*?)<\/script>/.exec(html)[1]);
  check('document words embedded (tie-break line, lg2 rows, lg10)', /فارق الأهداف، ثم الأهداف المسجلة/.test(words.tiebreak) && words.forfeit.absent[0][1].includes('0 – 3') && words.forfeit.unregistered[0][1].includes('3 – 0') && words.committee.startsWith('تفصل اللجنة'));
}

/* ================================================================== 1. local demo end to end */
section('local demo: mode, tabs, aria');
let LOCAL_STATE = null;
{
  const { ctx, p, errs, hosts } = await open();
  check('mode is local without a backend', (await MODE(p)) === 'local');
  check('badge and the exact local label', (await txt(p, '.tn-badge')) === 'وضع محلي' && (await txt(p, '.tn-stamp')) === 'وضع محلي: يُحفظ على هذا الجهاز فقط');
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter(t => !t.hidden).map(t => ({ id: t.id, sel: t.getAttribute('aria-selected'), ctl: t.getAttribute('aria-controls'), ti: t.tabIndex, txt: t.textContent })));
  check('five tabs in order with names', tabs.map(t => t.txt).join() === 'نظرة عامة,كرة القدم,الشطرنج,فريقي,الإعداد', tabs.map(t => t.txt).join());
  check('exactly one selected tab, roving tabindex, aria-controls point at tabpanels', tabs.filter(t => t.sel === 'true').length === 1 && tabs.filter(t => t.ti === 0).length === 1 && await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].every(t => document.getElementById(t.getAttribute('aria-controls')).getAttribute('role') === 'tabpanel')));
  check('tablist has a label and opts out of the sliding indicator (data-seg=own)', await p.evaluate(() => { const l = document.querySelector('[role=tablist]'); return !!l.getAttribute('aria-label') && l.dataset.seg === 'own' && !l.querySelector('.seg-ind'); }));
  check('empty overview says 12 teams are needed and points to setup', /يلزم 12 فريقًا/.test(await txt(p, '#tn-p-overview')) && await vis(p, '[data-act=go-setup]'));
  // keyboard on the tablist (RTL: ArrowLeft = next)
  await p.focus('#tn-t-overview');
  await p.keyboard.press('ArrowLeft');
  check('ArrowLeft moves to the next tab (RTL) and activates it', (await p.evaluate(() => document.activeElement.id)) === 'tn-t-football' && (await p.evaluate(() => document.getElementById('tn-p-football').hidden)) === false);
  await p.keyboard.press('End');
  check('End goes to the last tab', (await p.evaluate(() => document.activeElement.id)) === 'tn-t-setup');
  await p.keyboard.press('Home');
  check('Home goes to the first tab', (await p.evaluate(() => document.activeElement.id)) === 'tn-t-overview');
  check('hash is written for the active tab and deep-links on reload', await (async () => { await tab(p, 'chess'); const h = await p.evaluate(() => location.hash); await p.reload(); await p.waitForTimeout(300); return h === '#chess' && (await p.evaluate(() => document.getElementById('tn-t-chess').getAttribute('aria-selected'))) === 'true'; })());
  check('aria-live regions exist (status + alert)', await p.evaluate(() => !!document.querySelector('.tn-toast[role=status][aria-live=polite]') && !!document.querySelector('.tn-toast[role=alert]')));
  check('no console errors', errs.length === 0, errs.join(' | '));
  check('only file + fonts hosts (no backend host, no third party)', [...hosts].every(h => /fonts\.g/.test(h)), [...hosts].join());
  await ctx.close();
}

section('local demo: teams, groups, 18 results, final round, football podium');
{
  const { ctx, p, errs } = await open();
  await tab(p, 'setup');
  check('manager controls: setup has demo fill and the team list', await vis(p, '[data-act=demo]') && await count(p, '.tn-tlist li') === 0);
  await p.click('[data-act=demo]');
  let s = await ST(p);
  check('demo fill creates 12 teams named by chrome «الفريق n»', s.teams.length === 12 && s.teams[0].name === 'الفريق 1' && s.teams[11].name === 'الفريق 12');
  check('draw-groups button enabled with 12 teams; 4/4/4 hint absent before the draw', !(await p.locator('[data-act=draw-groups]').isDisabled()) && (await count(p, '[data-groups-ok]')) === 0);
  await p.click('[data-act=draw-groups]');
  s = await ST(p);
  check('groups are drawn 4/4/4 and reported valid', s.groups && s.groups.every(g => g.length === 4) && (await p.getAttribute('[data-groups-ok]', 'data-groups-ok')) === '1');
  // manual move with swap
  const before = JSON.stringify(s.groups);
  const mover = s.groups[0][0];
  await p.selectOption(`[data-fk="mv:${mover}"]`, '1');
  s = await ST(p);
  check('manual move keeps 4/4/4 (swap with the last of the target group)', s.groups.every(g => g.length === 4) && s.groups[1].includes(mover) && !s.groups[0].includes(mover) && JSON.stringify(s.groups) !== before && /نُقل/.test(await toast(p)), await toast(p));
  // football tab
  await tab(p, 'football');
  check('three group cards, each with a standings table of 4 rows and 6 fixtures', await count(p, '.tn-group') === 3 && await count(p, '.tn-group tbody tr') === 12 && await count(p, 'form.tn-fx') === 18);
  check('final-round card is the waiting card with the pending reasons', await count(p, '.tn-final.is-wait') === 1 && (await count(p, '.tn-why li')) === 3 && /بقي 6 من 6/.test(await txt(p, '.tn-why')));
  const gs = s.groups;
  const fb0 = Y.football(s);
  // first result with Enter: focus moves to the next unplayed row
  const first = fb0.groups[0].rounds[0].matches[0], second = fb0.groups[0].rounds[0].matches[1];
  await fillFx(p, first.key, 3, 1);
  check('Enter saves and moves to the next unplayed fixture', (await p.evaluate(() => document.activeElement.name + '@' + document.activeElement.closest('form').dataset.key)) === 'sa@' + second.key, await p.evaluate(() => document.activeElement.name + '@' + document.activeElement.closest('form').dataset.key));
  check('saving shows an aria-live message with the score', /حُفظت النتيجة/.test(await toast(p)) && (await txt(p, '.tn-toast.show')).includes('3 – 1'));
  // enter the rest: the group's first team wins everything
  for (const g of fb0.groups) for (const rd of g.rounds) for (const m of rd.matches) {
    if (m.key === first.key) continue;
    const ia = g.teams.indexOf(m.a), ib = g.teams.indexOf(m.b);
    await fillFx(p, m.key, ia < ib ? 2 : 0, ia < ib ? 0 : 2);
  }
  s = await ST(p);
  const f1 = Y.football(s);
  check('all 18 group results are in the state (3–1 for the first, the rest from the script)', f1.groups.every(g => g.played === 6) && f1.played === 18, String(f1.played));
  check('winner of each group is the first team of its list; qualifiers known', f1.qualifiers && f1.qualifiers.length === 3 && f1.groups.every(g => g.first === g.teams[0]));
  check('the group cards show «متأهل» and the qualified team name', await count(p, '.tn-group .tn-q') === 3 && await count(p, '.tn-group tr.is-q') === 3);
  check('final-round card appears with table + 3 fixtures; waiting card gone', await count(p, '.tn-final.is-wait') === 0 && await count(p, '.tn-final form.tn-fx') === 3 && await count(p, '.tn-final tbody tr') === 3);
  // final round: q0 beats q1, q2; q1 beats q2
  const fq = f1.final;
  for (const rd of fq.rounds) for (const m of rd.matches) {
    const ia = fq.teams.indexOf(m.a), ib = fq.teams.indexOf(m.b);
    await fillFx(p, m.key, ia < ib ? 1 : 0, ia < ib ? 0 : 1);
  }
  s = await ST(p);
  const f2 = Y.football(s);
  check('football podium decided in the engine state', Array.isArray(f2.podium) && f2.podium.join() === fq.teams.join());
  const podTxt = await p.evaluate(() => [...document.querySelectorAll('#tn-p-football .tn-pod li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
  check('podium rendered in the football tab with names (1st, 2nd, 3rd) and no amounts', podTxt.length === 3 && podTxt[0].includes('المركز الأول') && !/[$]|دولار|ريال|درهم|\d{3,}/.test(podTxt.join(' ')), podTxt.join(' | '));
  // overview reflects
  await tab(p, 'overview');
  const ovFb = await txt(p, '#tn-ov-fb');
  check('overview: football stepper shows all four steps done', (await p.evaluate(() => document.querySelectorAll('#tn-p-overview .tn-sport')[0].querySelectorAll('.tn-steps .is-done').length)) === 4);
  check('overview: progress bar 21 من 21 for football and podium names shown', /21 من 21/.test(await p.evaluate(() => document.querySelectorAll('#tn-p-overview .tn-sport')[0].textContent)) && (await count(p, '#tn-p-overview .tn-sport .tn-pod')) === 1);
  check('overview: progress bars are real progressbars with values', await p.evaluate(() => { const b = document.querySelector('#tn-p-overview [role=progressbar]'); return b && b.getAttribute('aria-valuemax') === '21' && b.getAttribute('aria-valuenow') === '21' && !!b.getAttribute('aria-label'); }));
  check('overview: no football match left, no committee banner', (await count(p, '.tn-decide')) === 0);
  LOCAL_STATE = s;
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

section('local demo: chess draw -> 12 -> 6 -> 3 -> round robin -> final -> podium');
{
  const { ctx, p, errs } = await open();
  await tab(p, 'chess');
  check('chess before 12 teams explains it', /يلزم 12 فريقًا/.test(await txt(p, '#tn-p-chess')));
  await demoDraw(p);
  await tab(p, 'chess');
  check('four bracket columns in the right order', (await p.evaluate(() => [...document.querySelectorAll('.tn-col h3')].map(h => h.textContent.trim()).join('|'))) === 'الجولة 1|الجولة 2|الجولة 3: دوري الثلاثة|النهائي');
  check('round 2 / 3 / final wait with a plain reason', /بعد انتهاء الجولة 1/.test(await txt(p, '[data-round=r2]')) && /بعد انتهاء الجولة 2/.test(await txt(p, '[data-round=rr]')) && /الأول والثاني/.test(await txt(p, '[data-round=final]')));
  await p.click('[data-act=draw-r1]');
  let s = await ST(p), c = Y.chess(s);
  check('draw of pairs makes 6 matches over the 12 teams', c.r1.matches.length === 6 && new Set(c.r1.matches.flatMap(m => [m.a, m.b])).size === 12 && await count(p, '[data-round=r1] .tn-cm') === 6);
  check('winner buttons have aria-pressed and a group label with both names', await p.evaluate(() => { const li = document.querySelector('[data-round=r1] .tn-cm'); return li.getAttribute('role') === 'group' && /ضد/.test(li.getAttribute('aria-label')) && li.querySelectorAll('button[aria-pressed=false]').length === 2; }));
  const m0 = c.r1.matches[0];
  await p.click(`[data-fk="w:r1:0:${m0.a}"]`);
  check('tap the winner sets it and marks aria-pressed', (await ST(p)).chess.r1[0].w === m0.a && (await p.getAttribute(`[data-fk="w:r1:0:${m0.a}"]`, 'aria-pressed')) === 'true');
  await p.click(`[data-fk="w:r1:0:${m0.a}"]`);
  check('tap again clears it', (await ST(p)).chess.r1[0].w === null);
  for (const m of c.r1.matches) await p.click(`[data-fk="w:r1:${m.index}:${m.a}"]`);
  s = await ST(p); c = Y.chess(s);
  check('round 1 complete: six winners; round 2 column offers the draw', c.r1.complete && await vis(p, '[data-act=draw-r2]') && /الفائزون الستة/.test(await txt(p, '[data-round=r2]')));
  await p.click('[data-act=draw-r2]');
  s = await ST(p); c = Y.chess(s);
  check('round 2: 3 matches over exactly the six winners', c.r2.matches.length === 3 && new Set(c.r2.matches.flatMap(m => [m.a, m.b])).size === 6);
  for (const m of c.r2.matches) await p.click(`[data-fk="w:r2:${m.index}:${m.a}"]`);
  s = await ST(p); c = Y.chess(s);
  check('round 3: table with 3 rows + 3 matches', c.r2.complete && await count(p, '[data-round=rr] tbody tr') === 3 && await count(p, '[data-round=rr] .tn-cm') === 3);
  const W3 = c.rr.teams;
  const rm = (x, y) => c.rr.matches.find(m => (m.a === x && m.b === y) || (m.a === y && m.b === x));
  await p.click(`[data-fk="w:rr:${rm(W3[0], W3[1]).key}:${W3[0]}"]`);
  await p.click(`[data-fk="w:rr:${rm(W3[0], W3[2]).key}:${W3[0]}"]`);
  await p.click(`[data-fk="w:rr:${rm(W3[1], W3[2]).key}:${W3[1]}"]`);
  s = await ST(p); c = Y.chess(s);
  check('round robin decided: final column shows the match between the top two', c.final && c.final.a === W3[0] && c.final.b === W3[1] && await count(p, '[data-round=final] .tn-cm') === 1 && await count(p, '.tn-tie') === 0);
  await p.click(`[data-fk="w:final:0:${W3[1]}"]`);
  s = await ST(p); c = Y.chess(s);
  check('chess podium: final winner first, loser second, round robin third', c.podium && c.podium.join() === [W3[1], W3[0], W3[2]].join());
  const pod = await p.evaluate(() => [...document.querySelectorAll('#tn-p-chess .tn-pod li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
  check('podium shown in the chess tab with team names only', pod.length === 3 && pod[0].includes(s.teams.find(t => t.id === W3[1]).name));
  await tab(p, 'overview');
  check('overview shows 13 من 13 and the chess podium', /13 من 13/.test(await p.evaluate(() => document.querySelectorAll('#tn-p-overview .tn-sport')[1].textContent)) && (await p.evaluate(() => document.querySelectorAll('#tn-p-overview .tn-sport')[1].querySelectorAll('.tn-pod li').length)) === 3 && (await p.evaluate(() => document.querySelectorAll('#tn-p-overview .tn-sport')[1].querySelectorAll('.tn-steps .is-done').length)) === 6);
  // changing an early winner removes dependents and says so
  await tab(p, 'chess');
  const m1 = Y.chess(await ST(p)).r1.matches[0];
  const other = m1.w === m1.a ? m1.b : m1.a;
  await p.click(`[data-fk="w:r1:0:${other}"]`);
  const t = await toast(p);
  check('changing an early winner clears dependent results and tells the manager', /أُلغيت \d+ (نتيجة|نتيجتان|نتائج)/.test(t) && Y.chess(await ST(p)).podium === null, t);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

section('manual chess pairs');
{
  const { ctx, p } = await open({ state: Y.setTeams(Y.emptyState(), TEAMS) });
  await tab(p, 'chess');
  await p.click('[data-round=r1] .tn-manual summary');
  for (let i = 0; i < 6; i++) { await p.selectOption(`[data-fk="pair:r1:${i}:0"]`, IDS[i * 2]); await p.selectOption(`[data-fk="pair:r1:${i}:1"]`, IDS[i * 2 + 1]); }
  await p.click('[data-act=save-pairs-r1]');
  let c = Y.chess(await ST(p));
  check('manual pairs saved: t1-t2, t3-t4 ...', c.r1.matches.length === 6 && c.r1.matches[0].a === 't1' && c.r1.matches[0].b === 't2' && c.r1.matches[5].b === 't12');
  await tab(p, 'chess');
  if (!(await vis(p, '[data-fk="pair:r1:0:1"]'))) await p.click('[data-round=r1] .tn-manual summary');
  await p.selectOption('[data-fk="pair:r1:0:1"]', 't3');
  await p.click('[data-act=save-pairs-r1]');
  check('invalid manual pairs are rejected with the Arabic sentence', /الأزواج غير صالحة/.test(await toast(p)), await toast(p));
  await ctx.close();
}

/* ================================================================== 2. ties */
section('ties: flagged draw tie, draw button and manual order');
{
  let s = base();
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) s = res(s, GROUPS[0][i], GROUPS[0][j], 1, 1);
  check('(engine) all-draw group is flagged', Y.football(s).groups[0].ties.length === 1 && Y.football(s).groups[0].ties[0].flag === 'draw');
  const { ctx, p, errs } = await open({ state: s });
  await tab(p, 'overview');
  check('overview banner: needs a decision, with the lg10 wording', await vis(p, '.tn-decide') && /المركز الأول في المجموعة أ/.test(await txt(p, '.tn-decide')) && /تفصل اللجنة في الحالات غير المنصوص عليها/.test(await txt(p, '.tn-decide')));
  await tab(p, 'football');
  check('the group shows the flagged tie, the tie note and the lg6 order', await count(p, '.tn-group[data-group="أ"] .tn-tie') === 1 && /قرعة علنية/.test(await txt(p, '.tn-group[data-group="أ"] .tn-tie')) && /فارق الأهداف، ثم الأهداف المسجلة، ثم المواجهات المباشرة/.test(await txt(p, '.tn-group[data-group="أ"] .tn-tie')));
  check('the tied rows carry a flag chip and the final card says which group is waiting', await count(p, '.tn-group[data-group="أ"] tr.is-tie') === 4 && /المجموعة أ: تعادل على المركز الأول/.test(await txt(p, '.tn-why')));
  await p.click('.tn-group[data-group="أ"] [data-act=draw]');
  s = await ST(p);
  let g = Y.football(s).groups[0];
  check('public draw stores a decision; the group now has a first and the tie is marked decided', g.first !== null && g.ties[0].decided === true && await count(p, '.tn-group[data-group="أ"] .tn-tie.is-done') === 1);
  check('qualifier chip shows after the draw', await count(p, '.tn-group[data-group="أ"] tr.is-q') === 1);
  // manual order: reverse the decided order
  const ids = g.ties[0].ids.slice().reverse();
  for (let i = 0; i < 4; i++) await p.selectOption(`.tn-group[data-group="أ"] .tn-tie select >> nth=${i}`, ids[i]);
  await p.click('.tn-group[data-group="أ"] [data-act=save-order]');
  g = Y.football(await ST(p)).groups[0];
  check('manual order selects set the order (setOrder)', g.table.map(r => r.id).join() === ids.join() && g.first === ids[0]);
  await p.selectOption('.tn-group[data-group="أ"] .tn-tie select >> nth=0', ids[1]);
  await p.click('.tn-group[data-group="أ"] [data-act=save-order]');
  check('a repeated team in the order is refused with a sentence', /الترتيب غير صالح|كل فريق مرة واحدة/.test(await toast(p)), await toast(p));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
section('ties: chess 1-1-1 committee order');
{
  let s = base();
  s = Y.setChessPairs(s, 'r1', [['t1', 't2'], ['t3', 't4'], ['t5', 't6'], ['t7', 't8'], ['t9', 't10'], ['t11', 't12']]);
  Y.chess(s).r1.matches.forEach(m => { s = Y.setChessWinner(s, 'r1', m.index, m.a); });
  s = Y.setChessPairs(s, 'r2', [['t1', 't3'], ['t5', 't7'], ['t9', 't11']]);
  Y.chess(s).r2.matches.forEach(m => { s = Y.setChessWinner(s, 'r2', m.index, m.a); });
  s = Y.setChessRR(s, 't1', 't5', 't1'); s = Y.setChessRR(s, 't5', 't9', 't5'); s = Y.setChessRR(s, 't1', 't9', 't9');
  check('(engine) 1-1-1 is tied', Y.chess(s).rr.tied === true);
  const { ctx, p, errs } = await open({ state: s });
  await tab(p, 'overview');
  check('overview banner mentions the 1–1–1 tie', /1–1–1/.test(await txt(p, '.tn-decide')));
  await tab(p, 'chess');
  check('tie panel with 3 selects and no final yet', await count(p, '[data-scope=rr] select') === 3 && await count(p, '[data-round=final] .tn-cm') === 0);
  await p.selectOption('[data-fk="rrord:0"]', 't9'); await p.selectOption('[data-fk="rrord:1"]', 't1'); await p.selectOption('[data-fk="rrord:2"]', 't5');
  await p.click('[data-act=save-rr-order]');
  const c = Y.chess(await ST(p));
  check('committee order resolves the tie: final between the first two', c.rr.top2 && c.rr.top2.join() === 't9,t1' && c.final && await count(p, '[data-round=final] .tn-cm') === 1 && await count(p, '[data-scope=rr].is-done') === 1);
  await p.click('[data-fk="w:final:0:t9"]');
  check('podium follows the committee order', Y.chess(await ST(p)).podium.join() === 't9,t1,t5');
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}


section('standings notes in plain Arabic');
{
  let s = base();
  s = res(s, 't1', 't3', 3, 0); s = res(s, 't1', 't4', 1, 0); s = res(s, 't2', 't3', 1, 0); s = res(s, 't2', 't4', 1, 0); s = res(s, 't1', 't2', 0, 0); s = res(s, 't3', 't4', 0, 0);
  const { ctx, p } = await open({ state: s });
  await tab(p, 'football');
  const n = await txt(p, '.tn-group[data-group="أ"] .tn-notes');
  check('equal points separated by goal difference: «الأمل» قبل «النور» بفارق الأهداف', /«الأمل» قبل «النور» بفارق الأهداف/.test(n), n);
  check('the points / tie-break rules are available from the document words (lg6)', await p.evaluate(() => { const d = document.querySelector('#tn-p-football .tn-how'); d.open = true; return /الفوز 3 نقاط/.test(d.textContent) && /ثم قرعة علنية/.test(d.textContent) && /الأول من كل مجموعة يدخل في التصفيات/.test(d.textContent); }));
  await ctx.close();
}

/* ================================================================== 3. forfeits */
section('forfeits and clear');
{
  const { ctx, p, errs } = await open({ state: base() });
  await tab(p, 'football');
  const fb = Y.football(base());
  const m = fb.groups[0].rounds[0].matches[0];
  const f = p.locator(`form.tn-fx[data-key="${m.key}"]`);
  await f.locator('[aria-expanded]').click();
  check('details toggle expands the panel (date, time, cards, forfeit)', await f.locator('.tn-more').isVisible() && await f.locator('.tn-more input[type=date]').count() === 1 && await f.locator('.tn-more input[type=time]').count() === 1 && await f.locator('input[name=ca]').count() === 1);
  check('forfeit menu has the four kinds in chrome words', (await f.locator('select[name=kind] option').allTextContents()).join('|') === 'اختر القرار…|لم يحضر|تأخر|انسحب|لاعب غير مسجل');
  await f.locator('select[name=kind]').selectOption('absent');
  check('selecting a kind shows the lg2 rule verbatim', /غياب الفريق دون عذر/.test(await f.locator('.tn-rule').textContent()) && /0 – 3/.test(await f.locator('.tn-rule').textContent()));
  await f.locator('select[name=fault]').selectOption(m.a);
  await f.locator('[data-act=forfeit]').click();
  let r = (await ST(p)).fb.res[m.key];
  check('absent: side at fault loses 0–3 (adminResult)', r && r.adm === 'absent' && r.fault === m.a && (r.a === m.a ? r.sa === 0 && r.sb === 3 : r.sb === 0 && r.sa === 3));
  check('the row shows the administrative badge with the kind and the team', /قرار إداري · لم يحضر · /.test(await txt(p, `form.tn-fx[data-key="${m.key}"]`)));
  check('the details stay open after the re-render', await p.locator(`form.tn-fx[data-key="${m.key}"] .tn-more`).isVisible());
  const f2 = p.locator(`form.tn-fx[data-key="${m.key}"]`);
  await f2.locator('select[name=kind]').selectOption('unregistered');
  await f2.locator('select[name=fault]').selectOption(m.b);
  await f2.locator('[data-act=forfeit]').click();
  r = (await ST(p)).fb.res[m.key];
  check('unregistered player: 3–0 against the side at fault', r.adm === 'unregistered' && r.fault === m.b && (r.b === m.b ? r.sb === 0 && r.sa === 3 : r.sa === 0 && r.sb === 3));
  const f3 = p.locator(`form.tn-fx[data-key="${m.key}"]`);
  await f3.locator('select[name=kind]').selectOption('late'); await f3.locator('select[name=fault]').selectOption(m.a);
  await f3.locator('[data-act=forfeit]').click();
  check('late / withdraw kinds are recorded', (await ST(p)).fb.res[m.key].adm === 'late');
  await p.locator(`form.tn-fx[data-key="${m.key}"] select[name=kind]`).selectOption('');
  await p.locator(`form.tn-fx[data-key="${m.key}"] [data-act=forfeit]`).click();
  check('applying with no kind chosen asks for one', /اختر القرار الإداري أولًا/.test(await toast(p)));
  await p.locator(`form.tn-fx[data-key="${m.key}"] [data-act=clear]`).click();
  check('clear result removes it', !(await ST(p)).fb.res[m.key] && (await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=sa]`).inputValue()) === '');
  // validation
  await fillFx(p, m.key, 2, '', false);
  await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=sa]`).press('Enter');
  check('one empty score is refused with a sentence and focus on the empty box', await p.evaluate(() => document.activeElement.name) === 'sb');
  await fillFx(p, m.key, '-1', '2', false);
  await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=sb]`).press('Enter');
  check('a bad score maps to the Arabic bad_score sentence', /عددان صحيحان/.test(await toast(p)), await toast(p));
  // cards
  const f4 = p.locator(`form.tn-fx[data-key="${m.key}"]`);
  await f4.locator('[aria-expanded]').first().click().catch(() => {});
  await fillFx(p, m.key, 1, 1, false);
  const f5 = p.locator(`form.tn-fx[data-key="${m.key}"]`);
  if (!(await f5.locator('.tn-more').isVisible())) await f5.locator('[aria-expanded]').click();
  await f5.locator('input[name=ca]').fill('1'); await f5.locator('input[name=ra]').fill('2');
  await f5.locator('[data-act=save-fx]').click();
  check('more reds than cards is refused (bad_cards sentence)', /البطاقات الحمراء لا تزيد/.test(await toast(p)), await toast(p));
  await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=ra]`).fill('1');
  await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=cb]`).fill('2');
  await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=date]`).fill('2026-11-20');
  await p.locator(`form.tn-fx[data-key="${m.key}"] input[name=time]`).fill('16:30');
  await p.locator(`form.tn-fx[data-key="${m.key}"] [data-act=save-fx]`).click();
  r = (await ST(p)).fb.res[m.key];
  check('cards, reds, date and time are stored', r && r.ca === 1 && r.ra === 1 && r.cb === 2 && r.date === '2026-11-20' && r.time === '16:30', JSON.stringify(r));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================================================================== 4. undo */
section('undo (20 deep)');
{
  const { ctx, p } = await open({ state: base() });
  await tab(p, 'football');
  const m = Y.football(base()).groups[0].rounds[0].matches[0];
  check('undo is disabled with no history', await p.locator('[data-act=undo]').isDisabled());
  await fillFx(p, m.key, 1, 0);
  check('undo enabled after a change', !(await p.locator('[data-act=undo]').isDisabled()));
  await p.click('[data-act=undo]');
  check('undo restores the earlier state and says so', !(await ST(p)).fb.res[m.key] && /تراجعت/.test(await toast(p)) && await p.locator('[data-act=undo]').isDisabled());
  for (let i = 0; i < 25; i++) await fillFx(p, m.key, i % 7, (i + 1) % 5);
  let n = 0;
  while (!(await p.locator('[data-act=undo]').isDisabled()) && n < 40) { await p.click('[data-act=undo]'); n++; }
  check('history keeps exactly the last 20 states', n === 20, String(n));
  await ctx.close();
}

/* ================================================================== 5. share link */
section('share link: read-only snapshot, local state untouched');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const a = await open({ ctx, state: LOCAL_STATE });
  await a.p.click('[data-act=share]');
  const link = await a.p.inputValue('.tn-sharebox input');
  check('share link = page url + #v= + encoded public state', /tournament\.html#v=[A-Za-z0-9_-]+$/.test(link) && link.endsWith(Y.encode(LOCAL_STATE, { public: true })), link.slice(0, 80));
  check('the share box explains it is a snapshot', /لقطة للعرض فقط/.test(await txt(a.p, '.tn-sharebox')));
  const localBefore = await lsGet(a.p, 'yanabee-tournament-v1');
  const b = await ctx.newPage();
  const berrs = []; b.on('pageerror', e => berrs.push(e.message));
  await b.route('**/fonts.g*/**', r => r.abort());
  await b.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ } });
  await b.goto(link);
  await b.waitForTimeout(400);
  check('share mode, read-only banner with the exact words and the open-as-local button', (await MODE(b)) === 'share' && /نسخة مشاركة للعرض فقط/.test(await txt(b, '.tn-note.info')) && await vis(b, '[data-act=open-local]'));
  check('no editing controls: no forms, no inputs, no setup tab, no undo, no publish', await count(b, 'form.tn-fx') === 0 && await count(b, '.tn input, .tn select') === 0 && await b.locator('#tn-t-setup').isHidden() && await b.locator('[data-act=undo]').isHidden() && await b.locator('[data-act=publish]').isHidden());
  await b.click('#tn-t-football');
  check('football tab shows 3 group tables read-only and the podium', await count(b, '.tn-group tbody tr') === 12 && await count(b, '#tn-p-football .tn-pod li') === 3 && await count(b, '.tn-fx.ro') === 21);
  check('tab clicks keep the share data in the hash', /^#v=[A-Za-z0-9_-]+&tab=football$/.test(await b.evaluate(() => location.hash)));
  check('the snapshot did not touch the local state', (await lsGet(b, 'yanabee-tournament-v1')) === localBefore && (await lsGet(a.p, 'yanabee-tournament-v1')) === localBefore);
  check('shared team names are the team names (no chess labels in the link)', !JSON.stringify(Y.decode(link.split('#v=')[1]).teams).includes('"chess"'));
  // open as local copy over an existing local state -> confirmation
  await b.click('[data-act=open-local]');
  check('open as local asks before replacing an existing local state', await vis(b, '.tn-dlg'));
  await b.click('.tn-dlg [data-cancel]');
  check('cancelling keeps share mode and the old local state', (await MODE(b)) === 'share' && (await lsGet(b, 'yanabee-tournament-v1')) === localBefore);
  await b.click('[data-act=open-local]'); await b.click('.tn-dlg [data-ok]');
  await b.waitForTimeout(150);
  check('opened as a local copy: manager controls appear, hash cleaned, state saved locally', (await MODE(b)) === 'local' && await count(b, 'form.tn-fx') > 0 && !/v=/.test(await b.evaluate(() => location.hash)) && JSON.stringify(JSON.parse(await lsGet(b, 'yanabee-tournament-v1')).state.teams.map(t => t.name)) === JSON.stringify(Y.normalize(LOCAL_STATE).teams.map(t => t.name)));
  check('no script errors in the share page', berrs.length === 0, berrs.join());
  // a damaged link
  const c = await open({ ctx, hash: '#v=@@@@' });
  check('a damaged share link shows the Arabic sentence and falls back to the local board', (await MODE(c.p)) === 'local' && /رابط المشاركة غير صالح/.test(await txt(c.p, '.tn-notices')));
  // deep tab in a share link
  const d = await ctx.newPage();
  await d.route('**/fonts.g*/**', r => r.abort());
  await d.goto(PAGE_URL + '#v=' + Y.encode(LOCAL_STATE, { public: true }) + '&tab=chess');
  await d.waitForTimeout(300);
  check('a share link can deep-link a tab', (await d.getAttribute('#tn-t-chess', 'aria-selected')) === 'true');
  await ctx.close();
}

/* ================================================================== 6. json export / import */
section('JSON export / import');
{
  const { ctx, p, errs } = await open({ state: LOCAL_STATE });
  await tab(p, 'setup');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=export]')]);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('export downloads tournament.json with the state', dl.suggestedFilename() === 'tournament.json' && file.v === 1 && JSON.stringify(Y.normalize(file)) === JSON.stringify(Y.normalize(LOCAL_STATE)));
  await p.click('[data-act=reset-all]'); await yes(p);
  check('reset all clears everything (with a confirmation)', (await ST(p)).teams.length === 0);
  await p.setInputFiles('#tn-file', { name: 'tournament.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await p.waitForTimeout(200);
  check('import restores the state', JSON.stringify(Y.normalize(await ST(p))) === JSON.stringify(Y.normalize(LOCAL_STATE)));
  await p.setInputFiles('#tn-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  await p.waitForTimeout(150);
  check('a broken file gets a plain sentence and changes nothing', /ليس JSON صالحًا/.test(await toast(p)) && (await ST(p)).teams.length === 12);
  await p.setInputFiles('#tn-file', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"v":7}') });
  await p.waitForTimeout(150);
  check('a JSON that is not a tournament file is refused', /ليس ملف بطولة/.test(await toast(p)));
  await p.click('[data-act=reset-results]'); await yes(p);
  const s = await ST(p);
  check('reset results keeps the teams but drops groups and results', s.teams.length === 12 && s.groups === null && Object.keys(s.fb.res).length === 0);
  await p.click('[data-act=undo]');
  check('undo brings the results back after a reset', (await ST(p)).groups !== null);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================================================================== 7. team editor */
section('team editor: add, rename, remove, confirmations');
{
  const { ctx, p } = await open();
  await tab(p, 'setup');
  await p.fill('[data-fk=add-team]', 'الأمل');
  await p.press('[data-fk=add-team]', 'Enter');
  await p.fill('[data-fk=add-team]', 'النور');
  await p.click('[data-act=add-team]');
  let s = await ST(p);
  check('add by Enter and by button; focus stays in the add box', s.teams.map(t => t.name).join() === 'الأمل,النور' && (await p.evaluate(() => document.activeElement.dataset.fk)) === 'add-team');
  await p.fill('[data-fk=add-team]', 'الأمل');
  await p.press('[data-fk=add-team]', 'Enter');
  check('duplicate name refused with its sentence', /اسم الفريق مكرّر/.test(await toast(p)));
  await p.fill('[data-fk=add-team]', '   ');
  await p.press('[data-fk=add-team]', 'Enter');
  check('empty name refused', /اكتب اسمًا/.test(await toast(p)));
  await p.fill('[data-fk="tname:t2"]', 'الفجر');
  await p.press('[data-fk="tname:t2"]', 'Enter');
  s = await ST(p);
  check('rename by Enter keeps the id and the focus', s.teams[1].id === 't2' && s.teams[1].name === 'الفجر' && (await p.evaluate(() => document.activeElement.dataset.fk)) === 'tname:t2');
  await p.click('[aria-label="احذف الفريق الأمل"]');
  check('remove without progress needs no confirmation', (await ST(p)).teams.length === 1 && !(await vis(p, '.tn-dlg')));
  await p.click('[data-act=demo]'); await yes(p);
  await p.click('[data-act=draw-groups]');
  await p.click('[aria-label="احذف الفريق الفريق 3"]');
  check('removing a team after the draw asks first', await vis(p, '.tn-dlg'));
  await p.click('.tn-dlg [data-cancel]');
  check('cancel keeps 12 teams and the groups', (await ST(p)).teams.length === 12 && (await ST(p)).groups !== null);
  await p.click('[aria-label="احذف الفريق الفريق 3"]'); await yes(p);
  s = await ST(p);
  check('confirmed removal drops the team and the groups', s.teams.length === 11 && s.groups === null);
  check('draw-groups is disabled with 11 teams and says why', await p.locator('[data-act=draw-groups]').isDisabled() && /يلزم 12 فريقًا/.test(await txt(p, '[aria-labelledby=tn-s-groups]')));
  await ctx.close();
}

/* ================================================================== 8. print */
section('print');
{
  const { ctx, p, errs } = await open({ state: FULL, dark: true });
  await p.click('[data-act=print]');
  const pr = await p.evaluate(() => ({ n: window.__printed, cls: window.__printClass, now: document.body.className }));
  check('print adds body class print-tournament while printing', pr.n === 1 && /print-tournament/.test(pr.cls));
  check('print block holds standings, fixtures, bracket and podiums with team names', await p.evaluate(() => { const t = document.getElementById('tn-print'); return t.querySelectorAll('table').length === 5 && t.querySelectorAll('li').length > 30 && /مراكز كرة القدم/.test(t.textContent) && /مراكز الشطرنج/.test(t.textContent) && /الجولة 1/.test(t.textContent) && /النهائي/.test(t.textContent); }));
  await p.emulateMedia({ media: 'print' });
  const cs = await p.evaluate(() => {
    const el = document.querySelector('.tn-printwrap'), td = el.querySelector('td'), vis = e => getComputedStyle(e).display;
    return { dark: document.documentElement.dataset.theme, wrap: vis(el), tabs: vis(document.querySelector('.tn-tabs')), top: vis(document.querySelector('.tn-top')), nav: vis(document.querySelector('.nav')), hero: vis(document.querySelector('.hero')), color: getComputedStyle(td).color, bg: getComputedStyle(td).backgroundColor, bodyBg: getComputedStyle(document.body).backgroundColor, app: vis(document.querySelector('.tn-sec')) };
  });
  check('theme is dark but the print sheet is black on white', cs.dark === 'dark' && cs.color === 'rgb(0, 0, 0)' && cs.bg === 'rgb(255, 255, 255)' && cs.bodyBg === 'rgb(255, 255, 255)', JSON.stringify(cs));
  check('while printing only the print block shows (no nav, hero, controls, app)', cs.wrap === 'block' && cs.tabs === 'none' && cs.top === 'none' && cs.nav === 'none' && cs.hero === 'none' && cs.app === 'none', JSON.stringify(cs));
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check('class is removed after printing', !(await p.evaluate(() => document.body.classList.contains('print-tournament'))));
  const before = await p.evaluate(() => getComputedStyle(document.getElementById('tn-print')).display);
  check('the print block is hidden on screen', before === 'none');
  // plain browser print (no class): controls hidden
  await p.emulateMedia({ media: 'print' });
  check('plain print hides toolbar and tabs', await p.evaluate(() => getComputedStyle(document.querySelector('.tn-top')).display === 'none' && getComputedStyle(document.querySelector('.tn-tabs')).display === 'none'));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================================================================== 9. persistence, blocked storage */
section('persistence and blocked storage');
{
  const { ctx, p } = await open();
  await demoDraw(p);
  await tab(p, 'football');
  const m = Y.football(await ST(p)).groups[1].rounds[0].matches[0];
  await fillFx(p, m.key, 4, 2);
  const s1 = await ST(p);
  await p.reload(); await p.waitForTimeout(300);
  const s2 = await ST(p);
  check('state survives a reload (localStorage yanabee-tournament-v1)', JSON.stringify(s2.fb.res) === JSON.stringify(s1.fb.res) && s2.groups.length === 3 && (await MODE(p)) === 'local');
  check('stored under the documented key as {v:1,state}', await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('yanabee-tournament-v1')); return o.v === 1 && o.state.teams.length === 12; }));
  await p.evaluate(() => localStorage.setItem('yanabee-tournament-v1', '{broken'));
  await p.reload(); await p.waitForTimeout(300);
  check('a corrupt stored value falls back to an empty board without errors', (await ST(p)).teams.length === 0 && (await MODE(p)) === 'local');
  await ctx.close();
}
{
  const { ctx, p, errs } = await open({ blockStorage: true });
  check('with storage blocked the board still works in memory and says it is not saved', (await MODE(p)) === 'local');
  await tab(p, 'setup'); await p.click('[data-act=demo]');
  check('demo fill works with blocked storage', (await ST(p)).teams.length === 12);
  check('a warning explains that nothing is saved on this device', /تعذّر الحفظ في هذا المتصفح/.test(await txt(p, '.tn-notices')));
  check('no console errors with storage blocked', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

/* ================================================================== 10. backend: public */
section('backend: public view, polling, not published, errors');
{
  const B = makeBackend();
  const { ctx, p, errs, hosts } = await open({ backend: B });
  check('configured backend with nothing published: public mode and a plain message', (await MODE(p)) === 'public' && /لم تُنشر نتائج البطولة بعد/.test(await txt(p, '#tn-p-overview')) && /لم تُنشر البطولة بعد/.test(await txt(p, '.tn-stamp')));
  check('public badge «عرض عام»; no manager controls', (await txt(p, '.tn-badge')) === 'عرض عام' && await p.locator('#tn-t-setup').isHidden() && await p.locator('[data-act=publish]').isHidden() && await p.locator('[data-act=undo]').isHidden());
  await ctx.close();
}
{
  const B = makeBackend({ state: groupsDone(base()) });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const { p, errs, hosts } = await open({ backend: B, ctx });
  check('published state is shown read-only with «آخر تحديث»', (await MODE(p)) === 'public' && /آخر تحديث:/.test(await txt(p, '.tn-stamp')));
  await tab(p, 'football');
  check('no score inputs, standings visible, final card present', await count(p, 'form.tn-fx') === 0 && await count(p, '.tn-group tbody tr') === 12 && await count(p, '.tn-final') === 1 && await count(p, '.tn-fx.ro') >= 18);
  check('no editing controls anywhere (inputs, selects, buttons that change data)', await count(p, '.tn input, .tn select') === 0 && await count(p, '[data-act=save-fx], [data-act=draw], [data-act=forfeit]') === 0);
  check('public refresh button is there; nothing to publish', await vis(p, '[data-act=refresh]'));
  const reads0 = B.log.filter(l => l.path === '/rest/v1/tournament_state').length;
  // poll: change the data, move the clock
  B.set(Y.setResult(Y.normalize(B.state), { a: 't1', b: 't5', sa: 0, sb: 0 }) && B.state);
  const finalState = groupsDone(base());
  const t1 = Y.football(finalState).qualifiers;
  let st = finalState;
  const fq = Y.football(st).final;
  fq.rounds[0].matches.forEach(m => { st = res(st, m.a, m.b, 1, 0); });
  B.set(st);
  await p.getByRole('button', { name: 'حدّث الآن' }).click();
  await p.waitForTimeout(250);
  check('manual refresh pulls the newer state and re-renders', B.log.filter(l => l.path === '/rest/v1/tournament_state').length > reads0 && await count(p, '.tn-fx.ro.is-played') >= 19);
  const reads1 = B.log.filter(l => l.path === '/rest/v1/tournament_state').length;
  await p.waitForTimeout(100);
  check('only the fake host and the shell fonts were contacted', [...hosts].every(h => h === 'fake.supabase.test' || /fonts\.g/.test(h)) && hosts.has('fake.supabase.test'), [...hosts].join());
  B.fail = true;
  await p.getByRole('button', { name: 'حدّث الآن' }).click();
  await p.waitForTimeout(250);
  check('a failed refresh keeps the last data and shows a plain warning with retry', await count(p, '.tn-group') === 3 && /تعذّر تحديث البيانات/.test(await txt(p, '.tn-notices')) && await vis(p, '[data-act=retry]'));
  B.fail = false;
  await p.click('[data-act=retry]');
  await p.waitForTimeout(250);
  check('retry clears the warning', (await count(p, '.tn-notices .warn')) === 0);
  check('no request carried a write (public is read-only)', B.log.every(l => l.method === 'GET' || l.method === 'OPTIONS' || l.path === '/rest/v1/rpc/my_team'));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  // automatic polling every 15 s while visible (fake clock)
  const B = makeBackend({ state: base() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.clock.install();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.route(FAKE + '/**', B.handler);
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); } catch (e) { /* ignore */ } const c = { url: 'https://fake.supabase.test', anonKey: 'anon-key-for-tests' }; Object.defineProperty(window, 'YB_CONFIG', { get: () => c, set: () => {}, configurable: true }); });
  await p.goto(PAGE_URL);
  await p.waitForFunction(() => window.__yanabeeTournament && window.__yanabeeTournament.mode() === 'public', null, { timeout: 8000 });
  await p.clock.runFor(1000);
  const r0 = B.log.filter(l => l.path === '/rest/v1/tournament_state').length;
  await p.clock.runFor(14000);
  await p.waitForTimeout(200);
  const r1 = B.log.filter(l => l.path === '/rest/v1/tournament_state').length;
  check('polls the published state every 15 seconds', r1 === r0 + 1, `${r0} -> ${r1}`);
  B.set(res(base(), 't1', 't2', 5, 0));
  await p.clock.runFor(15000);
  await p.waitForTimeout(300);
  await p.click('#tn-t-football');
  check('a poll that finds a newer state updates the screen by itself', (await ST(p)).fb.res['t1|t2'] && /5 – 0/.test(await txt(p, '.tn-group')));
  await ctx.close();
}
{
  // initial failure: skeleton -> plain error -> retry
  const B = makeBackend({ state: base() });
  B.fail = true;
  const { ctx, p } = await open({ backend: B });
  check('initial load failure shows a plain Arabic error with a retry button (role=alert)', await vis(p, '.tn-errbox[role=alert]') && /تعذّر/.test(await txt(p, '.tn-errbox')) && await vis(p, '[data-act=retry-load]'));
  B.fail = false;
  await p.click('[data-act=retry-load]');
  await p.waitForTimeout(400);
  check('retry loads the board', await count(p, '.tn-errbox') === 0 && (await ST(p)).teams.length === 12);
  await ctx.close();
}

/* ================================================================== 11. backend: admin */
section('backend: admin manager, publish, conflict');
{
  const approved = TEAMS.map((t, i) => ({ id: '0000000' + String(i).padStart(1, '0') + '-aaaa-4bbb-8ccc-00000000000' + String(i % 10), name: t.name, area: 'حي ' + (i + 1) }));
  approved.push({ id: 'ffffffff-aaaa-4bbb-8ccc-000000000099', name: 'فريق زائد', area: 'حي' });
  const B = makeBackend({ approved });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const { p, errs, hosts } = await open({ backend: B, token: 'tok-admin', ctx });
  check('admin is a manager: badge, setup tab, publish button (disabled until there is something to publish)', (await MODE(p)) === 'manager' && (await txt(p, '.tn-badge')) === 'وضع الإدارة' && await vis(p, '#tn-t-setup') && await vis(p, '[data-act=publish]') && await p.locator('[data-act=publish]').isDisabled());
  check('nothing published yet is said plainly in the toolbar', /لم يُنشر شيء بعد/.test(await txt(p, '.tn-stamp')));
  await tab(p, 'setup');
  check('demo teams are for local mode only: no demo button for the admin', await count(p, '[data-act=demo]') === 0);
  await p.click('[data-act=import-approved]');
  await p.waitForSelector('.tn-checks li');
  check('approved teams are listed (13) with the first 12 selected', await count(p, '.tn-checks li') === 13 && await count(p, '.tn-checks input:checked') === 12);
  check('the teams query asks for approved teams only, with id,name,area', B.log.some(l => l.path === '/rest/v1/teams' && /status=eq\.approved/.test(l.search) && /select=id%2Cname%2Carea/.test(l.search)));
  await p.check('.tn-checks li:last-child input').catch(() => {});
  check('more than 12 cannot be selected', await count(p, '.tn-checks input:checked') === 12 && /الحد الأقصى 12/.test(await toast(p)));
  await p.click('[data-act=use-approved]');
  let s = await ST(p);
  check('import puts the approved teams in the state (id = team uuid, name)', s.teams.length === 12 && /^[0-9a-f]{8}-/.test(s.teams[0].id) && s.teams[0].name === 'الأمل');
  check('«تغييرات غير منشورة» appears and publish is enabled', /تغييرات غير منشورة/.test(await txt(p, '.tn-stamp')) && !(await p.locator('[data-act=publish]').isDisabled()));
  check('a draft is autosaved under yanabee-tournament-draft-v1', await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('yanabee-tournament-draft-v1')); return o && o.state.teams.length === 12 && o.base === null; }));
  await p.click('[data-act=draw-groups]');
  await p.reload(); await p.waitForTimeout(500);
  s = await ST(p);
  check('reload restores the unpublished draft (still dirty)', s.teams.length === 12 && s.groups && /تغييرات غير منشورة/.test(await txt(p, '.tn-stamp')));
  const pubBefore = B.publishes.length;
  await p.click('[data-act=publish]');
  await p.waitForTimeout(300);
  check('publish sends state + prev=null for the first publish', B.publishes.length === pubBefore + 1 && B.publishes[0].prev === null && B.publishes[0].state.v === 1 && B.publishes[0].state.teams.length === 12);
  check('published payload has the stamp and no chess labels', !!B.publishes[0].state.updated && B.publishes[0].state.teams.every(t => !('chess' in t)) && !JSON.stringify(B.publishes[0]).includes('"chess":"'));
  check('after publishing: clean, not dirty, draft removed, server stamp shown', !/تغييرات غير منشورة/.test(await txt(p, '.tn-stamp')) && /منشور/.test(await txt(p, '.tn-stamp')) && (await lsGet(p, 'yanabee-tournament-draft-v1')) === null && /نُشرت البطولة/.test(await toast(p)));
  check('publish is disabled again with nothing new', await p.locator('[data-act=publish]').isDisabled());
  // second publish: prev must be the exact string returned
  await tab(p, 'football');
  const m = Y.football(await ST(p)).groups[0].rounds[0].matches[0];
  await fillFx(p, m.key, 2, 1);
  const at1 = B.at;
  await p.click('[data-act=publish]');
  await p.waitForTimeout(300);
  check('second publish sends prev = the exact updated_at string of the last publish', B.publishes[1].prev === at1 && typeof at1 === 'string', `${B.publishes[1].prev} vs ${at1}`);
  // conflict: someone else publishes
  await fillFx(p, Y.football(await ST(p)).groups[0].rounds[0].matches[1].key, 1, 0);
  const mine = await ST(p);
  B.set(Object.assign({}, B.state, { updated: 'other-admin' }));
  await p.click('[data-act=publish]');
  await p.waitForTimeout(300);
  check('conflict shows a clear choice (load newer / overwrite / keep draft) and nothing was written', await vis(p, '.tn-note.warn[role=alert]') && await vis(p, '[data-act=conflict-load]') && await vis(p, '[data-act=conflict-overwrite]') && await vis(p, '[data-act=conflict-keep]') && B.state.updated === 'other-admin');
  await p.click('[data-act=conflict-load]');
  await p.waitForTimeout(300);
  check('load newer replaces my state with the published one and clears the conflict', (await ST(p)).updated === 'other-admin' && await count(p, '.tn-note.warn') === 0 && !/تغييرات غير منشورة/.test(await txt(p, '.tn-stamp')));
  await p.click('[data-act=undo]');
  check('undo brings my changes back after loading the newer version', JSON.stringify(Object.keys((await ST(p)).fb.res)) === JSON.stringify(Object.keys(mine.fb.res)) && /تغييرات غير منشورة/.test(await txt(p, '.tn-stamp')));
  B.set(Object.assign({}, B.state, { updated: 'other-2' }));
  const pubs = B.publishes.length;
  await p.click('[data-act=publish]');
  await p.waitForTimeout(300);
  check('a second conflict is detected again', await vis(p, '[data-act=conflict-overwrite]') && B.publishes.length === pubs + 1);
  const latestAt = B.at;
  await p.click('[data-act=conflict-overwrite]');
  await yes(p);
  await p.waitForTimeout(400);
  check('overwrite re-reads the newest stamp, then publishes with it', B.publishes[B.publishes.length - 1].prev === latestAt && B.state.fb && Object.keys(B.state.fb.res).length === Object.keys(mine.fb.res).length && await count(p, '.tn-note.warn') === 0);
  // newer version appears while editing (poll)
  check('every write request was an admin publish_state call', B.log.filter(l => l.method === 'POST').every(l => l.path === '/rest/v1/rpc/publish_state' || l.path === '/rest/v1/rpc/my_team'));
  check('no console errors', errs.length === 0, errs.join(' | '));
  check('hosts: only the fake backend and fonts', [...hosts].every(h => h === 'fake.supabase.test' || /fonts\.g/.test(h)));
  // payload privacy: labels from an imported JSON never leave
  const withLabels = Y.normalize(JSON.parse(JSON.stringify(B.state)));
  withLabels.teams.forEach((t, i) => { t.chess = 'لاعب-سري-' + i; });
  await tab(p, 'setup');
  await p.setInputFiles('#tn-file', { name: 'labels.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withLabels)) });
  await p.waitForTimeout(200);
  if (await vis(p, '.tn-dlg')) await yes(p);
  await p.waitForTimeout(150);
  await p.evaluate(() => { const n = document.createElement('i'); document.body.append(n); });
  const rendered = await p.evaluate(() => document.body.innerText);
  check('chess labels (player names) are never rendered', !rendered.includes('لاعب-سري'));
  await fillFx(p, 'x', 0, 0, false).catch(() => {});
  const stNow = await ST(p);
  if (!stNow.fb.res['t1|t2']) { /* any change to make it dirty */ }
  await p.click('[data-act=publish]').catch(() => {});
  await p.waitForTimeout(300);
  check('no published payload ever contained a player label or a child name', B.publishes.every(x => !JSON.stringify(x).includes('لاعب-سري')));
  await ctx.close();
}
{
  // newer version appears while editing -> banner (polling)
  const B = makeBackend({ state: base() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.clock.install();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.route(FAKE + '/**', B.handler);
  await p.addInitScript(() => { try { sessionStorage.setItem('yb-intro', '1'); localStorage.setItem('yanabee-session-v1', JSON.stringify({ access_token: 'tok-admin', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'u-admin', email: 'a@x.test' } })); } catch (e) { /* ignore */ } const c = { url: 'https://fake.supabase.test', anonKey: 'anon-key-for-tests' }; Object.defineProperty(window, 'YB_CONFIG', { get: () => c, set: () => {}, configurable: true }); });
  await p.goto(PAGE_URL);
  await p.waitForFunction(() => window.__yanabeeTournament && window.__yanabeeTournament.mode() === 'manager', null, { timeout: 8000 });
  B.set(Object.assign({}, B.state, { updated: 'x2' }));
  await p.clock.runFor(15500);
  await p.waitForTimeout(300);
  check('manager is told when a newer version was published elsewhere', await vis(p, '[data-act=load-newer]'));
  await p.click('[data-act=load-newer]');
  await p.waitForTimeout(250);
  check('loading it clears the notice', (await ST(p)).updated === 'x2' && await count(p, '[data-act=load-newer]') === 0);
  await ctx.close();
}
{
  // stale draft (built on an older published version) is offered, not forced
  const B = makeBackend({ state: base() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const draft = res(base(), 't1', 't2', 9, 9);
  const p = await ctx.newPage();
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.route(FAKE + '/**', B.handler);
  await p.addInitScript(d => { try { sessionStorage.setItem('yb-intro', '1'); localStorage.setItem('yanabee-session-v1', JSON.stringify({ access_token: 'tok-admin', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 86400, user: { id: 'u-admin', email: 'a@x.test' } })); if (!localStorage.getItem('yanabee-tournament-draft-v1')) localStorage.setItem('yanabee-tournament-draft-v1', JSON.stringify({ v: 1, state: d, base: '2020-01-01T00:00:00+00:00', at: 1 })); } catch (e) { /* ignore */ } const c = { url: 'https://fake.supabase.test', anonKey: 'anon-key-for-tests' }; Object.defineProperty(window, 'YB_CONFIG', { get: () => c, set: () => {}, configurable: true }); }, draft);
  await p.goto(PAGE_URL);
  await p.waitForTimeout(600);
  check('a stale draft is offered: the published state is loaded and the choice is explicit', (await ST(p)).fb.res['t1|t2'] === undefined && await vis(p, '[data-act=restore-draft]'));
  await p.click('[data-act=restore-draft]');
  check('restoring the draft brings it back as an unpublished change', (await ST(p)).fb.res['t1|t2'] && /تغييرات غير منشورة/.test(await txt(p, '.tn-stamp')));
  await ctx.close();
}

/* ================================================================== 12. backend: roles */
section('backend: non-admin accounts see no manager controls; leader / parent see their team');
{
  const state = groupsDone(base());
  const B = makeBackend({ state, mine: [{ team_id: 't6', team_name: 'الرواد', area: 'x', status: 'approved', my_role: 'leader', member_id: 'm1', join_code: 'ABC234', admin_note: null }], children: [{ team_id: 't9', team_name: 'الإبداع' }] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const a = await open({ backend: B, token: 'tok-leader', ctx, hash: '#myteam' });
  check('a leader account is a public viewer: no manager controls', (await MODE(a.p)) === 'public' && await a.p.locator('#tn-t-setup').isHidden() && await a.p.locator('[data-act=publish]').isHidden() && await a.p.locator('[data-act=undo]').isHidden());
  check('deep link #myteam opens the team tab', (await a.p.getAttribute('#tn-t-myteam', 'aria-selected')) === 'true');
  check('the leader\'s team is preselected via my_team()', (await a.p.inputValue('#tn-team-sel')) === 't6' && /الرواد/.test(await txt(a.p, '.tn-mine')));
  const mineTxt = await txt(a.p, '#tn-p-myteam');
  check('team view: group, position, status text, matches with results', /المجموعة ب/.test(mineTxt) && /المركز \d من 4/.test(mineTxt) && /(متأهل إلى التصفيات|لم يتأهل إلى التصفيات)/.test(mineTxt) && await count(a.p, '.tn-mm li') >= 3 && /الشطرنج:/.test(mineTxt));
  check('the join code and admin note from my_team are never shown', !/ABC234/.test(await a.p.evaluate(() => document.body.innerText)));
  check('the team selector lists team names only', (await a.p.locator('#tn-team-sel option').allTextContents()).slice(1).join() === NAMES.join());
  await a.p.selectOption('#tn-team-sel', 't1');
  check('choosing another team shows its view', /الأمل/.test(await txt(a.p, '.tn-mine')) && /المركز 1 من 4|المجموعة أ/.test(await txt(a.p, '.tn-mine')));
  check('leader: no console errors', a.errs.length === 0, a.errs.join(' | '));
  await a.p.context().close();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const b = await open({ backend: B, token: 'tok-parent', ctx: ctx2, hash: '#myteam' });
  check('a parent has the team preselected through my_children (team id + name only)', (await b.p.inputValue('#tn-team-sel')) === 't9' && B.log.some(l => l.path === '/rest/v1/my_children' && /select=team_id%2Cteam_name/.test(l.search) && !/full_name/.test(l.search)));
  check('a parent has no manager controls either', await b.p.locator('#tn-t-setup').isHidden() && await count(b.p, 'form.tn-fx') === 0);
  check('no request fetched a child name', B.log.filter(l => l.path !== '/rest/v1/profiles').every(l => !/full_name|guardian/.test(l.search)));
  await ctx2.close();
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const c = await open({ backend: B, ctx: ctx3 });
  check('anonymous visitors: my team has a plain selector, no account needed', await vis(c.p, '#tn-t-myteam') && (await c.p.getAttribute('#tn-t-myteam', 'aria-selected')) !== null);
  await tab(c.p, 'myteam');
  await c.p.selectOption('#tn-team-sel', 't2');
  await c.p.reload(); await c.p.waitForTimeout(500);
  await tab(c.p, 'myteam');
  check('the chosen team is remembered on this device (convenience only)', (await c.p.inputValue('#tn-team-sel')) === 't2');
  await ctx3.close();
}

/* ================================================================== 13. phone, dark, keyboard, a11y */
section('390px: no overflow, 44px targets; dark theme; keyboard; labels');
{
  const { ctx, p, errs } = await open({ ...PHONE, state: LOCAL_STATE });
  for (const id of ['overview', 'football', 'chess', 'myteam', 'setup']) {
    await tab(p, id);
    const ov = await over(p);
    check(`390px: no horizontal page overflow on the «${id}» tab`, ov <= 0, String(ov));
  }
  await tab(p, 'football');
  const small = await p.evaluate(() => [...document.querySelectorAll('.tn button, .tn select, .tn input:not([type=checkbox]):not(.sr-only)')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), t: (e.getAttribute('aria-label') || e.textContent || e.className).slice(0, 24) }; }).filter(x => x.h < 43.5));
  check('390px: every visible button, select and input is at least 44px tall', small.length === 0, JSON.stringify(small.slice(0, 5)));
  const tbl = await p.evaluate(() => { const s = document.querySelector('.tn-scroll'); const r = s.getBoundingClientRect(); return { w: Math.round(r.width), cw: s.clientWidth, sw: s.scrollWidth, vw: innerWidth }; });
  check('390px: the standings table fits its wrapper or scrolls inside it (the page does not)', tbl.w <= tbl.vw && await over(p) <= 0, JSON.stringify(tbl));
  await tab(p, 'chess');
  const sides = await p.evaluate(() => [...document.querySelectorAll('.tn-side')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect().height).filter(h => h < 43.5));
  check('390px: chess winner buttons are 44px targets', sides.length === 0);
  const cols = await p.evaluate(() => { const ys = [...document.querySelectorAll('.tn-col')].map(e => Math.round(e.getBoundingClientRect().top)); return ys.every((y, i) => i === 0 || y > ys[i - 1]); });
  check('390px: bracket columns stack vertically', cols);
  check('390px: no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p, errs } = await open({ state: LOCAL_STATE, dark: true });
  check('dark theme is applied', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await tab(p, 'football');
  const c = await p.evaluate(() => { const card = document.querySelector('.tn-card'); const cs = getComputedStyle(card); return { bg: cs.backgroundColor, ink: getComputedStyle(document.querySelector('.tn-tbl .tn-tn')).color, body: getComputedStyle(document.body).backgroundColor }; });
  check('cards use the dark surface token and light text', c.bg === 'rgb(10, 31, 40)' && c.ink !== 'rgb(0, 0, 0)' && c.body === 'rgb(4, 19, 26)', JSON.stringify(c));
  const lum = rgb => { const m = rgb.match(/\d+/g).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  const ratio = await p.evaluate(() => { const f = e => getComputedStyle(e); const cells = [...document.querySelectorAll('.tn-chip, .tn-stamp, .tn-notes li, .tn-tabs .tn-tab')].slice(0, 12); return cells.map(e => [f(e).color, f(e).backgroundColor]); });
  check('dark theme: text colours are light enough on every sampled chip, stamp and note', ratio.every(([fg]) => lum(fg) > 110), JSON.stringify(ratio.filter(([fg]) => lum(fg) <= 110)));
  await tab(p, 'chess');
  await tab(p, 'overview');
  check('dark theme: no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p } = await open({ state: base() });
  await tab(p, 'football');
  const unl = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.tn input:not([type=hidden]), .tn select').forEach(e => {
      const lab = e.getAttribute('aria-label') || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label');
      if (!lab) bad.push(e.name || e.type);
    });
    return bad;
  });
  check('every input and select has an accessible label', unl.length === 0, unl.join());
  const ids = await p.evaluate(() => { const all = [...document.querySelectorAll('[id]')].map(e => e.id); return all.filter((x, i) => all.indexOf(x) !== i); });
  check('no duplicate ids in the page', ids.length === 0, ids.join());
  check('tables have captions and column headers; scroll wrappers are labelled regions', await p.evaluate(() => [...document.querySelectorAll('.tn-tbl')].every(t => t.querySelector('caption') && t.querySelectorAll('thead th[scope=col]').length >= 5) && [...document.querySelectorAll('.tn-scroll')].every(s => s.getAttribute('role') === 'region' && s.getAttribute('aria-label') && s.tabIndex === 0)));
  // keyboard: score entry, tabbing order
  const m = Y.football(base()).groups[0].rounds[0].matches[0];
  await p.focus(`form.tn-fx[data-key="${m.key}"] input[name=sa]`);
  await p.keyboard.type('2');
  await p.keyboard.press('Enter');
  check('Enter in the first box moves to the second box', (await p.evaluate(() => document.activeElement.name)) === 'sb');
  await p.keyboard.type('1');
  await p.keyboard.press('Enter');
  check('Enter in the second box saves', (await ST(p)).fb.res[m.key] && (await ST(p)).fb.res[m.key].sa + (await ST(p)).fb.res[m.key].sb === 3);
  await p.focus(`form.tn-fx[data-key="${m.key}"] [aria-expanded]`);
  await p.keyboard.press('Enter');
  check('the details toggle works from the keyboard (aria-expanded)', (await p.getAttribute(`form.tn-fx[data-key="${m.key}"] [aria-expanded]`, 'aria-expanded')) === 'true');
  await tab(p, 'setup');
  await p.click('[data-act=reset-all]');
  check('dialog opens as a modal with focus on the safe button', await p.evaluate(() => { const d = document.querySelector('.tn-dlg'); return !!d && d.open && document.activeElement.hasAttribute('data-cancel'); }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  check('Escape closes the dialog without doing anything', await count(p, '.tn-dlg') === 0 && (await ST(p)).teams.length === 12);
  await ctx.close();
}

/* ================================================================== 13b. fixtures planned in advance (fb.sched) */
section('fixtures planned in advance: plan row, public view, upcoming list, result keeps the date');
{
  const { ctx, p, errs } = await open();
  await demoDraw(p);
  await tab(p, 'football');
  let s = await ST(p);
  const m = Y.football(s).groups[0].rounds[0].matches[0];
  const f = p.locator(`form.tn-fx[data-key="${m.key}"]`);
  check('an unplayed fixture has a plan row with date, time and a save button', await f.locator('.tn-plan input[name=pdate]').count() === 1 && await f.locator('.tn-plan input[name=ptime]').count() === 1 && await f.locator('[data-act=save-when]').count() === 1);
  await f.locator('input[name=pdate]').fill('2026-11-20');
  await f.locator('input[name=ptime]').fill('16:00');
  await f.locator('[data-act=save-when]').click();
  await p.waitForTimeout(120);
  s = await ST(p);
  check('the plan is stored in the state (fb.sched)', JSON.stringify(s.fb.sched[m.key]) === JSON.stringify({ date: '2026-11-20', time: '16:00' }), JSON.stringify(s.fb.sched));
  check('a plain confirmation is announced', /حُفظ موعد المباراة/.test(await toast(p)));
  await tab(p, 'overview');
  const nx = await txt(p, '.tn-next');
  check('«المباريات القادمة» shows the planned day and time', /نوفمبر/.test(nx) && /16:00/.test(nx), nx);
  await tab(p, 'football');
  await fillFx(p, m.key, 2, 1);
  s = await ST(p);
  check('entering the result without touching the date keeps the planned date and time', s.fb.res[m.key] && s.fb.res[m.key].date === '2026-11-20' && s.fb.res[m.key].time === '16:00', JSON.stringify(s.fb.res[m.key]));
  check('a played fixture has no plan row any more', await p.locator(`form.tn-fx[data-key="${m.key}"] .tn-plan`).count() === 0);
  // another fixture: clear a plan by saving empty fields
  const m2 = Y.football(s).groups[1].rounds[0].matches[0];
  const f2 = p.locator(`form.tn-fx[data-key="${m2.key}"]`);
  await f2.locator('input[name=pdate]').fill('2026-11-21'); await f2.locator('[data-act=save-when]').click(); await p.waitForTimeout(100);
  check('a date alone is a plan', (await ST(p)).fb.sched[m2.key] && (await ST(p)).fb.sched[m2.key].date === '2026-11-21');
  await p.locator(`form.tn-fx[data-key="${m2.key}"] input[name=pdate]`).fill('');
  await p.locator(`form.tn-fx[data-key="${m2.key}"] [data-act=save-when]`).click(); await p.waitForTimeout(100);
  check('saving empty fields removes the plan', !(await ST(p)).fb.sched[m2.key]);
  check('no console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // the public / share view shows the plan read-only
  const enc = Y.encode(Y.setSchedule(s, m2.a, m2.b, { date: '2026-11-22', time: '09:30' }), { public: true });
  const v = await open({ hash: '#v=' + enc });
  await tab(v.p, 'football');
  check('share view: no forms, the planned date and time are visible', await count(v.p, 'form.tn-fx') === 0 && /09:30/.test(await txt(v.p, '#tn-p-football')) && /الموعد/.test(await txt(v.p, '#tn-p-football')));
  check('share view: no plan inputs', await count(v.p, 'input[name=pdate]') === 0);
  await tab(v.p, 'myteam');
  check('no console errors in the share view', v.errs.length === 0, v.errs.join(' | '));
  await v.ctx.close();
}

/* ================================================================== 14. the rest of the site is untouched */
section('shell');
{
  const { ctx, p } = await open();
  check('hero, c-format section and footer links still there', await vis(p, '.hero h1') && (await count(p, '#c-format')) === 1 && /نظام بطولة كرة القدم والشطرنج/.test(await p.evaluate(() => document.getElementById('c-format').textContent)));
  check('format lines are visible on the page (document section)', await p.evaluate(() => { const t = document.getElementById('c-format').textContent; return /الأول من كل مجموعة يدخل في التصفيات/.test(t) && /الأول والثاني يلعبان المباراة النهائية/.test(t); }));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? 'FAIL' : 'PASS'} ${pass}/${pass + fails.length} tournament-ui tests`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
