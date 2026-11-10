/* KlienKu API (Version 3): the leads live in the Google Sheet "Renovasi KL Leads"
   (env.SHEET_ID), tab "Leads", one row per lead; the dropdown lists in tab "Lists".
   Columns are found by their header text, so they can be moved around in the sheet.
   Every route needs sign-in.

   GET    /api/leads       every lead, the lists and the sheet's link: {leads, lists, sheet_url}
   POST   /api/leads       add a lead as a new row at the bottom (only the name is needed): {lead}
   PATCH  /api/leads/:id   change some of a lead's fields; only the fields sent are written: {lead}
   DELETE /api/leads/:id   delete the lead: its whole row is removed from the sheet: {ok}
   POST   /api/leads/:id/notes        add a note to the lead's log {text}: {note}
   DELETE /api/leads/:id/notes/:nid   delete a note: {ok}
   DELETE /api/account     delete the signed-in user and what KlienKu keeps for them (not the sheet)

   Writes are typed cells (text stays text, so 012… keeps its 0; dates are real dates), and
   only touch values: the sheet's formats, dropdowns and the WhatsApp formula stay.

   Notes (the running log on each lead page) are kept in D1 (`lead_notes`), not in the
   sheet. Each lead comes with `log`: its notes, newest first, as {id, at, text}. A lead's
   Notes cell in the sheet is copied in once as its first note, dated on its Date. */

import { SheetError, sheetUrl, sheets } from "./google.js";

/* Leads tab header → field. The WhatsApp column is a formula and is never read or written. */
const COLUMNS = {
  "date": "added", "name": "name", "status": "status", "phone": "phone", "source": "source",
  "project type": "type", "location": "location", "what they want": "want",
  "last contacted": "last_contacted", "next action": "next_action", "next follow-up": "follow_up",
  "stopped reason": "reason", "notes": "notes", "id": "id",
};
const DATES = ["added", "last_contacted", "follow_up"];
/* Fields filled from the Lists tab, and the longest text each other field takes. */
const CHOICES = ["status", "type", "source", "reason"];
const MAX = { name: 120, phone: 40, location: 120, want: 1000, next_action: 300, notes: 5000 };
/* Field → its name in messages. */
const NAMES = { added: "Date", last_contacted: "Last contacted", follow_up: "Next follow-up", status: "Status",
  type: "Project type", source: "Source", reason: "Stopped reason", name: "Name", phone: "Phone", location: "Location",
  want: "What they want", next_action: "Next action", notes: "Notes" };
/* Lists tab: the header in row 2 → list; the choices are below it. */
const LISTS = { "status": "status", "project type": "type", "source": "source", "stopped reason": "reason" };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
const bad = message => { throw new SheetError(400, message); };

const key = v => String(v ?? "").trim().toLowerCase();
/* 0 → A, 25 → Z, 26 → AA */
const letter = i => (i >= 26 ? letter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));
const EPOCH = Date.UTC(1899, 11, 30); // a sheet date is days since this
/* A sheet date → YYYY-MM-DD; text is kept as it is. */
const day = v => typeof v==="number" ? new Date(EPOCH + Math.floor(v) * 86400000).toISOString().slice(0, 10) : String(v ?? "").trim();
const serial = ymd => { const [y, m, d] = ymd.split("-").map(Number); return (Date.UTC(y, m - 1, d) - EPOCH) / 86400000; };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

/* Every lead's notes, newest first, as `log` on each lead. Sheet Notes cells not copied
   yet are copied first (one batch). */
async function withLogs(env, user, leads){
  const { results } = await env.DB.prepare(
    "SELECT id, lead_id, at, text, from_sheet, deleted FROM lead_notes WHERE user_id = ?1 ORDER BY at DESC, id DESC"
  ).bind(user).all();
  const copied = new Set(results.filter(n=>n.from_sheet).map(n=>n.lead_id));
  const toCopy = leads.filter(l=>l.notes && !copied.has(l.id));
  if (toCopy.length){
    const now = new Date().toISOString();
    const ins = env.DB.prepare("INSERT INTO lead_notes (user_id, lead_id, at, text, from_sheet, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5) RETURNING id, lead_id, at, text");
    const done = await env.DB.batch(toCopy.map(l=>ins.bind(user, l.id, /^\d{4}-\d{2}-\d{2}$/.test(l.added) ? l.added : today(), l.notes.slice(0, 5000), now)));
    for (const r of done) results.push(...r.results);
    results.sort((a, b)=>b.at.localeCompare(a.at) || b.id - a.id);
  }
  const logs = {};
  for (const n of results) if (!n.deleted) (logs[n.lead_id] ||= []).push({ id: n.id, at: n.at, text: n.text });
  return leads.map(({ notes, ...l })=>({ ...l, log: logs[l.id] || [] }));
}

/* The Leads tab's sheet id (needed to write cells), looked up once. */
let leadsGid = null;
async function gid(env){
  if (leadsGid==null){
    const meta = await sheets(env, "?fields=sheets.properties(sheetId,title)");
    const tab = meta.sheets.find(s=>key(s.properties.title)==="leads");
    if (!tab) throw new SheetError(500, "The Google Sheet needs a tab called Leads.");
    leadsGid = tab.properties.sheetId;
  }
  return leadsGid;
}

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
  // the first empty row after everything in the tab (the values API leaves out empty rows at the end)
  return { leads, lists, head, nextRow: leadsTab.length + 1 };
}

/* The fields in a request body, checked. `lead` is the lead as it is (when editing): a
   choice it already has is kept even if the Lists tab no longer offers it. */
function clean(b, lists, lead = null){
  if (!b || typeof b!=="object") bad("Body must be JSON");
  const out = {};
  for (const [f, v] of Object.entries(b)){
    if (!Object.values(COLUMNS).includes(f) || f==="id") continue;
    if (v!=null && typeof v!=="string") bad(NAMES[f] + " must be text");
    const t = (v || "").trim();
    if (DATES.includes(f)){
      if (t && !(/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)))) bad(NAMES[f] + " must be a date");
    } else if (CHOICES.includes(f)){
      if (t && !(lists[f] || []).includes(t) && !(lead && lead[f]===t)) bad(`"${t}" isn't in the sheet's ${NAMES[f]} list`);
    } else if (t.length > MAX[f]) bad(NAMES[f] + " is too long");
    out[f] = t;
  }
  if ("name" in out && !out.name) bad("Name is required");
  return out;
}

/* Writes `values` (field → text) into row `row`, only the fields given. Neighbouring
   columns go in one request; the WhatsApp formula column is never touched. */
async function writeRow(env, head, row, values){
  const sheetId = await gid(env), requests = [];
  let run = null;
  head.forEach((f, c)=>{
    if (!f || !(f in values)){ run = null; return; }
    const v = values[f];
    const cell = !v ? {} : DATES.includes(f) ? { userEnteredValue: { numberValue: serial(v) } } : { userEnteredValue: { stringValue: v } };
    if (!run){
      run = { updateCells: { start: { sheetId, rowIndex: row - 1, columnIndex: c }, rows: [{ values: [] }], fields: "userEnteredValue" } };
      requests.push(run);
    }
    run.updateCells.rows[0].values.push(cell);
  });
  if (requests.length) await sheets(env, ":batchUpdate", { method: "POST", body: { requests } });
}

const EMPTY = Object.fromEntries(Object.values(COLUMNS).map(f=>[f, ""]));

async function body(request){
  const raw = await request.text();
  if (raw.length > 50_000) throw new SheetError(413, "Too large");
  try { return JSON.parse(raw || "{}"); } catch(e){ bad("Body must be JSON"); }
}

export async function handleApi(request, env, user){
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const one = /^\/api\/leads\/([\w-]+)$/.exec(path);
  const note = /^\/api\/leads\/([\w-]{1,40})\/notes(?:\/(\d+))?$/.exec(path);
  if (!(path==="/api/leads" || one || note || path==="/api/account")) return null;
  if (!user) return json({ error: "Sign in required" }, 401);
  try {
    if (path==="/api/leads" && method==="GET"){
      const { leads, lists } = await readSheet(env);
      return json({ leads: await withLogs(env, user, leads), lists, sheet_url: sheetUrl(env) });
    }

    if (note && !note[2] && method==="POST"){
      const b = await body(request);
      const text = typeof b.text==="string" ? b.text.trim() : "";
      if (!text) bad("Write a note first");
      if (text.length > 5000) bad("Note is too long");
      const now = new Date().toISOString();
      const n = await env.DB.prepare("INSERT INTO lead_notes (user_id, lead_id, at, text, created_at) VALUES (?1, ?2, ?3, ?4, ?3) RETURNING id, at, text")
        .bind(user, note[1], now, text).first();
      return json({ note: n }, 201);
    }

    if (note && note[2] && method==="DELETE"){
      await env.DB.prepare("UPDATE lead_notes SET deleted = 1 WHERE id = ?1 AND user_id = ?2 AND lead_id = ?3")
        .bind(Number(note[2]), user, note[1]).run();
      return json({ ok: true });
    }

    if (path==="/api/leads" && method==="POST"){
      const b = await body(request), s = await readSheet(env), f = clean(b, s.lists);
      if (!f.name) bad("Name is required");
      const lead = { ...EMPTY, added: today(), status: s.lists.status[0] || "", ...f, id: newId() };
      await writeRow(env, s.head, s.nextRow, lead);
      const { notes, ...shown } = lead;
      return json({ lead: { ...shown, row: s.nextRow, log: [] } }, 201);
    }

    if (one && method==="PATCH"){
      const b = await body(request), s = await readSheet(env);
      const lead = s.leads.find(l=>l.id===one[1]);
      if (!lead) return json({ error: "Lead not found. It may have been removed from the Google Sheet." }, 404);
      const f = clean(b, s.lists, lead);
      await writeRow(env, s.head, lead.row, f);
      const { notes, ...shown } = { ...lead, ...f };
      return json({ lead: shown }); // the app keeps the lead's log it already has
    }

    // the row goes, so the rows below move up (the WhatsApp formula in D1 follows by itself)
    if (one && method==="DELETE"){
      const s = await readSheet(env);
      const lead = s.leads.find(l=>l.id===one[1]);
      if (!lead) return json({ error: "Lead not found. It may have been removed from the Google Sheet already." }, 404);
      const sheetId = await gid(env);
      await sheets(env, ":batchUpdate", { method: "POST", body: { requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: lead.row - 1, endIndex: lead.row } } },
      ] } });
      await env.DB.prepare("DELETE FROM lead_notes WHERE user_id = ?1 AND lead_id = ?2").bind(user, lead.id).run();
      return json({ ok: true });
    }

    // everything KlienKu keeps for them, then the account; the session goes too, so they're signed out
    if (path==="/api/account" && method==="DELETE"){
      const db = env.DB;
      await db.batch([
        ...["lead_notes", "activity", "clients", "settings", "push_subscriptions"].map(t=>db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(user)),
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
