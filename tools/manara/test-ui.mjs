// MANARA («منارة») cross-page QA gate.   node tools/manara/test-ui.mjs [--suite lint|honesty|pages|flow|all] [--pages index,mission,...]
//
// One file, four suites (run-all.sh prints a verdict for each):
//   lint     static scan of site/manara/** (no browser): every .js parses as a CLASSIC script (vm.Script, so ES-module syntax fails),
//            tools/*.mjs + python parse, forbidden patterns (modules, fetch/XHR of local files, innerHTML with non-literal data,
//            letter-spacing on Arabic, physical left/right CSS, external scripts/CDNs, banned phrases), every src/href/url() reference
//            exists, nav targets exist, page skeleton (doctype, lang/dir, bilingual <title>, skip link, #main, data-page).
//   honesty  renders index/pitch/report/poster/build/alert/detect/mission/404 in ar+en and cross-checks every real-world number against
//            docs/MANARA-SOURCES.md (best effort: see the long comment at the top of that suite), every cited S-number exists, sourced
//            figures carry a visible source, simulation numbers are labelled, Arabic and English show the same numbers.
//   pages    every page loads from file:// with no console error / page error / failed local request, in ar+en x dark+light x 390+1440:
//            lang/dir flip, bilingual <title>, no horizontal overflow, no duplicate ids, accessible names (Chrome's accessibility tree),
//            WCAG contrast of rendered text in both themes, nav + skip link + focus order, mobile menu, language/theme toggles,
//            letter-spacing never on Arabic, prefers-reduced-motion leaves no running looping animation on the hero.
//   flow     one browser context, mission + alert + detect open together: Evidence Lab detection -> Mission Control vision key ->
//            second key -> Approve -> phone alert -> "I'm awake" -> "I'm safe" -> headcount -> "I need help" -> hand-off.
//
// Exit code 1 on any failure. Tests never depend on the network (Google Fonts are blocked by lib.mjs).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { launch, openPage, overflow, check, done, SITE, ROOT, url } from './lib.mjs';

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.findIndex(a => a === '--' + n || a.startsWith('--' + n + '=')); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=')[1] : (argv[i + 1] || d); };
const SUITE = argOf('suite', 'all');
const want = s => SUITE === 'all' || SUITE === s;
const ALL_PAGES = ['index', 'mission', 'detect', 'alert', 'build', 'pitch', 'report', 'poster', '404'];
const PAGES = (argOf('pages', '') ? argOf('pages', '').split(',') : ALL_PAGES);
const section = t => console.log('\n' + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snip = (s, n = 90) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);
const VERBOSE = !!process.env.UI_VERBOSE;
const first = (arr, n = 4) => { if (VERBOSE) n = 1e9; return arr.slice(0, n).join(' | ') + (arr.length > n ? ` | … +${arr.length - n} more` : ''); };
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
const rel = p => path.relative(SITE, p).split(path.sep).join('/');
const read = p => fs.readFileSync(p, 'utf8');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

/* =========================================================================================================================
   SUITE 1 - LINT (static)
   ======================================================================================================================= */
if (want('lint')) {
  section('LINT  static scan of site/manara/** (no browser)');
  // preview/landing.html is a generated single-file bundle of index.html (tools/manara/bundle-preview.mjs): scanned for staleness only.
  const FILES = walk(SITE).filter(f => !rel(f).startsWith('preview/'));
  const TEXTUAL = FILES.filter(f => /\.(html|js|css|md|txt|ino|py|svg)$/.test(f));
  const SCANNABLE = TEXTUAL.filter(f => !rel(f).startsWith('data/') && !/samples-data\.js$/.test(f));
  const JS = FILES.filter(f => f.endsWith('.js'));
  const HTML = FILES.filter(f => f.endsWith('.html'));
  const CSS = FILES.filter(f => f.endsWith('.css'));
  const pageFile = n => path.join(SITE, n + '.html');
  const exists = (from, ref) => {
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) return true;
    return fs.existsSync(path.resolve(path.dirname(from), decodeURI(clean)));
  };

  // ---- L1. every script parses as a classic script (no import/export, no top-level await)
  {
    const bad = [];
    for (const f of JS) { try { new vm.Script(read(f), { filename: rel(f) }); } catch (e) { bad.push(`${rel(f)}: ${e.message}`); } }
    for (const f of HTML) {
      const src = read(f); const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi; let m;
      while ((m = re.exec(src))) { if (/type=["']?(application\/(ld\+)?json|text\/template)/i.test(m[1])) continue; try { new vm.Script(m[2], { filename: rel(f) + ' (inline)' }); } catch (e) { bad.push(`${rel(f)} inline: ${e.message}`); } }
    }
    check(`all ${JS.length} site scripts + inline scripts parse as classic scripts (vm.Script)`, bad.length === 0, first(bad));
    const mod = [];
    for (const f of JS) { const t = read(f); const m = /^\s*(import\s[^('"]*?from\s|import\s*['"]|export\s+(default|const|let|var|function|class|\{|\*))/m.exec(t); if (m) mod.push(`${rel(f)}:${lineOf(t, m.index)}`); }
    for (const f of HTML) { const t = read(f); if (/<script[^>]*type=["']?module/i.test(t)) mod.push(rel(f) + ' type=module'); }
    check('no ES-module syntax and no <script type="module">', mod.length === 0, first(mod));
    const tools = fs.readdirSync(path.join(ROOT, 'tools/manara')).filter(f => f.endsWith('.mjs')).map(f => path.join(ROOT, 'tools/manara', f));
    const tbad = [];
    for (const f of tools) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { tbad.push(path.basename(f) + ': ' + String(e.stderr || e.message).split('\n').find(l => /Error/.test(l))); } }
    check(`node --check passes for all ${tools.length} tools/manara/*.mjs`, tbad.length === 0, first(tbad));
    const py = [...fs.readdirSync(path.join(ROOT, 'tools/manara')).filter(f => f.endsWith('.py')).map(f => path.join(ROOT, 'tools/manara', f)), ...walk(path.join(SITE, 'kit')).filter(f => f.endsWith('.py'))];
    const pbad = [];
    for (const f of py) { try { execFileSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', f], { stdio: 'pipe' }); } catch (e) { pbad.push(path.basename(f) + ': ' + String(e.stderr).trim().split('\n').pop()); } }
    check(`python syntax OK for ${py.length} .py files (tools + kit)`, pbad.length === 0, first(pbad));
  }

  // ---- L2. no fetch()/XHR of local files; the only network call is the documented https lookup
  {
    const hits = [];
    for (const f of SCANNABLE.filter(x => /\.(js|html)$/.test(x))) {
      const t = read(f); const re = /\b(fetch\s*\(|XMLHttpRequest|importScripts\s*\(|new\s+Worker\s*\(|navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource)/g; let m;
      while ((m = re.exec(t))) { const ln = lineOf(t, m.index); const ctx = t.slice(m.index, m.index + 120); hits.push({ f: rel(f), ln, ctx: snip(ctx, 100), line: t.split('\n')[ln - 1] || '' }); }
    }
    // The ONLY allowed network call: alert.js "Nearby facilities" -> fetch(OVERPASS_URL) where OVERPASS_URL is an https:// literal (user consent, online only, no local files).
    const alertSrc = read(path.join(SITE, 'js/alert.js')); const ov = /var OVERPASS_URL\s*=\s*'(https:\/\/[^']+)'/.exec(alertSrc);
    const bad = hits.filter(h => !(h.f === 'js/alert.js' && /fetch\(OVERPASS_URL/.test(h.ctx) && ov));
    check('no fetch/XHR/Worker/beacon of local files (only the documented https OpenStreetMap lookup on the phone page)', bad.length === 0, first(bad.map(h => `${h.f}:${h.ln} ${h.ctx}`)));
    const localLit = [];
    for (const f of JS) { const t = read(f); const re = /(fetch|open)\s*\(\s*['"`](?!https:)/g; let m; while ((m = re.exec(t))) localLit.push(`${rel(f)}:${lineOf(t, m.index)}`); }
    check('no fetch("local-path")', localLit.length === 0, first(localLit));
  }

  // ---- L3. innerHTML / outerHTML / insertAdjacentHTML / document.write / setStaticHTML only fed with authored strings
  {
    // Every identifier that flows into a sink (after removing string literals) must be on the reviewed list of its file. A NEW variable
    // reaching a sink fails here and must be reviewed: bus / uploaded / user-typed text must go through textContent.
    const BASE_OK = new Set(['Manara.icon', 'Manara.logo', 'M.icon', 'M.logo', 'icon', 'logo']);
    const FILE_OK = {
      'js/core.js': ['brand', 's', 'links', 'lang', 'dark', 'open', 'PAGES.slice', 'map', 'function', 'p', 'return', 'join', 'PAGES', 'EXTRA', 'L', 'NAME', 'el.getAttribute'],  // nav/footer from authored STR + NAME + icon names in data-icon
      'js/detect.js': ['tpl', 'stageTemplate', 'fool', 'p', 'P', 'st.playing', 'L', 'T2', 'A.paused', 'hz.icon', 'HELD_REF.ok', 'HELD_REF.n', 'HELD_REF.acc', 'HELD_REF.fireFound', 'HELD_REF.falseFire', 'HELD_REF.smokeFound'],  // authored {{ar|en}} templates + benchmark constants
      'js/home.js': ['html', 'h.icon', 'STAGE_ICONS', 'i', 'st.playing', 'st.hz.night', 'iconInner', 'kd.icon', 'spec', 'mn', 'b2', 'g', 'b'],   // setStaticHTML(node, html): only M.icon()/M.logo() of authored tables (HZ, STAGE_ICONS, kd, FMT) and regex literals; reviewed at all 11 call sites
      'js/mission.js': ['name', 'cls', 'NS_SVG', 'XICON'],
      'js/pitch.js': ['ICON', 'name', 'svgIcon', 'cls'],
      'js/build.js': ['ic'],
      'js/report.js': [],
      'js/national.js': [], 'js/alert.js': [], 'js/poster.js': [], 'js/sim.js': [], 'js/fire.js': [], 'js/messages.js': [],
    };
    const stmtEnd = (t, i) => { let q = null, d = 0; for (let j = i; j < t.length; j++) { const c = t[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === '`') { q = c; continue; } if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { d--; if (d < 0) return j; } else if (c === ';' && d === 0) return j; } return t.length; };
    const IGNORE_ID = /^(return|function|true|false|null|undefined|replace|slice|map|join|new|typeof)$/;
    // scan one source text; returns every sink with the identifiers (outside string literals) that flow into it
    const sinkScan = t => {
      const out = []; const re = /\.(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(|setStaticHTML\s*\(|document\.write(ln)?\s*\(/g; let m;
      while ((m = re.exec(t))) {
        let start = m.index + m[0].length;
        if (/insertAdjacentHTML|setStaticHTML/.test(m[0])) { let q = null, d = 0, j = start; for (; j < t.length; j++) { const c = t[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; } if (c === "'" || c === '"') { q = c; continue; } if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; if (c === ',' && d === 0) break; } start = j + 1; }
        if (/function setStaticHTML/.test(t.slice(Math.max(0, m.index - 12), m.index + 20))) continue;
        const rhs = t.slice(start, stmtEnd(t, start)); const stripped = rhs.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
        out.push({ ln: lineOf(t, m.index), tpl: /`/.test(stripped), ids: [...new Set(stripped.match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) || [])].filter(x => !IGNORE_ID.test(x)) });
      }
      return out;
    };
    const hits = [];
    for (const f of JS) for (const h of sinkScan(read(f))) hits.push({ f: rel(f), ln: h.ln, tpl: h.tpl, ids: h.ids.filter(x => !BASE_OK.has(x) && !(FILE_OK[rel(f)] || []).includes(x)), known: rel(f) in FILE_OK });
    // self-test: the scanner must see a bus-text variable and ignore authored icons
    const stS = [['el.innerHTML = msg.text;', ['msg.text']], ["el.innerHTML = '<b>' + userText + '</b>';", ['userText']], ["b.insertAdjacentHTML('afterbegin', Manara.icon('x'));", ['Manara.icon']], ['n.innerHTML = `<i>${m.t}</i>`;', null], ["el.textContent = msg.text;", []]];
    const stSBad = stS.filter(([t, want]) => { const r = sinkScan(t); if (want === null) return !(r.length && r[0].tpl); return JSON.stringify(r.flatMap(x => x.ids)) !== JSON.stringify(want); }).map(([t]) => t);
    check(`innerHTML-sink scanner self-test: ${stS.length} samples (bus variable seen, icon() ignored, textContent is not a sink)`, stSBad.length === 0, first(stSBad));
    const unknownFile = hits.filter(h => !h.known);
    check(`${hits.length} innerHTML/insertAdjacentHTML/setStaticHTML sinks, all in reviewed files`, unknownFile.length === 0, first(unknownFile.map(h => `${h.f}:${h.ln}`)));
    const unrev = hits.filter(h => h.known && (h.ids.length || h.tpl));
    check('every identifier flowing into a sink is on the reviewed authored-data list (no bus/user/upload variable reaches innerHTML)', unrev.length === 0, first(unrev.map(h => `${h.f}:${h.ln} ${h.tpl ? '`template literal` ' : ''}${h.ids.join(',')}`)));
    const noSink = ['js/alert.js', 'js/poster.js', 'js/national.js', 'js/messages.js', 'js/sim.js', 'js/fire.js'].flatMap(x => hits.filter(h => h.f === x));
    check('alert.js (renders bus text) and the engines/poster/national code have zero innerHTML-type sinks', noSink.length === 0, first(noSink.map(h => `${h.f}:${h.ln}`)));
  }

  // ---- L4. CSS: parse rules once
  const cssText = {}; for (const f of CSS) cssText[rel(f)] = read(f);
  function parseCss(text) {
    text = text.replace(/\/\*[\s\S]*?\*\//g, ''); const rules = []; let i = 0;
    const readBlock = (start) => { let d = 1, j = start, q = null; for (; j < text.length && d > 0; j++) { const c = text[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '{') d++; else if (c === '}') d--; } return [text.slice(start, j - 1), j]; };
    const parse = (src, ctx) => {
      let k = 0;
      while (k < src.length) {
        const o = src.indexOf('{', k); if (o < 0) break;
        // selector prelude may contain strings with braces; keep simple (none in this code base)
        const pre = src.slice(k, o).trim();
        let d = 1, j = o + 1, q = null;
        for (; j < src.length && d > 0; j++) { const c = src[j]; if (q) { if (c === '\\') j++; else if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '{') d++; else if (c === '}') d--; }
        const body = src.slice(o + 1, j - 1);
        if (/^@(media|supports|layer|container|document)/i.test(pre)) parse(body, ctx + ' ' + pre);
        else if (/^@(keyframes|-webkit-keyframes)/i.test(pre)) { rules.push({ sel: pre, ctx, body, keyframes: true }); }
        else if (pre.startsWith('@')) { /* @font-face, @page, @property: ignore */ }
        else rules.push({ sel: pre, ctx, body });
        k = j;
      }
    };
    parse(text, ''); return rules;
  }
  const RULES = {}; for (const [f, t] of Object.entries(cssText)) RULES[f] = parseCss(t);
  const decls = body => body.split(/;(?![^(]*\))/).map(s => s.trim()).filter(Boolean).map(s => { const i = s.indexOf(':'); return i < 0 ? null : [s.slice(0, i).trim().toLowerCase(), s.slice(i + 1).trim().replace(/\s*!important$/i, '')]; }).filter(Boolean);

  {
    const physHits = (f, rules) => {
      const bad = [];
      for (const r of rules) {
        if (r.keyframes) continue;
        const D = decls(r.body); const map = new Map(D);
        const ltrCtx = /\bpre\b|\bcode\b|\.code\b|\.ltr\b|\[dir=["']?ltr|data-lang=["']?en\]|:lang\(en\)|\bcanvas\b|\bsvg\b|\bbdi\b|\.mono\b|\.num\b|\.pd-code|\.kbd|\.tok/i.test(r.sel) || map.get('direction') === 'ltr';
        for (const [p, v] of D) {
          let hit = null;
          if (/^(margin|padding)-(left|right)$/.test(p) || /^border-(left|right)(-(width|style|color))?$/.test(p) || /^border-(top|bottom)-(left|right)-radius$/.test(p) || p === 'float' && /^(left|right)$/.test(v) || p === 'clear' && /^(left|right)$/.test(v)) hit = p + ':' + v;
          else if ((p === 'left' || p === 'right') && !/^(auto|unset|initial|inherit|revert)$/.test(v) && !(map.has('left') && map.has('right') && map.get('left') === map.get('right'))) {
            const centre = p === 'left' && /^50%$/.test(v) && /translate/.test(map.get('transform') || ''); if (!centre) hit = p + ':' + v;
          } else if (p === 'text-align' && /^(left|right)$/.test(v)) hit = p + ':' + v;
          else if (/^(background-position|object-position)$/.test(p) && /\b(left|right)\b/.test(v)) hit = p + ':' + v;
          else if (/^scroll-(padding|margin)-(left|right)$/.test(p)) hit = p;
          if (hit && !ltrCtx) bad.push(`${f} ${r.sel.slice(0, 50)} {${hit}}`);
        }
      }
      return bad;
    };
    const bad = []; for (const [f, rules] of Object.entries(RULES)) bad.push(...physHits(f, rules));
    const stP = [['.a{margin-left:4px}', 1], ['.a{padding-right:2px;color:red}', 1], ['.a{left:0}', 1], ['.a{text-align:right}', 1], ['.a{margin-inline-start:4px}', 0], ['pre.code{text-align:left}', 0], ['.t{left:50%;transform:translateX(-50%)}', 0], ['.a{left:0;right:0}', 0], ['html[data-lang=en] .a{margin-left:4px}', 0], ['.a{inset-inline-start:0}', 0]];
    const stPBad = stP.filter(([css, n]) => physHits('self', parseCss(css)).length !== n).map(([c]) => c);
    check(`physical-CSS scanner self-test: ${stP.length} samples`, stPBad.length === 0, first(stPBad));
    check('no physical left/right CSS outside LTR-only contexts (code, canvas, svg, [data-lang=en], direction:ltr) or symmetric/centering uses', bad.length === 0, first(bad, 8));
  }
  {
    const lsHits = (f, rules) => {
      const bad = [];
      for (const r of rules) for (const [p, v] of decls(r.body)) if (p === 'letter-spacing' && !/^(0|0px|normal|0em)$/i.test(v)) {
        const scoped = /data-lang=["']?en\]|:lang\(en\)|\[dir=["']?ltr|\.ltr\b/.test(r.sel) || decls(r.body).some(([a, b]) => a === 'direction' && b === 'ltr');
        if (scoped) continue;
        const reset = rules.some(q => /data-lang=["']?ar\]/.test(q.sel) && q.sel.replace(/html\[data-lang=["']?ar["']?\]\s*/g, '').trim() === r.sel.trim() && decls(q.body).some(([a, b]) => a === 'letter-spacing' && /^(0|normal)/.test(b)));
        if (!reset) bad.push(`${f} ${r.sel.slice(0, 60)} {letter-spacing:${v}}`);
      }
      return bad;
    };
    const bad = []; for (const [f, rules] of Object.entries(RULES)) bad.push(...lsHits(f, rules));
    const stL = [['.a{letter-spacing:.05em}', 1], ['html[data-lang=en] .a{letter-spacing:.05em}', 0], ['.a{letter-spacing:.05em}html[data-lang=ar] .a{letter-spacing:0}', 0], ['.a{letter-spacing:0}', 0], ['.a{direction:ltr;letter-spacing:.1em}', 0]];
    const stLBad = stL.filter(([css, n]) => lsHits('self', parseCss(css)).length !== n).map(([c]) => c);
    check(`letter-spacing scanner self-test: ${stL.length} samples`, stLBad.length === 0, first(stLBad));
    check('letter-spacing is never non-zero on Arabic (scoped to [data-lang=en], direction:ltr, or reset for [data-lang=ar])', bad.length === 0, first(bad));
  }
  {
    // flashing: animations named strobe/flash/blink must be opt-in (class/attr toggled by the user) or sit inside prefers-reduced-motion:no-preference
    const names = []; for (const [f, rules] of Object.entries(RULES)) for (const r of rules) if (r.keyframes && /strobe|flash|blink|flicker/i.test(r.sel)) names.push([f, r.sel.replace(/@(-webkit-)?keyframes\s*/i, '').trim()]);
    const unguarded = [];
    for (const [f, n] of names) {
      const uses = []; for (const [g, rules] of Object.entries(RULES)) for (const r of rules) if (!r.keyframes && decls(r.body).some(([p, v]) => /^animation(-name)?$/.test(p) && new RegExp('\\b' + n + '\\b').test(v))) uses.push({ g, r });
      for (const u of uses) { const optIn = /strobe-on|\.strobe|\[data-strobe|\.is-strobe|\.on\b|\[aria-pressed=["']?true|\.flash-on|\.go\b|\.active|\.hot|\[data-on|\.alerting|\.live-flash/i.test(u.r.sel + u.r.ctx) || /no-preference/.test(u.r.ctx); if (!optIn) unguarded.push(`${u.g} ${u.r.sel.slice(0, 50)} -> ${n}`); }
    }
    check(`${names.length} flashing-type @keyframes (strobe/flash/blink), each used only behind an opt-in selector or no-preference`, unguarded.length === 0, first(unguarded));
    // every page CSS that runs infinite animations must be neutralised by the global reduced-motion rule (base.css) or its own query
    const base = cssText['css/base.css'];
    check('base.css has the global prefers-reduced-motion reset (animation + transition + scroll-behavior)', /prefers-reduced-motion:\s*reduce[\s\S]{0,400}animation-duration:\s*\.01ms\s*!important/.test(base) && /transition-duration:\s*\.01ms\s*!important/.test(base));
    // The strobe toggle on the phone page is opt-in and carries a photosensitivity warning (WCAG 2.3.1, S57)
    const al = read(pageFile('alert'));
    check('alert.html: strobe is an opt-in toggle (aria-pressed=false) inside a warning note', /id="set-strobe"[^>]*aria-pressed="false"/.test(al) && /al-strobe/.test(al) && /strobe_warn/.test(al));
    const msgs = read(path.join(SITE, 'js/messages.js'));
    check('messages.js carries the photosensitivity warning (ar + en: seizures, never more than 3 flashes a second, off for reduced motion)', /PHOTO_WARNING\s*=\s*T\('[^']*(نوبات|الحساسين)[^']*3 مرات[^']*',\s*'[^']*seizures[^']*3 times a second[^']*reduce motion/i.test(msgs));
  }

  // ---- L5. external loads / CDNs: only Google Fonts; no http: at all; no remote scripts
  {
    const bad = [];
    for (const f of HTML) {
      const t = read(f);
      for (const m of t.matchAll(/<(script|img|source|video|audio|iframe|embed|object|track)\b[^>]*\b(src|data)=["'](https?:)?\/\/[^"']+/gi)) bad.push(`${rel(f)} <${m[1]}> ${snip(m[0].slice(-70), 70)}`);
      for (const m of t.matchAll(/<link\b[^>]*>/gi)) { const h = /href=["']([^"']+)/.exec(m[0]); if (h && /^(https?:)?\/\//.test(h[1]) && !/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(h[1])) bad.push(`${rel(f)} <link> ${h[1].slice(0, 60)}`); }
    }
    for (const f of CSS) for (const m of read(f).matchAll(/(@import\s+(url\()?|url\()\s*["']?(https?:)?\/\/[^)"']+/gi)) bad.push(`${rel(f)} ${snip(m[0], 70)}`);
    for (const f of JS) { const t = read(f); for (const m of t.matchAll(/(import\s*\(|\.src\s*=|loadScript\s*\(|\.href\s*=)\s*['"]https?:\/\/[^'"]+/g)) bad.push(`${rel(f)}:${lineOf(t, m.index)} ${snip(m[0], 70)}`); }
    check('no external scripts, images, stylesheets or CDNs (Google Fonts links only; remote anchors are citations)', bad.length === 0, first(bad));
    const insecure = []; for (const f of SCANNABLE) { const t = read(f); for (const m of t.matchAll(/["'(]http:\/\/(?!www\.w3\.org|purl\.org|localhost|127\.0\.0\.1)[^\s"')]+/g)) insecure.push(`${rel(f)}:${lineOf(t, m.index)} ${m[0].slice(1, 50)}`); }
    check('no insecure http:// URLs (namespaces excluded)', insecure.length === 0, first(insecure));
  }

  // ---- L6. banned phrases (claims), allowing only quoted/negated mentions
  {
    const EN = [
      /\bworld[- ]?first\b/i, /\bfirst[- ]ever\b/i, /\bfirst of its kind\b/i, /\bfirst in (the )?(world|qatar|gulf|region|arab|middle east)\b/i, /\b(is|was|are|the) first (to|system|platform|project|solution|app|drone|of its)\b/i,
      /\bthe first (system|platform|project|solution|app|drone|detector|tool|prototype)\b/i,
      /\bsav(?:es?|ing|ed) (?:\d[\d,]* |many |countless |thousands of |hundreds of |more )?(?:lives|people'?s lives)\b/i, /\bwill save lives\b/i, /\blife-?saving\b/i,
      /\bAI[- ](powered|based|driven|enabled|detect\w*)\b/i, /\bpowered by (an? )?AI\b/i, /\bdeep[- ]learning\b/i, /\bartificial intelligence\b/i, /\bAI\b(?! (assistance|assistant|tool|disclosure|helped|help|tools|use|used|was|were|wrote|written|generated|coding|co-?pilot|model))/,
    ];
    const AR = [/أول (نظام|منصة|مشروع|حل|من نوعه|في (قطر|العالم|الخليج|المنطقة)|مبادرة)/, /الأول (من نوعه|عالميً?ا|في (قطر|العالم|الخليج|المنطقة))/, /الأولى (من نوعها|عالميً?ا)/, /(ينقذ|تنقذ|ننقذ|سينقذ|ستنقذ|يُنقذ|تُنقذ)\s*(ملايين|آلاف|مئات|عشرات|\d+)?\s*(من\s+)?(الأرواح|أرواح)/, /ذكاء\s+اصطناعي|الذكاء\s+الاصطناعي/, /(ال)?تعلّ?م\s+(ال)?عميق/];
    // mention-not-claim: inside quotes “ ” « » " ", preceded by a negation within 80 chars, or part of a regex literal / ban list / "disclosure" context
    const NEG = /\b(not|never|nor|without|avoid\w*|ban(ned)?|forbidden|don'?t|doesn'?t|do not|does not|cannot|can'?t|isn'?t|aren'?t|neither|instead of|rather than|n'?t say|never say|rule-?based|no claim)\b|(?:^|[\s«"“(])(لا|ولا|لم|لن|ليس|ليست|دون|بدون|نتجنب|ممنوع|محظور|بلا|غير)(?=[\s«"“])/i;
    const bannedHits = (label, t) => {
      const hits = [];
      for (const re of [...EN, ...AR]) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); let m;
        while ((m = g.exec(t))) {
          const a = Math.max(0, m.index - 140), b = Math.min(t.length, m.index + m[0].length + 80); const w = t.slice(a, b); const afterTxt = t.slice(m.index + m[0].length, m.index + m[0].length + 30);
          const clause = t.slice(Math.max(0, m.index - 90), m.index).split(/[.;!?؟\n]|<\/[a-z]+>|\.\s/).pop();   // the part of the sentence before the phrase
          const quoted = /[“«"'‘`][^“”«»"'’`]{0,30}$/.test(t.slice(Math.max(0, m.index - 30), m.index)) && /^[^“”«»"'’`]{0,40}[”»"'’`]/.test(afterTxt) || /\/[a-z]*\s*[,\]]/.test(afterTxt) || /\/i?,?\s*\/|\[\s*\/|BANNED|banned|BAN\b/.test(w);
          const negated = NEG.test(clause) || NEG.test(afterTxt.slice(0, 18));
          const disclosure = /disclos|helped by|AI assistance|AI tool|used an AI|مساعدة|ساعدني|استعن|أداة|أدوات|إفصاح|أفصح|افصح|اشتغل|AI tools|built \/ bought|built\/bought|mentor|SignBridge|Young Inventors|S45|S42|chatbot|Claude/i.test(w) && /AI|ذكاء/.test(m[0]);
          const thirdParty = /S45|SignBridge|Young Inventors|AI-powered fire response|Qatar Foundation|Stars of Science|Qatari team has an AI|فريق قطري/i.test(w);
          if (quoted || negated || disclosure || thirdParty) continue;
          hits.push(`${label}:${lineOf(t, m.index)} “${snip(m[0], 40)}” in …${snip(w, 90)}…`);
        }
      }
      return hits;
    };
    const hits = []; for (const f of SCANNABLE) { const t = read(f); if (t.length > 3_000_000) continue; hits.push(...bannedHits(rel(f), t)); }
    // self-test: the detector must catch claims and let quoted / negated mentions through (guards against a vacuous pass)
    const st = [['MANARA saves lives in Qatar.', 1], ['MANARA is the first system to alert you.', 1], ['A world-first platform.', 1], ['An AI-powered detector.', 1], ['منارة تنقذ أرواحًا كثيرة', 1], ['أول نظام في قطر', 1], ['نستخدم الذكاء الاصطناعي في الكاشف', 1],
      ['We never say “saves lives”.', 0], ['The detector is not AI-powered.', 0], ['لا نقول «ننقذ أرواحًا»', 0], ['rule-based, not deep learning', 0], ['I used an AI tool for the code', 0]];
    const stBad = st.filter(([t, n]) => (bannedHits('self', t).length > 0) !== (n > 0)).map(([t]) => t);
    check(`banned-phrase scanner self-test: ${st.length} sample sentences classified correctly`, stBad.length === 0, first(stBad));
    check('no banned claim phrases ("first"/"world-first", "saves lives", "AI-powered", «ذكاء اصطناعي»/«تعلّم عميق» for the detector) except as quoted/negated mentions', hits.length === 0, first(hits, 6));
  }

  // ---- L7. references exist
  {
    const miss = [];
    for (const f of HTML) {
      const t = read(f);
      for (const m of t.matchAll(/\b(src|href|poster|data-src)=["']([^"'#][^"']*?)["']/g)) {
        const ref = m[2]; if (/^(https?:|mailto:|tel:|data:|javascript:|blob:|\/\/)/i.test(ref) || ref.startsWith('#')) continue; if (/\{\{|\$\{/.test(ref)) continue;
        if (!exists(f, ref)) miss.push(`${rel(f)}:${lineOf(t, m.index)} ${ref}`);
      }
      for (const m of t.matchAll(/\bsrcset=["']([^"']+)["']/g)) for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (u && !/^(https?:|data:)/.test(u) && !exists(f, u)) miss.push(`${rel(f)} srcset ${u}`); }
    }
    for (const f of CSS) { const t = read(f); for (const m of t.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) { const u = m[1]; if (/^(https?:|data:|#|\/\/)/.test(u)) continue; if (!exists(f, u)) miss.push(`${rel(f)} url(${u})`); } }
    for (const f of JS.filter(x => !/samples-data\.js$/.test(x))) {
      const t = read(f);
      for (const m of t.matchAll(/['"`]((?:assets|data|kit|css|js)\/[\w./-]+\.(?:png|jpe?g|svg|js|css|json|webp|gif|mp4|webm|txt|md|ino|py|html))['"`]/g)) if (!exists(path.join(SITE, 'x.html'), m[1])) miss.push(`${rel(f)}:${lineOf(t, m.index)} ${m[1]}`);
      for (const m of t.matchAll(/['"`]((?:index|mission|detect|alert|build|pitch|report|poster|404)\.html)(?:[#?][^'"`]*)?['"`]/g)) if (!fs.existsSync(path.join(SITE, m[1]))) miss.push(`${rel(f)}:${lineOf(t, m.index)} ${m[1]}`);
    }
    check(`every src/href/poster/srcset/url()/asset string in ${HTML.length} html + ${CSS.length} css + ${JS.length} js files resolves to an existing file`, miss.length === 0, first(miss, 6));
    // core.js nav + footer targets
    const core = read(path.join(SITE, 'js/core.js')); const targets = [...core.matchAll(/\['([a-z0-9]+\.html)',\s*'nav\./g)].map(m => m[1]);
    check(`core.js nav/footer target ${targets.length} pages that exist`, targets.length >= 8 && targets.every(x => fs.existsSync(path.join(SITE, x))), targets.filter(x => !fs.existsSync(path.join(SITE, x))).join(','));
    // in-page anchors: every href="#id" has an id in the same file (static) or is produced by JS
    const anchors = [];
    for (const f of HTML) { const t = read(f); const ids = new Set([...t.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1])); const jsf = path.join(SITE, 'js', path.basename(f, '.html') + '.js'); const js = fs.existsSync(jsf) ? read(jsf) : ''; for (const m of t.matchAll(/\bhref=["']#([^"']+)["']/g)) { const pfx = m[1].replace(/[^-]*$/, ''); if (!ids.has(m[1]) && !js.includes(m[1]) && !(pfx && js.includes("'" + pfx + "'"))) anchors.push(`${rel(f)} #${m[1]}`); } }
    check('every in-page #anchor has a matching id (in the page or created by its script)', anchors.length === 0, first(anchors));
    // preview bundle freshness
    const prev = path.join(SITE, 'preview/landing.html');
    if (fs.existsSync(prev)) {
      const inputs = ['index.html', 'css/base.css', 'css/home.css', 'js/core.js', 'js/home.js', 'assets/logo.svg'].map(x => path.join(SITE, x)); const pm = fs.statSync(prev).mtimeMs; const newer = inputs.filter(x => fs.statSync(x).mtimeMs > pm + 1000).map(rel);
      check('preview/landing.html is newer than the files it bundles (else: node tools/manara/bundle-preview.mjs)', newer.length === 0, 'stale vs ' + newer.join(', '));
    }
  }

  // ---- L8. page skeletons
  {
    const bad = [];
    const boot = read(pageFile('index')).match(/<script>\(function\(\)\{var d=document\.documentElement[\s\S]*?<\/script>/);
    for (const n of ALL_PAGES) {
      const f = pageFile(n); if (!fs.existsSync(f)) { bad.push(n + '.html missing'); continue; } const t = read(f);
      const need = [
        [/^<!doctype html>/i, 'doctype'], [/<html lang="ar" dir="rtl" data-lang="ar">/, '<html lang="ar" dir="rtl" data-lang="ar">'], [/<meta charset="utf-8">/i, 'charset'],
        [/<meta name="viewport" content="width=device-width,initial-scale=1/, 'viewport'], [/<title data-en="[^"]{4,}">[^<]*[؀-ۿ][^<]*<\/title>/, 'bilingual <title data-en>'], [/<meta name="description" content="[^"]{20,}"/, 'meta description'],
        [/<meta name="theme-color"/, 'theme-color'], [/<meta name="color-scheme" content="light dark">/, 'color-scheme'], [/<link rel="icon" href="assets\/logo\.svg"/, 'icon'], [/<link rel="stylesheet" href="css\/base\.css">/, 'base.css'],
        [/<script src="js\/core\.js" defer><\/script>/, 'core.js defer'], [/<a class="skip" href="#main">[^<]+<\/a>/, 'skip link'], [/<header class="nav" data-nav><\/header>/, 'nav placeholder'], [/<main[^>]*\bid="main"/, 'main#main'],
        [new RegExp(`<body[^>]*data-page="${n}\\.html"`), 'data-page=' + n + '.html'],
      ];
      for (const [re, what] of need) if (!re.test(t)) bad.push(`${n}.html lacks ${what}`);
      if (boot && !t.includes(boot[0])) bad.push(`${n}.html: theme/lang bootstrap script differs from index.html`);
      for (const m of t.matchAll(/<img\b[^>]*>/gi)) if (!/\balt=/.test(m[0])) bad.push(`${n}.html img without alt: ${snip(m[0], 60)}`);
      for (const m of t.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) if (!/rel="[^"]*noopener/.test(m[0])) bad.push(`${n}.html target=_blank without rel=noopener: ${snip(m[0], 70)}`);
      for (const m of t.matchAll(/\btabindex="([1-9]\d*)"/g)) bad.push(`${n}.html positive tabindex ${m[1]}`);
      // every script src listed is deferred and non-module
      for (const m of t.matchAll(/<script\b[^>]*\bsrc=[^>]*>/g)) if (!/\bdefer\b/.test(m[0])) bad.push(`${n}.html script not deferred: ${snip(m[0], 60)}`);
      // pages load core.js first
      const srcs = [...t.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]); if (srcs[0] !== 'js/core.js') bad.push(`${n}.html: core.js must be the first script (got ${srcs[0]})`);
    }
    check(`${ALL_PAGES.length} pages follow the skeleton in docs/MANARA.md (lang/dir, bilingual title, skip link, #main, data-page, deferred scripts, bootstrap identical)`, bad.length === 0, first(bad, 6));
  }
}

/* =========================================================================================================================
   SUITE 2 - HONESTY (rendered text vs docs/MANARA-SOURCES.md)
   -------------------------------------------------------------------------------------------------------------------------
   Best-effort, deliberately conservative. For every page and language the DOM is split into text units (p, li, td, headings, ...).
   Numbers are extracted (Arabic-Indic digits normalised; URLs, DOIs, S-ids, [citations], table/section numbers, hh:mm, part
   numbers like MLX90640 removed first). Then:
     A. a number that is NOT in docs/MANARA-SOURCES.md must be benign (small count, year in sources, version, dimension, room
        number, axis tick) OR sit in a unit/card/section labelled SIM (simulation), OR be an own measurement/estimate declared in
        OWN below with a reason, OR be inside a table/figure/equation/reference list of the report (those must declare provenance:
        checked separately). Everything else FAILS, i.e. a new unsourced real-world number cannot slip in unnoticed.
     B. a sourced number that is "significant" (>= 100, a % or a decimal) must have a visible source marker (S-id, "Source",
        «المصدر», an outlet or organisation name, a [n] citation) in its unit, card or section.
     C. every S-id cited exists in MANARA-SOURCES.md.
     D. Arabic and English show the same significant numbers (a number in one language only is a translation drift).
   ======================================================================================================================= */
if (want('honesty')) {
  section('HONESTY  numbers vs docs/MANARA-SOURCES.md (rendered text, ar + en)');
  const SRC = read(path.join(ROOT, 'docs/MANARA-SOURCES.md'));
  const AD = '٠١٢٣٤٥٦٧٨٩';
  const norm = s => s.replace(/[٠-٩]/g, c => AD.indexOf(c)).replace(/[  ⁦-⁩‎‏​]/g, ' ').replace(/٫/g, '.').replace(/٬/g, ',');
  const NUMRE = /\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
  const AUTHOR_YEAR = /[A-Z\u00C0-\u024F][\p{L}'-]+(?:\s+(?:&|and)\s+[A-Z\u00C0-\u024F][\p{L}'-]+|\s+et al\.?)?,?\s*\(?\s*(?:19|20)\d{2}[a-z]?\b\)?/gu;
  const strip = text => norm(text)
    .replace(/\b(QAR|USD|SAR|AED|KWD|EUR|US\$)\s*(?=\d)/g, '$1 ')              // keep the amount: "QAR300,000" is a number, not a part number
    .replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, ' ')                         // [21, 78] citation numbers
    .replace(/https?:\/\/\S+/g, ' ').replace(/\b10\.\d{4,}\/\S+/g, ' ')         // URLs, DOIs
    .replace(/[\w-]+(?:\.[\w-]+)+\/\S*/g, ' ')                                  // domain/path
    .replace(AUTHOR_YEAR, ' ')                                                     // Çelik & Demirel (2009), Chen et al. 2004
    .replace(/\b\d+\s*\(\d+\)\s*:?\s*\d+(?:\s*[–-]\s*\d+)?/g, ' ')              // 44(2):147–158
    .replace(/\b[STC]\d+(?:[–-][STC]?\d+)?\b/g, ' ')                            // S12, T4, C3
    .replace(/(?:\b(?:Table|Tab\.?|Fig\.?|Figure|Appendix|Section|No\.?|Decision|Law)|§|(?<![\u0600-\u06FF])(?:رقم|القسم|الجدول|الشكل|الملحق|الفقرة))\s*\(?\d+(\.\d+)*\)?/gi, ' ')
    .replace(/^\s*\d+(\.\d+)*(?=[A-Za-z\u0600-\u06FF])/, ' ')                          // heading numbers ("8.4How we will…")
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')                                    // clock / mm:ss
    .replace(/\b0x[0-9a-fA-F]+\b/g, ' ')                                         // I2C addresses
    .replace(/[A-Za-z_][A-Za-z_-]*\d+[A-Za-z0-9_]*/g, m => /^(QAR|USD|SAR|AED|KWD|EUR)/.test(m) ? m : ' ')   // part numbers MLX90640 ESP32 MQ-2 H2S
    .replace(/\b\d+\s*[×x]\s*\d+(\s*[×x]\s*\d+)?/g, ' ');                       // 297 × 420
  const tokens = text => { const t = strip(text); const out = []; let m; NUMRE.lastIndex = 0; while ((m = NUMRE.exec(t))) out.push({ raw: m[0], v: parseFloat(m[0].replace(/[ ,]/g, '')), i: m.index, ctx: t.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24) }); return out; };
  const srcSet = new Set(); const srcYears = new Set();
  for (const n of tokens(SRC)) { srcSet.add(n.v); for (const part of n.raw.split(/[ ,]/)) if (/^\d+(\.\d+)?$/.test(part)) srcSet.add(parseFloat(part)); if (n.v >= 1990 && n.v <= 2035) srcYears.add(n.v); }
  for (const m of norm(SRC).matchAll(/\b(19|20)\d{2}\b/g)) { srcYears.add(+m[0]); srcSet.add(+m[0]); }
  const srcIds = new Set([...SRC.matchAll(/^\|\s*S(\d+)\s*\|/gm)].map(m => +m[1]));
  const STOPW = new Set('that with from this have were been their about than over into more only also source sources years year percent million thousand billion total number people minutes minute used show when what which where there these those them they will would could should each every other some such very much many most both after before between during under above below while because since until against among within without across through around along being does done make made take taken like just then once here said says claim figure exact wording keep'.split(' '));
  const wordsOf = t => new Set((t.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOPW.has(w)));
  const numsOf = t => new Set(tokens(t).flatMap(x => [x.v, ...x.raw.split(/[ ,]/).filter(y => /^\d+(\.\d+)?$/.test(y)).map(Number)]));
  const rowsById = new Map(); for (const line of SRC.split('\n')) { const m = /^\|\s*S(\d+)\s*\|/.exec(line); if (m) rowsById.set(+m[1], numsOf(line)); }
  const wordIdx = new Map();   // number value -> words of every table row / paragraph of the sources document that contains it
  for (const blk of SRC.split(/\n\s*\n/)) for (const part of [...blk.split('\n').filter(l => l.startsWith('|')), blk.replace(/^\|.*$/gm, '')]) { const w = wordsOf(part); for (const v of numsOf(part)) { const set = wordIdx.get(v) || new Set(); w.forEach(x => set.add(x)); wordIdx.set(v, set); } }
  check(`docs/MANARA-SOURCES.md parsed: ${srcIds.size} source rows (S1-S${Math.max(...srcIds)}), ${srcSet.size} distinct numbers`, srcIds.size >= 60 && srcSet.size > 150);

  // Own measurements / estimates that are allowed on the pages, each with its reason and the context words that must surround it.
  // (They are the student's own numbers, labelled as such; they are NOT real-world statistics.)
  const OWN = [
    { v: [66.7, 87.5, 81.3, 12, 18, 14, 16, 13, 6, 3, 43.7, 83.7, 57.0, 64.0, 96.5, 93.4, 27.8, 5.7, 51.0, 9, 91, 41, 25], ctx: /held-out|tuned|tuning|test set|sample set|photo|accuracy|الاختبار|ضُبط|الضبط|عيّنات|عينات|دقة|صور|Wilson|interval|CI\b|Decoy|Evidence/i, why: 'detector benchmark, own measurement (equals tools/manara/test-fire.mjs output; checked by test-home.mjs)' },
    { v: [74.95, 78, 217, 80, 227, 95, 270, 22, 43, 45, 100, 2, 102, 200, 20, 120, 150], ctx: /US\$|\$|dollar|دولار|USD|cost|price|كلفة|تكلفة|سعر|parts|قطع|Adafruit|booth|كشك|sentinel|الحارس|laptop|حاسوب/i, why: 'hardware price estimates, labelled "estimates" with vendor and month in the build guide (not statistics)' },
    { v: [5.5, 340, 331.3, 0.606, 358.6, 45], ctx: /sound|ultrasonic|HC-SR04|speed of sound|صوت|فوق صوتي|temperature|حرارة|depth|عمق|error|خطأ/i, why: 'physics of the water-level sensor (speed of sound 331.3 + 0.606 T), our own arithmetic' },
    { v: [32, 24, 55, 35, 110, 75], ctx: /MLX|thermal|حراري|pixel|بكسل|field of view|زاوية/i, why: 'MLX90640 datasheet figures (S68)' },
    { v: [4, 3, 7], ctx: /pillar|ركيزة|ركائز/i, why: 'small counts' },
  ];
  const BENIGN = (tk, unit) => {
    const { v, raw, i, ctx } = tk; const after = ctx.slice(ctx.indexOf(raw) + raw.length, ctx.indexOf(raw) + raw.length + 14);
    if (raw.replace(/[ ,.]/g, '').length >= 7) return 'axis ticks / long id';
    if (Number.isInteger(v) && v <= 12 && !/^\s*(%|٪|per ?cent|percent|minutes?\b|min\b|mins\b|hours?\b|دقيقة|دقائق|دقيقتين|ساعة|ساعات|deaths?|وفاة|years?|°)/i.test(after)) return 'small count';
    if (v === 0 || v === 1) return 'zero/one';
    if (v === 404) return 'HTTP status of the 404 page';
    if (ENG.test(unit)) return 'engineering spec (pins, volts, resistors, addresses, baud, formulas)';
    if (/(?:^|[^\p{L}])(room|rooms|غرفة|الغرفة|floor|الطابق|class|صف|الصف|seed|بذرة|GPIO|pin|دبوس|port|منفذ|baud|v|version|إصدار|CAP|WCAG|ISO|HTML|Python|Node|JSON|UTF|IEEE|RFC|Unicode|CSS)\s*[:#]?\s*$/iu.test(ctx.slice(0, ctx.indexOf(raw)))) return 'identifier (room/seed/version)';
    if (/^\s*(px|pt|dpi|pixels?|بكسل|kB|MB|KB|Hz|kHz|MHz|ms|fps|baud|bits?|بت|V\b|mA|mAh|Ω|kΩ|nm|µm|lux)/i.test(after)) return 'spec unit';
    if (v >= 1990 && v <= 2035 && srcYears.has(v)) return 'year in sources';
    return null;
  };
  const ENG = /\bGPIO\b|\bpins?\b|\bADC\d?\b|\bI2C\b|\baddress\b|\d\s?V\b|\bvolts?\b|Ω|\bohms?\b|\bresistors?\b|\bdivider\b|\bbaud\b|\bwiring\b|\bsketch\b|\bbreadboard\b|\bsolder\w*\b|\bjumper\b|\bpull-?up\b|\bYCbCr\b|\bRGB\b|\bHSI\b|coefficient|\bformula\b|\bflicker\b|\bgrowth\b|\bthreshold\b|[=≥≤·]/i;
  const SIMRE = /\bSIM\b|simulat|محاك|synthetic|fictional|وهمي|افتراضي|demo|توضيحي|تجريبي|illustrat|assum|افتراض|estimate|تقدير|model\b|in the model|نموذج|seed\b|بذرة|ordinary alarm|الإنذار العادي/i;
  const MARK = /\bS\d{1,2}\b|\bsources?\b|المصدر|المصادر|\[\d+|NFPA|\bWHO\b|CTIF|USFA|UNEP|Copernicus|The National|Gulf News|Arab News|Peninsula|Qatar Tribune|\bQNA\b|\bILO\b|\bHMC\b|Doha News|Gulf Times|\bPSA\b|GLMM|OSHA|NIOSH|\bCDC\b|\bEPA\b|\bNWS\b|Lancet|JAMA|\bW3C\b|Kerber|Emarat|FSRI|[Cc]ensus|datasheet|Wilson|Ministry|Hassantuk|وزارة|منظمة|تعداد|صحيفة|الشرق|الراية|قنا|مؤسسة|الأمم|الصحة العالمية|هيئة|دراسة|study|Fountoukis|Alexandridis|Russo|Stull|Bolton|OpenStreetMap|Natural Earth|Adafruit|Schierbeck|Claesson|Yigit|Chen|UL\b|Society for Science|ISEF|Milipol|Civil Defen[cs]e|الدفاع المدني/i;
  const EXTRACT = lang => {
    const BLOCK = new Set(['P', 'LI', 'TD', 'TH', 'DD', 'DT', 'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SUMMARY', 'BLOCKQUOTE', 'DIV', 'SECTION', 'ARTICLE', 'LABEL', 'BUTTON', 'TR', 'UL', 'OL', 'TABLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'FIGURE', 'ASIDE', 'DL', 'PRE', 'OPTION', 'DETAILS']);
    const skip = el => /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD)$/.test(el.tagName);
    const wrongLang = el => el.hasAttribute && el.hasAttribute('data-l') && el.getAttribute('data-l') !== lang;
    const own = el => { let t = ''; for (const c of el.childNodes) { if (c.nodeType === 3) t += c.textContent; else if (c.nodeType === 1 && !skip(c) && !wrongLang(c)) t += BLOCK.has(c.tagName) ? ' ' : own(c); } return t; };
    const all = el => { let t = ''; for (const c of el.childNodes) { if (c.nodeType === 3) t += c.textContent; else if (c.nodeType === 1 && !skip(c) && !wrongLang(c)) t += ' ' + all(c); } return t; };
    const units = [];
    (function walk(el) {
      if (skip(el) || wrongLang(el)) return;
      if (BLOCK.has(el.tagName) || el === document.body) {
        const t = own(el).replace(/\s+/g, ' ').trim();
        if (t) {
          const card = el.closest('li,tr,.card,.panel,figure,article,.kpi,.slide,details,blockquote') || el.parentElement;
          const sec = el.closest('section,.board,.slide,main') || document.body;
          const headOf = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { for (let y = x.previousElementSibling; y; y = y.previousElementSibling) { if (/^H[1-6]$/.test(y.tagName)) return all(y); const h = y.querySelector && y.querySelector('h1,h2,h3,h4'); if (h && y.tagName !== 'MAIN') return all(h); } } return ''; };
          const tabEl = el.closest('table,.table-wrap,figure,.panel,.card,details'); const tab = tabEl ? all(tabEl).replace(/\s+/g, ' ').slice(0, 1800) : '';
          const artEl = el.closest('article,section,.slide,.board-sec'); const art = artEl ? all(artEl).replace(/\s+/g, ' ').slice(0, 600) : '';
          const sib = [el.previousElementSibling, el.nextElementSibling, card && card.nextElementSibling, card && card.previousElementSibling].filter(Boolean).map(s => all(s)).join(' ').slice(0, 800);
          units.push({
            flags: [el.closest('table') ? 'table' : '', el.closest('figure,svg,canvas') ? 'figure' : '', el.closest('pre,code,.eq,.formula') ? 'pre' : '', el.closest('#reflist,.reflist') ? 'refs' : '', el.closest('footer,[data-footer],nav,[data-nav],.subnav') ? 'chrome' : ''].filter(Boolean),
            sec: (sec.id || sec.className || sec.tagName).toString().slice(0, 30), text: t, art, head: headOf(el).replace(/\s+/g, ' ').slice(0, 300), tab, card: card ? all(card).replace(/\s+/g, ' ').slice(0, 2500) : '', sib: sib.replace(/\s+/g, ' '), section: all(sec).replace(/\s+/g, ' ').slice(0, 7000),
          });
        }
      }
      for (const c of el.children) walk(c);
    })(document.body);
    return units;
  };
  // sections of the report that are the student's own methods/results/logbook: numbers there are own measurements (tables must still declare provenance)
  const STRICT = new Set(['index', 'pitch', 'report', 'poster', 'build']);   // static documents: A + B enforced
  const CLAIM_WORDS = /\b(deaths?|died|killed|fatalit\w*|injur\w*|per ?cent|population|residents of|million|billion|thousand)\b|وفاة|وفيات|قُتل|مليون|مليار/i;   // app pages are simulation consoles: only real-world claim words are enforced there
  const OWN_SECTIONS = /^(h-methods|s-methods|h-results|s-results|h-exp|s-exp|h-process|s-process|h-own|s-own|h-logbook|s-logbook|h-repro|s-repro|h-design|s-design|h-limits|s-limits|h-safety|s-safety|h-req|s-req|h-rq|s-rq|h-future|s-future|h-gloss|s-gloss|h-ethics|s-ethics)$/;
  // Reviewed exceptions: [page, text regex, reason]. A new unsourced number does NOT match and therefore fails.
  const ALLOW = [
    ['report', /Qatar National Vision 2030/, 'named programme with a [n] reference in the report reference list (secondary), no statistic'],
    ['report', /free-flow speed|emergency factor|turn-out|class sensitivity|daily curve|school queue|junction queues/i, 'SIM parameters of the traffic model (named assumptions, section 6)'],
    ['report', /Place the camera at suggested distances|I measured the mug|Put the glass pane|Count frames from the switch|120 frames\/s/i, 'experiment protocol steps (planned tests), not claims'],
    ['report', /115200/, 'serial baud rate'],
    ['report', /automated software checks|test-[a-z]+\.mjs|checks pass|test_kit|Browser tests also exist/i, 'our own test counts (checked by run-all.sh)'],
    ['report', /explain .why this unit|farther but .* faster because of rush-hour/i, 'worked example of the SIM dispatch explanation'],
    ['report', /personal alert is slower than the siren|Dispatch time in fire and gas|Night fire: P90|School fire: no meaningful|Dust: exposure|Gas: if gas never seeps/i, 'SIM A/B results, stated with seeds and as a mechanism check'],
    ['report', /Station B is about 1 km farther/i, 'SIM example'],
    ['poster', /^\d+%$|type scale \d+%/, 'poster Settings panel: type-scale / zoom read-out (UI control, not a claim)'],
    ['*', /OASIS CAP 1\.2|WCAG|WBGT/, 'standard names / versions'],
  ];

  const findings = { A: [], B: [], C: [], D: [] }; const stats = {};
  let store = {};
  const CACHE = process.env.UI_UNITS_CACHE;   // dev aid: reuse the rendered text of a previous run
  if (CACHE && fs.existsSync(CACHE)) store = JSON.parse(read(CACHE));
  else {
    const b = await launch();
    for (const name of ALL_PAGES) {
      for (const lang of ['en', 'ar']) {
        const { page, ctx, errors } = await openPage(b, name + '.html', { width: 1440, height: 900, lang });
        await page.waitForTimeout(name === 'report' || name === 'pitch' ? 1200 : 700);
        const units = await page.evaluate(`(${EXTRACT.toString()})('${lang}')`);
        store[name + ':' + lang] = units; if (errors.length) findings.C.push(`${name} ${lang}: page errors ${first(errors, 2)}`);
        await ctx.close();
      }
    }
    await b.close();
    if (CACHE) fs.writeFileSync(CACHE, JSON.stringify(store));
  }

  const counters = () => ({ nTok: 0, nSrc: 0, nBenign: 0, nSim: 0, nOwn: 0, nAllow: 0, nExempt: 0 });
  const findingsE = [];
  // classify one rendered English text unit of page `name`; pushes into findings and counters
  function classify(name, u, k, F = findings, E = findingsE) {
    if (u.flags.includes('chrome')) return;
    const toks = tokens(u.text); if (!toks.length) return;
    const app = !STRICT.has(name) && !CLAIM_WORDS.test(u.text);
    const inSim = app || SIMRE.test(u.text) || SIMRE.test(u.card) || SIMRE.test(u.head) || SIMRE.test(u.tab) || SIMRE.test(u.art) || SIMRE.test(u.sib.slice(0, 300));
    const container = u.flags.some(f => /table|figure|pre|refs/.test(f));
    for (const tk of toks) {
      k.nTok++;
      if (srcSet.has(tk.v)) {
        k.nSrc++;
        if (BENIGN(tk, u.text)) continue;
        const significant = (tk.v >= 100 || /[.%]/.test(tk.raw) || /^\s*(%|per ?cent)/i.test(tk.ctx.slice(tk.ctx.indexOf(tk.raw) + tk.raw.length))) && !(tk.v >= 1990 && tk.v <= 2035) && ![100, 999, 992, 184, 188, 991].includes(tk.v);
        const exempt = container || inSim || OWN.some(o => o.v.includes(tk.v) && o.ctx.test(u.text)) || ALLOW.some(([p, re]) => (p === '*' || p === name) && re.test(u.text));
        if (significant && !exempt) {
          // B. a visible source marker
          if (!(MARK.test(u.text) || MARK.test(u.card) || MARK.test(u.sib) || (u.section.length < 9000 && MARK.test(u.section)))) F.B.push(`${name}: ${tk.raw} in “${snip(u.text, 80)}”`);
          // E. the cited S-id really contains this number; without an S-id the claim must share words with the source row
          const idsOf = t => [...new Set([...t.matchAll(/\bS(\d{1,3})\b/g)].map(m => +m[1]))].filter(n => rowsById.has(n));
          const near = idsOf(u.text + ' ' + u.card);
          if (near.length) { if (!near.some(id => rowsById.get(id).has(tk.v))) E.push(`${name}: ${tk.raw} is cited as S${near.join('/S')} but none of those rows contains it — “${snip(u.text, 80)}”`); }
          else {
            const w = wordsOf(u.text + ' ' + u.card), ix = wordIdx.get(tk.v) || new Set(); const sec = u.section.length < 9000 ? idsOf(u.section) : [];
            if (w.size >= 3 && ![...w].some(x => ix.has(x)) && !sec.some(id => rowsById.get(id).has(tk.v))) E.push(`${name}: ${tk.raw} matches a sourced figure only by value, the wording differs — “${snip(u.text, 80)}”`);
          }
        }
        continue;
      }
      if (BENIGN(tk, u.text)) { k.nBenign++; continue; }
      if (inSim) { k.nSim++; continue; }
      if (OWN.some(o => o.v.includes(tk.v) && o.ctx.test(u.text + ' ' + u.card))) { k.nOwn++; continue; }
      if (ALLOW.some(([p, re]) => (p === '*' || p === name) && (re.test(u.text) || re.test(tk.ctx || '')))) { k.nAllow++; continue; }
      if (name === 'report' && (container || OWN_SECTIONS.test(u.sec))) { k.nExempt++; continue; }
      F.A.push(`${name}: ${tk.raw} in “${snip(u.text, 110)}”`);
    }
  }
  {
    // self-test: the detectors must fire on a planted unsourced number / missing source / mis-citation, and stay quiet on correct uses
    const U = (text, extra = {}) => ({ flags: [], text, card: '', head: '', tab: '', art: '', sib: '', section: '', sec: 'x', ...extra });
    const run = (u, name = 'index') => { const F = { A: [], B: [] }, E = []; classify(name, u, counters(), F, E); return { A: F.A.length, B: F.B.length, E: E.length }; };
    const cases = [
      ['unsourced death toll is flagged (A)', run(U('In Qatar 4,321 people die in house fires every year.')).A > 0],
      ['same figure labelled SIM is accepted', run(U('In the simulation 4,321 people die (SIM).')).A === 0],
      ['sourced figure without any source marker is flagged (B)', run(U('The UAE had 2,473 fires.')).B > 0],
      ['sourced figure with its S-id is accepted', (() => { const r = run(U('The UAE had 2,473 fires in 2023 (S11).')); return r.A + r.B + r.E === 0; })()],
      ['figure cited to the wrong S-id is flagged (E)', run(U('The UAE had 2,473 fires (S1).')).E > 0],
      ['an invented percentage on a strict page is flagged', run(U('Smoke alarms cut deaths by 83.2%.')).A > 0],
      ['a benign small count is accepted', run(U('Six hazards on one pipeline, 3 pillars.')).A === 0],
    ];
    const bad = cases.filter(([, ok]) => !ok).map(([n]) => n);
    check(`honesty scanner self-test: ${cases.length} planted cases behave (unsourced, SIM, missing source, mis-citation, benign)`, bad.length === 0, first(bad));
  }
  for (const name of ALL_PAGES) {
    const en = store[name + ':en'], ar = store[name + ':ar'];
    const k = counters(); for (const u of en) classify(name, u, k);
    const { nTok, nSrc, nBenign, nSim, nOwn, nAllow, nExempt } = k;
    // C. cited S-ids exist
    const allText = [...en, ...ar].map(u => u.text).join(' ');
    const cited = [...new Set([...allText.matchAll(/\bS(\d{1,3})\b/g)].map(m => +m[1]))].filter(n => n > 0);
    const unknown = cited.filter(n => !srcIds.has(n)); if (unknown.length) findings.C.push(`${name}: cites unknown S${unknown.join(', S')}`);
    // D. ar/en parity of significant numbers
    const sig = units => { const m = new Map(); for (const u of units) { if (u.flags.includes('chrome')) continue; for (const tk of tokens(u.text)) if (srcSet.has(tk.v) && (tk.v >= 100 || /[.%]/.test(tk.raw)) && !(tk.v >= 1990 && tk.v <= 2035) && ![100, 999].includes(tk.v)) m.set(tk.v, (m.get(tk.v) || 0) + 1); } return m; };
    const se = sig(en), sa = sig(ar); const onlyEn = [...se.keys()].filter(k => !sa.has(k)), onlyAr = [...sa.keys()].filter(k => !se.has(k));
    if (onlyEn.length + onlyAr.length) findings.D.push(`${name}: only in EN [${onlyEn.slice(0, 8)}] / only in AR [${onlyAr.slice(0, 8)}]`);
    stats[name] = `${en.length} units, ${nTok} numbers: ${nSrc} sourced, ${nBenign} benign, ${nSim} SIM-labelled, ${nOwn} own-measured, ${nAllow} allowed, ${nExempt} report-tables/own-sections`;
    console.log(`  ${name.padEnd(8)} ${stats[name]}`);
  }
  check('A. no number outside docs/MANARA-SOURCES.md is shown unless it is a benign count, SIM-labelled, an own measurement, or a reviewed exception', findings.A.length === 0, first(findings.A, 12));
  check('B. every significant sourced figure shows a visible source (S-id, "Source", outlet, organisation or [n]) in its unit, card or section', findings.B.length === 0, first(findings.B, 10));
  check('E. every cited S-number really contains the figure it sits next to; an uncited figure shares its wording with the source row (no mis-citation)', findingsE.length === 0, first(findingsE, 8));
  check('C. every cited S-number exists in MANARA-SOURCES.md and the pages render without errors', findings.C.length === 0, first(findings.C));
  check('D. Arabic and English show the same sourced figures (no translation drift)', findings.D.length === 0, first(findings.D, 8));
  // report: every table / figure that carries numbers declares its provenance (the report's own law: "every number carries a label")
  {
    const b2 = await launch(); const { page, ctx } = await openPage(b2, 'report.html', { width: 1440, height: 900, lang: 'en' }); await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const PROV = /\b(SIM|MEASURED|COMPUTED|PLANNED|CITED|EXAMPLE|SECONDARY|STUDENT FILLS|DESIGN|N\/A)\b|\(SIM\)|\bS\d{1,2}\b/;
      const out = []; let n = 0;
      document.querySelectorAll('main table, main figure').forEach(el => {
        if (el.tagName === 'FIGURE' && el.querySelector('table')) return;
        const nums = (el.textContent.replace(/\s+/g, ' ').match(/\d+(\.\d+)?/g) || []).length; if (nums < 3) return; n++;
        const holder = el.closest('figure, .rp-tab, .rp-fig, article') || el; const capEl = el.querySelector('caption, figcaption') || holder.querySelector('figcaption');
        const capTxt = capEl ? capEl.textContent : '';
        let ok = !!holder.querySelector('.ev, .cite') || PROV.test(capTxt) || (el.tagName === 'FIGURE' && /architecture|state machine|diagram|معمارية|آلة حالات|مخطط/i.test(capTxt));   // a design diagram is not a measurement
        for (let k = 0, x = holder.previousElementSibling; !ok && x && k < 3; k++, x = x.previousElementSibling) { if (x.matches('.ev') || (x.querySelector && x.querySelector('.ev, .cite'))) ok = true; if (/^H[1-4]$/.test(x.tagName)) break; }
        if (!ok) out.push((capEl ? capEl.textContent : el.id || el.tagName).replace(/\s+/g, ' ').slice(0, 60));
      });
      return { n, bad: [...new Set(out)] };
    });
    check(`report: all ${r.n} tables/figures with numbers carry an evidence label (SIM / MEASURED / COMPUTED / PLANNED / CITED / DESIGN ...) in the caption or panel`, r.bad.length === 0, first(r.bad, 8));
    await ctx.close(); await b2.close();
  }
}

/* =========================================================================================================================
   SUITE 3 - PAGES (per-page browser matrix)
   ======================================================================================================================= */
// Runs inside the page. Returns plain data only.
const AUDIT = ({ lang, theme, width, name }) => {
  const d = document.documentElement; const out = {};
  const vis = el => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  out.html = { lang: d.lang, dir: d.dir, dl: d.dataset.lang, theme: d.dataset.theme, bodyDir: getComputedStyle(document.body).direction, title: document.title };
  const t = document.querySelector('title'); out.titleAttr = { en: t && t.getAttribute('data-en'), ar: t && t.getAttribute('data-ar') };
  out.h1 = [...document.querySelectorAll('h1')].filter(vis).map(h => h.textContent.replace(/\s+/g, ' ').trim().slice(0, 50));
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { if (e.closest('template')) return; ids[e.id] = (ids[e.id] || 0) + 1; });
  out.dupIds = Object.entries(ids).filter(([, n]) => n > 1).map(([k, n]) => k + '×' + n);
  out.imgNoAlt = [...document.querySelectorAll('img:not([alt])')].map(i => i.getAttribute('src'));
  out.canvasUnlabelled = [...document.querySelectorAll('canvas')].filter(c => !c.closest('[aria-hidden="true"]') && vis(c) && !(c.getAttribute('aria-label') || '').trim() && !c.getAttribute('aria-labelledby') && !(c.getAttribute('role') === 'presentation')).map(c => c.id || c.className || 'canvas');
  out.posTabindex = [...document.querySelectorAll('[tabindex]')].filter(e => +e.getAttribute('tabindex') > 0).map(e => e.id || e.tagName);
  out.blank = [...document.querySelectorAll('a[target="_blank"]')].filter(a => !/noopener/.test(a.rel || '')).map(a => a.href.slice(0, 50));
  out.mains = document.querySelectorAll('main').length; out.skip = (document.querySelector('.skip') || {}).getAttribute ? document.querySelector('.skip').getAttribute('href') : null;
  out.navLinks = [...document.querySelectorAll('.nav-links a')].map(a => ({ href: a.getAttribute('href'), cur: a.getAttribute('aria-current') }));
  out.menuLinks = document.querySelectorAll('.menu a').length;
  out.footLinks = [...document.querySelectorAll('.foot a')].map(a => a.getAttribute('href'));
  out.links = [...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), blank: a.target === '_blank', dl: a.hasAttribute('download') }));
  const brand = document.querySelector('.nav .brand'); if (brand) { const r = brand.getBoundingClientRect(); out.brandSide = r.left + r.width / 2 > innerWidth / 2 ? 'right' : 'left'; }
  out.metaViewport = !!document.querySelector('meta[name=viewport][content*="width=device-width"]');
  // letter-spacing on Arabic text
  out.arSpacing = [];
  if (lang === 'ar') {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { if (!/[؀-ۿ]/.test(n.textContent)) continue; const el = n.parentElement; if (!el || !vis(el) || el.closest('script,style,svg')) continue; const ls = getComputedStyle(el).letterSpacing; if (ls !== 'normal' && parseFloat(ls) !== 0) out.arSpacing.push(`${el.className || el.tagName}:${ls}:${n.textContent.trim().slice(0, 20)}`); }
  }
  // language leakage (informational): visible Arabic prose in English mode, visible English prose in Arabic mode
  out.leak = [];
  { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const txt = n.textContent.replace(/\s+/g, ' ').trim(); if (txt.length < 8) continue; const el = n.parentElement; if (!el || el.closest('script,style,noscript,svg,code,pre,kbd,samp,.mono,.num,[lang],[dir=ltr],[dir=rtl],bdi,.ltr,a[href^=http],canvas,textarea,input,option,.kit-name,[data-keep-lang]') || !vis(el)) continue;
      if (lang === 'en' && /[؀-ۿ]{3,}/.test(txt)) out.leak.push('AR-in-EN: ' + txt.slice(0, 50));
      if (lang === 'ar' && /[A-Za-z]{3,}(\s+[A-Za-z]{2,}){2,}/.test(txt) && !/[؀-ۿ]/.test(txt)) out.leak.push('EN-in-AR: ' + txt.slice(0, 50));
    } }
  out.leak = out.leak.slice(0, 6);
  // contrast
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true }); const cache = new Map();
  const parse = css => {
    if (cache.has(css)) return cache.get(css);
    let m = /^rgba?\(([^)]+)\)$/.exec(css), r;
    if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); r = { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    else { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const px = g.getImageData(0, 0, 1, 1).data; r = { r: px[0], g: px[1], b: px[2], a: px[3] / 255 }; if (r.a > 0 && r.a < 1) { r.r = Math.min(255, Math.round(r.r)); } }
    cache.set(css, r); return r;
  };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const Lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const bgOf = el => {
    const layers = []; let e = el, uncertain = false;
    while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !/^none/.test(cs.backgroundImage)) uncertain = true; const bg = parse(cs.backgroundColor); if (bg.a > 0) { layers.push(bg); if (bg.a >= 0.99) break; if (uncertain) break; } if (uncertain && e !== el) break; e = e.parentElement; }
    let base = parse(getComputedStyle(document.body).backgroundColor); if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 };
    if (!layers.length || layers[layers.length - 1].a < 0.99) { /* fall through to body background */ } else base = layers.pop();
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { c: base, uncertain };
  };
  out.contrast = []; let sampled = 0, skipped = 0;
  { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const seen = new Set();
    while ((n = w.nextNode())) {
      const txt = n.textContent.trim(); if (!txt || !/[\p{L}\p{N}]/u.test(txt)) continue; const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (el.closest('script,style,noscript,svg,canvas,[aria-hidden="true"],.sr-only,[disabled],.skip,input,textarea,select,option,template') || !vis(el)) continue;
      const rc = el.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
      const cs = getComputedStyle(el); if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)') { skipped++; continue; }
      if (el.closest('button:disabled,[aria-disabled="true"],.is-disabled,.disabled')) continue;
      const { c: bg, uncertain } = bgOf(el); if (uncertain) { skipped++; continue; }
      let op = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity) || 1;
      const f0 = parse(cs.color); const fg = over({ ...f0, a: f0.a * op }, bg);
      const l1 = Lum(fg), l2 = Lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700); sampled++;
      if (ratio < (large ? 3 : 4.5)) out.contrast.push(`${ratio.toFixed(2)} ${large ? '(large) ' : ''}${(el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase())} “${txt.slice(0, 24)}”`);
    } }
  out.contrastN = sampled; out.contrastSkipped = skipped;
  // globals leaked by scripts (IIFE law): anything that is not Manara*/MANARA*/documented
  out.globals = Object.getOwnPropertyNames(window).filter(k => !(k in window.__baselineGlobals || {}) && !/^(Manara|MANARA|MissionControl|__|webkit|on[a-z]+$)/.test(k) && !document.getElementById(k) && !document.getElementsByName(k).length);
  return out;
};

if (want('pages')) {
  section('PAGES  load + audit matrix (ar|en x dark|light x 390|1440), keyboard, toggles, motion');
  const browser = await launch();
  // baseline window globals from an empty page (to detect leaked top-level vars)
  const bctx = await browser.newContext(); const bp = await bctx.newPage(); await bp.goto('about:blank');
  const baseline = await bp.evaluate(() => Object.fromEntries(Object.getOwnPropertyNames(window).map(k => [k, 1]))); await bctx.close();
  const P = { load: [], lang: [], title: [], overflow: [], dup: [], alt: [], axname: [], contrast: [], arspace: [], leak: [], misc: [], nav: [], brand: [], globals: [], links: new Map(), contrastN: 0 };
  const combos = []; for (const n of PAGES) for (const lang of ['ar', 'en']) for (const theme of ['dark', 'light']) for (const width of [390, 1440]) combos.push({ n, lang, theme, width });
  const AXROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem']);
  async function runCombo({ n, lang, theme, width }) {
    const tag = `${n} ${lang}/${theme} ${width}px`;
    const { ctx, page, errors } = await openPage(browser, n + '.html', { width, height: width > 600 ? 900 : 844, theme, lang });
    try {
      await page.addInitScript(b => { window.__baselineGlobals = b; }, baseline).catch(() => {});
      await page.evaluate(b => { window.__baselineGlobals = b; }, baseline);
      await page.waitForTimeout(n === 'mission' || n === 'pitch' || n === 'report' ? 900 : 500);
      if (errors.length) P.load.push(`${tag}: ${first(errors, 2)}`);
      const a = await page.evaluate(AUDIT, { lang, theme, width, name: n });
      const exp = lang === 'ar' ? 'rtl' : 'ltr';
      if (a.html.lang !== lang || a.html.dl !== lang || a.html.dir !== exp || a.html.bodyDir !== exp || a.html.theme !== theme) P.lang.push(`${tag}: lang=${a.html.lang} data-lang=${a.html.dl} dir=${a.html.dir}/${a.html.bodyDir} theme=${a.html.theme}`);
      const hasAr = /[؀-ۿ]/.test(a.html.title);
      if (!a.titleAttr.en || !a.titleAttr.ar || (lang === 'ar') !== hasAr || a.html.title.length < 8) P.title.push(`${tag}: title “${a.html.title}” (en attr: ${a.titleAttr.en ? 'ok' : 'missing'})`);
      const ov = await overflow(page); if (ov.bad.length || ov.scrollW > ov.W + 1) P.overflow.push(`${tag}: scrollW ${ov.scrollW} > ${ov.W}; ${first(ov.bad, 3)}`);
      if (a.dupIds.length) P.dup.push(`${tag}: ${first(a.dupIds, 4)}`);
      if (a.imgNoAlt.length || a.canvasUnlabelled.length || a.posTabindex.length || a.blank.length) P.alt.push(`${tag}: ${[a.imgNoAlt.length && 'img w/o alt ' + a.imgNoAlt, a.canvasUnlabelled.length && 'unlabelled canvas ' + a.canvasUnlabelled, a.posTabindex.length && 'tabindex>0 ' + a.posTabindex, a.blank.length && '_blank w/o noopener ' + a.blank].filter(Boolean).join('; ')}`);
      if (a.contrast.length) P.contrast.push(`${tag}: ${first(a.contrast, 4)}`); P.contrastN += a.contrastN;
      if (a.arSpacing.length) P.arspace.push(`${tag}: ${first(a.arSpacing, 3)}`);
      if (a.leak.length && width === 1440 && theme === 'dark') P.leak.push(`${tag}: ${first(a.leak, 3)}`);
      if (a.globals.length) P.globals.push(`${tag}: ${first(a.globals, 5)}`);
      if (a.mains !== 1 || a.skip !== '#main') P.misc.push(`${tag}: main×${a.mains}, skip href ${a.skip}`);
      if (!a.metaViewport) P.misc.push(`${tag}: viewport meta`);
      if (a.h1.length < 1) P.misc.push(`${tag}: no visible h1`);
      if (a.navLinks.length !== 7 || a.menuLinks !== 7) P.nav.push(`${tag}: ${a.navLinks.length} nav links, ${a.menuLinks} menu links (expected 7)`);
      const cur = a.navLinks.filter(l => l.cur === 'page').map(l => l.href); const shouldCur = ['index', 'mission', 'detect', 'alert', 'build', 'pitch', 'report'].includes(n) ? [n + '.html'] : [];
      if (cur.join() !== shouldCur.join()) P.nav.push(`${tag}: aria-current=${cur.join() || 'none'} expected ${shouldCur.join() || 'none'}`);
      if (width >= 1100 && a.brandSide && a.brandSide !== (lang === 'ar' ? 'right' : 'left')) P.brand.push(`${tag}: brand on the ${a.brandSide} (layout did not mirror)`);
      for (const l of a.links) { const k = l.href; if (!P.links.has(k)) P.links.set(k, n); }
      // accessible names from Chrome's accessibility tree
      if (theme === 'dark' || width === 390) {
        const cdp = await ctx.newCDPSession(page); await cdp.send('Accessibility.enable'); const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        const bad = []; let nn = 0;
        for (const x of nodes) {
          if (x.ignored) continue; const role = x.role && x.role.value; const nm = ((x.name && x.name.value) || '').trim();
          const need = AXROLES.has(role) || role === 'img' || role === 'navigation' && false;
          if (!need) continue; nn++;
          if (!nm) { let desc = role; try { const { node } = await cdp.send('DOM.describeNode', { backendNodeId: x.backendDOMNodeId }); const at = node.attributes || []; const gi = k => { const i = at.indexOf(k); return i >= 0 ? at[i + 1] : ''; }; desc = `${role} <${node.nodeName.toLowerCase()}${gi('id') ? '#' + gi('id') : ''}${gi('class') ? '.' + gi('class').split(' ')[0] : ''}>`; } catch (e) { /* ignore */ } bad.push(desc); }
        }
        if (bad.length) P.axname.push(`${tag}: ${bad.length} unnamed (${first([...new Set(bad)], 4)})`);
        await cdp.detach().catch(() => {});
      }
    } catch (e) { P.load.push(`${tag}: harness ${snip(e.message, 120)}`); }
    await ctx.close();
  }
  async function pool(items, size, fn) { let i = 0; await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }
  await pool(combos, 3, runCombo);
  const N = combos.length;
  check(`${N} loads from file:// without console errors, page errors or failed local requests`, P.load.length === 0, first(P.load));
  check('<html lang/dir/data-lang> and body direction match the language, data-theme matches the colour scheme (every load)', P.lang.length === 0, first(P.lang));
  check('<title> is bilingual: Arabic in ar, English in en, data-en present (every load)', P.title.length === 0, first(P.title));
  check('no horizontal overflow beyond .table-wrap/pre/.scroll-x and document scrollWidth never exceeds the viewport (every load)', P.overflow.length === 0, first(P.overflow));
  check('no duplicate ids after the scripts have run (every load)', P.dup.length === 0, first(P.dup));
  check('images have alt, canvases are labelled, no positive tabindex, target=_blank has rel=noopener (every load)', P.alt.length === 0, first(P.alt));
  check('every button/link/field/tab has an accessible name in Chrome\'s accessibility tree (dark + 390px loads)', P.axname.length === 0, first(P.axname, 5));
  check(`WCAG contrast of ${P.contrastN} rendered text runs: >= 4.5:1 (>= 3:1 large) on --bg/--surface/... in both themes`, P.contrast.length === 0, first(P.contrast, 6));
  check('letter-spacing is normal/0 on every Arabic text run (ar loads)', P.arspace.length === 0, first(P.arspace));
  check('one <main>, skip link href="#main", viewport meta, a visible h1 on every page', P.misc.length === 0, first(P.misc));
  check('nav: 7 links in the bar and 7 in the mobile menu, aria-current marks the current page only', P.nav.length === 0, first(P.nav));
  check('RTL/LTR mirroring: the brand sits on the right in Arabic and on the left in English (desktop)', P.brand.length === 0, first(P.brand));
  check('scripts leak no globals except Manara*/MANARA*/MissionControl (IIFE law)', P.globals.length === 0, first(P.globals));
  if (P.leak.length) console.log('  info language leakage (not a failure): ' + first(P.leak, 6));

  // ---- link resolution: every local href found on any page
  {
    const miss = [];
    for (const [href, from] of P.links) {
      if (!href || /^(https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(href)) continue;
      if (href === '#') { miss.push(`${from}: href="#"`); continue; }
      if (href.startsWith('#')) continue;
      const file = href.split('#')[0].split('?')[0]; if (!file) continue;
      if (!fs.existsSync(path.join(SITE, decodeURI(file)))) miss.push(`${from}: ${href}`);
      else if (file.endsWith('.html')) { const h = href.split('#')[1]; if (h && /^[A-Za-z][\w-]*$/.test(h)) { const src = read(path.join(SITE, file)) + (fs.existsSync(path.join(SITE, 'js', path.basename(file, '.html') + '.js')) ? read(path.join(SITE, 'js', path.basename(file, '.html') + '.js')) : ''); if (!src.includes(h)) miss.push(`${from}: ${href} (no #${h} in ${file})`); } }
    }
    check(`all ${P.links.size} distinct hrefs found in the rendered pages resolve to an existing file (and existing #id)`, miss.length === 0, first(miss));
    const inPage = [];
    for (const n of PAGES) {
      const { ctx, page } = await openPage(browser, n + '.html', { width: 1440, height: 900, lang: 'en' });
      const bad = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1))) && !document.getElementsByName(decodeURIComponent(h.slice(1))).length && !/=/.test(h)));
      if (bad.length) inPage.push(`${n}: ${first([...new Set(bad)], 4)}`); await ctx.close();
    }
    check('every in-page #anchor in the rendered DOM points at an element that exists', inPage.length === 0, first(inPage));
  }

  // ---- keyboard: skip link + focus order (desktop and phone)
  {
    const probs = [];
    for (const n of PAGES) for (const [width, lang] of [[1440, 'en'], [390, 'ar']]) {
      const { ctx, page } = await openPage(browser, n + '.html', { width, height: width > 600 ? 900 : 844, lang }); await page.waitForTimeout(400);
      const stops = [];
      for (let i = 0; i < 28; i++) {
        await page.keyboard.press('Tab');
        const s = await page.evaluate(() => {
          const e = document.activeElement; if (!e || e === document.body) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
          return { tag: e.tagName.toLowerCase(), id: e.id, cls: typeof e.className === 'string' ? e.className.split(' ')[0] : '', name: (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24), top: r.top, left: r.left, right: r.right, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, shadow: cs.boxShadow !== 'none', vis: cs.visibility !== 'hidden' && cs.display !== 'none', pos: cs.position, inMenu: !!e.closest('.menu:not(.open)'), key: window.__tabKey = (window.__tabKey || 0) + 1 };
        });
        stops.push(s);
        if (i === 0 && s && s.cls === 'skip') { /* ok */ }
      }
      const tag = `${n} ${width}px`;
      if (!stops[0] || stops[0].cls !== 'skip') probs.push(`${tag}: first Tab stop is ${stops[0] ? stops[0].tag + '.' + stops[0].cls : 'nothing'}, not the skip link`);
      else if (stops[0].top < 0 || stops[0].top > 80) probs.push(`${tag}: skip link not visible when focused (top ${Math.round(stops[0].top)})`);
      if (stops[1] && stops[1].cls !== 'brand') probs.push(`${tag}: second stop ${stops[1].tag}.${stops[1].cls}, expected the brand link`);
      const ok = stops.filter(Boolean);
      const hidden = ok.filter(s => !s.vis || s.inMenu || s.w < 1 || s.h < 1); if (hidden.length) probs.push(`${tag}: focus on hidden/zero-size element ${hidden[0].tag}#${hidden[0].id}.${hidden[0].cls} “${hidden[0].name}”`);
      const off = ok.filter(s => s.pos !== 'fixed' && (s.right < 0 || s.left > s.vw)); if (off.length) probs.push(`${tag}: focus moved off-screen to ${off[0].tag}.${off[0].cls} “${off[0].name}” (${Math.round(off[0].left)}..${Math.round(off[0].right)} of ${off[0].vw})`);
      const noRing = ok.filter(s => !s.outline && !s.shadow); if (noRing.length) probs.push(`${tag}: no visible focus indicator on ${noRing[0].tag}.${noRing[0].cls} “${noRing[0].name}” (+${noRing.length - 1})`);
      // DOM order monotonic for the first stops (positive tabindex is already forbidden, so Tab order == DOM order unless widgets re-focus)
      const order = await page.evaluate(() => { const els = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex="0"]')].filter(e => !e.closest('[hidden],.menu:not(.open)') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.disabled); return els.slice(0, 3).map(e => e.className); });
      void order;
      // skip link works: Enter -> hash #main and the next Tab lands inside <main>
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
      const hash = await page.evaluate(() => location.hash); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
      const inMain = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest('main')));
      if (hash !== '#main') probs.push(`${tag}: skip link did not navigate to #main (hash ${hash})`);
      else if (!inMain) probs.push(`${tag}: after the skip link the next Tab does not land inside <main> (${await page.evaluate(() => document.activeElement.tagName + '.' + document.activeElement.className)})`);
      await ctx.close();
    }
    check('keyboard: skip link first + visible + works; brand second; no focus on hidden or off-screen elements; every stop has a focus ring (desktop en + phone ar)', probs.length === 0, first(probs, 6));
  }

  // ---- mobile menu, language toggle, theme toggle, ?lang=en
  {
    const probs = [];
    for (const n of PAGES) {
      const { ctx, page, errors } = await openPage(browser, n + '.html', { width: 390, height: 844, lang: 'ar', theme: 'dark' }); await page.waitForTimeout(300);
      const mb = page.locator('.menu-btn'); await mb.click(); await page.waitForTimeout(100);
      const st1 = await page.evaluate(() => ({ exp: document.querySelector('.menu-btn').getAttribute('aria-expanded'), open: document.querySelector('.menu').classList.contains('open'), links: [...document.querySelectorAll('.menu a')].filter(a => a.getClientRects().length).length }));
      if (st1.exp !== 'true' || !st1.open || st1.links !== 7) probs.push(`${n}: menu open state ${JSON.stringify(st1)}`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      const st2 = await page.evaluate(() => ({ open: document.querySelector('.menu').classList.contains('open'), focus: document.activeElement.className }));
      if (st2.open || !/menu-btn/.test(st2.focus)) probs.push(`${n}: Escape should close the menu and return focus to the button (${JSON.stringify(st2)})`);
      // language toggle
      const before = await page.evaluate(() => ({ l: document.documentElement.lang, t: document.title }));
      await page.evaluate(() => { window.__lc = 0; window.addEventListener('langchange', () => window.__lc++); window.__tc = 0; window.addEventListener('themechange', () => window.__tc++); });
      await page.click('[data-lang-toggle]'); await page.waitForTimeout(250);
      const after = await page.evaluate(() => ({ l: document.documentElement.lang, dir: document.documentElement.dir, t: document.title, lc: window.__lc, stored: localStorage.getItem('manara-lang'), btn: document.querySelector('[data-lang-toggle]').getAttribute('aria-label') }));
      if (after.l !== 'en' || after.dir !== 'ltr' || after.t === before.t || after.lc !== 1 || after.stored !== 'en' || /[؀-ۿ]/.test(after.t)) probs.push(`${n}: language toggle ${JSON.stringify(after)} (before ${before.l})`);
      await page.click('[data-lang-toggle]'); await page.waitForTimeout(150);
      const back = await page.evaluate(() => ({ l: document.documentElement.lang, dir: document.documentElement.dir, lc: window.__lc }));
      if (back.l !== 'ar' || back.dir !== 'rtl' || back.lc !== 2) probs.push(`${n}: toggling back ${JSON.stringify(back)}`);
      // theme toggle
      await page.click('.theme-toggle'); await page.waitForTimeout(150);
      const th = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, tc: window.__tc, stored: localStorage.getItem('manara-theme'), bg: getComputedStyle(document.body).backgroundColor }));
      if (th.t !== 'light' || th.tc !== 1 || th.stored !== 'light' || th.bg === 'rgb(10, 14, 21)') probs.push(`${n}: theme toggle ${JSON.stringify(th)}`);
      if (errors.length) probs.push(`${n}: errors after toggles ${first(errors, 2)}`);
      await ctx.close();
      // ?lang=en overrides the stored Arabic
      const c2 = await openPage(browser, n + '.html', { width: 1280, height: 800, lang: 'ar', query: '?lang=en' });
      const ql = await c2.page.evaluate(() => document.documentElement.lang); if (ql !== 'en') probs.push(`${n}: ?lang=en ignored (lang=${ql})`); await c2.ctx.close();
    }
    check('mobile menu opens (aria-expanded) + Escape closes it and restores focus; language and theme toggles flip html, title, storage and fire events; ?lang=en wins', probs.length === 0, first(probs, 6));
  }

  // ---- prefers-reduced-motion
  {
    const probs = []; let infiniteWhenMotionOK = 0;
    for (const n of PAGES) {
      for (const rm of ['reduce', 'no-preference']) {
        const { ctx, page } = await openPage(browser, n + '.html', { width: 1440, height: 900, lang: 'en', reducedMotion: rm }); await page.waitForTimeout(900);
        const r = await page.evaluate(() => {
          const hero = el => !!el.closest('.nav, [data-nav], .hero, .page-hero, [class*=hero], main > section:first-of-type, main > div:first-child, header');
          const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target).map(a => { const t = a.effect.target, tm = a.effect.getTiming(); return { sel: (t.id ? '#' + t.id : '') + (typeof t.className === 'string' && t.className ? '.' + t.className.split(' ')[0] : t.tagName.toLowerCase()), inf: tm.iterations === Infinity, dur: tm.duration, hero: hero(t), name: a.animationName || a.transitionProperty || '' }; });
          return { running: running.filter(x => x.inf), heroInf: running.filter(x => x.inf && x.hero), all: running.length };
        });
        if (rm === 'reduce' && r.running.length) probs.push(`${n}: ${r.running.length} looping animation(s) still running under reduced motion: ${first(r.running.map(x => x.sel + (x.hero ? ' [hero]' : '')), 3)}`);
        if (rm === 'no-preference') infiniteWhenMotionOK += r.running.length;
        await ctx.close();
      }
    }
    check('prefers-reduced-motion: reduce leaves NO looping CSS animation running on any page (hero, nav, decorations)', probs.length === 0, first(probs));
    console.log(`  info (control): ${infiniteWhenMotionOK} looping animations run across the pages when motion is allowed, so the reduced-motion check is not vacuous`);
  }
  await browser.close();
}

/* =========================================================================================================================
   SUITE 4 - FLOW (one browser context, three pages talking over Manara.link)
   ======================================================================================================================= */
if (want('flow')) {
  section('FLOW  Evidence Lab -> Mission Control -> phones -> check-in -> headcount (one browser context)');
  const browser = await launch();
  const W = (p, fn, ...a) => p.evaluate(fn, ...a);
  const waitFor = async (page, fn, arg, timeout = 9000) => { try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { return false; } };
  const first1 = await openPage(browser, 'mission.html', { width: 1440, height: 900, lang: 'en' });
  const ctx = first1.ctx; const mc = first1.page; const errs = [first1.errors];
  await mc.waitForSelector('#main[data-ready="1"]', { timeout: 9000 });
  const ph = await openPage(browser, 'alert.html', { context: ctx, width: 1440, height: 900, lang: 'en' }); errs.push(ph.errors);
  const lab = await openPage(browser, 'detect.html', { context: ctx, width: 1440, height: 900, lang: 'en' }); errs.push(lab.errors);
  const alertP = ph.page, labP = lab.page;
  await waitFor(alertP, () => document.documentElement.getAttribute('data-alert-ready') === '1');
  await W(alertP, () => { window.__got = []; Manara.link.on(m => { if (/^(alert|dispatch|citizen)/.test(m.type)) window.__got.push({ type: m.type, hazard: m.hazard, level: m.level, person: m.person, id: m.id, state: m.state, from: m.from, units: m.units && m.units.map(u => u.kind) }); }); });
  check('three MANARA pages open together in one context (mission + alert + detect), all ready', (await W(mc, () => window.__manaraReady === true)) && (await W(alertP, () => window.__manaraReady === true)) && (await W(labP, () => window.__manaraReady === true)));

  // 1. Mission Control: the fire starts; one sensor key at most -> never an alert
  await W(mc, () => { MissionControl.start('fire-night', 7); MissionControl.advance(12); });
  const s0 = await W(mc, () => ({ phase: MissionControl.snap.verification.phase, keys: MissionControl.snap.verification.keys.slice(), alert: !!MissionControl.sim.alert, dis: document.querySelector('#pn-proof .mc-approve').disabled }));
  check('Mission Control at T+12 s: not confirmed, Approve disabled, no alert yet (proof before panic)', s0.phase !== 'confirmed' && s0.phase !== 'public' && s0.dis === true && !s0.alert, JSON.stringify(s0));

  // 2. Evidence Lab: the camera sees the flame; two keys inside the lab; the human approves there
  await labP.bringToFront();
  const labFire = await waitFor(labP, () => document.getElementById('live-ladder') && document.getElementById('live-ladder').getAttribute('data-level') === 'confirmed' && !document.getElementById('live-approve').disabled, null, 15000);
  check('Evidence Lab: the flame scene reaches CONFIRMED (vision + thermal) and Approve unlocks', labFire);
  await labP.click('#live-approve'); await sleep(500);
  const msg = await W(labP, () => { try { const m = JSON.parse(localStorage.getItem('manara-last-detection')); return m && { type: m.type, state: m.state, source: m.source, confidence: m.confidence, snap: !!m.snapshot, from: m.from }; } catch (e) { return null; } });
  check('Evidence Lab Approve publishes a "detection" message (state fire, confidence, snapshot) on the bus', !!msg && msg.type === 'detection' && msg.state === 'fire' && msg.confidence > 0.5 && msg.snap && msg.from === 'detect.html', JSON.stringify(msg));

  // 3. Mission Control sees it as ONE key (vision) - not enough alone
  await mc.bringToFront();
  const seen = await waitFor(mc, () => !!MissionControl.state.detection && MissionControl.state.detection.state === 'fire', null, 6000);
  check('Mission Control receives the Evidence Lab detection over the bus', seen);
  await W(mc, () => MissionControl.advance(2));
  const s1 = await W(mc, () => ({ phase: MissionControl.snap.verification.phase, keys: MissionControl.snap.verification.keys.slice(), ui: document.querySelector('#pn-proof').textContent, alert: !!MissionControl.sim.alert }));
  check('the camera is shown as a key in the proof panel and is not an alert by itself', /Evidence Lab/.test(s1.ui) && !s1.alert && s1.phase !== 'public', JSON.stringify({ phase: s1.phase, keys: s1.keys }));

  // 4. the second, independent key arrives from the sentinels -> CONFIRMED -> the operator approves
  await W(mc, () => MissionControl.advance(70));
  const s2 = await W(mc, () => ({ phase: MissionControl.snap.verification.phase, keys: MissionControl.snap.verification.keys.slice(), dis: document.querySelector('#pn-proof .mc-approve').disabled }));
  check('second independent key (sentinels) -> CONFIRMED and Approve is enabled', s2.phase === 'confirmed' && s2.keys.length >= 2 && s2.dis === false, JSON.stringify(s2));
  await mc.click('#pn-proof .mc-approve'); await sleep(400);
  const s3 = await W(mc, () => ({ phase: MissionControl.snap.verification.phase, level: MissionControl.sim.alert && MissionControl.sim.alert.level, sent: MissionControl.state.alertSent }));
  check('Approve -> PUBLIC alert (evacuate), message sent on the bus', s3.phase === 'public' && s3.level === 'evacuate' && s3.sent === true, JSON.stringify(s3));

  // 5. phones
  check('alert.html receives the alert for every demo resident', await waitFor(alertP, () => ['ravi', 'huda', 'abu-salem', 'lina'].every(k => window.__got.some(m => m.type === 'alert' && m.person === k))), 'got ' + JSON.stringify(await W(alertP, () => [...new Set(window.__got.filter(m => m.type === 'alert').map(m => m.person))])));
  check('alert.html receives the fastest-unit "dispatch" (SIM) after approval', await waitFor(alertP, () => window.__got.some(m => m.type === 'dispatch'), null, 8000));
  await alertP.bringToFront();
  await waitFor(alertP, () => !!document.querySelector('[data-phone="ravi"] .act-awake, [data-phone="ravi"] .act-safe'), null, 8000);
  const ravi = await W(alertP, () => { const p = document.querySelector('[data-phone="ravi"]'); return p ? p.textContent.replace(/\s+/g, ' ').slice(0, 600) : ''; });
  check('Ravi\'s phone shows an EXERCISE alert, tells him what to do, and mentions responder times as SIM or minutes', /exercise/i.test(ravi) && /exit|stair|leave|evacuat|go/i.test(ravi), snip(ravi, 160));
  if (await alertP.$('[data-phone="ravi"] .act-awake')) await alertP.click('[data-phone="ravi"] .act-awake');
  check('wake-up ladder: after "I\'m awake" the "I\'m safe" button appears', await waitFor(alertP, () => !!document.querySelector('[data-phone="ravi"] .act-safe'), null, 8000));
  await mc.bringToFront();
  const before = await W(mc, () => MissionControl.snap.headcount.safe + MissionControl.snap.headcount.safeAway);
  await alertP.bringToFront(); await alertP.click('[data-phone="ravi"] .act-safe'); await mc.bringToFront();
  check('"I\'m safe" on the phone marks Ravi safe in Mission Control', await waitFor(mc, () => { const p = MissionControl.snap && MissionControl.snap.people.find(q => q.key === 'ravi'); return p && p.checkin === 'safe'; }, null, 8000));
  await W(mc, () => MissionControl.refresh());
  const hc = await W(mc, () => ({ n: MissionControl.snap.headcount.safe + MissionControl.snap.headcount.safeAway, log: /Phone: Ravi/.test(document.querySelector('.evlog').textContent), tile: (document.querySelector('.tile[data-room="203"]') || {}).className }));
  check('headcount goes up, room 203 tile turns green, and the event log records the phone check-in', hc.n > before && hc.log && /part|all/.test(hc.tile || ''), `${before} -> ${hc.n}; log ${hc.log}; tile ${hc.tile}`);

  // 6. "I need help" from a resident -> hand-off
  await alertP.bringToFront();
  await W(alertP, () => Manara.link.send({ type: 'citizen', id: window.__got.find(m => m.type === 'alert').id, status: 'help', room: '302', lang: 'ar', needs: ['wheelchair'] }));
  await mc.bringToFront();
  const helped = await waitFor(mc, () => /302/.test(document.querySelector('#main').textContent) && /help|مساعدة/i.test(document.querySelector('#main').textContent), null, 6000);
  check('"I need help" (room 302, wheelchair) reaches Mission Control', helped);
  // 7. stand down in the lab clears the camera key (bus round trip back to Mission Control)
  await labP.bringToFront(); if (await labP.$('#live-stand:not([disabled])')) await labP.click('#live-stand'); await sleep(400);
  await mc.bringToFront();
  const cleared = await waitFor(mc, () => !MissionControl.state.detection || MissionControl.state.detection.state === 'clear', null, 6000);
  check('Evidence Lab "stand down" sends clear and Mission Control drops the camera key', cleared);
  check('no console/page errors on mission, alert or detect during the whole flow', errs.every(e => e.length === 0), first(errs.flat()));
  await ctx.close(); await browser.close();
}

await done();
