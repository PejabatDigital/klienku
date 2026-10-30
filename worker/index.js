/* KlienKu Worker: /api/* is the API; everything else is the built app in dist/
   (wrangler.jsonc routes only /api/* through this code). */
import { isPushService, sendPush } from "./push.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if (url.pathname==="/api/health") return json({ ok: true });
    if (url.pathname==="/api/push/key") return json({ key: env.VAPID_PUBLIC_KEY });
    if (url.pathname==="/api/push/test" && request.method==="POST") return pushTest(request, env, ctx);
    if (url.pathname==="/api" || url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    return env.ASSETS.fetch(request);
  }
};

/* Phase 1 check: sends one notification to the subscription in the request, now or after
   a short wait (so the phone can be locked first). Behind sign-in from Phase 2. */
async function pushTest(request, env, ctx){
  let body;
  try { body = await request.json(); } catch(e){ return json({ error: "Bad request" }, 400); }
  const sub = body && body.subscription;
  if (!sub || !isPushService(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth){
    return json({ error: "Not a push subscription" }, 400);
  }
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
