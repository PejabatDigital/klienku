/* Who's signed in, via the Worker's /api/auth routes (Better Auth).
   The last known user is remembered on this device so the app knows it offline. */
const KEY = "kk:user";

function remember(user){
  try { if (user) localStorage.setItem(KEY, JSON.stringify(user)); else localStorage.removeItem(KEY); } catch(e){}
}
function remembered(){
  try { return JSON.parse(localStorage.getItem(KEY)); } catch(e){ return null; }
}

/* The user last seen on this device, without asking the server (for drawing a page at once). */
export const knownUser = remembered;

/* The signed-in user {id, email, name, phone}, or null. Asking the server also renews the session. */
export async function currentUser(){
  try {
    const r = await fetch("/api/auth/get-session", { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const user = d && d.user ? { id: d.user.id, email: d.user.email, name: d.user.name || "", phone: d.user.phone || "" } : null;
    remember(user);
    return user;
  } catch(e){
    return remembered(); // offline: assume nothing changed
  }
}

/* Saves name and/or phone; returns the user as now stored. */
export async function updateUser(change){
  let r;
  try { r = await fetch("/api/auth/update-user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(change) }); }
  catch(e){ throw new Error("You're offline. Try again when you're back online."); }
  if (!r.ok) throw new Error(r.status===400 ? "That's too long." : "Couldn't save. Please try again.");
  const user = { ...remembered(), ...change };
  remember(user);
  return user;
}

/* Signs out every other device; this one stays signed in. */
export async function signOutOthers(){
  let r;
  try { r = await fetch("/api/auth/revoke-other-sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); }
  catch(e){ throw new Error("You're offline. Try again when you're back online."); }
  if (!r.ok) throw new Error("Couldn't sign out your other devices. Please try again.");
}

export async function signOut(){
  const r = await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  remember(null);
}
