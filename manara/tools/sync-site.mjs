// MANARA («منارة») - publish the PUBLIC part of the one-folder project to where the Cloudflare Worker serves it.
//
//   node manara/tools/sync-site.mjs            copy manara/ (public parts only) -> site/manara/   (npm run sync:manara)
//   node manara/tools/sync-site.mjs --check    change nothing; exit 1 if site/manara/ is missing or differs from manara/
//   node manara/tools/sync-site.mjs --dry-run  print what would be copied
//
// Why: everything MANARA lives in manara/ (pages, code, data, docs, tests, tools). The Worker (wrangler.jsonc) serves ./site, and
// MANARA must stay reachable at /manara/, so site/manara/ is a GENERATED copy: git-ignored, never edited by hand, rebuilt by
// `npm run build` (or `npm run sync:manara`) before `wrangler deploy`.
//
// Public = what a visitor needs: the pages (manara/*.html) and css/ js/ data/ assets/ kit/ preview/. NOT copied: tools/ (tests, build
// scripts, test photos), docs/, README.md. Whitelist on purpose: a new top-level folder stays private until it is added to PUBLIC_DIRS.
// Safety: the only directory this script ever deletes is <repo>/site/manara (checked below); the copy is dependency-free and does not
// depend on the current directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANARA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // this file is manara/tools/sync-site.mjs
const REPO = path.dirname(MANARA);
const SITE_DIR = path.join(REPO, 'site');
const DEST = path.join(SITE_DIR, 'manara');
const PUBLIC_DIRS = ['css', 'js', 'data', 'assets', 'kit', 'preview'];
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|__pycache__|[^/]*\.pyc)(\/|$)/;

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const DRY = args.includes('--dry-run');
const unknown = args.filter(a => !['--check', '--dry-run'].includes(a));
if (unknown.length) { console.error('unknown option: ' + unknown.join(' ') + '  (use --check or --dry-run)'); process.exit(2); }

// the Worker's asset directory must be the folder we publish into (and the layout must be the expected one)
if (path.basename(MANARA) !== 'manara' || !fs.existsSync(path.join(MANARA, 'index.html')) || !fs.existsSync(SITE_DIR) || !fs.statSync(SITE_DIR).isDirectory()) {
  console.error(`sync-site: expected <repo>/manara/index.html and <repo>/site/ next to it (this file is in ${path.dirname(fileURLToPath(import.meta.url))}). ` +
    'The single manara/ folder is deployable on its own, so there is nothing to sync outside the repo.');
  process.exit(2);
}
if (DEST !== path.join(REPO, 'site', 'manara') || path.dirname(DEST) !== SITE_DIR) { console.error('sync-site: refusing: unexpected destination ' + DEST); process.exit(2); }

// list the public files: [relative posix path]
const files = [];
const walk = rel => {
  for (const e of fs.readdirSync(path.join(MANARA, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (JUNK.test(r)) continue;
    if (e.isDirectory()) walk(r); else if (e.isFile()) files.push(r);
  }
};
for (const e of fs.readdirSync(MANARA, { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.html')) files.push(e.name);
for (const d of PUBLIC_DIRS) if (fs.existsSync(path.join(MANARA, d))) walk(d);
files.sort();
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(MANARA, f)).size, 0);

if (CHECK) {
  const have = new Set();
  const scan = rel => { if (!fs.existsSync(path.join(DEST, rel))) return; for (const e of fs.readdirSync(path.join(DEST, rel), { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) scan(r); else have.add(r); } };
  scan('');
  const bad = [];
  for (const f of files) { if (!have.has(f)) bad.push('missing   ' + f); else if (!fs.readFileSync(path.join(MANARA, f)).equals(fs.readFileSync(path.join(DEST, f)))) bad.push('differs   ' + f); }
  for (const f of have) if (!files.includes(f)) bad.push('extra     ' + f);
  if (bad.length) { console.log(`site/manara is NOT in sync with manara/ (${bad.length} difference(s)); run: npm run sync:manara`); bad.slice(0, 20).forEach(b => console.log('  ' + b)); process.exit(1); }
  console.log(`site/manara is in sync with manara/ (${files.length} files, ${(bytes / 1048576).toFixed(1)} MB)`);
  process.exit(0);
}

if (DRY) { files.forEach(f => console.log(f)); console.log(`would copy ${files.length} files (${(bytes / 1048576).toFixed(1)} MB) into site/manara/`); process.exit(0); }

// clear the old generated copy (never anything outside site/manara) and copy again
fs.rmSync(DEST, { recursive: true, force: true });   // DEST was verified above to be exactly <repo>/site/manara
for (const f of files) {
  const to = path.join(DEST, f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(MANARA, f), to);
}
console.log(`synced ${files.length} files (${(bytes / 1048576).toFixed(1)} MB) from manara/ to site/manara/  [pages + ${PUBLIC_DIRS.join(' ')}; not tools, docs, README]`);
