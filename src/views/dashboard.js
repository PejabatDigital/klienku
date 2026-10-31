/* Dashboard (Figma 1; Mac: Figma 7): the numbers, then the action list (overdue, due
   today, active leads with no follow-up, coming up in the next 7 days) and leads added
   this week. On wide screens the numbers and leads by status run across the top, the
   list sits on the left and the chosen lead opens on the right (?c=<id> keeps the choice). */
import { cachedClients, loadClients } from "../api.js";
import { addDays, localDay, longToday, status } from "../dates.js";
import { ACTIVE_STATUSES, isActive } from "../flow.js";
import { card, esc, icon, isWide, problem } from "../ui.js";
import { leadView } from "./lead.js";

const byDue = (a, b) => a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : 0;
const newest = (a, b) => b.created_at.localeCompare(a.created_at);
/* Monday of this week, as YYYY-MM-DD. */
const monday = () => addDays(-((new Date().getDay() + 6) % 7));

function groupsOf(clients){
  const active = clients.filter(isActive), dated = active.filter(c=>c.next_due).sort(byDue), week = addDays(7);
  const upcoming = dated.filter(c=>status(c.next_due)==="upcoming");
  return {
    active,
    overdue: dated.filter(c=>status(c.next_due)==="overdue"),
    today: dated.filter(c=>status(c.next_due)==="today"),
    none: active.filter(c=>!c.next_due).sort(newest),
    upcoming, soon: upcoming.filter(c=>c.next_due.slice(0, 10) <= week),
    fresh: clients.filter(c=>localDay(c.created_at) >= monday()).sort(newest),
  };
}

/* The numbers. Each one jumps to its list (Active leads opens Leads). */
function metrics(g){
  const tile = (key, n, label, jump) => jump===null
    ? `<a class="metric m-${key}" href="/leads" data-link><b>${n}</b>${label}</a>`
    : `<button type="button" class="metric m-${key}" data-jump="${jump}"${n ? "" : " disabled"}><b>${n}</b>${label}</button>`;
  return `<div class="metrics">
    ${tile("overdue", g.overdue.length, "Overdue", "overdue")}${tile("today", g.today.length, "Due today", "today")}
    ${tile("none", g.none.length, "No follow-up", "none")}${tile("upcoming", g.upcoming.length, "Upcoming", "soon")}
    ${tile("active", g.active.length, "Active leads", null)}${tile("fresh", g.fresh.length, "New this week", "fresh")}
  </div>`;
}

/* Leads by status: how many are at each step, each opening Leads filtered to it. */
function pipeline(clients, g){
  const count = key => g.active.filter(c=>c.stage===key).length, most = Math.max(1, ...ACTIVE_STATUSES.map(s=>count(s.key)));
  const won = clients.filter(c=>c.stage==="won").length, lost = clients.filter(c=>c.stage==="lost").length;
  return `<section class="pipeline">
    <p class="label">Leads by status<span>Won ${won} · Lost ${lost}</span></p>
    <div class="pipe">${ACTIVE_STATUSES.map(s=>{ const n = count(s.key); return `<a class="pipe-col${n ? "" : " zero"}" href="/leads?status=${s.key}" data-link>
      <b>${n}</b><i style="--h:${Math.round(n / most * 100)}%"></i><span>${esc(s.label)}</span></a>`; }).join("")}</div>
  </section>`;
}

const head = () => `<header class="head"><p class="eyebrow-date">${esc(longToday())}</p><h1>Dashboard</h1></header>`;

/* The action list and new this week; returns [html, the leads shown in order]. */
function lists(clients, g){
  const section = (key, title, extra = "") => g[key].length
    ? `<h2 class="section" id="s-${key}">${title} <span>${g[key].length}</span>${extra}</h2><div class="cards">${g[key].map(card).join("")}</div>` : "";
  if (!clients.length) return [`<div class="empty">${icon("clients")}<h2>No leads yet</h2><p>Add your first enquiry and KlienKu will remind you when to follow up.</p>
      <a class="btn btn-primary" href="/leads/new" data-link>Add a lead</a></div>`, []];
  const later = g.upcoming.length - g.soon.length;
  const soon = section("soon", "Coming up · next 7 days", later ? `<a class="more" href="/leads" data-link>+${later} later</a>` : "");
  const clear = !g.overdue.length && !g.today.length
    ? `<div class="empty small">${icon("check")}<h2>All clear for today</h2><p>Nothing is due.${g.none.length ? " Some leads still need a follow-up date." : ""}</p></div>` : "";
  const html = clear + section("overdue", "Overdue") + section("today", "Due today") + section("none", "No follow-up scheduled") + soon + section("fresh", "New this week");
  const seen = new Set(), shown = [...g.overdue, ...g.today, ...g.none, ...g.soon, ...g.fresh].filter(c=>!seen.has(c.id) && seen.add(c.id));
  return [html, shown];
}

/* Number tiles scroll to their list. */
function wireJumps(root, list){
  root.addEventListener("click", e=>{
    const b = e.target.closest("[data-jump]");
    if (!b) return;
    const h = list.querySelector(`#s-${b.dataset.jump}`);
    if (h) h.scrollIntoView({ block: "start" });
  });
}

export async function dashboard(root, params, ctx){
  if (!isWide()) return phone(root);

  root.innerHTML = `<div class="dash"><div class="dash-top"></div><div class="split"><section class="listcol"></section><section class="pane"></section></div></div>`;
  const top = root.querySelector(".dash-top"), list = root.querySelector(".listcol"), pane = root.querySelector(".pane");
  let chosen = new URLSearchParams(location.search).get("c"), shown = [];
  wireJumps(top, list);

  const mark = () => list.querySelectorAll(".ccard").forEach(a=>a.classList.toggle("sel", a.getAttribute("href")===`/leads/${chosen}`));
  const open = id => {
    chosen = id;
    history.replaceState(history.state, "", id ? `/?c=${id}` : "/");
    mark();
    if (id) leadView(pane, { id }, ctx, { embedded: true, onChange: refresh });
    else pane.innerHTML = `<div class="empty small"><p>Choose a lead on the left.</p></div>`;
  };
  const draw = clients => {
    const g = groupsOf(clients), [html, order] = lists(clients, g);
    top.innerHTML = `<div class="dash-head">${head()}</div><div class="dash-row">${metrics(g)}${pipeline(clients, g)}</div>`;
    list.innerHTML = html;
    return order;
  };
  // after a change in the pane: redraw from what's on this device, keep the choice
  function refresh(){ shown = draw(cachedClients() || []); mark(); }
  const show = (clients, first) => {
    shown = draw(clients);
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
  catch(e){ if (!cached) problem(list, e, ()=>dashboard(root, params, ctx)); }
}

async function phone(root){
  root.innerHTML = `<div class="dash-phone"></div>`;
  const box = root.firstChild;
  const draw = clients => { const g = groupsOf(clients); box.innerHTML = head() + metrics(g) + lists(clients, g)[0]; };
  wireJumps(box, box);
  const cached = cachedClients();
  if (cached) draw(cached); else box.innerHTML = `<div class="loading">Loading…</div>`;
  try { draw(await loadClients()); }
  catch(e){ if (!cached) problem(box, e, ()=>phone(root)); }
}
