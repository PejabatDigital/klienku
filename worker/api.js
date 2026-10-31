/* KlienKu API for clients and settings. Every route needs sign-in and only touches the
   signed-in user's rows.

   GET    /api/clients                 every client (open, won and closed), small enough to send whole
   POST   /api/clients                 add a client with its first next step
   GET    /api/clients/:id             one client and its activity, newest first
   PATCH  /api/clients/:id             edit details, or fix stage / next step / due
   POST   /api/clients/:id/steps       finish the next step: done | no_reply | moved, then set the new one
   POST   /api/clients/:id/notes       add a note to the history
   POST   /api/clients/:id/close       won | lost | ended, with a reason and note
   POST   /api/clients/:id/reopen      back to open with a new next step
   DELETE /api/clients/:id             remove for good (duplicates and mistakes)
   GET    /api/settings, PUT /api/settings   follow-up rules and reminders */

export const STAGES = ["new", "contacting", "site_visit", "quote_sent", "negotiating"];
const OUTCOMES = ["won", "lost", "ended"];
/* Settings: [check, default]. A check returns the cleaned value or refuses it. */
const int = (min, max) => (v, k) => Number.isInteger(Number(v)) && v >= min && v <= max ? Number(v) : bad(`${k} must be a whole number from ${min} to ${max}`);
const oneOf = (...ok) => (v, k) => ok.includes(Number(v)) ? Number(v) : bad(`${k} must be one of ${ok.join(", ")}`);
const flag = (v, k) => typeof v==="boolean" || v===0 || v===1 ? (v ? 1 : 0) : bad(`${k} must be on or off`);
const hhmm = (v, k) => typeof v==="string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : bad(`${k} must be HH:MM`);
const zone = (v, k) => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return v; } catch(e){ return bad(`${k} is not a time zone`); } };
const SETTINGS = {
  follow_up_days: [int(1, 30), 2],
  max_tries: [int(1, 10), 3],
  quote_after_visit_days: [int(1, 30), 2],
  quote_follow_up_days: [int(1, 30), 3],
  notify_due: [flag, 1],
  remind_before: [oneOf(0, 5, 10, 15, 30, 60), 15],
  morning_summary: [flag, 1],
  summary_time: [hhmm, "08:00"],
  timezone: [zone, "Asia/Kuala_Lumpur"],
};
const KEYS = Object.keys(SETTINGS);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
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
const stage = v => STAGES.includes(v) ? v : bad("unknown stage");
const step = v => text(v, 120, "next step", true);

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
  if (!c) throw new HttpError(404, "Client not found");
  return c;
}
const log = (db, user, cid, kind, txt, at = now()) =>
  db.prepare("INSERT INTO activity (id, user_id, client_id, kind, text, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id(), user, cid, kind, txt, at);

/* A settings row (or none) with defaults filled in. */
export function withDefaults(row){
  const out = {};
  for (const [k, [, def]] of Object.entries(SETTINGS)) out[k] = row && row[k]!=null ? row[k] : def;
  return out;
}
const settings = async (db, user) => withDefaults(await db.prepare("SELECT * FROM settings WHERE user_id = ?1").bind(user).first());

/* ── Routes ── */
const routes = [
  ["GET", /^\/api\/clients$/, async ({ db, user }) => {
    const { results } = await db.prepare("SELECT * FROM clients WHERE user_id = ?1 ORDER BY next_due IS NULL, next_due, created_at").bind(user).all();
    return json({ clients: results });
  }],

  ["POST", /^\/api\/clients$/, async ({ db, user, request }) => {
    const b = await body(request), t = now(), cid = id();
    const c = {
      name: text(b.name, 120, "name", true), phone: text(b.phone, 40, "phone"),
      need: text(b.need, 500, "what they need"), area: text(b.area, 120, "area"),
      notes: text(b.notes, 5000, "notes"), next_step: step(b.next_step), next_due: due(b.next_due),
    };
    await db.batch([
      db.prepare(`INSERT INTO clients (id, user_id, name, phone, need, area, notes, stage, next_step, next_due, tries, created_at, updated_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'new', ?8, ?9, 0, ?10, ?10)`)
        .bind(cid, user, c.name, c.phone, c.need, c.area, c.notes, c.next_step, c.next_due, t),
      log(db, user, cid, "created", "Added", t),
      ...(c.notes ? [log(db, user, cid, "note", c.notes, t)] : []),
    ]);
    return json({ client: await getClient(db, user, cid) }, 201);
  }],

  ["GET", /^\/api\/clients\/([\w-]+)$/, async ({ db, user, params: [cid] }) => {
    const client = await getClient(db, user, cid);
    const { results } = await db.prepare("SELECT kind, text, at FROM activity WHERE client_id = ?1 AND user_id = ?2 ORDER BY at DESC, rowid DESC").bind(cid, user).all();
    return json({ client, activity: results });
  }],

  ["PATCH", /^\/api\/clients\/([\w-]+)$/, async ({ db, user, request, params: [cid] }) => {
    const c = await getClient(db, user, cid), b = await body(request);
    const next = {
      name: "name" in b ? text(b.name, 120, "name", true) : c.name,
      phone: "phone" in b ? text(b.phone, 40, "phone") : c.phone,
      need: "need" in b ? text(b.need, 500, "what they need") : c.need,
      area: "area" in b ? text(b.area, 120, "area") : c.area,
      stage: c.stage, next_step: c.next_step, next_due: c.next_due,
    };
    const open = STAGES.includes(c.stage);
    if (open){
      if ("stage" in b) next.stage = stage(b.stage);
      if ("next_step" in b) next.next_step = step(b.next_step);
      if ("next_due" in b) next.next_due = due(b.next_due);
    }
    const t = now(), notes = [];
    if (next.stage!==c.stage) notes.push(log(db, user, cid, "stage", "Stage changed by hand", t));
    if (next.next_step!==c.next_step || next.next_due!==c.next_due) notes.push(log(db, user, cid, "edited", "Next step changed by hand", t));
    await db.batch([
      db.prepare("UPDATE clients SET name = ?1, phone = ?2, need = ?3, area = ?4, stage = ?5, next_step = ?6, next_due = ?7, updated_at = ?8 WHERE id = ?9 AND user_id = ?10")
        .bind(next.name, next.phone, next.need, next.area, next.stage, next.next_step, next.next_due, t, cid, user),
      ...notes,
    ]);
    return json({ client: await getClient(db, user, cid) });
  }],

  ["POST", /^\/api\/clients\/([\w-]+)\/steps$/, async ({ db, user, request, params: [cid] }) => {
    const c = await getClient(db, user, cid), b = await body(request);
    if (!STAGES.includes(c.stage)) bad("This client is closed");
    const outcome = ["done", "no_reply", "moved"].includes(b.outcome) ? b.outcome : bad("outcome must be done, no_reply or moved");
    const note = text(b.note, 5000, "note");
    const nextStep = step(b.next_step), nextDue = due(b.next_due);
    const nextStage = outcome==="done" && b.stage ? stage(b.stage) : c.stage;
    const tries = outcome==="no_reply" ? c.tries + 1 : outcome==="done" ? 0 : c.tries;
    const title = outcome==="done" ? `${c.next_step} — done` : outcome==="no_reply" ? `${c.next_step} — no reply` : `Moved: ${c.next_step}`;
    const t = now();
    await db.batch([
      db.prepare("UPDATE clients SET stage = ?1, next_step = ?2, next_due = ?3, tries = ?4, updated_at = ?5 WHERE id = ?6 AND user_id = ?7")
        .bind(nextStage, nextStep, nextDue, tries, t, cid, user),
      log(db, user, cid, outcome, note ? `${title}\n${note}` : title, t),
    ]);
    return json({ client: await getClient(db, user, cid) });
  }],

  ["POST", /^\/api\/clients\/([\w-]+)\/notes$/, async ({ db, user, request, params: [cid] }) => {
    await getClient(db, user, cid);
    const b = await body(request), t = now();
    await db.batch([
      log(db, user, cid, "note", text(b.text, 5000, "note", true), t),
      db.prepare("UPDATE clients SET updated_at = ?1 WHERE id = ?2 AND user_id = ?3").bind(t, cid, user),
    ]);
    return json({ ok: true }, 201);
  }],

  ["POST", /^\/api\/clients\/([\w-]+)\/close$/, async ({ db, user, request, params: [cid] }) => {
    const c = await getClient(db, user, cid), b = await body(request);
    if (!STAGES.includes(c.stage)) bad("Already closed");
    const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : bad("outcome must be won, lost or ended");
    const reason = text(b.reason, 200, "reason"), note = text(b.note, 5000, "note"), t = now();
    const title = outcome==="won" ? "Won" : outcome==="lost" ? "Lost" : "Ended by you";
    const line = [title + (reason ? ": " + reason : ""), note].filter(Boolean).join("\n");
    await db.batch([
      db.prepare(`UPDATE clients SET stage = ?1, outcome = ?2, close_reason = ?3, next_step = NULL, next_due = NULL,
                  closed_at = ?4, updated_at = ?4 WHERE id = ?5 AND user_id = ?6`)
        .bind(outcome==="won" ? "won" : "closed", outcome, reason || null, t, cid, user),
      log(db, user, cid, "closed", line, t),
    ]);
    return json({ client: await getClient(db, user, cid) });
  }],

  ["POST", /^\/api\/clients\/([\w-]+)\/reopen$/, async ({ db, user, request, params: [cid] }) => {
    const c = await getClient(db, user, cid), b = await body(request);
    if (STAGES.includes(c.stage)) bad("Already open");
    const t = now();
    await db.batch([
      db.prepare(`UPDATE clients SET stage = ?1, outcome = NULL, close_reason = NULL, closed_at = NULL, next_step = ?2, next_due = ?3,
                  tries = 0, updated_at = ?4 WHERE id = ?5 AND user_id = ?6`)
        .bind(b.stage ? stage(b.stage) : "contacting", step(b.next_step), due(b.next_due), t, cid, user),
      log(db, user, cid, "reopened", "Reopened", t),
    ]);
    return json({ client: await getClient(db, user, cid) });
  }],

  ["DELETE", /^\/api\/clients\/([\w-]+)$/, async ({ db, user, params: [cid] }) => {
    await getClient(db, user, cid);
    await db.batch([
      db.prepare("DELETE FROM activity WHERE client_id = ?1 AND user_id = ?2").bind(cid, user),
      db.prepare("DELETE FROM clients WHERE id = ?1 AND user_id = ?2").bind(cid, user),
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
