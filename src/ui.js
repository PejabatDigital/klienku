/* Small building blocks shared by the screens: escaping, icons, lead cards, toasts. */
import { dueShort } from "./dates.js";
import { isDate, leadState, statusName } from "./leads.js";

/* Mac and wide screens: sidebar layout, list and detail side by side, leads as a table. */
export const isWide = () => matchMedia("(min-width: 1024px)").matches;

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c=>({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

/* Lucide-style icons, 24px grid, drawn with currentColor. */
const PATHS = {
  today: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  clients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  offline: '<path d="M12 20h.01M8.5 16.43a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M2 2l20 20"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  search_off: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 8.5l5 5M13.5 8.5l-5 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
};
export const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;

/* A lead card for the Leads list: name, follow-up date, project · location, then the next
   action and status (closed leads: the reason). */
export function card(l){
  const s = leadState(l), closed = s==="closed" || s==="won";
  const sub = [l.type, l.location].filter(Boolean).join(" · ");
  const right = closed ? statusName(l.status) : isDate(l.follow_up) ? dueShort(l.follow_up) : "No follow-up";
  const chips = closed
    ? (l.reason ? `<span class="chip chip-stage">${esc(l.reason)}</span>` : "")
    : (l.next_action ? `<span class="chip chip-${s==="none" ? "plain" : s}">${icon("clock")}${esc(l.next_action)}</span>` : "")
      + `<span class="chip chip-stage">${esc(statusName(l.status))}</span>`;
  return `<a class="ccard s-${s}" href="/leads/${l.id}" data-link>
    <div class="ccard-top"><b>${esc(l.name || "No name")}</b><span class="due">${esc(right)}</span></div>
    ${sub ? `<div class="ccard-sub">${esc(sub)}</div>` : ""}
    ${chips ? `<div class="ccard-chips">${chips}</div>` : ""}
  </a>`;
}

/* Pills where one (or none) can be chosen; tapping the chosen one again unchooses it. */
export const pills = (name, list, value) => `<div class="chips pick-one" data-pills="${name}">${list.map(v=>
  `<button type="button" class="pill${v===value ? " on" : ""}" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div>`;
export function wirePills(root){
  root.querySelectorAll("[data-pills]").forEach(group=>group.addEventListener("click", e=>{
    const b = e.target.closest("[data-v]");
    if (!b) return;
    const on = !b.classList.contains("on");
    group.querySelectorAll("[data-v]").forEach(x=>x.classList.toggle("on", on && x===b));
  }));
  return name => { const on = root.querySelector(`[data-pills="${name}"] .on`); return on ? on.dataset.v : ""; };
}

/* When a screen can't load: offline, or something went wrong, with Try again. */
export function problem(root, e, retry){
  root.innerHTML = `<div class="empty small">${icon(e.offline ? "offline" : "alert")}
    <h2>${e.offline ? "You're offline" : "Couldn't load"}</h2>
    <p>${e.offline ? "Connect to the internet, then try again." : esc(e.message)}</p>
    <button type="button" class="btn btn-white" data-retry>Try again</button></div>`;
  root.querySelector("[data-retry]").addEventListener("click", retry);
}

/* A lead that's no longer there (deleted, or a wrong link). */
export const gone = root => { root.innerHTML = `<div class="empty small">${icon("search_off")}<h2>Lead not found</h2>
  <p>It may have been removed from the Google Sheet.</p><a class="btn btn-white" href="/leads" data-link>All leads</a></div>`; };

/* A short message at the bottom of the screen. */
export function toast(text, isError = false){
  document.querySelectorAll(".toast").forEach(t=>t.remove());
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " err" : "");
  t.textContent = text;
  t.setAttribute("role", "status");
  document.body.append(t);
  setTimeout(()=>t.classList.add("out"), 2600);
  setTimeout(()=>t.remove(), 3000);
}
