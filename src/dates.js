/* Dates for due steps. A due value is local time: "YYYY-MM-DD", or "YYYY-MM-DDTHH:MM"
   when a time was chosen. */

const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
/* The local calendar day of a stored UTC timestamp (activity, created, closed). */
export const localDay = iso => ymd(new Date(iso));
const parse = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };

export function addDays(n, from = new Date()){
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  return ymd(d);
}
/* Whole days from a to b (dates as YYYY-MM-DD…). */
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

export const timeOf = due => due && due.length > 10 ? due.slice(11, 16) : "";
export function clock(hhmm){
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "am" : "pm"}`;
}
const fmt = (s, opts) => parse(s).toLocaleDateString("en-GB", opts).replace(",", "");
export const shortDate = s => fmt(s, { weekday: "short", day: "numeric", month: "short" });   // Wed 29 Oct
export const dayMonth = s => fmt(s, { day: "numeric", month: "short" });                         // 29 Oct
/* When a note was written: "4 Nov, 3:15 pm" (another year: "4 Nov 2025, 3:15 pm"); a
   note copied from the sheet has only a day: "4 Nov". */
export function noteWhen(at){
  const d = at.length===10 ? parse(at) : new Date(at);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear()!==new Date().getFullYear() ? { year: "numeric" } : {}) });
  return at.length===10 ? day : `${day}, ${clock(`${d.getHours()}:${d.getMinutes()}`)}`;
}
export const longToday = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");

/* overdue | today | upcoming, or null when there's no due date. */
export function status(due){
  if (!due) return null;
  const d = due.slice(0, 10), t = today();
  return d < t ? "overdue" : d===t ? "today" : "upcoming";
}

const plural = (n, w) => `${n} ${w}${n===1 ? "" : "s"}`;

/* Short label for cards: "2 days late", "3:00 pm", "Today", "Tomorrow", "Sat 1 Nov". */
export function dueShort(due){
  const s = status(due), d = due.slice(0, 10), t = timeOf(due);
  if (s==="overdue") return `${plural(daysBetween(d, today()), "day")} late`;
  if (s==="today") return t ? clock(t) : "Today";
  const n = daysBetween(today(), d);
  return n===1 ? "Tomorrow" + (t ? ", " + clock(t) : "") : shortDate(d) + (t && n < 7 ? ", " + clock(t) : "");
}

/* Long label for the client page: "Due yesterday, Wed 29 Oct · 1 day late". */
export function dueLong(due){
  const s = status(due), d = due.slice(0, 10), t = timeOf(due), at = t ? ", " + clock(t) : "";
  const n = daysBetween(today(), d);
  if (s==="overdue") return `Due ${n===-1 ? "yesterday, " : ""}${shortDate(d)}${at} · ${plural(-n, "day")} late`;
  if (s==="today") return `Due today${at}`;
  return `Due ${n===1 ? "tomorrow, " : ""}${shortDate(d)}${at}`;
}

export const ordinal = n => n + (n % 10===1 && n % 100!==11 ? "st" : n % 10===2 && n % 100!==12 ? "nd" : n % 10===3 && n % 100!==13 ? "rd" : "th");
