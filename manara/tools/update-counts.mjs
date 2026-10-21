// MANARA («منارة») — keep the "N checks pass" numbers on the pitch, the report and the poster TRUE.
//
//   node manara/tools/update-counts.mjs                    run the quick engine suites (fire, msg, qatar-data, kit, national, drone-scene) and write the counts
//   node manara/tools/update-counts.mjs --all-engine       also run the slow engine suite (sim, about 2.5 minutes)
//   node manara/tools/update-counts.mjs --browser           also run the browser suites (detect, mission, control, control-feeds, control-panels, alert, robot, home, pitch, poster, report, ui-*; many minutes)
//   node manara/tools/update-counts.mjs --all               everything above
//   node manara/tools/update-counts.mjs --from <logdir>    do not run anything: read <logdir>/<suite>.log (bash manara/tools/run-all.sh calls this at the end)
//   node manara/tools/update-counts.mjs --only fire,msg    run just these suites
//   node manara/tools/update-counts.mjs --check            exit 1 if manara/data/test-counts.js is missing, malformed or lacks a suite the pages quote
//
// Output: manara/data/test-counts.js, a classic script that sets window.MANARA_TEST_COUNTS = { generated, suites: { name: { passed, failed, date } }, total }.
// pitch.html, report.html and poster.html load it and print the numbers from it (each page also carries a static fallback, so a missing file is not an error).
// Only suites that were actually run or logged are updated; the others keep their previous number and date. A suite that FAILED is recorded with
// its real failed count, never rounded up: the pages then say "N of M" instead of pretending.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // manara/
const OUT = path.join(ROOT, 'data', 'test-counts.js');
const T = f => path.join(ROOT, 'tools', f);

// name -> [command, args, group]. The names are the ones run-all.sh prints.
export const SUITES = {
  fire: ['node', [T('test-fire.mjs')], 'quick'],
  msg: ['node', [T('test-msg.mjs')], 'quick'],
  'qatar-data': ['node', [T('test-qatar-data.mjs')], 'quick'],
  kit: ['python3', [T('test_kit.py')], 'quick'],
  national: ['node', [T('test-national.mjs')], 'quick'],
  'drone-scene': ['node', [T('test-drone-scene.mjs')], 'quick'],
  sim: ['node', [T('test-sim.mjs')], 'slow'],
  // the Playwright (browser) suites and the cross-page gate: slow, so they run only with --browser / --all (or --only name, or from run-all.sh logs).
  // The names are the ones run-all.sh prints, so `--from <logdir>` and a direct run write the same keys.
  detect: ['node', [T('test-detect.mjs')], 'browser'],
  mission: ['node', [T('test-mission.mjs')], 'browser'],
  control: ['node', [T('test-control-room.mjs')], 'browser'],
  'control-feeds': ['node', [T('test-control-feeds.mjs')], 'browser'],
  'control-panels': ['node', [T('test-control-panels.mjs')], 'browser'],
  alert: ['node', [T('test-alert.mjs')], 'browser'],
  robot: ['node', [T('test-robot-page.mjs')], 'browser'],
  home: ['node', [T('test-home.mjs')], 'browser'],
  pitch: ['node', [T('test-pitch.mjs')], 'browser'],
  poster: ['node', [T('test-poster.mjs')], 'browser'],
  report: ['node', [T('test-report.mjs')], 'browser'],
  'ui-lint': ['node', [T('test-ui.mjs'), '--suite', 'lint'], 'browser'],
  'ui-honesty': ['node', [T('test-ui.mjs'), '--suite', 'honesty'], 'browser'],
  'ui-pages': ['node', [T('test-ui.mjs'), '--suite', 'pages'], 'browser'],
  'ui-flow': ['node', [T('test-ui.mjs'), '--suite', 'flow'], 'browser'],
};
// the suites the pages quote (--check demands them)
export const QUOTED = ['fire', 'msg', 'qatar-data', 'kit', 'national', 'drone-scene', 'sim'];

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const arg = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
const today = () => new Date().toISOString().slice(0, 10);

// the LAST "N passed, M failed" line of a log (some suites print a summary line before a few trailing info lines)
export function parseCounts(text) {
  let m = null; const re = /(\d+) passed, (\d+) failed/g, all = [...String(text).matchAll(re)];
  if (all.length) m = all[all.length - 1];
  return m ? { passed: +m[1], failed: +m[2] } : null;
}

export function readExisting() {
  try {
    const src = fs.readFileSync(OUT, 'utf8'); const m = /window\.MANARA_TEST_COUNTS\s*=\s*(\{[\s\S]*\});?\s*$/.exec(src);
    return m ? JSON.parse(m[1]) : null;
  } catch (e) { return null; }
}

function write(data) {
  const names = Object.keys(data.suites).sort();
  const suites = {}; let total = 0, failed = 0;
  for (const n of names) { suites[n] = data.suites[n]; total += data.suites[n].passed; failed += data.suites[n].failed; }
  const out = { generated: data.generated, suites, total, failed };
  // compact one line per suite
  const lines = names.map(n => '  ' + JSON.stringify(n) + ': ' + JSON.stringify(suites[n]));
  const compact = '/* GENERATED by manara/tools/update-counts.mjs — do not edit by hand (bash manara/tools/run-all.sh refreshes it at the end of a run).\n' +
    ' * Pass counts of MANARA\'s own automated test suites at the time each was last run: our own tests, not a statistic about the world.\n' +
    ' * pitch.html, report.html and poster.html print these numbers (with a static fallback if this file is missing). Classic script, no libraries. */\n' +
    'window.MANARA_TEST_COUNTS = {\n' +
    ' "generated": ' + JSON.stringify(out.generated) + ',\n "total": ' + total + ',\n "failed": ' + failed + ',\n "suites": {\n' + lines.join(',\n') + '\n }\n};\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, compact);
  return out;
}

function main() {
  if (flag('check')) {
    const d = readExisting(); const bad = [];
    if (!d) bad.push('manara/data/test-counts.js is missing or not parseable');
    else for (const n of QUOTED) if (!d.suites || !d.suites[n] || !(d.suites[n].passed > 0)) bad.push('no count for ' + n);
    if (bad.length) { console.error('test-counts: ' + bad.join('; ')); process.exit(1); }
    console.log('test-counts: ok (' + Object.keys(d.suites).length + ' suites, ' + d.total + ' checks, generated ' + d.generated + ')');
    return;
  }
  const prev = readExisting() || { generated: today(), suites: {} };
  const suites = { ...prev.suites };
  const got = [];
  const from = arg('from');
  if (from) {
    // every <logdir>/<name>.log whose name is a known engine suite OR any other suite run-all logged
    for (const f of fs.readdirSync(from).filter(x => x.endsWith('.log'))) {
      const n = f.replace(/\.log$/, ''), txt = fs.readFileSync(path.join(from, f), 'utf8'), c = /^MISSING:/m.test(txt) ? null : parseCounts(txt);   // run-all.sh writes MISSING: for a suite whose file does not exist: nothing to count
      if (c) { suites[n] = { ...c, date: today() }; got.push(n); }
    }
  } else {
    const only = arg('only') ? arg('only').split(',') : Object.keys(SUITES).filter(n => SUITES[n][2] === 'quick' || (SUITES[n][2] === 'slow' && (flag('all-engine') || flag('all'))) || (SUITES[n][2] === 'browser' && (flag('browser') || flag('all'))));
    for (const n of only) {
      const s = SUITES[n]; if (!s) { console.error('unknown suite ' + n); process.exit(2); }
      process.stdout.write(`  running ${n} ... `);
      const t0 = Date.now(), r = spawnSync(s[0], s[1], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const c = parseCounts((r.stdout || '') + '\n' + (r.stderr || ''));
      if (!c) { console.log('no "N passed, M failed" line (exit ' + r.status + ') — left unchanged'); continue; }
      console.log(`${c.passed} passed, ${c.failed} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      suites[n] = { ...c, date: today() }; got.push(n);
    }
  }
  const out = write({ generated: today(), suites });
  console.log(`test-counts: wrote manara/data/test-counts.js — ${got.length} suites refreshed (${got.join(', ') || 'none'}), ${Object.keys(out.suites).length} in the file, ${out.total} checks in total${out.failed ? ', ' + out.failed + ' FAILED' : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
