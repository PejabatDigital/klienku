/* Google Sheets from the Worker, with no library. A Google service account (its JSON key in
   the secret GOOGLE_SERVICE_ACCOUNT) signs a short JWT with Web Crypto and trades it for an
   access token, kept in memory until a minute before it runs out. The sheet must be shared
   with the service account's email as Editor. */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const API = "https://sheets.googleapis.com/v4/spreadsheets/";

export class SheetError extends Error {
  constructor(status, message){ super(message); this.status = status; }
}

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const enc = s => b64url(new TextEncoder().encode(s));

function account(env){
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new SheetError(503, "KlienKu isn't connected to the Google Sheet yet.");
  try { return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT); }
  catch(e){ throw new SheetError(503, "The Google key (GOOGLE_SERVICE_ACCOUNT) isn't valid JSON."); }
}

let cached = null; // { token, until }

async function token(env){
  if (cached && cached.until > Date.now()) return cached.token;
  const sa = account(env), now = Math.floor(Date.now() / 1000);
  const unsigned = enc(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + enc(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, "")), c=>c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(sig) }),
  });
  const d = await r.json().catch(()=>({}));
  if (!r.ok || !d.access_token){
    console.error("Google token", r.status, d.error, d.error_description);
    throw new SheetError(502, "Google didn't accept KlienKu's key. It may have been deleted; make a new one.");
  }
  cached = { token: d.access_token, until: Date.now() + (d.expires_in - 60) * 1000 };
  return cached.token;
}

/* One Sheets API call: `path` after the spreadsheet id (e.g. "/values:batchGet?…"). */
export async function sheets(env, path, { method = "GET", body } = {}){
  const r = await fetch(API + env.SHEET_ID + path, {
    method,
    headers: { authorization: "Bearer " + await token(env), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.ok) return r.json();
  const d = await r.json().catch(()=>({}));
  console.error("Google Sheets", r.status, d.error && d.error.message);
  if (r.status===403 || r.status===404) throw new SheetError(502, `KlienKu can't open the Google Sheet. Share it with ${account(env).client_email} as Editor.`);
  if (r.status===429) throw new SheetError(503, "Google is busy. Please try again in a minute.");
  throw new SheetError(502, "Couldn't reach the Google Sheet. Please try again.");
}

export const sheetUrl = env => `https://docs.google.com/spreadsheets/d/${env.SHEET_ID}/edit`;
