/* Registers the service worker (production builds only). Returns its registration, or
   null when there isn't one. */
export async function registerSW(){
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return null;
  try { return await navigator.serviceWorker.register("/sw.js"); } catch(e){ return null; }
}

/* True when KlienKu runs from the Home Screen / as an installed app. */
export const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;

/* iPhone and iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints > 1);
