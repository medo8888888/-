// A generic single-file bundler for MANARA («منارة») pages — Node, no dependencies.
//
//   node manara/tools/bundle-page.mjs <page.html> [outFile] [--pages a.html,b.html] [--quiet]
//
//   <page.html>   a page in manara/ (robot.html, mission.html, …) — a bare name, `manara/robot.html` or an absolute path
//   [outFile]     default manara/preview/<page>.html (the preview folder sits one level below the pages)
//   --pages       the pages the nav / footer / links point to (default: every *.html in manara/); in the bundle they become ../<page>.html
//
// What it does: inlines every local <link rel="stylesheet"> as <style>, every local <script src> (js/*.js, data/*.js …) in order, and drops <link rel="icon">,
// so the result is ONE self-contained html file (Google Fonts links stay: the page works when they fail to load).
//
// IMPORTANT, learned the hard way: the scripts are NOT inlined as plain <script> in <head>. A page boot that checks `document.readyState` (core.js does) would see
// 'loading' and wait for DOMContentLoaded, which an inline script in <head> misses. So every script is embedded inertly as
//     <script type="text/plain" data-bundled="js/core.js"> … </script>      (closing script tags and "<!--" escaped)
// and a loader appended before </body> creates real <script> elements, in order, on DOMContentLoaded (or at once if the document is no longer loading), so they run with
// readyState 'interactive' exactly like `defer` scripts do.
//
// Links to the other pages (static ones and the ones core.js renders into the nav and footer at run time) are rewritten to ../<page>.html.
// Warnings (exit code 1): a missing file, a relative url() in a stylesheet, and any relative src/href left in the bundle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// this file is manara/tools/<name>: the MANARA folder (pages, css/, js/, data/ ...) is one level up, whatever the current directory is
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = ROOT;
const args = process.argv.slice(2);
const flag = k => args.indexOf('--' + k);
const opt = k => { const i = flag(k); return i >= 0 ? args[i + 1] : null; };
const quiet = flag('quiet') >= 0;
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--pages'));
if (!positional.length) {
  console.error('usage: node manara/tools/bundle-page.mjs <page.html> [outFile] [--pages a.html,b.html] [--quiet]');
  process.exit(2);
}

const resolvePage = p => {
  const c = [path.resolve(p), path.join(SITE, p), path.join(path.dirname(ROOT), p)];   // as typed (cwd), inside manara/, or relative to the repo root (manara/robot.html)
  for (const f of c) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  console.error('page not found: ' + p); process.exit(2);
};
const pageFile = resolvePage(positional[0]);
const pageDir = path.dirname(pageFile);
const pageName = path.basename(pageFile);
const outFile = positional[1] ? path.resolve(positional[1]) : path.join(SITE, 'preview', pageName);
const pages = (opt('pages') ? opt('pages').split(',').map(s => s.trim()).filter(Boolean)
  : fs.readdirSync(SITE).filter(f => f.endsWith('.html'))).map(f => path.basename(f));

const warnings = [];
const warn = m => { warnings.push(m); console.log('WARNING ' + m); };
const isLocal = u => u && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(u);
const read = rel => {
  const f = path.resolve(pageDir, rel.split(/[?#]/)[0]);
  if (!fs.existsSync(f)) { warn('missing file: ' + rel); return ''; }
  return fs.readFileSync(f, 'utf8');
};
// closing script tags and "<!--" would end / confuse an inert <script type="text/plain"> block; the loader undoes both escapes
const escapeInert = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

let html = fs.readFileSync(pageFile, 'utf8');

// ---- styles
let nStyles = 0;
html = html.replace(/<link\b[^>]*>/gi, tag => {
  if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag;
  const m = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
  if (!m || !isLocal(m[1])) return tag;
  const css = read(m[1]);
  (css.match(/url\(\s*(["']?)(?!data:|https?:|#|\/\/)[^)"']+\1\s*\)/gi) || []).forEach(u => warn('relative ' + u + ' in ' + m[1]));
  nStyles++;
  return '<style data-bundled="' + m[1] + '">\n' + css.replace(/<\/style/gi, '<\\/style') + '\n</style>';
});

// ---- icons (the preview has no assets folder next to it)
html = html.replace(/<link\b[^>]*\brel\s*=\s*["'](?:shortcut )?icon["'][^>]*>\s*/gi, '');

// ---- scripts: inert text/plain blocks, in the original order
const scripts = [];
html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (all, attrs) => {
  const m = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
  if (!m || !isLocal(m[1])) return all;
  const src = read(m[1]);
  if (/<\\\/script|<\\!--/.test(src)) warn(m[1] + ' contains "<\\/script" or "<\\!--": the loader would change it');
  scripts.push(m[1]);
  return '<script type="text/plain" data-bundled="' + m[1] + '">' + escapeInert(src) + '</script>';
});

// ---- links to the other pages: static ones, and the ones core.js renders at run time
const pageAlt = pages.map(p => p.replace(/\.html$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
if (pageAlt) {
  html = html.replace(new RegExp('((?:href|action)=")((?:' + pageAlt + ')\\.html(?:[#?][^"]*)?")', 'g'), '$1../$2');
}
const FIXER = String.raw`(function(){
  // the bundle sits in manara/preview/, the other pages one folder up
  var re=/^(?:${pageAlt})\.html(?:[?#].*)?$/;
  function fix(root){(root.querySelectorAll?root:document).querySelectorAll('a[href]').forEach(function(a){var h=a.getAttribute('href');if(re.test(h))a.setAttribute('href','../'+h)})}
  function watch(sel){var n=document.querySelector(sel);if(n)new MutationObserver(function(){fix(n)}).observe(n,{childList:true,subtree:true})}
  function go(){fix(document);watch('[data-nav]');watch('[data-footer]')}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
  window.addEventListener('load',function(){fix(document)});
})();`;
const LOADER = String.raw`(function(){
  var CLOSE='<'+'/script', COMMENT='<'+'!--';
  function undo(t){return t.split('<\\/script').join(CLOSE).split('<\\!--').join(COMMENT);}
  function run(){
    var els=document.querySelectorAll('script[data-bundled]');
    for(var i=0;i<els.length;i++){var s=document.createElement('script');s.setAttribute('data-from',els[i].getAttribute('data-bundled'));s.textContent=undo(els[i].textContent);document.head.appendChild(s);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();`;
if (!/<\/body>/i.test(html)) { warn('no </body> in ' + pageName + ': the loader cannot be added'); }
html = html.replace(/<\/body>/i, () => '<script>\n' + FIXER + '\n</script>\n<script>\n' + LOADER + '\n</script>\n</body>');
html = html.replace(/<!doctype html>/i, m => m + '\n<!-- GENERATED by manara/tools/bundle-page.mjs from manara/' + pageName + ': do not edit. One self-contained file (links to the other pages go to ../*.html). -->');

// ---- anything relative left? (scripts and styles removed from the check; ../ and the page links are fine)
const rest = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const left = (rest.match(/\b(?:src|href|poster|action)="[^"]*"/g) || []).filter(a => { const u = a.replace(/^[a-z]+="|"$/gi, ''); return isLocal(u) && !u.startsWith('../') && u !== ''; });
left.forEach(a => warn('relative reference left in the bundle: ' + a));
if (scripts.length === 0) warn('no local <script src> was bundled');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
const shown = f => { const r = path.relative(ROOT, f); return r.startsWith('..') ? f : path.basename(ROOT) + '/' + r.split(path.sep).join('/'); };   // manara/preview/robot.html
if (!quiet) console.log(`wrote ${shown(outFile)}  (${(Buffer.byteLength(html) / 1024).toFixed(0)} kB; ${nStyles} stylesheet(s), ${scripts.length} script(s): ${scripts.join(', ')})`);
if (warnings.length) process.exitCode = 1;
