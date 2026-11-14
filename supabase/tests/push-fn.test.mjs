// The yb-push edge function (supabase/functions/yb-push): Web Push encryption, VAPID, and the request handler.
//   node supabase/tests/push-fn.test.mjs
// The encryption is checked by decrypting with an independent implementation (Node's crypto: createECDH, hkdfSync,
// AES-128-GCM), the VAPID token by verifying its ES256 signature with Node's crypto.verify, and the handler with a
// fake database and fake push services.
import crypto from 'node:crypto';
import { encrypt, newVapidKeys, vapidHeader, pushHostOk, b64u } from '../functions/yb-push/webpush.js';
import { makeHandler } from '../functions/yb-push/handler.js';
import { pushMessage } from '../functions/yb-push/text.js';

let pass = 0; const fails = [];
const ok = (c, n, d = '') => { if (c) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };
const section = t => console.log('\n== ' + t);

// a browser's push subscription keys, made with Node's own ECDH
function browserKeys() {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, p256dh: b64u.enc(ecdh.getPublicKey()), authB64: b64u.enc(auth) };
}
// RFC 8291 decryption, written apart from the encrypter
function decrypt(body, ecdh, auth) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16), rs = buf.readUInt32BE(16), idlen = buf[20], asPublic = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const shared = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  if (plain[plain.length - 1] !== 2) throw new Error('no last-record delimiter');
  return { text: plain.subarray(0, plain.length - 1).toString('utf8'), rs, idlen };
}

section('1. encryption (RFC 8291, aes128gcm)');
{
  const k = browserKeys();
  const msg = JSON.stringify({ title: 'ينابيع', body: 'إعلان جديد: موعد التسميع' });
  const body = await encrypt(new TextEncoder().encode(msg), k.p256dh, k.authB64);
  const out = decrypt(body, k.ecdh, k.auth);
  ok(out.text === msg, 'an independent decrypter reads the Arabic message back');
  ok(out.rs === 4096 && out.idlen === 65, 'header: record size 4096, the server key (65 bytes) as key id');
  const again = await encrypt(new TextEncoder().encode(msg), k.p256dh, k.authB64);
  ok(Buffer.compare(Buffer.from(body.subarray(0, 16)), Buffer.from(again.subarray(0, 16))) !== 0, 'a new salt and a new server key every time');
  let threw = '';
  try { decrypt(body, browserKeys().ecdh, k.auth); } catch (e) { threw = e.message; }
  ok(threw !== '', 'another browser cannot read it');
  try { await encrypt('x', 'AAAA', k.authB64); } catch (e) { threw = e.message; }
  ok(threw === 'bad_p256dh', 'a malformed browser key is refused');
  try { await encrypt('x'.repeat(4000), k.p256dh, k.authB64); } catch (e) { threw = e.message; }
  ok(threw === 'payload_too_large', 'a message over the push limit is refused');
}

section('2. VAPID (RFC 8292)');
{
  const v = await newVapidKeys();
  ok(b64u.dec(v.publicKey).length === 65 && v.privateJwk.d && v.privateJwk.crv === 'P-256', 'a P-256 key pair: 65-byte public point, private JWK');
  const hdr = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', { ...v, subject: 'https://example.invalid' }, Date.UTC(2026, 10, 14, 12));
  const m = hdr.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  ok(!!m && m[4] === v.publicKey, 'the header: vapid t=<JWT>, k=<public key>');
  const claims = JSON.parse(Buffer.from(b64u.dec(m[2])).toString());
  ok(claims.aud === 'https://fcm.googleapis.com' && claims.sub === 'https://example.invalid' && claims.exp === Date.UTC(2026, 10, 14, 12) / 1000 + 12 * 3600, 'claims: the push service origin, the subject, 12 hours');
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.privateJwk.x, y: v.privateJwk.y }, format: 'jwk' });
  const good = crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.dec(m[3])));
  ok(good, 'the ES256 signature verifies with the public key');
}

section('3. only the browsers\' push services');
ok(['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QX', 'https://db5p.notify.windows.com/w/?token=x'].every(pushHostOk), 'Google, Mozilla, Apple and Windows endpoints are accepted');
ok(!['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com:8443/x', 'https://169.254.169.254/latest', 'not a url'].some(pushHostOk), 'anything else (http, other hosts, look-alikes, ports, internal addresses) is refused');

section('4. the words');
ok(pushMessage('announcement', { title: 'موعد التسميع يوم الجمعة' }).body === 'إعلان جديد: موعد التسميع يوم الجمعة', 'an announcement shows its title');
ok(pushMessage('invite_new', { team_name: 'الشروق' }).body === 'دعاك فريق الشروق للانضمام إليه.', 'an invite names the team');
ok(pushMessage('result_returned', { note: 'سبب طويل '.repeat(30) }).body === 'أعادت الإدارة نتيجة مباراة للمراجعة.', 'notes stay in the account, not on the lock screen');
ok(pushMessage('pledge_kept', { first_name: 'سالم' }).body === 'وفّى سالم بوعده هذا الأسبوع.' && pushMessage('pledge_nudge', { team_name: 'النور' }).body === 'يذكّرك قائد فريق النور: اكتب وعد هذا الأسبوع.'
  && !/undefined/.test(pushMessage('pledge_note', {}).body + pushMessage('pledge_cheer', {}).body), 'the journey notes: a first name or a team name, never a promise');
ok(pushMessage('something_new', {}).body === 'لديك إشعار جديد.' && pushMessage('x', {}).url === 'account.html', 'an unknown kind still says something and opens the account');
ok(pushMessage('announcement', { title: 'ع'.repeat(200) }).body.length <= 80, 'long titles are cut');

section('5. the handler');
{
  const db = { cfg: { secret: 's'.repeat(64), vapid_public: null, vapid_private: null }, pruned: [], calls: [] };
  const sent = [];
  const statusFor = { 'https://fcm.googleapis.com/fcm/send/gone': 410, 'https://fcm.googleapis.com/fcm/send/old': 404, 'https://web.push.apple.com/fail': 500 };
  const fetchFn = async (url, init) => {
    if (url.startsWith('https://db.test/rest/v1/rpc/')) {
      const name = url.split('/').pop(), args = JSON.parse(init.body);
      db.calls.push(name);
      if (init.headers.Authorization !== 'Bearer SERVICE' || init.headers.apikey !== 'SERVICE') return new Response('', { status: 401 });
      if (name === 'yb_push_cfg') return new Response(JSON.stringify(db.cfg));
      if (name === 'yb_push_set_vapid') { if (!db.cfg.vapid_public) Object.assign(db.cfg, { vapid_public: args.pub, vapid_private: args.priv }); return new Response('true'); }
      if (name === 'yb_push_prune') { db.pruned.push(...args.endpoints); return new Response('2'); }
      return new Response('', { status: 404 });
    }
    sent.push({ url, init });
    return new Response('', { status: statusFor[url] || 201 });
  };
  const handle = makeHandler({ url: 'https://db.test', serviceKey: 'SERVICE', subject: 'https://example.invalid', fetchFn });
  let r = await handle(new Request('https://fn.test/yb-push', { method: 'POST', headers: { 'x-yb-push': db.cfg.secret }, body: '{}' }));
  ok(r.status === 503, 'before any key exists, sending waits (503)');
  r = await handle(new Request('https://fn.test/yb-push'));
  const k1 = (await r.json()).key;
  ok(r.status === 200 && b64u.dec(k1).length === 65 && db.cfg.vapid_private && db.cfg.vapid_private.d, 'GET creates the key pair once and returns the public key only');
  r = await handle(new Request('https://fn.test/yb-push'));
  ok((await r.json()).key === k1, 'a second GET keeps the same key');
  ok(!JSON.stringify(await (await handle(new Request('https://fn.test/yb-push'))).json()).includes('"d"'), 'the private key never leaves');
  r = await handle(new Request('https://fn.test/yb-push', { method: 'POST', body: '{}' }));
  ok(r.status === 401, 'a POST without the secret is refused');
  r = await handle(new Request('https://fn.test/yb-push', { method: 'POST', headers: { 'x-yb-push': 'wrong' + db.cfg.secret.slice(5) }, body: '{}' }));
  ok(r.status === 401, 'a wrong secret is refused');
  const k = browserKeys();
  const item = (endpoint, kind = 'announcement', data = { title: 'تجربة' }) => ({ endpoint, p256dh: k.p256dh, auth: k.authB64, kind, data });
  r = await handle(new Request('https://fn.test/yb-push', { method: 'POST', headers: { 'x-yb-push': db.cfg.secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [item('https://fcm.googleapis.com/fcm/send/ok1'), item('https://fcm.googleapis.com/fcm/send/gone'), item('https://fcm.googleapis.com/fcm/send/old'),
      item('https://web.push.apple.com/fail'), item('https://evil.example/steal')] }) }));
  const out = await r.json();
  ok(out.ok && out.sent === 1 && out.gone === 2 && out.failed === 1, 'sends: 1 delivered, 2 gone, 1 failed', JSON.stringify(out));
  ok(!sent.some(s => s.url.includes('evil.example')), 'an endpoint outside the push services is never called');
  ok(db.pruned.sort().join() === ['https://fcm.googleapis.com/fcm/send/gone', 'https://fcm.googleapis.com/fcm/send/old'].sort().join(), 'the gone subscriptions are pruned');
  const s0 = sent.find(s => s.url.endsWith('/ok1'));
  ok(s0.init.headers['Content-Encoding'] === 'aes128gcm' && s0.init.headers.TTL === '86400' && /^vapid t=.+, k=/.test(s0.init.headers.Authorization), 'each request: aes128gcm, a TTL of a day, the VAPID header');
  const got = JSON.parse(decrypt(s0.init.body, k.ecdh, k.auth).text);
  ok(got.title === 'ينابيع' && got.body === 'إعلان جديد: تجربة' && got.url === 'account.html' && got.tag === 'yb-announcement', 'the phone receives the title, the words, the page to open and a tag');
  r = await handle(new Request('https://fn.test/yb-push', { method: 'POST', headers: { 'x-yb-push': db.cfg.secret }, body: 'not json' }));
  ok(r.status === 400, 'a broken body is refused');
  r = await handle(new Request('https://fn.test/yb-push', { method: 'PUT' }));
  ok(r.status === 405, 'other methods are refused');
}

console.log(`\n${pass}/${pass + fails.length} assertions passed`);
if (fails.length) { console.log('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('ALL GREEN');
