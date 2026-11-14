// Web Push for the Yanabee edge function (yb-push), with WebCrypto only: no library, the same code runs in Deno
// (Supabase Edge Functions) and in Node (supabase/tests/push-fn.test.mjs).
//   - Message encryption: RFC 8291 (Message Encryption for Web Push) with the aes128gcm content coding of RFC 8188.
//   - Sender identity: VAPID, RFC 8292 (an ES256 JWT for the push service's origin, plus the public key).
// The private key never leaves the server: it is created by the function itself (newVapidKeys) and kept in a
// database table that only the service role can read.
const enc = new TextEncoder();

export const b64u = {
  enc(bytes) {
    let s = '';
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// encrypt(payload, the browser's p256dh, the browser's auth secret) -> the aes128gcm body
// opts.salt and opts.serverKeys only exist so a test can pin them; production leaves them random.
export async function encrypt(payload, p256dh, auth, opts = {}) {
  const uaPublic = b64u.dec(p256dh), authSecret = b64u.dec(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad_p256dh');
  if (authSecret.length < 16) throw new Error('bad_auth');
  const data = payload instanceof Uint8Array ? payload : enc.encode(String(payload));
  if (data.length > 3800) throw new Error('payload_too_large');
  const server = opts.serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(data, new Uint8Array([2]))));
  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]), new Uint8Array([asPublic.length]), asPublic);
  return concat(header, sealed);
}

// a fresh VAPID key pair: { publicKey: base64url of the raw 65-byte point, privateJwk }
export async function newVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64u.enc(raw), privateJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

// the Authorization header for one push service: "vapid t=<ES256 JWT>, k=<public key>"
export async function vapidHeader(endpoint, vapid, nowMs = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: vapid.subject })));
  const key = await crypto.subtle.importKey('jwk', { ...vapid.privateJwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${vapid.publicKey}`;
}

// Only the browsers' own push services: the function never posts anywhere else (no request forgery through it).
const PUSH_HOST = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)$/;
export function pushHostOk(endpoint) {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && !u.port && PUSH_HOST.test(u.hostname); } catch (e) { return false; }
}

// send one message; returns the push service's HTTP status (0 when the request itself failed)
export async function sendPush(sub, message, vapid, fetchFn = fetch, ttl = 24 * 3600) {
  if (!pushHostOk(sub.endpoint)) return 0;
  const body = await encrypt(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
  try {
    const res = await fetchFn(sub.endpoint, {
      method: 'POST',
      headers: { TTL: String(ttl), Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: await vapidHeader(sub.endpoint, vapid) },
      body,
    });
    return res.status;
  } catch (e) { return 0; }
}
