/* KlienKu API for leads and settings. Every route needs sign-in and only touches the
   signed-in user's rows. Leads live in the `clients` table (see migrations/0005_leads.sql):
   `stage` is the status, `area` the location, `notes` the general notes, `next_due` /
   `next_step` the next follow-up date and note.

   GET    /api/clients                 every lead (active, won and lost) with last_contact, small enough to send whole
   POST   /api/clients                 add a lead (the follow-up is optional)
   GET    /api/clients/:id             one lead and its activity, newest first
   PATCH  /api/clients/:id             edit details, change status ({stage, reason}), set or clear the follow-up ({next_due, next_step};
                                       {next_due: null, done: true} marks it done)
   POST   /api/clients/:id/interactions  log what happened ({type, text, at}), with the same status / follow-up changes as PATCH
   DELETE /api/clients/:id             remove for good (duplicates and mistakes)
   GET    /api/settings, PUT /api/settings   reminders
   GET    /api/export                  every lead and its history as a spreadsheet file (CSV)
   DELETE /api/account                 delete the signed-in user and everything they own */

import { CLOSED, CONTACT_KINDS, INTERACTION_TYPES, PROJECT_TYPES, SOURCES, STATUSES } from "../src/lists.js";

const STATUS_KEYS = STATUSES.map(s=>s.key), statusName = key => (STATUSES.find(s=>s.key===key) || {}).label || key;
/* Settings: [check, default]. A check returns the cleaned value or refuses it. */
const oneOf = (...ok) => (v, k) => ok.includes(Number(v)) ? Number(v) : bad(`${k} must be one of ${ok.join(", ")}`);
const flag = (v, k) => typeof v==="boolean" || v===0 || v===1 ? (v ? 1 : 0) : bad(`${k} must be on or off`);
const hhmm = (v, k) => typeof v==="string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : bad(`${k} must be HH:MM`);
const zone = (v, k) => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return v; } catch(e){ return bad(`${k} is not a time zone`); } };
const SETTINGS = {
  notify_due: [flag, 1],
  remind_before: [oneOf(0, 5, 10, 15, 30, 60), 15],
  morning_summary: [flag, 1],
  summary_time: [hhmm, "08:00"],
  timezone: [zone, "Asia/Kuala_Lumpur"],
};
const KEYS = Object.keys(SETTINGS);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
class HttpError extends Error { constructor(status, message){ super(message); this.status = status; } }
const bad = message => { throw new HttpError(400, message); };

/* ── Input checks ── */
const text = (v, max, name, required = false) => {
  if (v==null) v = "";
  if (typeof v!=="string") bad(name + " must be text");
  v = v.trim();
  if (required && !v) bad(name + " is required");
  if (v.length > max) bad(name + " is too long");
  return v;
};
/* A due date in local time: YYYY-MM-DD, optionally with THH:MM. */
const due = v => {
  if (typeof v!=="string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v)) bad("due must be YYYY-MM-DD or YYYY-MM-DDTHH:MM");
  const [y, m, d] = v.slice(0, 10).split("-").map(Number), t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear()!==y || t.getUTCMonth()!==m - 1 || t.getUTCDate()!==d) bad("due is not a real date");
  return v;
};
const status = v => STATUS_KEYS.includes(v) ? v : bad("unknown status");
const choice = (list, name) => v => { v = text(v, 60, name); return !v || list.includes(v) ? v : bad("unknown " + name); };
const projectType = choice(PROJECT_TYPES, "project type"), source = choice(SOURCES, "lead source");
const interactionType = v => INTERACTION_TYPES.includes(v) ? v : bad("unknown interaction type");
/* When an interaction happened: an ISO time, not in the future (a few minutes' leeway). */
const when = v => {
  const t = typeof v==="string" ? Date.parse(v) : NaN;
  if (Number.isNaN(t) || t < Date.UTC(2020, 0, 1)) bad("at must be a date and time");
  if (t > Date.now() + 5 * 60_000) bad("An interaction can't be in the future");
  return new Date(t).toISOString();
};
/* Estimated budget in whole ringgit, or null when not given. */
const budget = v => {
  if (v==null || v==="") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100_000_000 ? n : bad("budget must be a whole number of ringgit");
};
/* The follow-up: a due value and a short note, or both null when there's none. */
const followUp = b => {
  if (b.next_due==null || b.next_due==="") return { next_due: null, next_step: null };
  return { next_due: due(b.next_due), next_step: text(b.next_step, 200, "follow-up note") || null };
};
/* Lead details from a request body; when editing, `c` (the lead as it is) fills in what isn't sent. */
const details = (b, c = null) => {
  const pick = (k, check) => !c || k in b ? check(b[k]) : c[k];
  return {
    name: pick("name", v=>text(v, 120, "name", true)), phone: pick("phone", v=>text(v, 40, "phone")),
    area: pick("area", v=>text(v, 120, "location")), project_type: pick("project_type", projectType),
    source: pick("source", source), budget: pick("budget", budget), notes: pick("notes", v=>text(v, 5000, "general notes")),
  };
};

async function body(request){
  const raw = await request.text();
  if (raw.length > 50_000) throw new HttpError(413, "Too large");
  try { return JSON.parse(raw || "{}"); } catch(e){ bad("Body must be JSON"); }
}

/* ── Storage ── */
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

async function getClient(db, user, cid){
  const c = await db.prepare("SELECT * FROM clients WHERE id = ?1 AND user_id = ?2").bind(cid, user).first();
  if (!c) throw new HttpError(404, "Lead not found");
  return c;
}
const log = (db, user, cid, kind, txt, at = now()) =>
  db.prepare("INSERT INTO activity (id, user_id, client_id, kind, text, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id(), user, cid, kind, txt, at);

/* "Tue 4 Nov" (and ", 3:00 pm") for a due value, for history lines. */
function dueText(v){
  const [y, m, d] = v.slice(0, 10).split("-").map(Number), t = v.slice(11, 16);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d)).replace(",", "");
  if (!t) return day;
  const [h, mi] = t.split(":").map(Number);
  return `${day}, ${h % 12 || 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/* A settings row (or none) with defaults filled in. */
export function withDefaults(row){
  const out = {};
  for (const [k, [, def]] of Object.entries(SETTINGS)) out[k] = row && row[k]!=null ? row[k] : def;
  return out;
}
const settings = async (db, user) => withDefaults(await db.prepare("SELECT * FROM settings WHERE user_id = ?1").bind(user).first());

/* ── Download (CSV) ── one row per lead, its history in the last column. Dates are in the
   user's time zone; a byte-order mark makes Excel read it as UTF-8. */
const cell = v => {
  let t = String(v ?? "");
  if (/^[=@\t]/.test(t)) t = "'" + t; // never let a spreadsheet run it as a formula
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
function csv(clients, activity, timeZone){
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const day = iso => iso ? ymd.format(new Date(iso)) : "";
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const history = {};
  for (const a of activity) (history[a.client_id] ||= []).push(`${day(a.at)} ${hm.format(new Date(a.at))}  ${a.text.replace(/\n/g, " — ")}`);
  const rows = [["Name", "Phone", "Location", "Project type", "Lead source", "Estimated budget (RM)", "Status", "Lost reason",
    "Next follow-up", "Follow-up note", "Added", "Closed", "Last contacted", "General notes", "History"]];
  for (const c of clients) rows.push([c.name, c.phone, c.area, c.project_type, c.source, c.budget ?? "", statusName(c.stage),
    c.close_reason, (c.next_due || "").replace("T", " "), c.next_step, day(c.created_at), day(c.closed_at),
    day(c.last_contact), c.notes, (history[c.id] || []).join("\n")]);
  return "\uFEFF" + rows.map(r=>r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/* When they were last in touch (CONTACT_KINDS are fixed names from src/lists.js). */
const LAST_CONTACT = `(SELECT MAX(a.at) FROM activity a WHERE a.client_id = c.id AND a.kind IN (${CONTACT_KINDS.map(k=>`'${k}'`).join(", ")})) AS last_contact`;

/* Status and follow-up changes asked for in `b` ({stage, reason}, {next_due, next_step}),
   applied to `next` (the lead's new values); returns the history lines they add. */
function progress(db, user, c, b, next, t){
  const notes = [], cid = c.id;
  Object.assign(next, { stage: c.stage, next_step: c.next_step, next_due: c.next_due, close_reason: c.close_reason, closed_at: c.closed_at });
  if ("stage" in b && b.stage!==c.stage){
    next.stage = status(b.stage);
    const reason = text(b.reason, 200, "reason");
    if (CLOSED.includes(next.stage)){
      // Won and Lost have no follow-up
      Object.assign(next, { next_step: null, next_due: null, closed_at: t, close_reason: next.stage==="lost" && reason ? reason : null });
    } else Object.assign(next, { closed_at: null, close_reason: null });
    notes.push(log(db, user, cid, "status", `Status: ${statusName(c.stage)} → ${statusName(next.stage)}` + (next.close_reason ? "\n" + next.close_reason : ""), t));
  }
  if ("next_due" in b){
    if (CLOSED.includes(next.stage)) bad("Won and Lost leads have no follow-up");
    const f = followUp(b);
    if (f.next_due!==next.next_due || f.next_step!==next.next_step){
      // clearing it with {done: true} means it was done, not dropped
      const line = f.next_due ? `Follow-up: ${dueText(f.next_due)}` + (f.next_step ? "\n" + f.next_step : "")
        : b.done ? "Follow-up done" + (next.next_step ? "\n" + next.next_step : "") : "Follow-up removed";
      Object.assign(next, f);
      notes.push(log(db, user, cid, "follow_up", line, t));
    }
  }
  return notes;
}
const saveLead = (db, user, cid, next, t) => db.prepare(`UPDATE clients SET name = ?1, phone = ?2, area = ?3, project_type = ?4, source = ?5, budget = ?6, notes = ?7, stage = ?8,
    next_step = ?9, next_due = ?10, close_reason = ?11, closed_at = ?12, updated_at = ?13 WHERE id = ?14 AND user_id = ?15`)
  .bind(next.name, next.phone, next.area, next.project_type, next.source, next.budget, next.notes, next.stage,
    next.next_step, next.next_due, next.close_reason, next.closed_at, t, cid, user);

/* ── Routes ── */
const routes = [
  ["GET", /^\/api\/clients$/, async ({ db, user }) => {
    const { results } = await db.prepare(`SELECT c.*, ${LAST_CONTACT}
      FROM clients c WHERE c.user_id = ?1 ORDER BY c.next_due IS NULL, c.next_due, c.created_at`).bind(user).all();
    return json({ clients: results });
  }],

  ["POST", /^\/api\/clients$/, async ({ db, user, request }) => {
    const b = await body(request), t = now(), cid = id();
    const c = details(b), f = followUp(b);
    await db.batch([
      db.prepare(`INSERT INTO clients (id, user_id, name, phone, area, project_type, source, budget, notes, stage, next_step, next_due, created_at, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'new', ?10, ?11, ?12, ?12)`)
        .bind(cid, user, c.name, c.phone, c.area, c.project_type, c.source, c.budget, c.notes, f.next_step, f.next_due, t),
      log(db, user, cid, "created", "Added", t),
    ]);
    return json({ client: await getClient(db, user, cid) }, 201);
  }],

  ["GET", /^\/api\/clients\/([\w-]+)$/, async ({ db, user, params: [cid] }) => {
    const client = await getClient(db, user, cid);
    const { results } = await db.prepare("SELECT kind, text, at FROM activity WHERE client_id = ?1 AND user_id = ?2 ORDER BY at DESC, rowid DESC").bind(cid, user).all();
    return json({ client, activity: results });
  }],

  ["PATCH", /^\/api\/clients\/([\w-]+)$/, async ({ db, user, request, params: [cid] }) => {
    const c = await getClient(db, user, cid), b = await body(request), t = now();
    const next = details(b, c), notes = progress(db, user, c, b, next, t);
    await db.batch([saveLead(db, user, cid, next, t), ...notes]);
    return json({ client: await getClient(db, user, cid) });
  }],

  ["POST", /^\/api\/clients\/([\w-]+)\/interactions$/, async ({ db, user, request, params: [cid] }) => {
    const c = await getClient(db, user, cid), b = await body(request), t = now();
    const type = interactionType(b.type), said = text(b.text, 5000, "description"), at = b.at ? when(b.at) : t;
    const next = details({}, c), notes = progress(db, user, c, b, next, t);
    await db.batch([log(db, user, cid, "interaction", said ? `${type}\n${said}` : type, at), saveLead(db, user, cid, next, t), ...notes]);
    return json({ client: await getClient(db, user, cid) }, 201);
  }],

  ["DELETE", /^\/api\/clients\/([\w-]+)$/, async ({ db, user, params: [cid] }) => {
    await getClient(db, user, cid);
    await db.batch([
      db.prepare("DELETE FROM activity WHERE client_id = ?1 AND user_id = ?2").bind(cid, user),
      db.prepare("DELETE FROM clients WHERE id = ?1 AND user_id = ?2").bind(cid, user),
    ]);
    return json({ ok: true });
  }],

  ["GET", /^\/api\/export$/, async ({ db, user }) => {
    const [{ results: clients }, { results: activity }, s] = await Promise.all([
      db.prepare(`SELECT c.*, ${LAST_CONTACT}
        FROM clients c WHERE c.user_id = ?1 ORDER BY c.name COLLATE NOCASE`).bind(user).all(),
      db.prepare("SELECT client_id, text, at FROM activity WHERE user_id = ?1 ORDER BY at, rowid").bind(user).all(),
      settings(db, user),
    ]);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: s.timezone }).format(new Date());
    return new Response(csv(clients, activity, s.timezone), { headers: {
      "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
      "content-disposition": `attachment; filename="klienku-leads-${date}.csv"`,
    } });
  }],

  // everything of theirs, then the account itself; the session goes too, so they're signed out
  ["DELETE", /^\/api\/account$/, async ({ db, user }) => {
    await db.batch([
      ...["activity", "clients", "settings", "push_subscriptions"].map(t=>db.prepare(`DELETE FROM ${t} WHERE user_id = ?1`).bind(user)),
      db.prepare(`DELETE FROM "verification" WHERE "value" = ?1`).bind(user),
      db.prepare(`DELETE FROM "session" WHERE "userId" = ?1`).bind(user),
      db.prepare(`DELETE FROM "account" WHERE "userId" = ?1`).bind(user),
      db.prepare(`DELETE FROM "user" WHERE "id" = ?1`).bind(user),
    ]);
    return json({ ok: true });
  }],

  ["GET", /^\/api\/settings$/, async ({ db, user }) => json({ settings: await settings(db, user) })],

  ["PUT", /^\/api\/settings$/, async ({ db, user, request }) => {
    const b = await body(request), cur = await settings(db, user);
    for (const [k, [check]] of Object.entries(SETTINGS)) if (k in b) cur[k] = check(b[k], k);
    // KEYS are fixed names from SETTINGS above, never from the request
    await db.prepare(`INSERT INTO settings (user_id, ${KEYS.join(", ")}, updated_at) VALUES (?1, ${KEYS.map((_, i)=>"?" + (i + 2)).join(", ")}, ?${KEYS.length + 2})
                      ON CONFLICT (user_id) DO UPDATE SET ${KEYS.map((k, i)=>`${k} = ?${i + 2}`).join(", ")}, updated_at = ?${KEYS.length + 2}`)
      .bind(user, ...KEYS.map(k=>cur[k]), now()).run();
    return json({ settings: cur });
  }],
];

/* Runs the matching route for a signed-in user. Returns null when no route matches. */
export async function handleApi(request, env, user){
  const url = new URL(request.url);
  const found = routes.map(([method, path, run]) => ({ method, run, m: path.exec(url.pathname) })).filter(r=>r.m);
  if (!found.length) return null;
  const hit = found.find(r=>r.method===request.method);
  if (!hit) return json({ error: "Method not allowed" }, 405);
  if (!user) return json({ error: "Sign in required" }, 401);
  try {
    return await hit.run({ db: env.DB, user, request, params: hit.m.slice(1) });
  } catch(e){
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    throw e;
  }
}
