/* Today (Figma 1; Mac: Figma 7): what needs doing — overdue, due today, active leads with no
   follow-up, and coming up in the next 7 days. The numbers live on the Dashboard. On wide
   screens the list sits on the left and the chosen lead opens on the right (?c=<id> keeps
   the choice). ?s=<list> scrolls to that list. */
import { cachedClients, loadClients } from "../api.js";
import { addDays, longToday, status } from "../dates.js";
import { isActive } from "../flow.js";
import { card, esc, icon, isWide, problem } from "../ui.js";
import { leadView } from "./lead.js";

const byDue = (a, b) => a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : 0;
const newest = (a, b) => b.created_at.localeCompare(a.created_at);
/* The leads in each list. */
function groupsOf(clients){
  const active = clients.filter(isActive), dated = active.filter(c=>c.next_due).sort(byDue), week = addDays(7);
  const upcoming = dated.filter(c=>status(c.next_due)==="upcoming");
  return {
    active,
    overdue: dated.filter(c=>status(c.next_due)==="overdue"),
    today: dated.filter(c=>status(c.next_due)==="today"),
    none: active.filter(c=>!c.next_due).sort(newest),
    upcoming, soon: upcoming.filter(c=>c.next_due.slice(0, 10) <= week),
  };
}

/* Returns the leads shown, in order. */
function draw(root, clients){
  const g = groupsOf(clients);
  const section = (key, title, extra = "") => g[key].length
    ? `<h2 class="section" id="s-${key}">${title} <span>${g[key].length}</span>${extra}</h2><div class="cards">${g[key].map(card).join("")}</div>` : "";
  const later = g.upcoming.length - g.soon.length;
  const soon = section("soon", "Coming up · next 7 days", later ? `<a class="more" href="/leads" data-link>+${later} later</a>` : "");
  const counts = [g.overdue.length && `${g.overdue.length} overdue`, g.today.length && `${g.today.length} due today`,
    g.none.length && `${g.none.length} with no follow-up`].filter(Boolean).join(" · ");

  let body;
  if (!clients.length){
    body = `<div class="empty">${icon("clients")}<h2>No leads yet</h2><p>Add your first enquiry and KlienKu will remind you when to follow up.</p>
      <a class="btn btn-primary" href="/leads/new" data-link>Add a lead</a></div>`;
  } else {
    const clear = !g.overdue.length && !g.today.length
      ? `<div class="empty small">${icon("check")}<h2>All clear for today</h2><p>Nothing is due.${g.none.length ? " Some leads still need a follow-up date." : ""}</p></div>` : "";
    body = clear + section("overdue", "Overdue") + section("today", "Due today") + section("none", "No follow-up scheduled") + soon;
  }
  root.innerHTML = `<header class="head"><p class="eyebrow-date">${esc(longToday())}</p><h1>Today</h1>${counts ? `<p class="head-sub">${counts}</p>` : ""}</header>${body}`;
  return [...g.overdue, ...g.today, ...g.none, ...g.soon];
}

/* ?s=<list>: scroll to it once, then drop it from the address. */
function jumpTo(root){
  const s = new URLSearchParams(location.search).get("s");
  if (!s) return;
  const h = root.querySelector(`#s-${s}`);
  if (h) h.scrollIntoView({ block: "start" });
  const p = new URLSearchParams(location.search); p.delete("s");
  history.replaceState(history.state, "", "/" + (p.toString() ? "?" + p : ""));
}

export async function today(root, params, ctx){
  if (!isWide()) return phone(root);

  root.innerHTML = `<div class="split"><section class="listcol"></section><section class="pane"></section></div>`;
  const list = root.querySelector(".listcol"), pane = root.querySelector(".pane");
  let chosen = new URLSearchParams(location.search).get("c"), shown = [];

  const mark = () => list.querySelectorAll(".ccard").forEach(a=>a.classList.toggle("sel", a.getAttribute("href")===`/leads/${chosen}`));
  const open = id => {
    chosen = id;
    const p = new URLSearchParams(location.search);
    if (id) p.set("c", id); else p.delete("c");
    history.replaceState(history.state, "", "/" + (p.toString() ? "?" + p : ""));
    mark();
    if (id) leadView(pane, { id }, ctx, { embedded: true, onChange: refresh });
    else pane.innerHTML = `<div class="empty small"><p>Choose a lead on the left.</p></div>`;
  };
  // after a change in the pane: redraw the list from what's on this device, keep the choice
  function refresh(){ shown = draw(list, cachedClients() || []); mark(); }
  const show = (clients, first) => {
    shown = draw(list, clients);
    if (first || !chosen) open(shown.some(c=>c.id===chosen) ? chosen : (shown[0] && shown[0].id));
    else mark();
    jumpTo(list);
  };

  list.addEventListener("click", e=>{
    const a = e.target.closest(".ccard");
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    open(a.getAttribute("href").split("/").pop());
  });

  const cached = cachedClients();
  if (cached) show(cached, true); else list.innerHTML = `<div class="loading">Loading…</div>`;
  try { const fresh = await loadClients(); if (cached) refresh(); else show(fresh, true); }
  catch(e){ if (!cached) problem(list, e, ()=>today(root, params, ctx)); }
}

async function phone(root){
  root.innerHTML = `<div class="today-phone"></div>`;
  const box = root.firstChild;
  const cached = cachedClients();
  if (cached){ draw(box, cached); jumpTo(box); } else box.innerHTML = `<div class="loading">Loading…</div>`;
  try { draw(box, await loadClients()); if (!cached) jumpTo(box); }
  catch(e){ if (!cached) problem(box, e, ()=>phone(root)); }
}
