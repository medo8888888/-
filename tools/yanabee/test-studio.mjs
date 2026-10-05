// Browser test of «ستوديو الفريق» (lab.html, panel #panel-studio): full flow, persistence, crisis mode, reduced motion.
//   node tools/yanabee/test-studio.mjs
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = createRequire(import.meta.url)(path.join(process.env.NODE_PATH || execSync('npm root -g').toString().trim(), 'playwright'));
const url = 'file://' + path.join(ROOT, 'site/yanabee/lab.html');
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference', permissions: ['microphone'], ...opts });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
  await p.route('**/fonts.g*/**', r => r.abort());
  await p.goto(url); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const st = p => p.evaluate(() => window.YanabeeStudio.state());
const click = async (p, s, o = {}) => { await p.click(s, o); await p.waitForTimeout(90); };
const txt = (p, s) => p.$eval(s, e => e.textContent.replace(/\s+/g, ' ').trim());

console.log('studio: founding');
{
  const { ctx, p, errs } = await open();
  check('studio panel is the first tab and visible', await p.isVisible('#panel-studio #studio'));
  check('later steps are locked before the team exists', await p.$$eval('.sd-step-b', bs => bs.filter(b => b.dataset.i !== 'found').every(b => b.disabled)));
  check('steps are real buttons with aria-current', await p.$$eval('.sd-step-b', bs => bs.every(b => b.tagName === 'BUTTON') && bs.filter(b => b.getAttribute('aria-current') === 'step').length === 1));
  check('no role=tab leaked into the lab tablist logic', await p.$$eval('#studio [role=tab]', e => e.length === 0));
  check('seven specialisation cards with photos', (await p.$$('.sd-team')).length === 7);
  await click(p, '[data-act=pick][data-i=t5]');
  const nat = await txt(p, '.sd-nat');
  check('the verbatim «طبيعة العمل» of the environment team is shown', nat.includes('إعادة التدوير') && nat.includes('قوافل صحية') && nat.includes('مواجهة التغير المناخي'));
  check('supervising bodies shown', (await p.$$('.sd-bodies li')).length === 3);
  check('six challenge fragments are highlighted', (await p.$$('.sd-nat mark')).length === 6);
  check('the app bar takes the team crest/name state', (await txt(p, '#sd-appbar')).includes('الأسبوع 1 من 8'));
  await click(p, '.sd-stage [data-act=sub][data-i="1"]');
  await p.fill('[data-in=tname]', 'حرّاس الاختبار');
  check('team name appears in the app bar while typing', (await txt(p, '.sd-ab-t b')) === 'حرّاس الاختبار');
  await click(p, '[data-act=size][data-i="7"]');
  check('7 member inputs', (await p.$$('[data-in=mname]')).length === 7);
  await p.fill('[data-in=mname][data-i="0"]', 'أمل');
  await click(p, '[data-act=nicks]');
  const names = await p.$$eval('[data-in=mname]', e => e.map(x => x.value));
  check('nicknames fill only the empty rows', names[0] === 'أمل' && names.every(Boolean));
  await click(p, '.sd-stage [data-act=sub][data-i="2"]');
  await click(p, '[data-act=role][data-r=leader][data-i="3"]');
  await click(p, '[data-act=role][data-r=quality][data-i="3"]');
  let s = await st(p);
  check('a member holds only one role (swap)', s.team.roles.quality === 3 && s.team.roles.leader !== 3 && new Set(Object.values(s.team.roles)).size === 3, JSON.stringify(s.team.roles));
  const before = await p.$eval('.sd-wh-name', e => e.textContent);
  await click(p, '[data-act=spin]');
  await p.waitForTimeout(200);
  check('the wheel passes the crown to the next member', (await p.$eval('.sd-wh-name', e => e.textContent)) !== before);
  await click(p, '[data-act=crest][data-k=shape][data-i="2"]');
  check('crest builder updates the crest', (await st(p)).team.crest.shape === 2);
  check('role wording is the document\'s', (await txt(p, '.sd-roles')).includes('مسؤول الجودة والسلوك') && (await txt(p, '.sd-roles')).includes('المسؤول التقني والإعلامي') && (await txt(p, '.sd-roles')).includes('يداور هذا الدور شهرياً'));
  await click(p, '[data-act=launch]');
  s = await st(p);
  check('team launched', s.team.launched && s.team.size === 7);
  check('later steps unlocked', await p.$$eval('.sd-step-b', bs => bs.every(b => !b.disabled)));
  check('focus moved to the step heading', await p.evaluate(() => document.activeElement.classList.contains('sd-h')));
  check('no console errors', errs.length === 0, errs.join(' | '));

  console.log('studio: challenge, proof, wallet');
  await click(p, '[data-act=go][data-i=chal]');
  check('challenge board derived from the team (6 cards)', (await p.$$('.sd-ch')).length === 6);
  check('crisis switch is a real switch', (await p.getAttribute('[data-act=crisis]', 'role')) === 'switch');
  await click(p, '[data-act=chal][data-i="t5-1"]');
  check('challenge chosen -> mission steps', (await p.$$('.sd-chk')).length === 3);
  // wallet before proof
  await click(p, '.sd-step-b[data-i=wallet]');
  await p.fill('[data-in=amt]', '80'); await click(p, '[data-act=request]');
  s = await st(p);
  check('spend request is held', s.wallet.ledger.length === 1 && s.wallet.ledger[0].st === 'held');
  check('vault shows locked', await p.isVisible('.sd-vault.v-locked'));
  await click(p, '[data-act=settle]', { force: true });
  await p.waitForTimeout(500);
  check('release is refused before the challenge + proof', (await st(p)).wallet.ledger[0].st === 'held' && (await p.getAttribute('[data-act=settle]', 'aria-disabled')) === 'true');
  // do the work
  await click(p, '.sd-step-b[data-i=chal]');
  for (const i of [0, 1, 2]) await click(p, `[data-act=step][data-i="${i}"]`);
  await click(p, '.sd-step-b[data-i=wallet]');
  check('steps alone are not enough (proof missing)', (await p.getAttribute('[data-act=settle]', 'aria-disabled')) === 'true');
  await click(p, '.sd-step-b[data-i=chal]');
  await p.setInputFiles('[data-in=file]', { name: 'invoice.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
  await p.waitForTimeout(200);
  check('real file preview is local (blob: URL)', (await p.getAttribute('.sd-pv', 'src') || '').startsWith('blob:'));
  const net = []; p.on('request', r => { if (/^https?:/.test(r.url()) && !/fonts\./.test(r.url())) net.push(r.url()); });
  check('mission complete message', await p.isVisible('.sd-win'));
  await click(p, '.sd-step-b[data-i=wallet]');
  check('vault unlocks when both conditions hold', await p.isVisible('.sd-vault.v-open'));
  await click(p, '[data-act=settle]');
  await p.waitForTimeout(2900);
  s = await st(p);
  check('wallet settled digitally after the conditions', s.wallet.ledger[0].st === 'settled' && !!s.wallet.ledger[0].ref);
  check('nothing was uploaded', net.length === 0, net.join(','));
  check('points reflect execution + proof', (await st(p)).weeks['1'].steps.every(Boolean));

  console.log('studio: crisis');
  await click(p, '.sd-step-b[data-i=chal]');
  await click(p, '[data-act=crisis]');
  check('crisis -> digital challenges', (await p.$$('.sd-ch.is-dig')).length === 6 && (await txt(p, '#sd-appbar')).includes('وضع الأزمة'));
  check('crisis rule quoted from the document', (await txt(p, '.sd-crisis')).includes('تحويل الأنشطة فوراً إلى تحديات رقمية تفاعلية عبر المنصة'));
  await click(p, '[data-act=crisis]');
  check('crisis switch toggles back', (await p.$$('.sd-ch.is-dig')).length === 0);

  console.log('studio: score, league, weeks, rotation');
  await click(p, '.sd-step-b[data-i=score]');
  check('league has the user + 8 simulated rivals', (await p.$$('.sd-lg-row')).length === 9 && (await p.$$('.sd-lg-row em.rival')).length === 8);
  const w1 = await p.$eval('.sd-big', e => parseInt(e.textContent));
  check('automatic scoring shows a total', w1 > 0, String(w1));
  await click(p, '[data-act=close-week]');
  check('week summary dialog', await p.isVisible('#sd-dialog[open]'));
  await click(p, '[data-act=dlg-next]');
  check('advanced to week 2', (await st(p)).week === 2);
  for (const w of [2, 3]) { await click(p, '[data-act=sim-week]'); await click(p, '[data-act=close-week]'); await click(p, '[data-act=dlg-next]'); }
  await click(p, '[data-act=sim-week]'); await click(p, '[data-act=close-week]');
  check('month boundary asks for the leader rotation', await p.isVisible('[data-act=dlg-next][data-i=rotate]'));
  const lead0 = await p.evaluate(() => { const s = window.YanabeeStudio.state(); return (s.team.roles.leader + s.team.rot) % s.team.size; });
  await click(p, '[data-act=dlg-next][data-i=rotate]');
  s = await st(p);
  const lead1 = (s.team.roles.leader + s.team.rot) % s.team.size;
  check('week 5 and the crown moved', s.week === 5 && lead1 === (lead0 + 1) % 7);
  check('awards or medal recorded after buddy weeks', s.awards.medal.length >= 2, JSON.stringify(s.awards));

  console.log('studio: family');
  await click(p, '.sd-step-b[data-i=family]');
  await click(p, '[data-act=rep-mode][data-i=text]');
  await p.fill('[data-in=reptext]', 'ساعدت جارنا'); await click(p, '[data-act=rep-text]');
  check('written report submitted', !!(await st(p)).weeks['5'].rep['0']);
  await click(p, '[data-act=fam-m][data-i="1"]');
  await click(p, '[data-act=rep-mode][data-i=voice]');
  await click(p, '[data-act=rec-start]'); await p.waitForTimeout(1200);
  check('recording state (real or simulated)', await p.isVisible('.sd-voice.rec'));
  await click(p, '[data-act=rec-stop]'); await p.waitForTimeout(500);
  check('recording finished', await p.isVisible('.sd-voice.done'));
  await click(p, '[data-act=rep-voice]');
  check('voice report submitted', (await st(p)).weeks['5'].rep['1'].type === 'voice');
  await p.check('input[name=sv0][value="0"]', { force: true }); await p.check('input[name=sv1][value="0"]', { force: true }); await p.check('input[name=sv2][value="1"]', { force: true });
  await click(p, '[data-act=surv-send]');
  check('parent survey submitted', !!(await st(p)).weeks['5'].sur['1']);

  console.log('studio: impact');
  await click(p, '.sd-step-b[data-i=impact]');
  check('six gauges with document targets and KPI links', (await p.$$('.sd-gc')).length === 6 && (await p.$$eval('.sd-gc a.sd-src', a => a.map(x => x.getAttribute('href')))).join() === 'quran.html#kpi2,quran.html#kpi3,quran.html#kpi5,quran.html#kpi4,quran.html#kpi6,quran.html#kpi8');
  const targets = await p.$$eval('.sd-gt b', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check('targets are the document numbers', targets.join('|') === '≥ 90%|≥ 80%|≥ 80%|مبادرة واحدة على الأقل|≥ 100%|≥ 30%', targets.join('|'));
  const vals = await p.$$eval('.sd-gval b', b => b.map(x => x.textContent));
  await click(p, '.sd-step-b[data-i=family]'); await click(p, '[data-act=fam-sim]');
  await click(p, '.sd-step-b[data-i=impact]');
  const vals2 = await p.$$eval('.sd-gval b', b => b.map(x => x.textContent));
  check('dashboard values change with the user\'s actions', vals.join() !== vals2.join(), vals.join() + ' -> ' + vals2.join());

  console.log('studio: persistence + reset');
  await p.reload(); await p.waitForTimeout(500);
  s = await st(p);
  check('state persisted after reload', s.team.launched && s.week === 5 && s.team.name === 'حرّاس الاختبار');
  check('app bar restored', (await txt(p, '.sd-ab-t b')) === 'حرّاس الاختبار');
  await click(p, '.sd-step-b[data-i=impact]');
  await click(p, '[data-act=reset]');
  check('reset needs a second press', (await st(p)).team.launched);
  await click(p, '[data-act=reset]');
  s = await st(p);
  check('reset clears everything', !s.team.launched && s.week === 1 && s.step === 'found');
  await p.reload(); await p.waitForTimeout(300);
  check('reset persisted', !(await st(p)).team.launched);
  check('no console errors (whole flow)', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('studio: mobile + overflow + reduced motion');
for (const [w, rm] of [[360, 'reduce'], [390, 'no-preference']]) {
  const { ctx, p, errs } = await open({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: rm });
  await click(p, '[data-act=pick][data-i=t3]'); await click(p, '.sd-stage [data-act=sub][data-i="1"]'); await click(p, '[data-act=nicks]');
  await click(p, '.sd-stage [data-act=sub][data-i="2"]'); await click(p, '[data-act=launch]');
  for (const k of ['chal', 'score', 'wallet', 'family', 'impact']) {
    await click(p, `.sd-step-b[data-i=${k}]`); await p.waitForTimeout(150);
    const o = await p.evaluate(() => { const W = document.documentElement.clientWidth; return { sw: document.documentElement.scrollWidth, W, bad: [...document.querySelectorAll('#studio *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('.sr-only,.sd-wh-ring,svg,[aria-hidden=true]'); }).slice(0, 3).map(e => e.className) }; });
    check(`${w}px ${k}: no horizontal overflow`, o.sw <= o.W + 1 && o.bad.length === 0, JSON.stringify(o));
  }
  const small = await p.$$eval('#studio button:not([disabled]), #studio .sd-opt-r span, #studio .sd-drop', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5) && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); }).map(e => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 5));
  check(`${w}px tap targets >= 44px (current step)`, small.length === 0, small.join(','));
  if (rm === 'reduce') {
    await click(p, '.sd-step-b[data-i=chal]');
    const anim = await p.evaluate(() => [...document.querySelectorAll('#studio *')].filter(e => { const a = getComputedStyle(e); return a.animationName !== 'none' && parseFloat(a.animationDuration) > 0.05; }).length);
    check('reduced motion: no running animations > 50ms', anim === 0, String(anim));
  }
  check(`${w}px no console errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}

console.log('studio: keyboard');
{
  const { ctx, p } = await open();
  await p.focus('[data-act=pick][data-i=t2]'); await p.keyboard.press('Enter');
  check('team card selectable with the keyboard', (await st(p)).team.id === 't2');
  await p.focus('.sd-step-b[data-i=found]');
  check('step button focus is visible (outline)', await p.$eval('.sd-step-b[data-i=found]', e => { e.focus(); return getComputedStyle(e).outlineStyle !== 'none'; }));
  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
