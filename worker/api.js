/* KlienKu API (Version 3): the leads live in the Google Sheet "Renovasi KL Leads"
   (env.SHEET_ID), tab "Leads", one row per lead; the dropdown lists in tab "Lists".
   Columns are found by their header text, so they can be moved around in the sheet.
   Every route needs sign-in.

   GET    /api/leads     every lead, the lists and the sheet's link: {leads, lists, sheet_url}
   DELETE /api/account   delete the signed-in user and what KlienKu keeps for them (not the sheet) */

import { SheetError, sheetUrl, sheets } from "./google.js";

/* Leads tab header → field. The WhatsApp column is a formula and is never read or written. */
const COLUMNS = {
  "date": "added", "name": "name", "status": "status", "phone": "phone", "source": "source",
  "project type": "type", "location": "location", "what they want": "want",
  "last contacted": "last_contacted", "next action": "next_action", "next follow-up": "follow_up",
  "stopped reason": "reason", "notes": "notes", "id": "id",
};
const DATES = ["added", "last_contacted", "follow_up"];
/* Lists tab: the header in row 2 → list; the choices are below it. */
const LISTS = { "status": "status", "project type": "type", "source": "source", "stopped reason": "reason" };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});

const key = v => String(v ?? "").trim().toLowerCase();
/* 0 → A, 25 → Z, 26 → AA */
const letter = i => (i >= 26 ? letter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
/* A sheet date (days since 30 Dec 1899) → YYYY-MM-DD; text is kept as it is. */
const day = v => typeof v==="number" ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10) : String(v ?? "").trim();
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

/* Reads both tabs. Rows with a name or phone are leads; any without an ID get one, written
   back to the sheet, so each lead keeps the same link when rows are sorted or moved. */
async function readSheet(env){
  const q = ["Leads!A1:Z", "Lists!A2:Z60"].map(r=>"ranges=" + encodeURIComponent(r)).join("&");
  const data = await sheets(env, `/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  const [leadsTab, listsTab] = data.valueRanges.map(v=>v.values || []);

  const head = (leadsTab[0] || []).map(h=>COLUMNS[key(h)]);
  const idCol = head.indexOf("id");
  if (idCol < 0) throw new SheetError(500, "The Leads tab needs a column headed ID.");
  const leads = [], missing = [];
  leadsTab.slice(1).forEach((cells, i)=>{
    const lead = { row: i + 2 };
    head.forEach((f, c)=>{ if (f) lead[f] = DATES.includes(f) ? day(cells[c]) : String(cells[c] ?? "").trim(); });
    if (!lead.name && !lead.phone) return;
    if (!lead.id){ lead.id = newId(); missing.push({ range: `Leads!${letter(idCol)}${lead.row}`, values: [[lead.id]] }); }
    leads.push(lead);
  });
  if (missing.length) await sheets(env, "/values:batchUpdate", { method: "POST", body: { valueInputOption: "RAW", data: missing } });

  const lists = { status: [], type: [], source: [], reason: [] };
  const titles = listsTab[0] || [];
  titles.forEach((t, c)=>{
    const name = LISTS[key(t)];
    if (name) lists[name] = listsTab.slice(1).map(r=>String(r[c] ?? "").trim()).filter(Boolean);
  });
  return { leads, lists };
}

export async function handleApi(request, env, user){
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const known = path==="/api/leads" || path==="/api/account";
  if (!known) return null;
  if (!user) return json({ error: "Sign in required" }, 401);
  try {
    if (path==="/api/leads" && method==="GET") return json({ ...await readSheet(env), sheet_url: sheetUrl(env) });
    // everything KlienKu keeps for them, then the account; the session goes too, so they're signed out
    if (path==="/api/account" && method==="DELETE"){
      const db = env.DB;
      await db.batch([
        ...["activity", "clients", "settings", "push_subscriptions"].map(t=>db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(user)),
        db.prepare(`DELETE FROM "verification" WHERE "value" = ?1`).bind(user),
        db.prepare(`DELETE FROM "session" WHERE "userId" = ?1`).bind(user),
        db.prepare(`DELETE FROM "account" WHERE "userId" = ?1`).bind(user),
        db.prepare(`DELETE FROM "user" WHERE "id" = ?1`).bind(user),
      ]);
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch(e){
    if (e instanceof SheetError) return json({ error: e.message }, e.status);
    throw e;
  }
}
