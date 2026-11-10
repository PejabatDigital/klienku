/* Talking to the Worker. Signed out (401) → the sign-in page. The leads (with the sheet's
   lists and link) are kept on this device too, so screens open instantly and show
   something offline. */
const CACHE = "kk:leads";

export async function api(path, { method = "GET", body } = {}){
  let r;
  try {
    r = await fetch("/api" + path, {
      method, headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch(e){ throw Object.assign(new Error("You're offline. Try again when you're back online."), { offline: true }); }
  if (r.status===401){ location.replace("/signin"); throw new Error("Please sign in again."); }
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong. Please try again."), { status: r.status });
  return data;
}

/* {leads, lists, sheet_url} from the Google Sheet, or null before the first load. */
let sheet = null;
try { sheet = JSON.parse(localStorage.getItem(CACHE)); localStorage.removeItem("kk:clients"); } catch(e){}

export const cachedSheet = () => sheet;
export async function loadSheet(){
  sheet = await api("/leads");
  try { localStorage.setItem(CACHE, JSON.stringify(sheet)); } catch(e){}
  window.dispatchEvent(new Event("klienku:leads"));
  return sheet;
}
export function forgetSheet(){ sheet = null; try { localStorage.removeItem(CACHE); } catch(e){} }
