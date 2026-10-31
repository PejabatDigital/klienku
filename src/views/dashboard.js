/* Dashboard: how things stand — the numbers, leads by status, and leads added this week.
   What to do today is on Today. The follow-up numbers open Today at that list; a status
   opens Leads filtered to it. */
import { cachedClients, loadClients } from "../api.js";
import { ACTIVE_STATUSES } from "../flow.js";
import { card, esc, icon, isWide, problem } from "../ui.js";
import { groupsOf } from "./today.js";

function metrics(g){
  const tile = (key, n, label, href) => `<a class="metric m-${key}${n ? "" : " zero"}" href="${href}" data-link><b>${n}</b>${label}</a>`;
  return `<div class="metrics">
    ${tile("overdue", g.overdue.length, "Overdue", "/?s=overdue")}${tile("today", g.today.length, "Due today", "/?s=today")}
    ${tile("none", g.none.length, "No follow-up", "/?s=none")}${tile("upcoming", g.upcoming.length, "Upcoming", "/?s=soon")}
    ${tile("active", g.active.length, "Active leads", "/leads")}
    <button type="button" class="metric m-fresh${g.fresh.length ? "" : " zero"}" data-jump="fresh"><b>${g.fresh.length}</b>New this week</button>
  </div>`;
}

/* Leads by status as bars, each opening Leads filtered to it. */
function byStatus(clients, g){
  const count = key => g.active.filter(c=>c.stage===key).length, most = Math.max(1, ...ACTIVE_STATUSES.map(s=>count(s.key)));
  const won = clients.filter(c=>c.stage==="won").length, lost = clients.filter(c=>c.stage==="lost").length;
  return `<section class="box status-chart">
    <p class="label">Leads by status<span>Active ${g.active.length}</span></p>
    ${ACTIVE_STATUSES.map(s=>{ const n = count(s.key); return `<a class="bar-row${n ? "" : " zero"}" href="/leads?status=${s.key}" data-link>
      <span>${esc(s.label)}</span><i><b style="width:${Math.round(n / most * 100)}%"></b></i><em>${n}</em></a>`; }).join("")}
    <div class="bar-foot"><a href="/leads?status=won" data-link>${icon("trophy")}Won ${won}</a><a href="/leads?status=lost" data-link>${icon("archive")}Lost ${lost}</a></div>
  </section>`;
}

function draw(root, clients){
  const g = groupsOf(clients);
  const fresh = g.fresh.length ? `<div class="cards">${g.fresh.map(card).join("")}</div>` : `<div class="box"><p class="none-note">No new leads since Monday.</p></div>`;
  root.innerHTML = `<header class="head"><h1>Dashboard</h1></header>
    ${clients.length ? `${metrics(g)}
    <div class="dash-grid">
      ${byStatus(clients, g)}
      <section><h2 class="section" id="s-fresh">New this week <span>${g.fresh.length}</span></h2>${fresh}</section>
    </div>` : `<div class="empty">${icon("clients")}<h2>No leads yet</h2><p>Your numbers will show here once you add leads.</p>
      <a class="btn btn-primary" href="/leads/new" data-link>Add a lead</a></div>`}`;
}

export async function dashboard(root, params, { go }){
  root.innerHTML = `<div class="dash-page"></div>`;
  const box = root.firstChild;
  box.addEventListener("click", e=>{
    const jump = e.target.closest("[data-jump]");
    if (jump){ const h = box.querySelector(`#s-${jump.dataset.jump}`); if (h) h.scrollIntoView({ block: "start" }); return; }
    // Mac: a lead opens beside the Leads table
    const a = e.target.closest(".ccard");
    if (a && isWide()){ e.preventDefault(); e.stopPropagation(); go(`/leads?c=${a.getAttribute("href").split("/").pop()}`); }
  });
  const cached = cachedClients();
  if (cached) draw(box, cached); else box.innerHTML = `<div class="loading">Loading…</div>`;
  try { draw(box, await loadClients()); }
  catch(e){ if (!cached) problem(box, e, ()=>dashboard(root, params, { go })); }
}
