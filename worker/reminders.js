/* Reminders, run by the Cron Trigger every 5 minutes (wrangler.jsonc "triggers").
   For each person with a device that accepts notifications:
   - a step with a time (e.g. a 3:00 pm site visit): a notification `remind_before`
     minutes before it, if "Notify when a step is due" is on;
   - the morning summary at `summary_time`: overdue and due today, if it's on;
   - steps with only a date get their own notification at `summary_time` instead, but only
     when the morning summary is off (otherwise the summary already lists them).
   Everything is worked out in the person's time zone. Each reminder goes once: clients
   remember the due value they were reminded about, settings the day of the last summary. */
import { withDefaults } from "./api.js";
import { sendPush } from "./push.js";

const LATE = 60; // minutes: a reminder later than this isn't sent (Today and the summary show it)

/* The local date and time in a time zone, e.g. {date: "2026-10-31", time: "08:05"}. */
export function localNow(timeZone, at = new Date()){
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).map(x=>[x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
/* "YYYY-MM-DD" + "HH:MM" as a number of minutes, so local times can be compared and subtracted. */
const minutes = (date, time = "00:00") => {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) / 60000;
};
const clock = hhmm => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const plural = (n, w) => `${n} ${w}${n===1 ? "" : "s"}`;

/* What to send one person now: {messages, remindedIds, summaryDay}. Pure, so it can be tested. */
export function plan(settings, clients, at = new Date()){
  const s = { ...withDefaults(settings), last_summary: settings && settings.last_summary }, local = localNow(s.timezone, at);
  const nowMin = minutes(local.date, local.time), summaryMin = minutes(local.date, s.summary_time);
  const messages = [], remindedIds = [];
  let summaryDay = null;

  for (const c of clients){
    if (!c.next_due || c.notified_due===c.next_due) continue;
    const date = c.next_due.slice(0, 10), time = c.next_due.slice(11, 16);
    if (time){
      if (!s.notify_due) continue;
      const moment = minutes(date, time) - s.remind_before;
      if (nowMin < moment) continue;
      remindedIds.push(c.id);
      if (nowMin - moment > LATE) continue;
      messages.push({ title: c.name, body: `${c.next_step} at ${clock(time)}`, tag: "due-" + c.id, url: "/clients/" + c.id });
    } else if (s.notify_due && !s.morning_summary && date===local.date && nowMin >= summaryMin){
      remindedIds.push(c.id);
      messages.push({ title: c.name, body: `Due today: ${c.next_step}`, tag: "due-" + c.id, url: "/clients/" + c.id });
    }
  }

  if (s.morning_summary && s.last_summary!==local.date && nowMin >= summaryMin && nowMin - summaryMin < 3 * 60){
    summaryDay = local.date;
    const due = clients.filter(c=>c.next_due).sort((a, b)=>a.next_due < b.next_due ? -1 : 1);
    const overdue = due.filter(c=>c.next_due.slice(0, 10) < local.date), today = due.filter(c=>c.next_due.slice(0, 10)===local.date);
    if (overdue.length || today.length){
      const parts = [overdue.length && `${overdue.length} overdue`, today.length && `${today.length} due today`].filter(Boolean);
      const first = (overdue[0] || today[0]);
      messages.push({ title: "Good morning", body: `${parts.join(", ")}. First: ${first.name} · ${first.next_step}`, tag: "summary", url: "/" });
    }
  }
  return { messages, remindedIds, summaryDay, local };
}

export async function runReminders(env, at = new Date()){
  const db = env.DB;
  const { results: users } = await db.prepare("SELECT DISTINCT user_id FROM push_subscriptions").all();
  for (const { user_id: user } of users){
    const [settings, clients, subs] = await Promise.all([
      db.prepare("SELECT * FROM settings WHERE user_id = ?1").bind(user).first(),
      db.prepare("SELECT id, name, next_step, next_due, notified_due FROM clients WHERE user_id = ?1 AND next_due IS NOT NULL").bind(user).all().then(r=>r.results),
      db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?1").bind(user).all().then(r=>r.results),
    ]);
    const { messages, remindedIds, summaryDay } = plan(settings, clients, at);
    if (!messages.length && !remindedIds.length && !summaryDay) continue;

    const gone = new Set();
    let sent = 0;
    for (const m of messages){
      for (const sub of subs){
        if (gone.has(sub.endpoint)) continue;
        try {
          const res = await sendPush({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, m, env);
          if (res.status===404 || res.status===410) gone.add(sub.endpoint);
          else if (res.ok) sent++;
          else console.log(`[reminders] push service said ${res.status}`);
        } catch(e){ console.log("[reminders] send failed:", e.message); }
      }
    }

    // remember what was sent even if a push failed, so nothing repeats every 5 minutes
    const writes = [
      ...remindedIds.map(id=>db.prepare("UPDATE clients SET notified_due = next_due WHERE id = ?1 AND user_id = ?2").bind(id, user)),
      ...[...gone].map(e=>db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?1").bind(e)),
    ];
    if (summaryDay) writes.push(db.prepare(
      `INSERT INTO settings (user_id, last_summary, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT (user_id) DO UPDATE SET last_summary = ?2`).bind(user, summaryDay, new Date().toISOString()));
    if (writes.length) await db.batch(writes);
    console.log(`[reminders] ${messages.length} message(s), ${sent} delivered, ${gone.size} old device(s) removed`);
  }
}
