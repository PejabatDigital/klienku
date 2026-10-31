/* Small building blocks shared by the screens: escaping, icons, client cards, toasts. */
import { dueShort, status } from "./dates.js";
import { stageLabel, stepLabel } from "./flow.js";

/* Mac and wide screens: sidebar layout, list and detail side by side, clients as a table. */
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
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
};
export const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;

/* A client card for Today and the Clients list. */
export function card(c){
  const open = !!c.next_due, s = open ? status(c.next_due) : c.stage==="won" ? "won" : "closed";
  const sub = [c.need, c.area].filter(Boolean).join(" · ");
  const right = open ? dueShort(c.next_due) : (c.stage==="won" ? "Won" : c.outcome==="ended" ? "Ended" : "Lost");
  const step = open
    ? `<span class="chip chip-${s}">${icon("clock")}${esc(stepLabel(c))}</span><span class="chip chip-stage">${esc(stageLabel(c.stage))}</span>`
    : c.close_reason ? `<span class="chip chip-stage">${esc(c.close_reason)}</span>` : "";
  return `<a class="ccard s-${s}" href="/clients/${c.id}" data-link>
    <div class="ccard-top"><b>${esc(c.name)}</b><span class="due">${esc(right)}</span></div>
    ${sub ? `<div class="ccard-sub">${esc(sub)}</div>` : ""}
    ${step ? `<div class="ccard-chips">${step}</div>` : ""}
  </a>`;
}

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
