/* Today (Figma 1; Mac: Figma 7): overdue, due today, active leads with no follow-up, and
   coming up in the next 7 days. On wide screens the list sits on the left and the chosen
   lead opens on the right (?c=<id> keeps the choice). */
import { cachedClients, loadClients } from "../api.js";
import { addDays, longToday, status } from "../dates.js";
import { isActive } from "../flow.js";
import { card, esc, icon, isWide, problem } from "../ui.js";
import { leadView } from "./lead.js";

const byDue = (a, b) => a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : 0;

/* Returns the leads shown, in order. */
function draw(root, clients){
  const open = clients.filter(c=>c.next_due).sort(byDue);
  const week = addDays(7);
  const groups = {
    overdue: open.filter(c=>status(c.next_due)==="overdue"),
    today: open.filter(c=>status(c.next_due)==="today"),
    none: clients.filter(c=>isActive(c) && !c.next_due).sort((a, b)=>b.created_at.localeCompare(a.created_at)),
    upcoming: open.filter(c=>status(c.next_due)==="upcoming" && c.next_due.slice(0, 10) <= week),
  };
  const section = (key, title) => groups[key].length
    ? `<h2 class="section">${title} <span>${groups[key].length}</span></h2><div class="cards">${groups[key].map(card).join("")}</div>` : "";

  let body;
  if (!clients.length){
    body = `<div class="empty">${icon("clients")}<h2>No leads yet</h2><p>Add your first enquiry and KlienKu will remind you when to follow up.</p>
      <a class="btn btn-primary" href="/leads/new" data-link>Add a lead</a></div>`;
  } else if (!groups.overdue.length && !groups.today.length){
    body = `<div class="empty small">${icon("check")}<h2>All clear for today</h2><p>Nothing is due. ${groups.upcoming.length ? "Here's what's coming up." : "Nothing coming up this week either."}</p></div>`
      + section("none", "No follow-up scheduled") + section("upcoming", "Coming up");
  } else {
    body = section("overdue", "Overdue") + section("today", "Today") + section("none", "No follow-up scheduled") + section("upcoming", "Coming up");
  }

  root.innerHTML = `
    <header class="head"><p class="eyebrow-date">${esc(longToday())}</p><h1>Today</h1></header>
    <div class="stats">
      <div class="stat s-overdue"><b>${groups.overdue.length}</b>Overdue</div>
      <div class="stat s-today"><b>${groups.today.length}</b>Today</div>
      <div class="stat s-upcoming"><b>${groups.upcoming.length}</b>Coming up</div>
    </div>
    ${body}`;
  return [...groups.overdue, ...groups.today, ...groups.none, ...groups.upcoming];
}

export async function today(root, params, ctx){
  if (!isWide()) return phone(root);

  root.innerHTML = `<div class="split"><section class="listcol"></section><section class="pane"></section></div>`;
  const list = root.querySelector(".listcol"), pane = root.querySelector(".pane");
  let chosen = new URLSearchParams(location.search).get("c"), shown = [];

  const mark = () => list.querySelectorAll(".ccard").forEach(a=>a.classList.toggle("sel", a.getAttribute("href")===`/leads/${chosen}`));
  const open = id => {
    chosen = id;
    history.replaceState(history.state, "", id ? `/?c=${id}` : "/");
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
  const cached = cachedClients();
  if (cached) draw(root, cached); else root.innerHTML = `<div class="loading">Loading…</div>`;
  try { draw(root, await loadClients()); }
  catch(e){ if (!cached) problem(root, e, ()=>phone(root)); }
}
