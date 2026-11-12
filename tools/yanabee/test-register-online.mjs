// Browser test of the online part of register.html (migration 0005): «أرسل التسجيل» → request number, «تابع طلبك» →
// the team checklist (js/yb-checklist.js).
//   python3 tools/yanabee/build.py register && node tools/yanabee/test-register-online.mjs
// The page talks to a small FAKE Supabase (page.route at https://fake.supabase.test) that answers yb_register_team and
// yb_track_request like supabase/migrations/0005_yb_register_fee.sql (same error keys, same checklist shape).
// Covers: unconfigured mode (no send button, tracker off, local privacy text), the payload sent, the receipt (number,
// copy, WhatsApp text, claim link, saved on this device), a repeated send, server and network errors, tracking
// (wrong phone, statuses, fee, consents, group, next date, claim step, no child names), 390px layout, console errors.
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = f => 'file://' + path.join(ROOT, 'site/yanabee', f);
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const section = t => console.log('\n' + t);
const FAKE = 'https://fake.supabase.test';
const CHILDREN = /سالم|يوسف|عمر حسن|زيد/;

/* ---------------------------------------------------------------- fake backend (0005 semantics, trimmed) */
class Fake {
  constructor() { this.teams = []; this.calls = []; this.fail = null; this.offline = false; }
  digits(s) { return String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^0-9]/g, ''); }
  key(s) { return this.digits(s).slice(-9); }
  norm(s) { return String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().replace(/^YN(?=.{8}$)/, ''); }
  register(p) {
    if (this.fail) return { ok: false, error: this.fail };
    const n = (p.members || []).length;
    if (n < 5 || n > 7) return { ok: false, error: 'members_count_invalid' };
    const dup = this.teams.find(t => t.name === p.team && this.key(t.phone) === this.key(p.phone));
    if (dup) return { ok: true, ref: dup.ref, team_id: dup.id, duplicate: true };
    if (this.teams.some(t => t.name === p.team)) return { ok: false, error: 'team_name_taken' };
    const ref = 'K7M2QW' + String(this.teams.length + 10);
    const t = { id: 'team-' + (this.teams.length + 1), ref, name: p.team, area: p.area, phone: p.phone, status: 'submitted', fee: 'unpaid',
      members: n, minors: p.members.filter(m => m.age < 18).length, consents: 0, claimed: false, group: null, next: null, note: null, created_at: '2026-11-09T10:00:00Z' };
    this.teams.push(t);
    return { ok: true, ref, team_id: t.id };
  }
  track(b) {
    const t = this.teams.find(x => x.ref === this.norm(b.ref) && this.key(x.phone) === this.key(b.phone) && this.key(b.phone).length >= 7);
    if (!t) return { ok: false, error: 'not_found' };
    const { phone, id, ...pub } = t;
    return { ok: true, team: { team_id: id, ...pub } };
  }
  async handle(route) {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (this.offline) return route.abort('internetdisconnected');
    const u = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    this.calls.push({ path: u.pathname, body });
    let out = { status: 404, body: { code: 'PGRST202', message: 'no function' } };
    if (u.pathname === '/rest/v1/rpc/yb_register_team') out = { status: 200, body: this.register(body.p || {}) };
    if (u.pathname === '/rest/v1/rpc/yb_track_request') out = { status: 200, body: this.track(body) };
    if (u.pathname === '/rest/v1/rpc/yb_registration_stats') out = { status: 200, body: this.stats || { target: 12, registered: this.teams.length + 2, approved: 1 } };
    return route.fulfill({ status: out.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(out.body) });
  }
}

/* ---------------------------------------------------------------- harness */
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DRAFT = {
  f: { team: 'فريق الفجر', leader: 'خالد سعيد', phone: '0530 517 5431', email: '', area: 'حي السلام', rec1: 'سالم أحمد', rec2: 'يوسف علي', chess: 'عمر حسن', idea: 'حملة نظافة', coord: 'زيد محمود', pledge0: true, pledge1: true, pledge2: true, pledge3: true },
  m: [{ n: 'خالد سعيد', a: '16', c: '05301110000' }, { n: 'سالم أحمد', a: '12', c: '05302220000' }, { n: 'يوسف علي', a: '13', c: '05303330000' }, { n: 'عمر حسن', a: '14', c: '05304440000' }, { n: 'زيد محمود', a: '19', c: '05305550000' }]
};
const setCfg = ([u]) => { const cfg = { url: u, anonKey: 'fake-anon-key' }; Object.defineProperty(window, 'YB_CONFIG', { configurable: true, get: () => cfg, set: () => {} }); };
async function open(fake, { configured = true, draft = DRAFT, mobile = false, sent = null, query = '' } = {}) {
  const ctx = await browser.newContext({ ...(mobile ? PHONE : { viewport: { width: 1280, height: 900 } }), reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::|Failed to load resource|ERR_INTERNET/.test(m.text())) p.errs.push(m.text()); });
  await p.clock.setFixedTime(new Date(2026, 10, 9, 10, 0, 0));   // 9 Nov 2026: registration is open (comp.js phases)
  await p.route(/fonts\.g(oogleapis|static)\.com/, r => r.abort());
  if (fake) await p.route(`${FAKE}/**`, r => fake.handle(r));
  if (configured) await p.addInitScript(setCfg, [FAKE]);
  await p.addInitScript(([d, s]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (d) localStorage.setItem('yanabee-reg-draft', JSON.stringify(d));
    if (s) localStorage.setItem('yanabee-reg-sent', JSON.stringify(s));
  }, [draft, sent]);
  await p.goto(url('register.html') + query);
  await p.waitForSelector('[data-members] tr');
  return { ctx, p };
}
const checkForm = async p => { await p.click('[data-reg] button[type=submit]'); await p.waitForSelector('[data-done]:not([hidden])'); };
const cls = async (p, step) => (await p.getAttribute(`[data-step=${step}]`, 'class')) || '';

/* ================================================================ 1. unconfigured */
section('without a backend the page stays local');
{
  const { ctx, p } = await open(null, { configured: false });
  check('local privacy text shown, online text hidden', await p.isVisible('[data-priv-local]') && !(await p.isVisible('[data-priv-online]')));
  check('the tracker form is hidden and says online tracking is off', !(await p.isVisible('[data-track-form]')) && await p.isVisible('[data-track-off]'));
  await checkForm(p);
  check('a checked form offers print and copy but no send button', !(await p.isVisible('[data-send-box]')) && await p.isVisible('[data-print-form]'));
  check('no team count without a backend', await p.locator('[data-cs-teams]').first().isHidden());
  check('no console errors (unconfigured)', !p.errs.length, p.errs.join(' | '));
  await ctx.close();
}

/* ================================================================ 2. sending */
section('send once, get a request number');
const fake = new Fake();
{
  const { ctx, p } = await open(fake);
  check('online privacy text shown', await p.isVisible('[data-priv-online]') && !(await p.isVisible('[data-priv-local]')));
  await p.waitForSelector('[data-cs-teams]:not([hidden])');
  check('the status strip counts registered teams: «سُجّل 2 من 12 فريقًا · اعتُمد 1 · بقي 10»', (await p.locator('[data-cs-teams-t]').first().textContent()) === 'سُجّل 2 من 12 فريقًا · اعتُمد 1 · بقي 10');
  check('the bar is 17% wide (2 of 12)', (await p.locator('[data-cs-bar]').first().getAttribute('style')).includes('17%'));
  check('the tracker form is shown', await p.isVisible('[data-track-form]') && !(await p.isVisible('[data-track-off]')));
  check('no send button before the form is checked', !(await p.isVisible('[data-send-box]')));
  await checkForm(p);
  check('a checked form shows «أرسل التسجيل»', await p.isVisible('[data-send]'));
  await p.click('[data-send]');
  await p.waitForSelector('[data-sent]:not([hidden])');
  const regs = fake.calls.filter(c => c.path.endsWith('yb_register_team'));
  const P = regs[0] && regs[0].body.p;
  check('one register call was made', regs.length === 1);
  check('payload: team, leader, phone, area, empty email as null', P && P.team === 'فريق الفجر' && P.leader === 'خالد سعيد' && P.phone === '0530 517 5431' && P.area === 'حي السلام' && P.email === null);
  check('payload: five members, the leader first, ages as numbers', P && P.members.length === 5 && P.members[0].name === 'خالد سعيد' && P.members.every(m => typeof m.age === 'number') && P.members[1].contact === '05302220000');
  check('payload: nominees and pledges', P && P.reciter1 === 'سالم أحمد' && P.reciter2 === 'يوسف علي' && P.chess === 'عمر حسن' && P.coordinator === 'زيد محمود' && P.pledges === true);
  const ref = await p.textContent('[data-sent] [data-ref]');
  check('the receipt shows the request number as YN-XXXX-XXXX', ref === 'YN-K7M2-QW10', ref);
  check('the receipt heading says it arrived', /وصل تسجيل فريقكم/.test(await p.textContent('[data-sent] h4')));
  const wa = await p.getAttribute('[data-wa-sent]', 'href');
  check('WhatsApp goes to the official number with the team and the request number', wa.startsWith('https://wa.me/905305175431?text=') && decodeURIComponent(wa).includes('YN-K7M2-QW10') && decodeURIComponent(wa).includes('فريق الفجر'));
  check('the claim link opens the account page with the request number', (await p.getAttribute('[data-claim-link]', 'href')) === 'account.html?claim=K7M2QW10');
  check('the send box is gone after sending', !(await p.isVisible('[data-send-box]')));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-reg-sent') || '[]'));
  check('the request is saved on this device (number, team, phone)', saved.length === 1 && saved[0].ref === 'K7M2QW10' && saved[0].team === 'فريق الفجر' && saved[0].phone === '0530 517 5431');
  check('the tracker lists it under «طلبات أُرسلت من هذا الجهاز»', await p.isVisible('[data-mine="K7M2QW10"]'));
  await p.click('[data-copy-ref]');
  check('copy puts the formatted number on the clipboard', (await p.evaluate(() => navigator.clipboard.readText())) === 'YN-K7M2-QW10');

  section('tracking from the receipt');
  await p.click('[data-go-track]');
  await p.waitForSelector('[data-track-out] .ybc');
  const steps = await p.$$eval('[data-track-out] .ybc-s', ls => ls.map(l => [l.dataset.step, l.className.replace('ybc-s ', '')]));
  check('the checklist: sent done, fee / consents / review / draw waiting, claim waiting', JSON.stringify(steps) === JSON.stringify([['sent', 'is-done'], ['fee', 'is-wait'], ['consent', 'is-wait'], ['review', 'is-wait'], ['draw', 'is-wait'], ['claim', 'is-wait']]), JSON.stringify(steps));
  check('the ring counts 1 of 5', (await p.textContent('[data-track-out] .ybc-ring')).replace(/\s/g, '') === '1من5');
  check('consents read «استُلمت 0 من 4»', /استُلمت 0 من 4/.test(await p.textContent('[data-step=consent]')));
  check('the checklist names the team and the request number', /فريق الفجر/.test(await p.textContent('.ybc-t')) && /YN-K7M2-QW10/.test(await p.textContent('.ybc-t')));
  check('no child name appears in the checklist', !CHILDREN.test(await p.textContent('[data-track-out]')));
  check('the claim step links to the account page', (await p.getAttribute('[data-step=claim] a', 'href')) === 'account.html?claim=K7M2QW10');
  check('the tracker fields were filled', (await p.inputValue('[name=ref]')) === 'YN-K7M2-QW10' && (await p.inputValue('[name=tphone]')) === '0530 517 5431');

  section('sending the same form again');
  await p.evaluate(() => { document.querySelector('[data-sent]').hidden = true; });
  await checkForm(p);
  await p.click('[data-send]');
  await p.waitForSelector('[data-sent]:not([hidden])');
  check('a repeated send says it arrived before, same number', /وصل طلبكم من قبل/.test(await p.textContent('[data-sent] h4')) && (await p.textContent('[data-sent] [data-ref]')) === 'YN-K7M2-QW10');
  check('still one saved request', (await p.evaluate(() => JSON.parse(localStorage.getItem('yanabee-reg-sent')).length)) === 1);
  check('no console errors (send + track)', !p.errs.length, p.errs.join(' | '));
  await ctx.close();
}

section('errors while sending');
{
  const f2 = new Fake();
  f2.fail = 'team_name_taken';
  const { ctx, p } = await open(f2);
  await checkForm(p);
  await p.click('[data-send]');
  await p.waitForSelector('[data-send-err]:not([hidden])');
  check('a server refusal shows its Arabic text', (await p.textContent('[data-send-err]')) === 'هذا الاسم مستخدم لفريق آخر. اختر اسمًا مختلفًا.');
  check('no receipt after a refusal', !(await p.isVisible('[data-sent]')));
  check('the send button is usable again', await p.isEnabled('[data-send]'));
  f2.fail = null; f2.offline = true;
  await p.click('[data-send]');
  await p.waitForFunction(() => /تحقق من الاتصال/.test(document.querySelector('[data-send-err]').textContent));
  check('a network failure says the data is kept and to try again', /بياناتك محفوظة في هذا المتصفح/.test(await p.textContent('[data-send-err]')));
  f2.offline = false;
  await p.fill('[data-reg] [name=team]', '');
  await p.click('[data-send]');
  check('a form changed into an invalid one asks to check it first', /تحقق من الاستمارة/.test(await p.textContent('[data-send-err]')));
  check('nothing was saved on this device', (await p.evaluate(() => localStorage.getItem('yanabee-reg-sent'))) === null);
  await ctx.close();
}

/* ================================================================ 3. tracking by hand */
section('«تابع طلبك» by hand');
{
  const t = fake.teams[0];
  const { ctx, p } = await open(fake, { draft: null });
  await p.fill('[name=ref]', 'yn-k7m2-qw10');
  await p.fill('[name=tphone]', '0530 000 0000');
  await p.click('[data-track-form] button[type=submit]');
  await p.waitForSelector('[data-track-err]:not([hidden])');
  check('a wrong phone: clear message, no checklist', /لم نجد طلبًا بهذا الرقم وهذا الهاتف/.test(await p.textContent('[data-track-err]')) && !(await p.$('[data-track-out] .ybc')));
  await p.fill('[name=tphone]', '');
  await p.click('[data-track-form] button[type=submit]');
  check('an empty phone is caught on the page', /اكتب رقم الطلب ورقم هاتف القائد/.test(await p.textContent('[data-track-err]')));
  Object.assign(t, { status: 'returned', note: 'أضيفوا رقم ولي أمر العضو الثالث.', fee: 'paid', consents: 4 });
  await p.fill('[name=tphone]', '+90 530 517 54 31');
  await p.click('[data-track-form] button[type=submit]');
  await p.waitForSelector('[data-track-out] .ybc');
  check('the error is cleared on success', await p.isHidden('[data-track-err]'));
  check('returned: the review step needs action and shows the note', (await cls(p, 'review')).includes('is-bad') && /أضيفوا رقم ولي أمر العضو الثالث/.test(await p.textContent('[data-step=review] .ybc-note')));
  check('fee paid and consents complete are done', (await cls(p, 'fee')).includes('is-done') && (await cls(p, 'consent')).includes('is-done'));
  Object.assign(t, { status: 'approved', note: null, group: 1, claimed: true, next: { title: 'مباراة الجولة الأولى', starts_at: '2026-11-20T15:00:00Z', place: 'ملعب الحي', competition: 'football' } });
  await p.click('[data-track-form] button[type=submit]');
  await p.waitForFunction(() => document.querySelector('[data-step=draw]') && document.querySelector('[data-step=draw]').className.includes('is-done'));
  check('approved + drawn: «فريقكم في المجموعة ب»', /المجموعة ب/.test(await p.textContent('[data-step=draw]')));
  check('the ring shows 5 of 5', (await p.textContent('.ybc-ring')).replace(/\s/g, '') === '5من5');
  const nx = await p.textContent('[data-step=next]');
  check('the next date is listed with its place and competition', /مباراة الجولة الأولى/.test(nx) && /ملعب الحي/.test(nx) && /كرة القدم/.test(nx));
  check('a claimed team has no claim step', !(await p.$('[data-step=claim]')));
  Object.assign(t, { status: 'rejected', note: 'لم تكتمل الشروط.' });
  await p.click('[data-track-form] button[type=submit]');
  await p.waitForFunction(() => /لم يُقبل/.test(document.querySelector('[data-step=review]')?.textContent || ''));
  check('rejected: «لم يُقبل طلب التسجيل» with the note', /لم تكتمل الشروط/.test(await p.textContent('[data-step=review]')));
  check('no console errors (tracking)', !p.errs.length, p.errs.join(' | '));
  await ctx.close();
}
{
  const { ctx, p } = await open(fake, { draft: null, sent: [{ ref: 'K7M2QW10', team: 'فريق الفجر', phone: '0530 517 5431', at: '2026-11-09T10:00:00Z' }] });
  check('a request saved on this device shows as a button', await p.isVisible('[data-mine="K7M2QW10"]'));
  await p.click('[data-mine="K7M2QW10"]');
  await p.waitForSelector('[data-track-out] .ybc');
  check('one tap tracks it', /فريق الفجر/.test(await p.textContent('[data-track-out]')));
  await ctx.close();
}
{
  const { ctx, p } = await open(fake, { draft: null, query: '?ref=K7M2QW10#track' });
  check('?ref= fills the request number', (await p.inputValue('[name=ref]')) === 'K7M2QW10');
  await ctx.close();
}

section('the reserve list and the roles (migration 0006)');
{
  const t = fake.teams[0];
  Object.assign(t, { status: 'submitted', note: null, claimed: false, group: null, next: null, waitlist: true, wait_pos: 2, roles: { reciter: true, reserve: false, chess: true, coord: false } });
  fake.stats = { target: 12, registered: 12, approved: 5, waiting: 3 };
  const { ctx, p } = await open(fake, { draft: null });
  await p.waitForSelector('[data-cs-teams]:not([hidden])');
  check('a full competition: «اكتمل العدد (12 فريقًا) · 3 في قائمة الاحتياط · التسجيل الآن في قائمة الاحتياط»', (await p.locator('[data-cs-teams-t]').first().textContent()) === 'اكتمل العدد (12 فريقًا) · 3 في قائمة الاحتياط · التسجيل الآن في قائمة الاحتياط');
  await p.fill('[name=ref]', 'K7M2QW10'); await p.fill('[name=tphone]', '05305175431');
  await p.click('[data-track-form] button[type=submit]');
  await p.waitForSelector('[data-step=place]');
  check('the place step: on the reserve list, number 2, moves up by itself', (await cls(p, 'place')).includes('is-wait') && /قائمة الاحتياط \(رقم 2\)/.test(await p.textContent('[data-step=place]')) && /ينتقل تلقائيًا/.test(await p.textContent('[data-step=place]')));
  check('the roles step names the missing role, never a person', (await cls(p, 'roles')).includes('is-wait') && /لم يُحدَّد بعد: المرشح الاحتياطي للتسميع\./.test(await p.textContent('[data-step=roles]')) && !CHILDREN.test(await p.textContent('[data-track-out]')));
  check('the ring counts 7 steps when places and roles are reported', /من7$/.test((await p.textContent('.ybc-ring')).replace(/\s/g, '')));
  Object.assign(t, { waitlist: false, wait_pos: null, roles: { reciter: true, reserve: true, chess: true, coord: true } });
  await p.click('[data-track-form] button[type=submit]');
  await p.waitForFunction(() => (document.querySelector('[data-step=place]') || {}).className?.includes('is-done'));
  check('with a place and all roles both steps are done', (await cls(p, 'roles')).includes('is-done') && /للفريق مكان/.test(await p.textContent('[data-step=place]')));
  delete t.waitlist; delete t.wait_pos; delete t.roles; fake.stats = null;
  await ctx.close();
}

/* ================================================================ 4. phone */
section('390px phone');
{
  Object.assign(fake.teams[0], { status: 'submitted', note: null, claimed: false });
  const { ctx, p } = await open(fake, { mobile: true });
  await checkForm(p);
  await p.click('[data-send]');
  await p.waitForSelector('[data-sent]:not([hidden])');
  await p.click('[data-go-track]');
  await p.waitForSelector('[data-track-out] .ybc');
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 390px with the receipt and the checklist', over <= 1, String(over));
  const small = await p.$$eval('[data-sent] .btn, [data-track-form] .btn', bs => bs.filter(b => b.getBoundingClientRect().height < 40).length);
  check('receipt and tracker buttons are at least 40px tall', small === 0, String(small));
  check('the tracker fields stack on a phone', await p.evaluate(() => { const [a, b] = document.querySelectorAll('[data-track-form] label'); return b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom - 1; }));
  check('no console errors (phone)', !p.errs.length, p.errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
