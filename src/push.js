/* Notifications on this device: ask permission, subscribe to push, and ask the Worker to
   send a test. */
import { isInstalled, isIOS } from "./pwa.js";

const keyBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c=>c.charCodeAt(0));

/* What this device can do right now:
   "install" (iPhone/iPad not on the Home Screen yet), "unsupported", "blocked", "ready". */
export function pushState(){
  if (isIOS() && !isInstalled()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission==="denied") return "blocked";
  return "ready";
}

/* Asks for permission if needed (must run from a tap), then returns this device's
   push subscription. */
export async function subscribe(){
  const permission = await Notification.requestPermission();
  if (permission!=="granted") throw new Error(permission==="denied" ? "blocked" : "dismissed");
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const { key } = await fetch("/api/push/key").then(r=>r.json());
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
}

/* Sends a test notification, now (delay 0) or after `delay` seconds. */
export async function sendTest(delay = 0){
  const subscription = await subscribe();
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), delay })
  });
  if (!res.ok){
    const { error } = await res.json().catch(()=>({}));
    throw new Error(error || "Couldn't send (" + res.status + ")");
  }
}
