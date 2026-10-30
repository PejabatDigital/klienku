/* KlienKu service worker. vite.config.js builds dist/sw.js from this file, defining
   VERSION (a hash of the build) and SHELL (every file in the build) above it.

   - The app shell is cached on install, so KlienKu opens offline.
   - A new version takes over straight away and is used from the next open.
   - Push messages from the Worker are shown as notifications; tapping one opens KlienKu. */
const CACHE = "klienku-shell-" + VERSION;

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE)
    .then(c=>c.addAll(SHELL.map(u=>new Request(u, {cache:"reload"}))))
    .then(()=>self.skipWaiting()));
});

self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith("klienku-shell-") && k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

self.addEventListener("fetch", e=>{
  const req = e.request, url = new URL(req.url);
  if (req.method!=="GET" || url.origin!==location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API calls always go to the network
  if (req.mode==="navigate"){
    // the app itself opens from cache; other pages (e.g. /signin) try the network first
    e.respondWith(url.pathname==="/"
      ? caches.match("/", {cacheName:CACHE}).then(r=>r || fetch(req))
      : fetch(req).catch(()=>caches.match(url.pathname==="/signin" ? "/signin.html" : "/", {cacheName:CACHE})));
    return;
  }
  e.respondWith(caches.match(req, {cacheName:CACHE}).then(r=>r || fetch(req)));
});

self.addEventListener("push", e=>{
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch(err){ msg = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(msg.title || "KlienKu", {
    body: msg.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: msg.tag,
    data: { url: msg.url || "/" }
  }));
});

self.addEventListener("notificationclick", e=>{
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", location.origin).href;
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(list=>{
    const open = list.find(c=>c.url.startsWith(location.origin));
    if (open) return open.focus().then(c=>c && c.navigate ? c.navigate(target) : c);
    return self.clients.openWindow(target);
  }));
});
