// MANARA_MSG tests — Node only, no browser:  node tools/manara/test-msg.mjs
//
//   1  load under vm (no DOM, classic script), API surface, house laws (no DOM / fetch / innerHTML / modules / letter-spacing)
//   2  validate(): every hazard × level × persona × language cell, vocab, vibration, flash, pictograms, placeholders, banned claims
//   3  languages: ar/en complete, six community languages flagged draft-needs-native-review and never presented as reviewed
//   4  fallback chain (language → en → ar), aliases, unknown ids, persona restrictions
//   5  Arabic: Arabic script everywhere, no Latin letters except allowed loanwords / acronyms
//   6  native scripts of the draft languages, English without Arabic script
//   7  phone-card length budgets (headline, line, detail, voice) and 1–3 instruction lines
//   8  hazard-correct safety content (fire, smoke, gas, flood, dust, heat, SOS) per persona
//   9  formats: strobe opt-in ≤ 3 flashes/s with steady fallback, vibration, voice, wake-up ladder (T+0/30/60/90)
//  10  honesty: no invented numbers, no banned claims, no "AI", SIM labels, sources shown
//  11  dispatch wording (fastest given traffic, not nearest), hand-off labels, check-in labels, people, drone light, UI strings
//  12  sim.js action keys map onto the playbook; coverage matrix is printed
//  13  robustness: one global only, fuzzing never throws, get() is fast
//
// The messages are written by the project team; this test checks structure, consistency and the safety rules, not translation quality.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, '../../site', path.basename(HERE));
const CODE = fs.readFileSync(path.join(SITE, 'js/messages.js'), 'utf8');
const T0 = performance.now();
const ctx = vm.createContext({});
vm.runInContext(CODE, ctx, { filename: 'messages.js' });
const loadMs = performance.now() - T0;
const M = ctx.MANARA_MSG;

let passed = 0; const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  return !!cond;
};
const section = t => console.log(`\n${t}`);
const first = (arr, n = 5) => arr.slice(0, n).join(' | ');

const HZ = M.hazards().map(h => h.id), LV = M.levels().map(l => l.id), PS = M.personas().map(p => p.id), LG = M.languages().map(l => l.id);
const DRAFTS = ['ml', 'ne', 'bn', 'ur', 'hi', 'tl'];
const VARS = { exit: { ar: 'الدرج (ب)', en: 'Stair B' }, steps: 12, turn: 'left', n: 4, room: '203', place: { ar: 'المبنى ب', en: 'Building B' }, shelter: { ar: 'حاوية التبريد', en: 'the cooling container' } };
const msg = (hazard, level, persona, lang = 'en', extra = {}) => M.get({ hazard, level, persona, lang, vars: VARS, also: false, ...extra });
const body = m => [m.headline, ...m.lines, ...m.more].join(' \n ');
const applies = (ps, hz, lg) => { const p = M.personas().find(x => x.id === ps); return !(p.hazards && !p.hazards.includes(hz)) && !(p.langs && !p.langs.includes(lg)); };

// every message that exists (variants included), in every language
const ALL = [];
for (const hz of HZ) for (const lv of LV) for (const ps of PS) for (const lg of LG) {
  if (!applies(ps, hz, lg)) continue;
  const variants = hz === 'gas' ? [undefined, 'co', 'h2s'] : hz === 'flood' ? [undefined, 'driver'] : [undefined];
  for (const variant of variants) {
    const m = M.get({ hazard: hz, level: lv, persona: ps, lang: lg, vars: VARS, variant, asleep: ps === 'asleep', also: false, noLadder: true });
    ALL.push({ tag: `${hz}.${lv}.${ps}/${lg}${variant ? ':' + variant : ''}`, hz, lv, ps, lg, variant, m });
  }
}
// all raw phrase strings
const IDS = M.ids();
const RAW = IDS.map(id => ({ id, ...M.phrase(id) }));

// =====================================================================================================================
section('1. load, API, house laws');
{
  check('MANARA_MSG loads in a bare vm context (no DOM, classic script)', !!M && typeof M.get === 'function', `${(CODE.length / 1024).toFixed(0)} kB, ${loadMs.toFixed(0)} ms`);
  for (const f of ['get', 'bundle', 'byAction', 'ladder', 'text', 'languages', 'coverage', 'validate', 'strings', 'personas', 'people', 'hazards', 'levels', 'pictograms', 'vibration', 'flash', 'dispatch', 'checkin', 'drone', 'safetyNotes', 'table', 'fmtMinutes', 'fmtDuration'])
    check(`API: MANARA_MSG.${f}`, f in M);
  check('house law: no DOM, fetch, XHR, innerHTML, import/export, eval in messages.js', !/\b(document\.|window\.|fetch\(|XMLHttpRequest|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|require\()/.test(CODE.replace(/\/\*[\s\S]*?\*\//g, '')) && !/^\s*(import|export)\s/m.test(CODE) && !/\bimport\(/.test(CODE));
  check('house law: classic script IIFE, attaches to globalThis', /^\(function \(root\) \{/m.test(CODE) && /root\.MANARA_MSG = api/.test(CODE));
  check('house law: no letter-spacing, no CSS in the data file', !/letter-spacing/i.test(CODE));
  check('file stays small enough to ship (< 450 kB)', CODE.length < 450 * 1024, `${(CODE.length / 1024).toFixed(0)} kB`);
  check('pure functions: get() twice gives identical results, mutation does not leak', (() => {
    const a = M.get({ hazard: 'fire', level: 'evacuate', lang: 'en' }); const s1 = JSON.stringify(a);
    a.lines.push('x'); a.headline = 'changed'; a.vibration.pattern.push(1);
    const b = M.get({ hazard: 'fire', level: 'evacuate', lang: 'en' }); return JSON.stringify(b) === s1;
  })());
}

// =====================================================================================================================
section('2. validate()');
{
  const T1 = performance.now();
  const v = M.validate();
  const ms = performance.now() - T1;
  check('validate() passes', v.ok, first(v.errors, 6));
  check('validate() has no warnings', v.warnings.length === 0, first(v.warnings, 4));
  check('validate() checked a large matrix', v.counts.messages > 1500 && v.counts.phrases > 300, JSON.stringify(v.counts));
  check('validate() is fast enough to run in the browser (< 1.5 s)', ms < 1500, `${ms.toFixed(0)} ms`);
  const pics = M.pictograms();
  check('pictogram vocabulary: unique ids, ar + en labels, three categories at least', new Set(pics.map(x => x.id)).size === pics.length && pics.every(x => x.name.ar && x.name.en) && new Set(pics.map(x => x.cat)).size >= 3, `${pics.length} ids`);
  const vib = M.vibrations();
  check('vibration patterns are valid integer arrays (≤ 2000 ms each, ≤ 8000 ms in all)', Object.entries(vib).every(([id, v_]) => (id === 'none' ? v_.pattern.length === 0 : v_.pattern.length > 0) && v_.pattern.every(n => Number.isInteger(n) && n > 0 && n <= 2000) && v_.pattern.reduce((a, b) => a + b, 0) <= 8000), Object.keys(vib).join(','));
  check('every message of every cell has a headline and 1–3 instruction lines', ALL.every(x => x.m && x.m.headline && x.m.lines.length >= 1 && x.m.lines.length <= 3), first(ALL.filter(x => !x.m || !x.m.headline || x.m.lines.length < 1 || x.m.lines.length > 3).map(x => x.tag)));
  check('no placeholder survives in any default message', ALL.every(x => !/[{}]/.test(JSON.stringify([x.m.headline, x.m.lines, x.m.more, x.m.voice && x.m.voice.text]))), first(ALL.filter(x => /[{}]/.test(JSON.stringify([x.m.headline, x.m.lines, x.m.more]))).map(x => x.tag)));
  check('missing variables fall back to generic twins (no braces without vars, in any field)', ALL.length > 0 && HZ.every(h => PS.every(p => LV.every(l => ['ar', 'en', 'ml'].every(lg => { const m = M.get({ hazard: h, level: l, persona: p, lang: lg, also: true }); const f = [m.headline, ...m.lines, ...m.more, m.voice ? m.voice.text : '', ...m.wake.steps.flatMap(s => [s.title, s.text])]; return !f.some(z => /[{}]/.test(z)); })))));
  check('every message lists 1–5 known pictogram ids in reading order', ALL.every(x => x.m.pictograms.length >= 1 && x.m.pictograms.length <= 5 && x.m.pictograms.every(p => p.id && p.label)));
  check('message messages have a tone from the level scheme', ALL.every(x => ['info', 'warn', 'danger', 'safe'].includes(x.m.tone)));
}

// =====================================================================================================================
section('3. languages and the draft flag');
{
  const L = M.languages();
  check('eight languages: ar, en + ml ne bn ur hi tl', L.map(l => l.id).join(',') === 'ar,en,ml,ne,bn,ur,hi,tl');
  check('ar and en are complete', ['ar', 'en'].every(id => L.find(l => l.id === id).status === 'complete' && !L.find(l => l.id === id).draft));
  check('the six community languages are flagged status draft-needs-native-review and none claims review', DRAFTS.every(id => { const l = L.find(x => x.id === id); return l.status === 'draft-needs-native-review' && l.draft && l.reviewed === false && l.notice && l.notice.ar.includes('مسودة') && l.notice.en.startsWith('Draft'); }));
  check('Urdu is right-to-left, the others left-to-right (page must set dir)', L.find(l => l.id === 'ur').dir === 'rtl' && L.find(l => l.id === 'ar').dir === 'rtl' && ['en', 'ml', 'ne', 'bn', 'hi', 'tl'].every(id => L.find(l => l.id === id).dir === 'ltr'));
  check('every language has a BCP-47 tag for speech synthesis and fallbacks', L.every(l => /^[a-z]{2,3}-[A-Z]{2}$/.test(l.bcp47) && l.speech.length >= 2));
  const d = M.get({ hazard: 'fire', level: 'evacuate', persona: 'worker', lang: 'ml', asleep: true, vars: VARS });
  check('a Malayalam message is draft, flagged, shows the draft notice and carries ar + en beside it', d.lang === 'ml' && d.draft && d.status === 'draft-needs-native-review' && d.draftNotice.includes('Draft') && d.draftNotice.includes('مسودة') && d.also && d.also.ar.headline && d.also.en.lines.length > 0);
  check('draft voice scripts are flagged draft with the right language tag', d.voice && d.voice.draft === true && d.voice.lang === 'ml-IN');
  check('every draft message in every draft language is flagged draft', ALL.filter(x => DRAFTS.includes(x.lg)).every(x => x.m.draft && x.m.status === 'draft-needs-native-review'));
  check('ar and en messages are never flagged draft', ALL.filter(x => !DRAFTS.includes(x.lg)).every(x => !x.m.draft && x.m.status === 'complete'));
  check('the draft banner words exist in ar and en (ui.alert.draft)', M.text('ui.alert.draft', 'ar').includes('مسودة') && M.text('ui.alert.draft', 'en') === 'Draft — needs native-speaker review');
  const notes = M.safetyNotes().find(n => n.id === 'languages');
  check('safety notes record that the six languages are unreviewed', notes && notes.status === 'confirm-before-printing');
}

// =====================================================================================================================
section('4. fallback chain, aliases, restrictions');
{
  const g1 = M.get({ hazard: 'fire', level: 'evacuate', lang: 'xx' });
  check('unknown language → English (fallback chain language → en → ar)', g1.lang === 'en' && g1.fallback === false || g1.lang === 'en', `served ${g1.lang}`);
  const g2 = M.get({ hazard: 'fire', level: 'evacuate', persona: 'guard', lang: 'ml' });
  check('operator-facing persona asked in a draft language falls back to en and says so', g2.lang === 'en' && g2.fallback === true && g2.requestedLang === 'ml');
  const g3 = M.get({ hazard: 'gas', level: 'watch', persona: 'adult', lang: 'tl' });
  check('Tagalog served as Tagalog', g3.lang === 'tl' && g3.fallback === false);
  check('lang tags are normalised (ar-QA, en-GB, fil, ML)', M.get({ hazard: 'fire', level: 'watch', lang: 'ar-QA' }).lang === 'ar' && M.get({ hazard: 'fire', level: 'watch', lang: 'en-GB' }).lang === 'en' && M.get({ hazard: 'fire', level: 'watch', lang: 'fil' }).lang === 'tl' && M.get({ hazard: 'fire', level: 'watch', lang: 'ML' }).lang === 'ml');
  check('no language given → Arabic (the site default)', M.get({ hazard: 'fire', level: 'watch' }).lang === 'ar');
  check('hazard alias smoke-shelter → smoke; help → sos', M.get({ hazard: 'smoke-shelter', level: 'warning', lang: 'en' }).hazard === 'smoke' && M.get({ hazard: 'help', level: 'evacuate', lang: 'en' }).hazard === 'sos');
  check('level aliases: shelter → warning, clear → all-clear, evac → evacuate', M.get({ hazard: 'fire', level: 'shelter', lang: 'en' }).level === 'warning' && M.get({ hazard: 'fire', level: 'clear', lang: 'en' }).level === 'all-clear' && M.get({ hazard: 'fire', level: 'evac', lang: 'en' }).level === 'evacuate');
  check('a missing level defaults to watch (quiet), never to an alarm', M.get({ hazard: 'fire', lang: 'en' }).level === 'watch');
  check('unknown hazard → null (a caller bug is visible, not hidden)', M.get({ hazard: 'earthquake', level: 'watch', lang: 'en' }) === null && M.get({}) === null && M.get() === null);
  check('unknown persona → adult; volunteer outside SOS → adult', M.get({ hazard: 'fire', level: 'watch', persona: 'martian', lang: 'en' }).persona === 'adult' && M.get({ hazard: 'fire', level: 'evacuate', persona: 'volunteer', lang: 'en' }).persona === 'adult');
  check('persona aliases (migrant, operator, mobility, pupil)', M.get({ hazard: 'fire', level: 'watch', persona: 'migrant', lang: 'en' }).persona === 'worker' && M.get({ hazard: 'fire', level: 'watch', persona: 'operator', lang: 'en' }).persona === 'guard' && M.get({ hazard: 'fire', level: 'watch', persona: 'mobility', lang: 'en' }).persona === 'wheelchair' && M.get({ hazard: 'fire', level: 'watch', persona: 'pupil', lang: 'en' }).persona === 'child');
  check('bus level "shelter" and "evacuate" and "watch" all resolve for every hazard', HZ.every(h => ['watch', 'shelter', 'evacuate'].every(l => M.get({ hazard: h, level: l, lang: 'ar' }))));
  const b = M.bundle({ hazard: 'flood', level: 'evacuate', persona: 'worker', lang: 'ml' });
  check('bundle() returns primary + ar + en', b.primary.lang === 'ml' && b.ar.lang === 'ar' && b.en.lang === 'en');
}

// =====================================================================================================================
section('5. Arabic: script and Latin letters');
{
  const ALLOWED = new Set(['CO', 'H2S', 'LPG', 'MANARA', 'MANARA-SAFE', 'AED', 'SIM', 'WBGT', 'CAP', 'OASIS', 'OpenStreetMap']);
  const strip = s => s.replace(/\{\w+\}/g, '');
  const latinTokens = s => (strip(s).match(/[A-Za-z][A-Za-z0-9\-]*/g) || []);
  const seen = new Map();
  const bad = [];
  const scan = (tag, s) => { for (const tkn of latinTokens(s)) { if (ALLOWED.has(tkn)) seen.set(tkn, (seen.get(tkn) || 0) + 1); else bad.push(`${tag}: "${tkn}"`); } };
  for (const x of ALL.filter(y => y.lg === 'ar')) { scan(x.tag, x.m.headline); x.m.lines.forEach(l => scan(x.tag, l)); x.m.more.forEach(l => scan(x.tag, l)); if (x.m.voice) scan(x.tag + ' voice', x.m.voice.text); }
  for (const r of RAW) scan('phrase ' + r.id, r.ar);
  check('Arabic strings contain no Latin letters except the allowed loanwords/acronyms', bad.length === 0, first(bad, 6));
  console.log(`       allowed Latin tokens used in Arabic: ${[...seen.entries()].map(([k, v]) => k + '×' + v).join(', ')}`);
  check('every Arabic phrase and message contains Arabic script', RAW.every(r => /[\u0600-\u06FF]/.test(r.ar)) && ALL.filter(y => y.lg === 'ar').every(x => /[\u0600-\u06FF]/.test(x.m.headline) && x.m.lines.every(l => /[\u0600-\u06FF]/.test(l))));
  check('Arabic numbers agree with the noun (1, 2, 3–10, 11+ minutes)', M.fmtMinutes(1, 'ar') === 'دقيقة واحدة' && M.fmtMinutes(2, 'ar') === 'دقيقتين' && M.fmtMinutes(3, 'ar') === '3 دقائق' && M.fmtMinutes(10, 'ar') === '10 دقائق' && M.fmtMinutes(11, 'ar') === '11 دقيقة' && M.fmtMinutes(25, 'ar') === '25 دقيقة');
  check('Arabic seconds agree too (1, 2, 5, 47)', M.fmtDuration(1, 'ar') === 'ثانية واحدة' && M.fmtDuration(2, 'ar') === 'ثانيتين' && M.fmtDuration(5, 'ar') === '5 ثوانٍ' && M.fmtDuration(47, 'ar') === '47 ثانية' && M.fmtDuration(130, 'ar') === 'دقيقتين');
  check('digits are Western in every language (no Arabic-Indic or Devanagari digits)', RAW.every(r => !/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0D66-\u0D6F]/.test(JSON.stringify(r))));
  check('Arabic never uses letter-spacing or tatweel padding (the only kashida is the joining form in «بـ 999»)', RAW.every(r => !/\u0640/.test(r.ar.replace(/ب\u0640(?= ?[0-9{])/g, ''))));
  const sosAr = M.get({ hazard: 'sos', level: 'evacuate', lang: 'ar', vars: { n: 1 } });
  check('Arabic ETA line agrees: "نحو دقيقة واحدة"', sosAr.lines[0].includes('دقيقة واحدة'), sosAr.lines[0]);
}

// =====================================================================================================================
section('6. native scripts of the draft languages, English without Arabic script');
{
  const SCRIPT = { ml: /[\u0D00-\u0D7F]/, ne: /[\u0900-\u097F]/, hi: /[\u0900-\u097F]/, bn: /[\u0980-\u09FF]/, ur: /[\u0600-\u06FF\u0750-\u077F]/, tl: /[A-Za-z]/ };
  for (const lg of DRAFTS) {
    const strs = RAW.filter(r => r[lg]);
    const wrong = strs.filter(r => !SCRIPT[lg].test(r[lg]));
    check(`${lg}: ${strs.length} phrases, all written in the native script`, strs.length >= 100 && wrong.length === 0, first(wrong.map(r => r.id)));
    if (lg !== 'tl') {
      const latin = strs.filter(r => /[A-Za-z]{2,}/.test(r[lg].replace(/\{\w+\}/g, '')));
      check(`${lg}: no transliteration — no Latin words inside the native-script strings`, latin.length === 0, first(latin.map(r => r.id + ' → ' + r[lg].match(/[A-Za-z]{2,}/)[0])));
    }
  }
  check('English strings contain no Arabic script', RAW.every(r => !/[\u0600-\u06FF]/.test(r.en)));
  check('every draft language covers the core set: all 28 hazard×level headlines', DRAFTS.every(lg => HZ.every(h => ['watch', 'warning', 'evacuate', 'clear'].every(l => M.phrase(`h.${h}.${l}`)[lg]))));
  check('every draft language has the check-in buttons, unit names and the ETA / ambulance / police lines', DRAFTS.every(lg => ['c.safe', 'c.help', 'c.awake', 'u.fire', 'u.ambulance', 'u.police', 'u.rescue', 'u.hospital', 'r.eta', 'r.eta.ambulance', 'r.onway.ambulance', 'r.cordon.police'].every(id => M.phrase(id)[lg])));
  check('draft messages never mix in another language’s script', ALL.filter(x => ['ml', 'ne', 'bn', 'hi'].includes(x.lg)).every(x => !/[\u0600-\u06FF]/.test(x.m.headline + x.m.lines.join(''))));
}

// =====================================================================================================================
section('7. phone-card length budgets');
{
  const BUDGET = { 'ar/en': { headline: 64, line: 92, more: 120, voice: 320 }, draft: { headline: 66, line: 100, more: 140, voice: 300 } };
  const over = [];
  const maxes = { 'ar/en': { headline: 0, line: 0, more: 0, voice: 0 }, draft: { headline: 0, line: 0, more: 0, voice: 0 } };
  for (const x of ALL) {
    const b = DRAFTS.includes(x.lg) ? BUDGET.draft : BUDGET['ar/en'];
    const grp = DRAFTS.includes(x.lg) ? 'draft' : 'ar/en';
    const chk = (k, s) => { maxes[grp][k] = Math.max(maxes[grp][k], s.length); if (s.length > b[k]) over.push(`${x.tag} ${k} ${s.length}/${b[k]}`); };
    chk('headline', x.m.headline); x.m.lines.forEach(l => chk('line', l)); x.m.more.forEach(l => chk('more', l)); if (x.m.voice) chk('voice', x.m.voice.text);
  }
  check('no headline, instruction, detail line or voice script exceeds its budget', over.length === 0, first(over, 5));
  for (const g of ['ar/en', 'draft']) console.log(`       budgets (${g}): headline ≤ ${BUDGET[g].headline}, line ≤ ${BUDGET[g].line}, detail ≤ ${BUDGET[g].more}, voice ≤ ${BUDGET[g].voice}; longest seen: headline ${maxes[g].headline}, line ${maxes[g].line}, detail ${maxes[g].more}, voice ${maxes[g].voice}`);
  check('detail lines (more) number at most 4 per message', ALL.every(x => x.m.more.length <= 4));
  check('worker (picture-first) headlines are telegraphic: at most 3 segments, ≤ 40 characters', ALL.filter(x => x.ps === 'worker' && x.lv !== 'watch' && x.lv !== 'all-clear' && !DRAFTS.includes(x.lg) && !x.variant).every(x => x.m.headline.replace(/^(استيقظ!|WAKE UP!) /, '').split(/\s+[—-]\s+/).length <= 3 && x.m.headline.length <= 40), first(ALL.filter(x => x.ps === 'worker' && x.lv === 'evacuate' && x.lg === 'en').map(x => x.m.headline), 7));
  check('one action per line: no instruction line is a list of more than two sentences', ALL.every(x => x.m.lines.every(l => (l.match(/[.؟?!]\s/g) || []).length <= 2)));
}

// =====================================================================================================================
section('8. hazard-correct safety content');
{
  const lines = (h, l, p, lg = 'en', ex) => { const m = msg(h, l, p, lg, ex); return m.lines.join(' ') ; };
  const all = (h, l, p, lg = 'en', ex) => body(msg(h, l, p, lg, ex));
  // FIRE
  for (const p of ['adult', 'asleep', 'deaf', 'blind', 'elderly', 'worker']) {
    const t = all('fire', 'evacuate', p);
    check(`fire.evacuate.${p}: nearest OPEN exit, stairs not lift, named exit`, /nearest open exit/.test(t) && /Do not use the lift/.test(t) && /Stair B/.test(t));
  }
  check('fire.evacuate adult: stay low in smoke, close doors, call 999 from outside, do not go back', (() => { const t = all('fire', 'evacuate', 'adult'); return /stay low/.test(t) && /Close doors behind you/.test(t) && /Call 999 from a safe place outside/.test(t) && /Do not go back in/.test(t); })());
  check('fire.evacuate Arabic adult: same four instructions', (() => { const t = all('fire', 'evacuate', 'adult', 'ar'); return /أقرب مخرج مفتوح/.test(t) && /لا تستخدم المصعد/.test(t) && /منخفضًا/.test(t) && /أغلق الأبواب/.test(t) && /999/.test(t); })());
  const wf = msg('fire', 'evacuate', 'wheelchair');
  check('fire.evacuate.wheelchair: never "use the stairs"; refuge balcony; location sent to Civil Defence (SIM)', !/(^|\. )Use the stairs/.test(body(wf)) && /Do not use the stairs/.test(wf.lines.join(' ')) && /refuge balcony/.test(wf.lines.join(' ')) && /Civil Defence/.test(wf.lines.join(' ')));
  check('fire.evacuate.wheelchair Arabic: لا تستخدم الدرج + الشرطة الآمنة', /لا تستخدم الدرج/.test(all('fire', 'evacuate', 'wheelchair', 'ar')) && /الشرفة الآمنة/.test(all('fire', 'evacuate', 'wheelchair', 'ar')));
  check('wheelchair is never told to use the stairs, in any hazard, level or language we ship in en/ar', ALL.filter(x => x.ps === 'wheelchair' && ['en', 'ar'].includes(x.lg)).every(x => !/(^|[.!] )(Use the stairs|Go down the stairs)/.test(body(x.m)) && !/(^|[.!] )استخدم الدرج/.test(body(x.m))));
  check('fire.warning (downwind): close windows, AC off, be ready, do not go toward the fire', (() => { const t = all('fire', 'warning', 'adult'); return /Close all windows/.test(t) && /air conditioning/.test(t) && /Be ready to leave/.test(t) && /Do not go toward the fire/.test(t); })());
  check('fire.evacuate.child: follow teacher/grown-up, walk, do not run', (() => { const t = all('fire', 'evacuate', 'child'); return /teacher or a grown-up/.test(t) && /Walk. Do not run/.test(t); })());
  check('fire.evacuate.elderly: hold the rail, ask for help', /rail/.test(all('fire', 'evacuate', 'elderly')) && /neighbour or the guard/.test(all('fire', 'evacuate', 'elderly')));
  check('fire.evacuate.guard: knock on doors, check roof door (exit truth), count at the assembly point', (() => { const t = all('fire', 'evacuate', 'guard'); return /Knock on the rooms/.test(t) && /roof door/.test(t) && /assembly point/.test(t); })());
  // SMOKE
  check('smoke.warning: stay in, windows shut, AC off, asthma / heart / lung first', (() => { const t = all('smoke', 'warning', 'adult'); return /Close all windows/.test(t) && /air conditioning/.test(t) && /asthma/.test(t); })());
  check('smoke.evacuate: get out to fresh air, stay low', (() => { const t = all('smoke', 'evacuate', 'adult'); return /fresh air/.test(t) && /stay low/.test(t) && /open exit/.test(t); })());
  // GAS
  for (const p of ['adult', 'asleep', 'blind', 'elderly', 'worker']) {
    const t = all('gas', 'evacuate', p);
    check(`gas.evacuate.${p}: no switches / no flames, across or into the wind`, /switches/.test(t) && /No flames|flame/.test(t) && /across the wind/.test(t));
  }
  check('gas.evacuate LPG default: avoid low places (heavier than air), smell cannot be relied on', (() => { const t = all('gas', 'evacuate', 'adult'); return /low places/.test(t) && /smell/.test(t); })());
  check('gas.evacuate: phones — not near the source, call 999 from far away', /Do not use a phone near the source/.test(all('gas', 'evacuate', 'adult')));
  check('gas.evacuate: "open doors and windows" is scoped to a leak INSIDE the home (Civil Defence S40)', (() => { const m = msg('gas', 'evacuate', 'adult'); return m.more.some(l => /Leak inside your home\? Open doors and windows/.test(l)) && !m.lines.some(l => /Open doors/.test(l)); })());
  check('gas.warning (outdoor plume): stay in and CLOSE windows; never "open"', (() => { const t = lines('gas', 'warning', 'adult'); return /Stay inside. Close windows/.test(t) && !/Open/.test(t); })());
  const co = M.get({ hazard: 'gas', level: 'evacuate', variant: 'co', lang: 'en', also: false });
  check('gas CO variant: fresh air at once, check others (headache, dizziness), do not go back; no "low places" (CO mixes)', /fresh air/i.test(body(co)) && /headache/.test(body(co)) && /Do not go back/.test(body(co)) && !/low place/.test(body(co)), co.headline);
  const h2s = M.get({ hazard: 'gas', level: 'evacuate', variant: 'h2s', lang: 'en', also: false });
  check('gas H2S variant: across the wind, avoid low places, smell cannot be relied on', /across the wind/.test(body(h2s)) && /low places/.test(body(h2s)) && /smell/.test(body(h2s)) && /H2S/.test(h2s.headline));
  check('gas.evacuate.wheelchair: open a window if reachable, no switches, help knows the room', (() => { const t = all('gas', 'evacuate', 'wheelchair'); return /Open a window if you can reach it/.test(t) && /switches/.test(t) && /Help knows your room/.test(t); })());
  check('gas.evacuate.deaf points at the arrow on the screen', /arrow on the screen/.test(all('gas', 'evacuate', 'deaf')));
  check('gas.evacuate.child: do not touch switches, follow teacher', /Do not touch the switches/.test(all('gas', 'evacuate', 'child')) && /teacher/.test(all('gas', 'evacuate', 'child')));
  // FLOOD
  for (const p of ['adult', 'asleep', 'blind', 'elderly', 'worker', 'deaf']) {
    const t = all('flood', 'evacuate', p);
    check(`flood.evacuate.${p}: upper floor / higher ground`, /upper floor or higher ground/.test(t));
  }
  check('flood.evacuate adult: never walk or drive through moving water; no underpass; helplines 184/188/991 with 999', (() => { const t = all('flood', 'evacuate', 'adult'); return /Never walk or drive through moving water/.test(t) && /underpass/.test(t) && /184/.test(t) && /188/.test(t) && /991/.test(t) && /999/.test(t); })());
  check('flood.warning: stay upstairs, do not go down to the street; ground floor be ready to go up', (() => { const t = lines('flood', 'warning', 'adult'); return /If you are upstairs, stay there/.test(t) && /ground floor/.test(t) && /moving water/.test(t); })());
  check('flood.evacuate.wheelchair: stay upstairs (never "go down"), call 999 if water reaches', (() => { const t = all('flood', 'evacuate', 'wheelchair'); return /Stay upstairs. Do not go down/.test(t) && /call 999/.test(t); })());
  check('flood.evacuate.child: stay inside with the teacher, do not touch the water', /Stay inside with your teacher/.test(all('flood', 'evacuate', 'child')) && /Do not touch the water/.test(all('flood', 'evacuate', 'child')));
  check('flood driver variant: do not drive through water, turn around', /Do not drive through water. Turn around/.test(all('flood', 'warning', 'adult', 'en', { variant: 'driver' })));
  // DUST
  check('dust.warning adult: shelter indoors with windows closed, stop outdoor work and driving, asthma first, mask', (() => { const t = all('dust', 'warning', 'adult'); return /Stay indoors with windows and doors closed/.test(t) && /Stop outdoor work and driving/.test(t) && /asthma/.test(t) && /dust mask/.test(t); })());
  check('dust.evacuate: get inside now, mask only "if you must go out"', (() => { const t = all('dust', 'evacuate', 'adult'); return /Go into a closed building/.test(t) && /If you must go out, wear a dust mask/.test(t); })());
  check('dust.evacuate.worker: STOP WORK — GO INSIDE — MASK', msg('dust', 'evacuate', 'worker').headline === 'STOP WORK — GO INSIDE — MASK');
  // HEAT
  check('heat.evacuate adult: stop work, shade or cool shelter (named), drink water', (() => { const m = msg('heat', 'evacuate', 'adult'); return /HEAT DANGER/.test(m.headline) && /stop work/.test(m.headline) && /cooling container/.test(m.lines.join(' ')) && /Drink water/.test(m.lines.join(' ')); })());
  check('heat stroke line: call 999, cool with wet cloths, GIVE NOTHING TO DRINK — only in the confused/fainted line (never contradicts "drink water")', (() => { const m = msg('heat', 'evacuate', 'adult'); const line = m.more.find(l => /give nothing to drink/.test(l)); return !!line && /Call 999/.test(line) && /confusion or fainting/.test(line) && !m.lines.some(l => /give nothing/.test(l)); })());
  check('heat.evacuate.worker: STOP WORK — SHADE — WATER', msg('heat', 'evacuate', 'worker').headline === 'STOP WORK — SHADE — WATER');
  check('heat.evacuate.elderly/wheelchair: stay in a cool room, drink water, tell someone if dizzy', ['elderly', 'wheelchair'].every(p => /cool room/.test(all('heat', 'evacuate', p)) && /dizzy/.test(all('heat', 'evacuate', p))));
  check('heat guard: Qatar WBGT line cites 32.1 °C with its source (ILO/S19)', (() => { const m = msg('heat', 'evacuate', 'guard'); return m.more.some(l => /32\.1/.test(l) && /WBGT/.test(l)) && m.sources.some(s => s.id === 'S19'); })());
  check('heat.evacuate says MANARA asks for help if the worker stops answering (auto-SOS)', /MANARA will ask for help/.test(all('heat', 'evacuate', 'adult')));
  // SOS
  check('sos.evacuate victim: help is coming (ETA), stay where you are, unlock the door', (() => { const t = all('sos', 'evacuate', 'adult'); return /Help is coming in about 4 min/.test(t) && /Stay where you are/.test(t) && /Unlock the door/.test(t); })());
  check('sos ETA is calm: no ETA given → generic "Help is coming to you"', M.get({ hazard: 'sos', level: 'evacuate', lang: 'en', also: false }).lines[0] === 'Help is coming to you.');
  check('sos.evacuate volunteer: someone needs help in room, take the AED, call 999 if no one has; recovery position flagged for medical review', (() => { const m = msg('sos', 'evacuate', 'volunteer'); return /room 203/.test(m.lines[0]) && /AED/.test(m.lines[1]) && /Call 999 if no one has/.test(m.lines[2]) && m.more.some(l => /onto their side/.test(l)) && m.review.includes('medical'); })());
  check('sos.evacuate.guard: go to the room with the first-aid kit, open the door, meet the ambulance', (() => { const t = all('sos', 'evacuate', 'guard'); return /room 203/.test(t) && /first-aid kit/.test(t) && /Meet the ambulance/.test(t); })());
  check('sos.evacuate.blind: voice says it will say when they are at the door', /at the door/.test(msg('sos', 'evacuate', 'blind').voice.text));
  check('sos.evacuate.child: a teacher is coming, stay where you are', /A teacher is coming/.test(all('sos', 'evacuate', 'child')));
  // ALL-CLEAR
  check('all-clear never says it is safe to go back by itself: fire/gas ask for the guard / Civil Defence / "told it is safe"', /guard or Civil Defence says it is safe/.test(all('fire', 'all-clear', 'adult')) && /told it is safe/.test(all('gas', 'all-clear', 'adult')));
  check('all-clear heat: restart work only when the supervisor says so', /supervisor says so/.test(all('heat', 'all-clear', 'adult')));
  // every message carries some instruction that is not a bare "stay informed"
  check('watch-level messages never tell people to run or evacuate', ALL.filter(x => x.lv === 'watch' && ['en'].includes(x.lg) && x.ps !== 'volunteer').every(x => !/leave now|evacuate|get out/i.test(body(x.m))));
  check('child SOS card has no “unlock the door”, guard SOS watch is addressed to the helper (not “Are you OK?”)', !/Unlock/.test(all('sos', 'warning', 'child')) && msg('sos', 'watch', 'guard').headline !== 'Are you OK?');
  check('heat WARNING asks for a break in the shade; “STOP WORK” is only the evacuate level (also for the worker card)', !/STOP WORK/.test(msg('heat', 'warning', 'worker').headline) && /take a break in the shade/.test(msg('heat', 'warning', 'worker').headline));
  check('no message repeats the same instruction twice', ALL.every(x => new Set(x.m.lines).size === x.m.lines.length && new Set([...x.m.lines, ...x.m.more]).size === x.m.lines.length + x.m.more.length), first(ALL.filter(x => new Set([...x.m.lines, ...x.m.more]).size !== x.m.lines.length + x.m.more.length).map(x => x.tag)));
  check('warning and evacuate cards show 3–5 pictograms', ALL.filter(x => x.lv === 'warning' || x.lv === 'evacuate').every(x => x.m.pictograms.length >= 3 && x.m.pictograms.length <= 5), first(ALL.filter(x => (x.lv === 'warning' || x.lv === 'evacuate') && x.m.pictograms.length < 3).map(x => x.tag)));
  check('pictograms never contradict the words: wheelchair fire card shows no-stairs + refuge, never the stairs icon', (ids => ids.includes('act-no-stairs') && ids.includes('act-refuge') && !ids.includes('act-stairs'))(msg('fire', 'evacuate', 'wheelchair').pictograms.map(p => p.id)) && (ids => ids.includes('act-no-lift') && ids.includes('act-stairs') && ids.includes('act-exit'))(msg('fire', 'evacuate', 'adult').pictograms.map(p => p.id)));
  check('every pictogram id not used by a card is documented as reserved in the file header', (() => { const used = new Set(ALL.flatMap(x => x.m.pictograms.map(p => p.id))); ['driver'].forEach(v => { const m = M.get({ hazard: 'flood', level: 'warning', variant: v, lang: 'en' }); m.pictograms.forEach(p => used.add(p.id)); }); const unused = M.pictograms().map(p => p.id).filter(id => !used.has(id)); return unused.every(id => CODE.slice(0, CODE.indexOf('FORMATS (same names')).includes(id)); })());
  check('only evacuate-level messages are headlined with an imperative alarm word (LEAVE / GET OUT / STOP WORK / MOVE UP)', ALL.filter(x => x.lg === 'en' && x.lv !== 'evacuate').every(x => !/\b(LEAVE NOW|FIRE —|GAS LEAK —|FLOOD —|DUST STORM NOW)\b/.test(x.m.headline)));
}

// =====================================================================================================================
section('9. formats: strobe, vibration, voice, wake-up ladder');
{
  const F = M.flashes();
  const flashers = Object.entries(F).filter(([, f]) => f.kind === 'flash');
  check('every flashing pattern is opt-in, ≤ 3 flashes per second, has a steady fallback and a photosensitivity warning', flashers.length >= 2 && flashers.every(([id, f]) => f.optIn && 1000 / (f.onMs + f.offMs) <= 3 && F[f.fallback].kind === 'steady' && f.warning && f.warning.ar && f.warning.en), flashers.map(([id, f]) => `${id} ${(1000 / (f.onMs + f.offMs)).toFixed(1)}/s`).join(', '));
  check('non-flashing patterns are steady or none and never opt-in-only', Object.entries(F).filter(([, f]) => f.kind === 'steady' || f.kind === 'none').every(([, f]) => !f.optIn));
  check('the photosensitivity warning mentions seizures, 3 times a second and reduce-motion (ar + en)', (w => /seizures/.test(w.en) && /3 times a second/.test(w.en) && /reduce motion/.test(w.en) && /نوبات/.test(w.ar) && /3 مرات/.test(w.ar))(F['strobe-optin'].warning));
  const deafE = msg('fire', 'evacuate', 'deaf');
  check('Deaf evacuate: strobe offered but opt-in, strong vibration, text + pictogram, no sound format', deafE.flash.id === 'strobe-optin' && deafE.flash.optIn && deafE.flash.fallback === 'steady-red' && deafE.flash.warning && deafE.vibration.id === 'strong' && deafE.formats.includes('strobe') && deafE.formats.includes('text') && deafE.formats.includes('pictogram') && !deafE.formats.includes('sound'));
  check('Deaf warning: slow pulse, opt-in, with steady amber fallback', (m => m.flash.id === 'pulse-slow' && m.flash.optIn && m.flash.fallback === 'steady-amber')(msg('fire', 'warning', 'deaf')));
  check('nobody except the Deaf persona is offered a flashing pattern by default', ALL.filter(x => x.ps !== 'deaf' && x.m.flash.kind === 'flash').length === 0);
  check('non-Deaf personas use steady colours by level (info / amber / red / green)', msg('fire', 'watch', 'adult').flash.id === 'steady-info' && msg('fire', 'warning', 'adult').flash.id === 'steady-amber' && msg('fire', 'evacuate', 'adult').flash.id === 'steady-red' && msg('fire', 'all-clear', 'adult').flash.id === 'steady-green');
  const blindE = msg('fire', 'evacuate', 'blind');
  check('Blind: voice + vibration, voice speaks automatically at evacuate, strong vibration, spoken turn-by-turn', blindE.formats.includes('voice') && blindE.voice.auto && blindE.vibration.id === 'strong' && /turn left, 12 steps to Stair B/.test(blindE.voice.text) && /Keep a hand on the rail/.test(blindE.voice.text));
  check('Blind voice at watch level does not start by itself', msg('fire', 'watch', 'blind').voice.auto === false);
  check('Deaf persona has no voice script', msg('fire', 'evacuate', 'deaf').voice === null && msg('fire', 'evacuate', 'guard').voice === null);
  const wd = M.get({ hazard: 'fire', level: 'evacuate', persona: 'wheelchair', needs: ['deaf'], lang: 'en', also: false });
  check('several needs: wheelchair TEXT (no stairs) + Deaf FORMAT (strobe opt-in, strong vibration, no sound, no automatic voice)', wd.persona === 'wheelchair' && /Do not use the stairs/.test(wd.lines.join(' ')) && wd.flash.id === 'strobe-optin' && wd.flash.optIn && wd.vibration.id === 'strong' && wd.formats.includes('strobe') && !wd.formats.includes('sound') && !(wd.voice && wd.voice.auto));
  const ns = M.get({ hazard: 'fire', level: 'evacuate', needs: ['deaf', 'wheelchair', 'asleep'], lang: 'en', also: false });
  check('needs alone pick the safe text persona (wheelchair > child > blind > deaf > elderly > worker) and “asleep” adds the wake prefix', ns.persona === 'wheelchair' && ns.headline.startsWith('WAKE UP!') && ns.vibration.id === 'wake' && M.personaFromNeeds(['deaf', 'elderly']).text === 'deaf' && M.personaFromNeeds(['child', 'blind']).text === 'child' && M.personaFromNeeds([]).text === 'adult');
  const eb = M.get({ hazard: 'gas', level: 'evacuate', persona: 'elderly', needs: ['blind'], lang: 'en', also: false });
  check('an older blind resident gets the elderly text and the blind voice guidance', eb.persona === 'elderly' && eb.voice.auto && /I will say left or right/.test(eb.voice.text) && eb.formats.includes('voice') && eb.vibration.id === 'strong');
  check('child gets a picture card + voice; worker gets picture + sound + text', msg('fire', 'evacuate', 'child').formats.includes('card') && msg('fire', 'evacuate', 'worker').formats.includes('pictogram') && msg('fire', 'evacuate', 'worker').voice.auto);
  check('voice scripts carry a BCP-47 tag and speech fallbacks; Arabic is ar-QA with ar-SA, ar fallbacks', (v => v.lang === 'ar-QA' && v.fallback.includes('ar-SA') && v.fallback.includes('ar') && v.text.length > 10)(msg('fire', 'evacuate', 'adult', 'ar').voice));
  const asl = msg('fire', 'evacuate', 'asleep', 'en', { asleep: true });
  check('Asleep: WAKE UP! prefix at evacuate, wake vibration, sound added, ladder attached', asl.headline.startsWith('WAKE UP! FIRE') && asl.vibration.id === 'wake' && asl.formats.includes('sound') && asl.wake.mode === 'ladder' && asl.wake.steps.length === 4);
  check('Asleep Arabic prefix «استيقظ!»', msg('fire', 'evacuate', 'asleep', 'ar').headline.startsWith('استيقظ! حريق'));
  check('no wake-up prefix at watch or all-clear, and not for people who are awake', !msg('fire', 'watch', 'asleep').headline.startsWith('WAKE') && !msg('fire', 'all-clear', 'asleep').headline.startsWith('WAKE') && !msg('fire', 'evacuate', 'adult').headline.startsWith('WAKE'));
  check('Ravi at night = worker + asleep: telegraphic headline AND wake prefix AND wake vibration', (m => m.headline === 'WAKE UP! FIRE — OUT — Stair B' && m.vibration.id === 'wake')(msg('fire', 'evacuate', 'worker', 'en', { asleep: true })));
  check('wake modes: evacuate fire/smoke/gas/flood = ladder; heat is a daytime hazard (none)', ['fire', 'smoke', 'gas', 'flood'].every(h => msg(h, 'evacuate', 'adult').wake.mode === 'ladder') && msg('heat', 'evacuate', 'adult').wake.mode === 'none' && msg('fire', 'watch', 'adult').wake.mode === 'none');
  const lad = M.ladder({ hazard: 'fire', persona: 'asleep', lang: 'en', vars: VARS });
  check('ladder: four steps at T+0 / +30 / +60 / +90 s (stepSec 30, same as sim.js ladderStepSec)', lad.steps.map(s => s.tSec).join(',') === '0,30,60,90' && lad.stepSec === 30);
  check('ladder step 0 = wake headline + "Tap I\'m awake"; step 1 louder + light; step 2 guard; step 3 Civil Defence', lad.steps[0].title.startsWith('WAKE UP!') && /I'm awake/.test(lad.steps[0].text) && lad.steps[1].louder && lad.steps[1].light && /guard/.test(lad.steps[2].title) && lad.steps[2].audience.includes('guard') && /knock on these rooms/.test(lad.steps[2].guardText) && /Civil Defence/.test(lad.steps[3].title) && lad.steps[3].audience.includes('operator') && /sent to Civil Defence/.test(lad.steps[3].operatorText));
  check('ladder text is complete in Arabic and English, and has titles in all six drafts', ['ar', 'en', ...DRAFTS].every(lg => M.ladder({ hazard: 'fire', persona: 'asleep', lang: lg }).steps.every(s => s.title && s.text)));
  check('ladder: Deaf gets strobe (opt-in) not sound; blind gets voice; step formats follow the persona', (d => d.steps[0].formats.includes('strobe') && !d.steps[0].formats.includes('sound'))(M.ladder({ hazard: 'fire', persona: 'deaf', lang: 'en' })) && M.ladder({ hazard: 'fire', persona: 'blind', lang: 'en' }).steps[0].formats.includes('voice'));
  check('ladder sound = 520 Hz three pulses with the source (S56) and the phone-speaker caveat', lad.sound.hz === 520 && lad.sound.pattern === 'three-pulse' && lad.sound.src.includes('S56') && /poorly/.test(lad.sound.note));
  check('ladder step length is adjustable (stepSec) and stops on "awake"', M.ladder({ hazard: 'fire', stepSec: 20, lang: 'en' }).steps.map(s => s.tSec).join() === '0,20,40,60' && lad.steps.every(s => s.stopsOn === 'awake') && lad.stopText.length > 5);
}

// =====================================================================================================================
section('10. honesty');
{
  const ENG = RAW.map(r => ({ id: r.id, s: r.en })), ARB = RAW.map(r => ({ id: r.id, s: r.ar }));
  const banned = /world[- ]first|\bthe first(?![- ]aid)\b|first[- ]ever|saves? (?:\d+ )?lives|\bAI\b|deep learning|artificial intelligence/i;
  check('no banned claims in English (first, world-first, saves lives, AI, deep learning)', ENG.every(x => !banned.test(x.s)), first(ENG.filter(x => banned.test(x.s)).map(x => x.id)));
  check('no banned claims in Arabic (ذكاء اصطناعي، الأول من نوعه، ينقذ أرواح)', ARB.every(x => !/ذكاء اصطناعي|الأول من نوعه|ينقذ أرواح|أول نظام/.test(x.s)));
  // numbers: only those with a source (S-ids) or demo labels
  const NUM_OK = { '999': 'S40', '184': 'S71', '188': 'S71', '991': 'S71', '32.1': 'S19', '520': 'S56', '3': 'S57 flashes per second / three pulses', '2': 'two flashes / seconds (design)', '1.2': 'OASIS CAP version', '1': 'Level I (S73)', '30': 'seconds (design)', '5': 'class 5B (demo)', '9': 'Lina age (demo)', '24': 'ED capability label “24-hour” (QATAR §2b ed24, S72)', '2020': 'citation year of the NFPA Research Foundation report (S56)' };
  const numbersIn = s => (s.replace(/\{\w+\}/g, '').match(/\d+(?:\.\d+)?/g) || []);
  const badNums = [];
  for (const r of RAW) for (const lg of ['ar', 'en']) for (const n of numbersIn(r[lg])) if (!(n in NUM_OK)) badNums.push(`${r.id}/${lg}: ${n}`);
  check('every number in the wording is a sourced figure (999, 184/188/991, 32.1, 520, …) — no invented statistics', badNums.length === 0, first(badNums));
  const withNums = RAW.filter(r => /\b(184|188|991|32\.1|520)\b/.test(r.en));
  check('phrases that show a sourced number name their source (src: S71 / S19 / S56)', withNums.every(r => (r.src && r.src.length) || /^(ui\.alert\.sound_note|x\.ladder)/.test(r.id)), first(withNums.filter(r => !(r.src && r.src.length)).map(r => r.id)));
  check('messages that use a sourced line list the source (flood numbers → S71, heat rule → S19)', msg('flood', 'evacuate', 'adult').sources.some(s => s.id === 'S71') && msg('heat', 'evacuate', 'guard').sources.some(s => s.id === 'S19') && msg('fire', 'evacuate', 'adult').sources.some(s => s.id === 'S56'));
  check('every source cited by a phrase has a bilingual label', RAW.every(r => (r.src || []).every(s => M.sources()[s] && M.sources()[s].short.ar && M.sources()[s].short.en)));
  check('demo/SIM labels exist: EXERCISE banner, SIM, “not an official warning”, 999 stays the dispatcher', /EXERCISE/.test(M.text('ui.alert.exercise', 'en')) && /not an official warning/.test(M.text('ui.alert.exercise', 'en')) && /SIM/.test(M.text('r.sim', 'en')) && /999 is the real dispatcher/.test(M.text('r.999', 'en')) && /تمرين/.test(M.text('ui.alert.exercise', 'ar')) && /لا تتصل نيابةً عنك/.test(M.text('r.999', 'ar')));
  check('the national alert tone is never copied (note on the page) and the tone source S36 is cited', /not the national alert tone/.test(M.text('ui.alert.tone_note', 'en')) && M.phrase('ui.alert.tone_note').src.includes('S36'));
  check('N/A wording exists: “N/A for this stimulus”', M.text('ui.alert.na', 'en') === 'N/A for this stimulus' && /غير متاح/.test(M.text('ui.alert.na', 'ar')));
  check('nearby-facilities strings: consent, informational, distance not ETA, may be incomplete, offline fallback, call 999 (ar + en)', ['consent', 'intro', 'distance', 'incomplete', 'offline', 'call999', 'not_dispatch'].every(k => M.ui('nearby.' + k, 'en').length > 10 && M.ui('nearby.' + k, 'ar').length > 5) && /not saved/.test(M.ui('nearby.consent', 'en')) && /Distance, not travel time/.test(M.ui('nearby.distance', 'en')));
  const notes = M.safetyNotes();
  const STAT = ['sourced', 'confirm-before-printing', 'medical-review', 'changed-from-research', 'demo-only', 'not-included'];
  check('safety notes: every note has an id, a status and bilingual text; every cited source exists', notes.length >= 20 && notes.every(n => n.id && STAT.includes(n.status) && n.text.ar && n.text.en && (n.basis || []).every(s => M.sources()[s])), `${notes.length} notes`);
  check('first-aid / medical lines are flagged for review before printing (dust mask, asthma, heat stroke, recovery position, CO signs)', ['dust-mask', 'heat-stroke', 'sos-recovery', 'gas-co-signs'].every(id => notes.find(n => n.id === id && n.status === 'medical-review')));
  check('the “no lift” and “stay low” lines are flagged confirm-before-printing (no source row)', ['fire-no-lift', 'fire-stay-low', 'gas-no-phone'].every(id => notes.find(n => n.id === id && n.status === 'confirm-before-printing')));
  check('the Deaf card does not show 992 (needs an official check first)', ALL.filter(x => x.ps === 'deaf').every(x => !/992/.test(body(x.m))) && notes.find(n => n.id === 'deaf-992').status === 'not-included');
}

// =====================================================================================================================
section('11. dispatch wording, hand-off labels, check-in, people, drone light, UI strings');
{
  const D = M.dispatch;
  check('spec line: "Fire engine ETA 4 min"', D.resident({ kind: 'fire', state: 'en-route', n: 4, lang: 'en' }) === 'Fire engine ETA 4 min');
  check('spec line: "Ambulance on its way — stay where you are"', D.resident({ kind: 'ambulance', state: 'en-route', lang: 'en' }) === 'Ambulance on its way — stay where you are');
  check('with an ETA the ambulance line keeps "stay where you are"', D.resident({ kind: 'ambulance', state: 'dispatched', n: 6, lang: 'en' }) === 'Ambulance ETA 6 min — stay where you are');
  check('spec line: "Police are closing the road"', D.resident({ kind: 'police', state: 'on-scene', cordon: true, lang: 'en' }) === 'Police are closing the road');
  check('Arabic resident lines are calm and agree in number', D.resident({ kind: 'fire', state: 'en-route', n: 4, lang: 'ar' }) === 'سيارة الإطفاء: الوصول خلال 4 دقائق' && D.resident({ kind: 'ambulance', state: 'en-route', n: 2, lang: 'ar' }) === 'الإسعاف: الوصول خلال دقيقتين — ابقَ مكانك' && D.resident({ kind: 'police', state: 'en-route', cordon: true, lang: 'ar' }) === 'الشرطة تغلق الطريق');
  check('update line when the ETA changes materially', D.resident({ kind: 'fire', state: 'en-route', n: 7, update: true, lang: 'en' }) === 'Update: Fire engine ETA is now 7 min');
  check('residents never see a mere recommendation (state recommended → null)', D.resident({ kind: 'fire', state: 'recommended', n: 4, lang: 'en' }) === null);
  check('on-scene and cleared lines exist for every unit kind in ar + en', ['fire', 'ambulance', 'police', 'rescue'].every(k => D.resident({ kind: k, state: 'on-scene', lang: 'en' }).includes('on scene') && D.resident({ kind: k, state: 'on-scene', lang: 'ar' }).includes('وصل') && D.resident({ kind: k, state: 'cleared', lang: 'en' }).length > 5));
  check('draft-language resident lines: Malayalam ambulance line is the stay-put line, flagged by the language status', /ആംബുലൻസ്/.test(D.resident({ kind: 'ambulance', state: 'en-route', n: 6, lang: 'ml' })) && M.languages().find(l => l.id === 'ml').draft);
  const rec = D.operator('rec', { noun: 'fire', name: 'Civil Defence Station A (demo)', n: 4, name2: 'Station B (demo)', mins2: 7 }, 'en');
  check('operator line: "Recommended: fastest available fire unit — …, ETA 4 min; runner-up … 7 min."', rec === 'Recommended: fastest available fire unit — Civil Defence Station A (demo), ETA 4 min; runner-up Station B (demo) 7 min.', rec);
  check('operator line is about the FASTEST unit given traffic, never "the nearest" as the rule (en + ar)', !/nearest available/i.test(rec) && /fastest/.test(rec) && /أسرع/.test(D.operator('rec', { noun: 'fire', name: 'أ', n: 4, name2: 'ب', mins2: 7 }, 'ar')) && /not the shortest distance/.test(M.text('o.why', 'en')) && /وليس أقصر مسافة/.test(M.text('o.why', 'ar')));
  check('no runner-up → "No other unit is available"', /No other unit is available/.test(D.operator('rec', { noun: 'ambulance', name: 'Ambulance point (demo)', n: 6 }, 'en')));
  check('"farther but faster" explanation (km, seconds, reason)', D.operator('far_faster', { name: 'Station B', km: 2.1, gain: 47, reason: 'traffic' }, 'en') === 'Station B is 2.1 km farther than the nearest unit but 47 s faster (traffic got worse on its route).' && /أسرع بمقدار 47 ثانية/.test(D.operator('far_faster', { name: 'ب', km: 2.1, gain: 47, reason: 'traffic' }, 'ar')));
  check('nearest-by-distance is shown only as a comparison line', /^Nearest by distance: /.test(D.operator('nearest', { name: 'A', km: 1.4, n: 5 }, 'en')));
  check('re-dispatch lines with all four reasons, ar + en', ['closed', 'traffic', 'busy', 'faster'].every(r => D.operator('redispatched', { from: 'A', to: 'B', reason: r, gain: 130 }, 'en').includes('2 min faster') && D.operator('redispatched', { from: 'أ', to: 'ب', reason: r, gain: 130 }, 'ar').includes('دقيقتين')));
  check('hospital line states the capability (24-hour / Level I trauma / paediatric) and “fastest”', ['ed', 'trauma', 'paed'].every(k => /fastest/.test(D.operator('hospital', { name: 'H', n: 3, need: k }, 'en'))) && /Level I trauma care/.test(D.operator('hospital', { name: 'H', n: 3, need: 'trauma' }, 'en')));
  check('SIM + fictional + "MANARA only recommends; 999 decides" texts exist (operator)', /SIM traffic/.test(M.text('o.sim', 'en')) && /only recommends/.test(M.text('o.dispatcher', 'en')) && /توصي فقط/.test(M.text('o.dispatcher', 'ar')) && /SIM assumption/.test(M.text('o.capacity', 'en')));
  check('unit labels in all eight languages for fire, ambulance, police, rescue, hospital', LG.every(lg => ['fire', 'ambulance', 'police', 'rescue', 'hospital'].every(k => D.unit(k, lg).length > 1)) && D.unit('fire', 'en') === 'Fire engine' && D.unit('hospital', 'ar') === 'المستشفى');
  check('dispatch states in ar + en (recommended → approved → dispatched → en route → on scene → cleared)', ['recommended', 'approved', 'dispatched', 'en-route', 'on-scene', 'cleared'].every(s => D.state(s, 'en').length > 3 && D.state(s, 'ar').length > 3));
  const plan = D.plan('fire');
  check('dispatch plan per hazard follows the spec (fire: fire + ambulance + police; gas: hazmat; flood: rescue + police + ambulance; heat/SOS end at a hospital)', plan.map(x => x.kind).join() === 'fire,rescue,ambulance,police' && D.plan('gas')[0].kind === 'hazmat' && D.plan('flood').map(x => x.kind).join() === 'rescue,police,ambulance' && D.plan('heat').some(x => x.kind === 'hospital') && D.plan('sos').some(x => x.kind === 'hospital') && D.plan('dust').map(x => x.kind).join() === 'police,ambulance');
  const hc = D.handoff('en'), hca = D.handoff('ar');
  check('hand-off card labels: every field in ar + en, incl. exit states and the “999 stays the dispatcher” line', hc.order.length >= 20 && hc.order.every(k => hc.labels[k] && hca.labels[k]) && hc.labels.status && hc.states.locked === 'LOCKED' && hca.states.locked === 'مقفل' && hc.labels.dispatcher === '999 stays the dispatcher');
  check('hand-off CAP label names OASIS CAP 1.2 and status Exercise', /OASIS CAP 1\.2/.test(hc.labels.cap) && /Exercise/.test(hc.labels.cap));
  const ck = M.checkin('en'), cka = M.checkin('ar');
  check('check-in labels: "I\'m safe", "I need help", "I\'m awake" in ar + en', ck.safe === "I'm safe" && ck.help === 'I need help' && ck.awake === "I'm awake" && cka.safe === 'أنا بأمان' && cka.help === 'أحتاج مساعدة' && cka.awake === 'أنا مستيقظ');
  check('check-in buttons exist in every language and are distinct', LG.every(lg => { const c = M.checkin(lg); return c.safe && c.help && c.awake && new Set([c.safe, c.help, c.awake]).size === 3; }));
  check('the button names inside the instruction lines match the buttons (Arabic)', M.get({ hazard: 'sos', level: 'watch', lang: 'ar' }).lines[0].includes(M.checkin('ar').safe) && M.get({ hazard: 'sos', level: 'watch', lang: 'ar' }).lines[0].includes(M.checkin('ar').help));
  const P_ = M.people();
  check('people: Ravi (Malayalam, worker, room 203), Huda (Deaf, 105), Abu Salem (wheelchair + elderly, 302), Lina (child, 9, 5B), a guard and a blind resident — all fictional', ['ravi', 'huda', 'abu-salem', 'lina', 'guard', 'yousef'].every(id => P_.find(x => x.id === id && x.fictional)) && P_.find(x => x.id === 'ravi').lang === 'ml' && P_.find(x => x.id === 'ravi').persona === 'worker' && P_.find(x => x.id === 'ravi').room === '203' && P_.find(x => x.id === 'huda').persona === 'deaf' && P_.find(x => x.id === 'abu-salem').persona === 'wheelchair' && P_.find(x => x.id === 'lina').age === 9 && P_.find(x => x.id === 'yousef').persona === 'blind' && P_.find(x => x.id === 'yousef').room === '207');
  check('people have bilingual names, roles and a one-line story each', P_.every(x => x.name.ar && x.name.en && x.role.ar && x.role.en && x.story.ar.length > 20 && x.story.en.length > 20 && !x.story.en.includes('\n')));
  check('personaFor(simKey) maps the sim hero keys', M.personaFor('ravi').lang === 'ml' && M.personaFor('abu-salem').persona === 'wheelchair' && M.personaFor('nobody') === null);
  const dr = M.drone('en');
  check('friendly drone light: steady green + two white flashes every 2 s, ≤ 3 flashes/s, no siren, “not an official standard”', dr.flash.cycleMs === 2000 && dr.flash.events.length === 2 && dr.flash.events.every(e => e.color === 'white') && dr.flash.base.token === '--safe' && /steady green/i.test(dr.description) && /two short white flashes every 2 seconds/.test(dr.description) && /no siren/.test(dr.description) && /not an official standard/.test(dr.note) && /never flashes more than 3 times a second/.test(dr.safe));
  check('the drone note keeps the drone a concept for a licensed agency and says nothing flies over anyone', /concept for a licensed agency/.test(dr.note) && /nothing flies over anyone/.test(dr.note) && /مفهوم/.test(M.drone('ar').note));
  const S = M.strings();
  check('strings() returns Manara.strings()-shaped entries {ar,en} under msg.* keys, no placeholders', Object.keys(S).length > 120 && Object.entries(S).every(([k, v]) => k.startsWith('msg.') && v.ar && v.en && !/\{\w+\}/.test(v.ar + v.en)));
  check('alert-page UI strings exist in ar + en: title, exercise banner, strobe warning, reduced motion, read aloud, route, call 999', ['title', 'exercise', 'strobe_warn', 'reduced_motion', 'read_aloud', 'route', 'call999', 'responders', 'counted', 'help_sent', 'draft', 'draft_note', 'fallback'].every(k => M.ui('alert.' + k, 'en') && M.ui('alert.' + k, 'ar')));
  check('UI placeholder strings fill: route_to, distance, eta_front', M.ui('alert.route_to', 'en', { place: 'the school yard' }) === 'to the school yard' && M.ui('alert.distance', 'ar', { m: 108 }) === 'المسافة إلى الخطر: 108 م' && M.ui('alert.eta_front', 'ar', { n: 7 }) === 'وصول الغبار المتوقع خلال 7 دقائق');
  const tab = M.table({ lang: 'en' });
  check('table(): 28 rows for the report/poster (7 hazards × 4 levels)', tab.length === 28 && tab.every(r => r.headline && r.lines.length));
}

// =====================================================================================================================
section('12. sim.js action keys and the coverage matrix');
{
  const SIM = fs.readFileSync(path.join(SITE, 'js/sim.js'), 'utf8');
  const block = SIM.slice(SIM.indexOf('var ACTIONS = {'), SIM.indexOf('function actionKey'));
  const simKeys = [...block.matchAll(/'([a-z]+\.[a-z]+)': T\(/g)].map(m => m[1]);
  check('sim.js defines its action keys (found by reading the file)', simKeys.length >= 14, simKeys.join(' '));
  check('every sim.js action key maps onto the playbook and resolves in ar + en', simKeys.every(k => M.byAction(k) && M.get({ action: k, lang: 'ar' }) && M.get({ action: k, lang: 'en' })), first(simKeys.filter(k => !M.byAction(k))));
  const act = M.actions();
  check('every action key we map also exists in sim.js (except our own smoke.shelter)', Object.keys(act).filter(k => k !== 'smoke.shelter').every(k => simKeys.includes(k)), first(Object.keys(act).filter(k => !simKeys.includes(k) && k !== 'smoke.shelter')));
  check('fire.refuge → wheelchair evacuate (refuge balcony), fire.exit → adult evacuate, fire.shelter → warning', M.get({ action: 'fire.refuge', lang: 'en' }).persona === 'wheelchair' && /refuge balcony/.test(M.get({ action: 'fire.refuge', lang: 'en' }).lines.join(' ')) && M.get({ action: 'fire.exit', lang: 'en' }).level === 'evacuate' && M.get({ action: 'fire.shelter', lang: 'en' }).level === 'warning');
  check('get({action}) with an explicit persona keeps that persona', M.get({ action: 'fire.exit', persona: 'blind', lang: 'en' }).persona === 'blind');
  check('messages report the sim action key they correspond to (fire.evacuate.adult → fire.exit)', msg('fire', 'evacuate', 'adult').action === 'fire.exit' && msg('gas', 'evacuate', 'adult').action === 'gas.crosswind' && msg('flood', 'warning', 'adult').action === 'flood.stay' && msg('sos', 'evacuate', 'volunteer').action === 'sos.volunteer');
  check('sim.js ladder step default is 30 s and four steps (T+0/+30/+60/+90) — same as the ladder here', /def\('ladderStepSec', 'alert', 30,/.test(SIM) && M.ladderSpec().stepSec === 30 && M.ladderSpec().steps.length === 4);
  check('sim.js format names are the same ones messages use (sound, vibration, strobe, voice, card, text, pictogram)', ['sound', 'vibration', 'strobe', 'voice', 'card', 'text', 'pictogram'].every(f => M.personas().some(p => p.formats.includes(f))) && /FORMATS = \{[\s\S]*strobe[\s\S]*voice[\s\S]*card/.test(SIM));

  // ---- coverage matrix
  const C = M.coverage();
  console.log('\n' + C.text + '\n');
  const cells = C.rows.length * C.langs.length;
  check('coverage covers hazard × persona × language = 7 × 10 × 8 cells', C.rows.length === 70 && cells === 560 && C.hazards.length === 7 && C.personas.length === 10 && C.langs.length === 8);
  check('Arabic and English are complete in every applicable cell (64 each; guard + volunteer rules only remove 6)', C.totals.ar.complete === 64 && C.totals.en.complete === 64 && C.totals.ar.missing === 0 && C.totals.en.missing === 0 && C.totals.ar['n/a'] === 6);
  check('every community language is draft (never complete) in every applicable cell, none missing', DRAFTS.every(lg => C.totals[lg].complete === 0 && C.totals[lg].missing === 0 && C.totals[lg].draft + C.totals[lg]['draft-core'] === 56 && C.totals[lg]['n/a'] === 14), DRAFTS.map(lg => lg + ':' + JSON.stringify(C.totals[lg])).join(' '));
  check('how many draft cells carry the full persona text vs core only is reported', true, DRAFTS.map(lg => `${lg} D${C.totals[lg].draft} d${C.totals[lg]['draft-core']}`).join(', '));
  check('not-applicable cells are exactly: volunteer outside SOS, and operator personas in the six draft languages', C.rows.every(r => DRAFTS.concat(['ar', 'en']).every(lg => { const na = r.cells[lg] === 'n/a'; const expect = (r.persona === 'volunteer' && r.hazard !== 'sos') || (['guard', 'volunteer'].includes(r.persona) && DRAFTS.includes(lg)); return na === expect; })));
  const sn = M.safetyNotes();
  console.log('Safety notes (what was changed from, or goes beyond, the research — printed for the report):');
  for (const st of ['changed-from-research', 'confirm-before-printing', 'medical-review', 'demo-only', 'not-included']) {
    const ns = sn.filter(n => n.status === st); console.log(`  ${st} (${ns.length}): ${ns.map(n => n.id).join(', ')}`);
  }
}

// =====================================================================================================================
section('13. robustness');
{
  const leak = vm.createContext({}); vm.runInContext(CODE, leak);
  check('the script adds exactly one global: MANARA_MSG', Object.keys(leak).join() === 'MANARA_MSG', Object.keys(leak).join());
  const vals = [undefined, null, '', 0, 1, -5, NaN, 'x', 'fire', 'evacuate', 'ar', {}, [], { ar: 'a' }, { en: 'b' }, true, 'ML', 'smoke-shelter', 'shelter', 99999];
  let calls = 0; const threw = [];
  const t = (name, fn) => { try { fn(); calls++; } catch (e) { threw.push(name + ': ' + e.message); } };
  for (const h of vals) for (const l of vals.slice(0, 12)) for (const p of [undefined, 'child', 'xx', null]) for (const g of [undefined, 'ml', 'zz', 5])
    t('get', () => M.get({ hazard: h, level: l, persona: p, lang: g, vars: { n: h, exit: l, steps: p, mins: NaN, room: {}, place: null, turn: 'up' }, asleep: !!l, variant: g }));
  for (const a of vals) {
    t('byAction', () => M.byAction(a)); t('text', () => M.text(a, a, a)); t('ladder', () => M.ladder(a)); t('fmtMinutes', () => M.fmtMinutes(a, 'ar')); t('fmtDuration', () => M.fmtDuration(a, 'en'));
    t('resident', () => M.dispatch.resident({ kind: a, state: a, n: a, lang: a })); t('operator', () => M.dispatch.operator(a, a, a)); t('plan', () => M.dispatch.plan(a)); t('handoff', () => M.dispatch.handoff(a));
    t('bundle', () => M.bundle(a)); t('table', () => M.table(a)); t('checkin', () => M.checkin(a)); t('ui', () => M.ui(a, a, a)); t('personaFor', () => M.personaFor(a)); t('drone', () => M.drone(a)); t('fill', () => M.fill(a, a, a));
  }
  check('fuzzing the public API (odd hazards, levels, personas, languages, variables) never throws', threw.length === 0, `${calls} calls; ${first(threw, 3)}`);
  check('unknown phrase ids give an empty string, not an exception', M.text('no.such.id', 'ar') === '' && M.phrase('no.such.id') === null);
  const t1 = performance.now(); for (let i = 0; i < 1000; i++) M.get({ hazard: 'fire', level: 'evacuate', persona: 'worker', lang: 'ml', asleep: true }); const per = (performance.now() - t1) / 1000;
  check('get() is cheap enough to call on every bus message (< 1 ms each, ladder included)', per < 1, `${per.toFixed(3)} ms`);
}

console.log(`\n${passed} passed, ${failures.length} failed  (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
