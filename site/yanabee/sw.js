/* ينابيع: the service worker of the installable site. Written by tools/yanabee/build_pwa.py: do not edit by hand.
   It answers only GET requests to this site. Accounts, the database and photos live on Supabase (another host)
   and the assistant on /api/: neither is ever answered or saved here. */
const VERSION = 'd62ca43afa02';
const CORE = ["index.html", "account.html", "tournament.html", "competition.html", "register.html", "offline.html", "assets/logo.svg", "assets/icon-180.png", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png", "css/base.css", "css/assist.css", "css/art.css", "css/home.css", "css/landing.css", "css/gallery.css", "css/intro.css", "css/news.css", "css/fx.css", "css/play.css", "css/wow.css", "css/pwa.css", "data/kb.js", "js/main.js", "js/acct-nav.js", "js/search.js", "js/chat.js", "js/fx.js", "js/play.js", "js/wow.js", "js/pwa.js", "js/gallery.js", "js/intro.js", "js/comp.js", "js/yb-config.js", "js/yb-api.js", "js/yb-news.js", "js/yb-projects.js", "css/comp.css", "css/account.css", "css/dash-fx.css", "js/yb-demo.js", "js/tournament-engine.js", "js/yb-checklist.js", "js/xlsx-lite.js", "js/dash-fx.js", "js/account.js", "css/tournament.css", "js/tournament.js", "js/yb-results.js", "css/calendar-ics.css", "css/ad-maker.css", "css/match-day.css", "css/league-table.css", "css/rule-finder.css", "css/judge-sheet.css", "css/activity-card.css", "css/partner-kit.css", "js/calendar-ics.js", "js/ad-maker.js", "js/match-day.js", "js/league-table.js", "js/rule-finder.js", "js/judge-sheet.js", "js/activity-card.js", "js/partner-kit.js", "css/team-builder.css", "js/register.js", "js/team-builder.js"];
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

// Phone notifications (migration 0013): the yb-push edge function sends {title, body, url, tag}, encrypted for this
// phone only. A tap opens (or brings back) the dashboard.
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (err) { m = { body: e.data ? e.data.text() : '' }; }
  const url = new URL(typeof m.url === 'string' && !/^[a-z]+:/i.test(m.url) ? m.url : 'account.html', BASE).href;
  e.waitUntil(self.registration.showNotification(String(m.title || 'ينابيع').slice(0, 60), {
    body: String(m.body || 'لديك إشعار جديد.').slice(0, 200), tag: String(m.tag || 'yb').slice(0, 40), renotify: true,
    icon: new URL('assets/icon-192.png', BASE).href, badge: new URL('assets/icon-192.png', BASE).href,
    lang: 'ar', dir: 'rtl', data: { url },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || new URL('account.html', BASE).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = wins.find(c => c.url.startsWith(BASE));
    if (mine) { await mine.focus(); if (!mine.url.startsWith(url) && 'navigate' in mine) await mine.navigate(url).catch(() => {}); return; }
    await self.clients.openWindow(url);
  })());
});
