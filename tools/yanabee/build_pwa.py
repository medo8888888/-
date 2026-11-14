"""The installable app (PWA): manifest.webmanifest, sw.js, offline.html and _headers (Cloudflare Pages).

Runs last in build.py, after every page exists, because the service worker's version is a hash of the files
it saves and its list of saved files is read from the built pages.

What the service worker does (site/yanabee/sw.js):
- It only ever touches GET requests to this site. Supabase (accounts, the database, Storage photos), Google
  Fonts and the assistant's /api/ are other hosts or paths, and the worker never answers or saves them, so no
  account data, token or private photo is ever stored on the phone.
- Pages, styles and scripts: the network first (so an upload is seen at once), the saved copy when there is no
  connection (or the network takes longer than 4 seconds). Photos and icons: the saved copy first.
- On install it saves the core pages (CORE) with every style and script they load, so the app opens offline
  even before the person has visited them; other pages are saved the first time they are opened.
- A page that is not saved yet opens offline.html when there is no connection.
- A new upload changes the version, the new worker replaces the old one and deletes the old saved copies;
  js/pwa.js then offers «حدّث» to the open pages.
"""
import hashlib
import json
import re

from core import SITE, ic, page

CORE = ['index.html', 'account.html', 'tournament.html', 'competition.html', 'register.html', 'offline.html']
ICONS = ['assets/logo.svg', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png']

MANIFEST = {
    'id': './',
    'name': 'ينابيع: المسابقة والفرق',
    'short_name': 'ينابيع',
    'description': 'مشروع ينابيع: المسابقة والفرق والنتائج وأخبار الفرق، وحسابك في مكان واحد.',
    'lang': 'ar',
    'dir': 'rtl',
    'start_url': 'index.html?source=app',
    'scope': './',
    'display': 'standalone',
    'orientation': 'portrait',
    'background_color': '#f3f8f7',
    'theme_color': '#0b7d84',
    'categories': ['education', 'sports'],
    'icons': [
        {'src': 'assets/icon-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
        {'src': 'assets/icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
        {'src': 'assets/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
    'shortcuts': [
        {'name': 'لوحتي', 'short_name': 'لوحتي', 'url': 'account.html', 'icons': [{'src': 'assets/icon-192.png', 'sizes': '192x192'}]},
        {'name': 'لوحة البطولة', 'short_name': 'البطولة', 'url': 'tournament.html', 'icons': [{'src': 'assets/icon-192.png', 'sizes': '192x192'}]},
        {'name': 'سجّل فريقك', 'short_name': 'التسجيل', 'url': 'register.html', 'icons': [{'src': 'assets/icon-192.png', 'sizes': '192x192'}]},
    ],
}

HEADERS = '''# Cloudflare Pages response headers (written by tools/yanabee/build_pwa.py).
# The service worker and the manifest are always checked for a new version.
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
'''

SW = r'''/* ينابيع: the service worker of the installable site. Written by tools/yanabee/build_pwa.py: do not edit by hand.
   It answers only GET requests to this site. Accounts, the database and photos live on Supabase (another host)
   and the assistant on /api/: neither is ever answered or saved here. */
const VERSION = '__VERSION__';
const CORE = __CORE__;
const PAGES = 'yb-pages-' + VERSION, MEDIA = 'yb-media-' + VERSION;
const MEDIA_MAX = 60, WAIT_MS = 4000;
const BASE = new URL('./', self.location).href;

// one key per page, whatever the address looks like: "/", "/teams", "/teams.html?x=1" -> "…/teams.html"
function keyFor(url) {
  const u = new URL(url);
  u.search = ''; u.hash = '';
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  else if (!/\.[a-z0-9]+$/i.test(p.split('/').pop())) p += '.html';
  u.pathname = p;
  return u.href;
}
// a redirected answer cannot be given to a page later: keep a clean copy of it
async function clean(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
const savable = res => res && res.ok && res.type === 'basic';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(PAGES);
    await Promise.all(CORE.map(async path => {
      const url = new URL(path, BASE).href;
      try {
        const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (savable(res)) await c.put(keyFor(url), await clean(res));
      } catch (err) { /* one missing file must not stop the app */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [PAGES, MEDIA];
    for (const k of await caches.keys()) if (/^yb-/.test(k) && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const inScope = url => url.href.startsWith(BASE) && !/\/api\//.test(url.pathname) && !/\/sw\.js$/.test(url.pathname);
const isMedia = url => /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);

function timeout(ms) { return new Promise(r => setTimeout(() => r(null), ms)); }

async function networkFirst(req, nav) {
  const c = await caches.open(PAGES);
  const key = keyFor(req.url);
  const net = fetch(req).then(async res => {
    if (savable(res) && !res.redirected) c.put(key, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  const first = await Promise.race([net, timeout(WAIT_MS)]);
  if (first) return first;
  const saved = await c.match(key) || await caches.match(key);
  if (saved) return saved;
  const late = await net;
  if (late) return late;
  if (nav) {
    const off = await c.match(keyFor(new URL('offline.html', BASE).href));
    if (off) return off;
  }
  return new Response('', { status: 504, statusText: 'offline' });
}

async function cacheFirst(req) {
  const c = await caches.open(MEDIA);
  const key = keyFor(req.url);
  const saved = await c.match(key) || await caches.match(key);
  if (saved) return saved;
  try {
    const res = await fetch(req);
    if (savable(res) && !res.redirected) {
      await c.put(key, res.clone());
      const keys = await c.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - MEDIA_MAX))) await c.delete(k);
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !inScope(url)) return;   // Supabase, fonts, /api/: never touched
  if (req.headers.get('range')) return;
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req, true)); return; }
  e.respondWith(isMedia(url) ? cacheFirst(req) : networkFirst(req, false));
});

self.addEventListener('message', e => {
  if (e.data === 'yb-version' && e.source) e.source.postMessage({ type: 'yb-version', version: VERSION });
});
'''


def offline_page():
    body = f'''
<section class="hero hero-page nf pwa-off">
  <div class="hero-bg" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span></div>
  <div class="wrap center">
    <span class="pwa-off-ic" aria-hidden="true">{ic('wifi-off')}</span>
    <h1>لا يوجد اتصال بالإنترنت</h1>
    <p class="hero-lead" style="margin-inline:auto">هذه الصفحة لم تُحفظ على جهازك بعد. الصفحات التي فتحتها من قبل تعمل بلا إنترنت، وحسابك وأخبار الفرق تحتاج إلى اتصال.</p>
    <div class="btns center">
      <button type="button" class="btn btn-primary" data-pwa-retry>{ic('repeat')}<span>أعد المحاولة</span></button>
    </div>
    <nav class="pwa-saved" aria-label="صفحات محفوظة على جهازك" data-pwa-saved hidden>
      <h2>محفوظة على جهازك</h2>
      <ul></ul>
    </nav>
  </div>
</section>'''
    page('offline.html', 'لا يوجد اتصال', body, 'صفحة تظهر عندما لا يوجد اتصال بالإنترنت في تطبيق ينابيع.')


LOCAL_REF = re.compile(r'''(?:src|href)="((?:css|js|data)/[^"#?]+)"''')


def build():
    offline_page()
    files = list(dict.fromkeys(CORE + ICONS))
    for fn in CORE:
        html = (SITE / fn).read_text(encoding='utf-8')
        for ref in LOCAL_REF.findall(html):
            if ref not in files and (SITE / ref).exists():
                files.append(ref)
    missing = [f for f in files if not (SITE / f).exists()]
    if missing:
        raise SystemExit('build_pwa: missing ' + ', '.join(missing))
    (SITE / 'manifest.webmanifest').write_text(json.dumps(MANIFEST, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (SITE / '_headers').write_text(HEADERS, encoding='utf-8')
    # the version follows every file of the site (not only the saved ones): any upload refreshes the saved copies
    h = hashlib.sha256()
    for f in sorted(p for p in SITE.rglob('*') if p.is_file() and p.name not in ('sw.js',) and '__pycache__' not in p.parts):
        h.update(str(f.relative_to(SITE)).encode()); h.update(f.read_bytes())
    sw = SW.replace('__VERSION__', h.hexdigest()[:12]).replace('__CORE__', json.dumps(files, ensure_ascii=False))
    (SITE / 'sw.js').write_text(sw, encoding='utf-8')
    return f'sw.js ({len(files)} files saved on install), manifest.webmanifest, offline.html, _headers'
