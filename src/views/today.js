/* Today (Figma 1): overdue, due today, and coming up in the next 7 days. */
import { cachedClients, loadClients } from "../api.js";
import { addDays, longToday, status } from "../dates.js";
import { card, esc, icon } from "../ui.js";

const byDue = (a, b) => a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : 0;

function draw(root, clients){
  const open = clients.filter(c=>c.next_due).sort(byDue);
  const week = addDays(7);
  const groups = {
    overdue: open.filter(c=>status(c.next_due)==="overdue"),
    today: open.filter(c=>status(c.next_due)==="today"),
    upcoming: open.filter(c=>status(c.next_due)==="upcoming" && c.next_due.slice(0, 10) <= week),
  };
  const section = (key, title) => groups[key].length
    ? `<h2 class="section">${title} <span>${groups[key].length}</span></h2><div class="cards">${groups[key].map(card).join("")}</div>` : "";

  let body;
  if (!open.length && !clients.length){
    body = `<div class="empty">${icon("clients")}<h2>No clients yet</h2><p>Add your first enquiry and KlienKu will remind you when to follow up.</p>
      <a class="btn btn-primary" href="/clients/new" data-link>Add a client</a></div>`;
  } else if (!groups.overdue.length && !groups.today.length){
    body = `<div class="empty small">${icon("check")}<h2>All clear for today</h2><p>Nothing is due. ${groups.upcoming.length ? "Here's what's coming up." : "Nothing coming up this week either."}</p></div>` + section("upcoming", "Coming up");
  } else {
    body = section("overdue", "Overdue") + section("today", "Today") + section("upcoming", "Coming up");
  }

  root.innerHTML = `
    <header class="head"><p class="eyebrow-date">${esc(longToday())}</p><h1>Today</h1></header>
    <div class="stats">
      <div class="stat s-overdue"><b>${groups.overdue.length}</b>Overdue</div>
      <div class="stat s-today"><b>${groups.today.length}</b>Today</div>
      <div class="stat s-upcoming"><b>${groups.upcoming.length}</b>Coming up</div>
    </div>
    ${body}`;
}

export async function today(root){
  const cached = cachedClients();
  if (cached) draw(root, cached); else root.innerHTML = `<div class="loading">Loading…</div>`;
  try { draw(root, await loadClients()); }
  catch(e){ if (!cached) root.innerHTML = `<div class="empty small"><h2>Couldn't load</h2><p>${esc(e.message)}</p></div>`; }
}
