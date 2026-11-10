/* KlienKu Worker: /api/auth/* is sign-in, the rest of /api/* is the API; everything else
   is the built app in dist/ (wrangler.jsonc routes only /api/* through this code).
   Leads live in the Google Sheet (worker/api.js, worker/google.js); D1 keeps sign-in.

   GET    /api/health          is the database reachable (no sign-in needed)
   GET    /api/setup           can an account be created right now ({open})
   GET    /api/push/key        the public key browsers need to subscribe to notifications
   POST   /api/push/subscribe  remember this device for reminders (signed in)
   DELETE /api/push/subscribe  forget this device ({endpoint}) (signed in)
   POST   /api/push/test       remember this device and send it a test notification (signed in)
   /api/leads, /api/account    see worker/api.js

   Changes (anything but GET) must come from KlienKu's own pages: a request another site
   sends with this browser's cookie is refused. */
import { handleApi } from "./api.js";
import { getAuth, getUserId, signupOpen } from "./auth.js";
import { isPushService, sendPush } from "./push.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return getAuth(env).handler(request);
    const origin = request.headers.get("origin");
    if (request.method!=="GET" && origin && origin!==new URL(env.BETTER_AUTH_URL).origin) return json({ error: "Not allowed" }, 403);
    try {
      if (url.pathname==="/api/health"){
        await env.DB.prepare("SELECT 1").first();
        return json({ ok: true });
      }
      if (url.pathname==="/api/setup") return json({ open: await signupOpen(env) });
      if (url.pathname==="/api/push/key") return json({ key: env.VAPID_PUBLIC_KEY });
      if (url.pathname==="/api/push/subscribe" || url.pathname==="/api/push/test"){
        const user = await getUserId(request, env);
        if (!user) return json({ error: "Sign in required" }, 401);
        if (url.pathname==="/api/push/test" && request.method==="POST") return pushTest(request, env, ctx, user);
        if (request.method==="POST") return subscribe(request, env, user);
        if (request.method==="DELETE") return unsubscribe(request, env, user);
      }
      if (/^\/api\/(leads|account)(\/|$)/.test(url.pathname)){
        const res = await handleApi(request, env, await getUserId(request, env));
        if (res) return res;
      }
      if (url.pathname==="/api" || url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    } catch(e){
      console.error(e);
      return json({ error: "Something went wrong" }, 500);
    }
    return env.ASSETS.fetch(request);
  }
};

/* Reads {subscription} from the body; null when it isn't a real push subscription. */
async function readSubscription(request){
  let body;
  try { body = await request.json(); } catch(e){ return {}; }
  const sub = body && body.subscription;
  const ok = sub && isPushService(sub.endpoint) && sub.keys && typeof sub.keys.p256dh==="string" && typeof sub.keys.auth==="string";
  return { body, sub: ok ? sub : null };
}
const save = (env, user, sub) => env.DB.prepare(
  `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
   ON CONFLICT (endpoint) DO UPDATE SET user_id = ?2, p256dh = ?3, auth = ?4`
).bind(sub.endpoint, user, sub.keys.p256dh, sub.keys.auth, new Date().toISOString()).run();

async function subscribe(request, env, user){
  const { sub } = await readSubscription(request);
  if (!sub) return json({ error: "Not a push subscription" }, 400);
  await save(env, user, sub);
  return json({ ok: true });
}

async function unsubscribe(request, env, user){
  let body;
  try { body = await request.json(); } catch(e){ return json({ error: "Bad request" }, 400); }
  if (!body || typeof body.endpoint!=="string") return json({ error: "endpoint is required" }, 400);
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1 AND user_id = ?2").bind(body.endpoint, user).run();
  return json({ ok: true });
}

/* Saves the device, then sends one notification, now or after a short wait (so the phone
   can be locked first). */
async function pushTest(request, env, ctx, user){
  const { body, sub } = await readSubscription(request);
  if (!sub) return json({ error: "Not a push subscription" }, 400);
  await save(env, user, sub);

  const delay = Math.min(Math.max(Number(body.delay) || 0, 0), 20);
  const message = {
    title: "KlienKu",
    body: delay ? "It works, even with the app closed. Your reminders will look like this." : "It works. Your reminders will look like this.",
    url: "/"
  };
  const send = () => sendPush(sub, message, env);
  if (!delay){
    const res = await send();
    return res.ok ? json({ sent: true }) : json({ error: "Push service said " + res.status }, 502);
  }
  ctx.waitUntil(new Promise(r=>setTimeout(r, delay * 1000)).then(send).catch(()=>{}));
  return json({ sent: false, in: delay });
}
