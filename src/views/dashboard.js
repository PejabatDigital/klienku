/* Dashboard (Figma 18 Mac, 19 phone): how things stand. Active leads is always as of now;
   the rest counts the leads that came in during the chosen period (by created_at): total,
   win rate (Won ÷ total), won value (estimated budgets of the Won ones), and leads by
   project type. What to do today is on Today. */
import { cachedClients, loadClients } from "../api.js";
import { localDay, ymd } from "../dates.js";
import { isActive, money } from "../flow.js";
import { PROJECT_TYPES } from "../lists.js";
import { esc, icon, problem } from "../ui.js";

const PERIODS = { month: "This month", "3m": "Last 3 months", all: "All time" };
const KEY = "kk:dash-period";
let period = "month";
try { if (PERIODS[localStorage.getItem(KEY)]) period = localStorage.getItem(KEY); } catch(e){}

const fmt = (d, o) => d.toLocaleDateString("en-GB", o);
const plural = (n, word) => `${n} ${word}${n===1 ? "" : "s"}`;

/* The period's first day (YYYY-MM-DD, or "" for all time), its dates as words, and how
   the numbers describe it ("came in this month"). */
function span(clients){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), end = new Date(y, m + 1, 0);
  if (period==="all"){
    const first = clients.reduce((a, c)=>!a || c.created_at < a ? c.created_at : a, "");
    return { from: "", dates: first ? "since " + fmt(new Date(first), { day: "numeric", month: "short", year: "numeric" }) : "", came: "came in so far" };
  }
  const start = new Date(y, m - (period==="3m" ? 2 : 0), 1);
  const startText = fmt(start, start.getMonth()===m ? { day: "numeric" } : { day: "numeric", month: "short" });
  return { from: ymd(start), dates: `${startText} – ${fmt(end, { day: "numeric", month: "short", year: "numeric" })}`,
    came: period==="3m" ? "came in the last 3 months" : "came in this month" };
}

function numbers(leads, s){
  const won = leads.filter(c=>c.stage==="won"), priced = won.filter(c=>c.budget!=null);
  const rate = leads.length ? Math.round(won.length / leads.length * 100) : null;
  const value = priced.reduce((t, c)=>t + Number(c.budget), 0);
  const missing = won.length - priced.length;
  const wonNote = !won.length ? "no won projects yet"
    : missing ? `estimated, ${plural(missing, "won project")} ${missing===1 ? "has" : "have"} no budget`
    : `estimated, from ${plural(won.length, "won project")}`;
  return `<section class="box period">
    <p class="ptitle"><b>${PERIODS[period]}</b><span>${esc(s.dates)}<i> · leads that came in</i></span></p>
    <div class="pstats">
      <div><span>Total leads</span><b>${leads.length}</b><small>${s.came}</small></div>
      <div><span>Win rate</span><b>${rate==null ? "–" : rate + "%"}</b><small>${won.length} of ${leads.length} won</small>
        <i class="meter"><b style="width:${rate || 0}%"></b></i></div>
      <div class="pwon"><span>Won value</span><b>${money(value)}</b><small>${wonNote}</small></div>
    </div>
  </section>`;
}

/* Leads by project type: count and share, longest bar = the most common type. */
function byProject(leads){
  const rows = PROJECT_TYPES.map(t=>[t, leads.filter(c=>c.project_type===t).length]);
  const unset = leads.filter(c=>!PROJECT_TYPES.includes(c.project_type)).length;
  if (unset) rows.push(["Not set", unset]);
  rows.sort((a, b)=>b[1] - a[1]);   // stable: equal counts keep the list order
  const most = Math.max(1, ...rows.map(r=>r[1]));
  return `<section class="box projects">
    <p class="ptitle"><b>Leads by project</b><span>${plural(leads.length, "lead")}<i> · ${PERIODS[period].toLowerCase()}</i></span></p>
    ${rows.map(([t, n])=>`<div class="prow${n ? "" : " zero"}"><span>${esc(t)}</span>
      <i><b style="width:${Math.round(n / most * 100)}%"></b></i><em>${n}</em>
      <small>${leads.length ? Math.round(n / leads.length * 100) : 0}%</small></div>`).join("")}
  </section>`;
}

function draw(root, clients){
  if (!clients.length){
    root.innerHTML = `<header class="head"><h1>Dashboard</h1></header>
      <div class="empty">${icon("clients")}<h2>No leads yet</h2><p>Your numbers will show here once you add leads.</p>
      <a class="btn btn-primary" href="/leads/new" data-link>Add a lead</a></div>`;
    return;
  }
  const s = span(clients), leads = clients.filter(c=>localDay(c.created_at) >= s.from);
  const active = clients.filter(isActive).length;
  root.innerHTML = `<header class="head dash-head">
      <div><h1>Dashboard</h1><p class="head-sub">How your leads are doing</p></div>
      <div class="segment">${Object.entries(PERIODS).map(([k, label])=>
        `<button type="button" data-p="${k}"${k===period ? ' class="on"' : ""}>${label}</button>`).join("")}</div>
    </header>
    <div class="dash-top">
      <section class="active-card"><p><span>Active leads</span><em>Now</em></p><b>${active}</b>
        <small>Open leads still waiting for a result. End the ones that stop moving.</small></section>
      ${numbers(leads, s)}
    </div>
    ${byProject(leads)}
    <p class="dash-note">Counts the leads that came in during the period. Active leads is always as of now.</p>`;
}

export async function dashboard(root, params, ctx){
  root.innerHTML = `<div class="dash-page"></div>`;
  const box = root.firstChild;
  box.addEventListener("click", e=>{
    const b = e.target.closest("[data-p]");
    if (!b || b.dataset.p===period) return;
    period = b.dataset.p;
    try { localStorage.setItem(KEY, period); } catch(e){}
    draw(box, cachedClients() || []);
  });
  const cached = cachedClients();
  if (cached) draw(box, cached); else box.innerHTML = `<div class="loading">Loading…</div>`;
  try { draw(box, await loadClients()); }
  catch(e){ if (!cached) problem(box, e, ()=>dashboard(root, params, ctx)); }
}
