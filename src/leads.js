/* Lead helpers. A lead is one row of the Google Sheet's Leads tab (see worker/api.js):
   {id, row, added, name, status, phone, source, type, location, want, last_contacted,
   next_action, follow_up, reason, log}, all text but `log` (its notes, newest first: {id, at,
   text}, kept in KlienKu); dates as YYYY-MM-DD when the sheet
   has a real date. Statuses come from the sheet's Lists tab, in its order. */
import { status as dueStatus } from "./dates.js";

/* Statuses that mean the lead is finished. */
export const isClosed = l => /^(closed|won|lost|stopped)$/i.test(l.status || "");
export const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

/* The colour of a lead: overdue | today | upcoming | none (no follow-up date), or won | closed. */
export const leadState = l => isClosed(l) ? (/^won$/i.test(l.status) ? "won" : "closed")
  : isDate(l.follow_up) ? dueStatus(l.follow_up) : "none";

/* Statuses in the sheet's order; then any a lead has that the list doesn't (old or typed). */
export function statusList(sheet){
  const list = [...(sheet.lists.status || [])];
  for (const l of sheet.leads) if (!list.includes(l.status)) list.push(l.status);
  return list;
}
export const statusName = s => s || "No status";

/* Leads with a follow-up date first, soonest first; then the rest, newest first. */
export function byFollowUp(a, b){
  const da = isDate(a.follow_up), db = isDate(b.follow_up);
  if (da && db) return a.follow_up.localeCompare(b.follow_up);
  if (da!==db) return da ? -1 : 1;
  return (b.added || "").localeCompare(a.added || "");
}

/* WhatsApp link for a Malaysian or international number: 012-345 6789 → 60123456789.
   Handles like "@name" aren't numbers and get none. */
export function whatsapp(phone){
  if (/[a-z@]/i.test(phone || "")) return null;
  let n = (phone || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("0")) n = "60" + n.slice(1);
  return n.length >= 8 ? "https://wa.me/" + n : null;
}
export const telLink = phone => /[a-z@]/i.test(phone || "") ? null : (phone || "").replace(/[^\d+]/g, "") || null;
