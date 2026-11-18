// The request handler of the yb-push edge function, apart from Deno so a Node test can drive it with a fake fetch.
//   GET  -> makes sure the VAPID keys exist (the first call creates them) and returns the PUBLIC key only.
//   POST -> from the database trigger (migration 0013): {items: [{endpoint, p256dh, auth, kind, data}]} with the
//           x-yb-push header equal to the secret kept in yb_push_config; sends each message, then asks the database
//           to forget the subscriptions the push service says are gone (404 / 410).
// The function talks to the database only through three service-role functions (yb_push_cfg, yb_push_set_vapid,
// yb_push_prune); the service key comes from the Edge Function's own environment, never from the site or the repo.
import { newVapidKeys, sendPush, pushHostOk } from './webpush.js';
import { pushMessage } from './text.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export function makeHandler({ url, serviceKey, subject, fetchFn = fetch, concurrency = 8 }) {
  async function rpc(name, args) {
    const r = await fetchFn(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}),
    });
    if (!r.ok) throw new Error(`rpc_${name}_${r.status}`);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  return async function handle(req) {
    try {
      if (req.method === 'GET') {
        let cfg = await rpc('yb_push_cfg', {});
        if (!cfg || !cfg.vapid_public) {
          const k = await newVapidKeys();
          await rpc('yb_push_set_vapid', { pub: k.publicKey, priv: k.privateJwk });
          cfg = await rpc('yb_push_cfg', {});
        }
        return json({ ok: true, key: cfg.vapid_public });
      }
      if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
      const cfg = await rpc('yb_push_cfg', {});
      if (!cfg || !sameText(req.headers.get('x-yb-push') || '', cfg.secret || '')) return json({ ok: false, error: 'forbidden' }, 401);
      if (!cfg.vapid_public || !cfg.vapid_private) return json({ ok: false, error: 'no_keys' }, 503);
      let body;
      try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'bad_body' }, 400); }
      const items = (Array.isArray(body && body.items) ? body.items : []).slice(0, 1000)
        .filter(x => x && typeof x.endpoint === 'string' && pushHostOk(x.endpoint) && typeof x.p256dh === 'string' && typeof x.auth === 'string');
      const vapid = { publicKey: cfg.vapid_public, privateJwk: cfg.vapid_private, subject };
      const gone = [];
      let sent = 0, failed = 0;
      for (let i = 0; i < items.length; i += concurrency) {
        const part = items.slice(i, i + concurrency);
        const res = await Promise.all(part.map(x => sendPush(x, pushMessage(x.kind, x.data), vapid, fetchFn).catch(() => 0)));
        res.forEach((st, k) => {
          if (st === 404 || st === 410) gone.push(part[k].endpoint);
          else if (st >= 200 && st < 300) sent++;
          else failed++;
        });
      }
      if (gone.length) { try { await rpc('yb_push_prune', { endpoints: gone }); } catch (e) { /* tried again next time */ } }
      return json({ ok: true, sent, failed, gone: gone.length });
    } catch (e) {
      return json({ ok: false, error: 'server' }, 500);
    }
  };
}
