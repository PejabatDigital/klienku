/* Web Push from the Worker with Web Crypto only: VAPID sign-in (RFC 8292) and an
   encrypted message (RFC 8291, aes128gcm), so the push services carry it unread. */

const enc = new TextEncoder();
const b64u = {
  from: s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c=>c.charCodeAt(0)),
  to: bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p)=>n + p.length, 0));
  let i = 0; for (const p of parts){ out.set(p, i); i += p.length; }
  return out;
};

/* The browsers' push services. Anything else is refused, so the Worker never posts to a
   URL someone made up. */
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export function isPushService(endpoint){
  try {
    const u = new URL(endpoint);
    return u.protocol==="https:" && PUSH_HOSTS.some(h=>h.test(u.hostname));
  } catch(e){ return false; }
}

/* Sends `message` (any JSON) to one subscription. Returns the push service's response:
   201 = delivered to the service, 404/410 = the subscription is gone. */
export async function sendPush(subscription, message, env){
  const endpoint = new URL(subscription.endpoint);
  const jwt = await vapidToken(endpoint.origin, env);
  const body = await encrypt(enc.encode(JSON.stringify(message)), subscription.keys);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "high"
    },
    body
  });
}

/* A short-lived token proving the message comes from this app's key pair. */
async function vapidToken(audience, env){
  const pub = b64u.from(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE_KEY,
    x: b64u.to(pub.slice(1, 33)), y: b64u.to(pub.slice(33, 65))
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const part = obj => b64u.to(enc.encode(JSON.stringify(obj)));
  const unsigned = part({ typ: "JWT", alg: "ES256" }) + "." +
    part({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return unsigned + "." + b64u.to(sig);
}

const hkdf = async (salt, ikm, info, bits) => new Uint8Array(await crypto.subtle.deriveBits(
  { name: "HKDF", hash: "SHA-256", salt, info },
  await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bits));

/* RFC 8291: one record, encrypted for the browser's key. `test` fixes the random parts
   (server key pair and salt) so the RFC's worked example can be checked. */
export async function encrypt(plaintext, keys, test = {}){
  const uaPublic = b64u.from(keys.p256dh), auth = b64u.from(keys.auth);
  const server = test.serverKeys || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", server.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, server.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 256);
  const salt = test.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 96);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const padded = concat(plaintext, new Uint8Array([2])); // 2 = last (and only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, padded));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // record size
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}
