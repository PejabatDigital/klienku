/* Talking to the Worker. Signed out (401) → the sign-in page. The client list is kept on
   this device too, so screens open instantly and show something offline. */
const CACHE = "kk:clients";

export async function api(path, { method = "GET", body } = {}){
  let r;
  try {
    r = await fetch("/api" + path, {
      method, headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch(e){ throw new Error("You're offline. Try again when you're back online."); }
  if (r.status===401){ location.replace("/signin"); throw new Error("Please sign in again."); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

let clients = null, settings = null;
try { clients = JSON.parse(localStorage.getItem(CACHE)); } catch(e){}
const keep = () => { try { localStorage.setItem(CACHE, JSON.stringify(clients)); } catch(e){} };

export const cachedClients = () => clients;
export async function loadClients(){
  clients = (await api("/clients")).clients;
  keep();
  return clients;
}
/* Puts a changed client into the list (or removes it when `gone`). */
export function updateClient(client, gone = false){
  if (!clients) return;
  clients = clients.filter(c=>c.id!==client.id);
  if (!gone) clients.push(client);
  keep();
}
export function forgetClients(){ clients = null; try { localStorage.removeItem(CACHE); } catch(e){} }

export async function loadSettings(){
  if (!settings) settings = (await api("/settings")).settings;
  return settings;
}
export async function saveSettings(change){
  settings = (await api("/settings", { method: "PUT", body: change })).settings;
  return settings;
}
