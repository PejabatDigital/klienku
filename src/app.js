/* KlienKu app: signed-out → /signin; otherwise a small router over the screens.
   /  Today · /dashboard · /leads  list · /leads/new  add · /leads/:id  detail ·
   /leads/:id/edit  edit · /settings  (old /clients… links go to /leads…)
   Wide screens (≥ 1024 px, see isWide) get the sidebar instead of the tab bar and + button. */
import { registerSW } from "./pwa.js";
import { refreshDevice } from "./push.js";
import { maybeShowSetup } from "./views/setup.js";
import { currentUser } from "./account.js";
import { closeSheet } from "./sheets.js";
import { cachedClients, loadSettings } from "./api.js";
import { clock, status } from "./dates.js";
import { isActive } from "./flow.js";
import { icon, isWide } from "./ui.js";
import { today } from "./views/today.js";
import { dashboard } from "./views/dashboard.js";
import { leadsView } from "./views/leads.js";
import { leadView } from "./views/lead.js";
import { addView, editView } from "./views/form.js";
import { settingsView } from "./views/settings.js";

const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar"), fab = document.getElementById("fab"), side = document.getElementById("side");

const ROUTES = [
  [/^\/$/, today, { tabs: true, fab: true }],
  [/^\/dashboard$/, dashboard, { tabs: true, fab: true }],
  [/^\/leads$/, leadsView, { tabs: true, fab: true }],
  [/^\/leads\/new$/, addView, {}],
  [/^\/leads\/([\w-]+)\/edit$/, editView, {}],
  [/^\/leads\/([\w-]+)$/, leadView, {}],
  [/^\/settings$/, settingsView, { tabs: true }],
  [/./, notFound, {}],
];

function notFound(root){
  root.innerHTML = `<div class="empty">${icon("search_off")}<h2>Page not found</h2>
    <p>This page doesn't exist. It may be an old or mistyped link.</p><a class="btn btn-primary" href="/" data-link>Go to Today</a></div>`;
}

let depth = 0; // how many in-app pages are behind this one, so Back can use history

/* Go to an in-app path. `replace` swaps the current page instead of adding one. */
function go(path, { replace = false } = {}){
  const state = { depth: replace ? depth : depth + 1, from: location.pathname };
  if (replace) history.replaceState(state, "", path); else history.pushState(state, "", path);
  depth = state.depth;
  render();
}
/* Back to the previous in-app page, or to `fallback` when opened directly. */
function back(fallback){
  if (depth > 0) history.back(); else go(fallback, { replace: true });
}

function render(){
  closeSheet();
  if (/^\/clients(\/|$)/.test(location.pathname)) history.replaceState(history.state, "", location.pathname.replace("/clients", "/leads") + location.search);
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const hit = ROUTES.map(([re, fn, opts])=>({ m: re.exec(path), fn, opts })).find(r=>r.m);
  const wide = isWide();
  document.body.classList.toggle("wide", wide);
  tabbar.hidden = wide || !hit.opts.tabs;
  fab.hidden = wide || !hit.opts.fab;
  document.body.classList.toggle("has-tabs", !wide && !!hit.opts.tabs);
  tabbar.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("on", a.dataset.tab===path));
  // a lead page opened from Today or the Dashboard keeps that item lit in the sidebar
  const from = history.state && history.state.from;
  const section = path.startsWith("/leads/") && (from==="/" || from==="/dashboard") ? from : path.startsWith("/leads") ? "/leads" : path;
  side.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("on", a.dataset.tab===section));
  view.className = "view v-" + (path==="/" ? "today" : path==="/dashboard" ? "dash" : path==="/leads" ? "leads" : path==="/settings" ? "settings" : "page");
  view.scrollTop = 0; window.scrollTo(0, 0);
  hit.fn(view, { id: hit.m[1] }, { go, back });
  sideCounts();
}

/* Sidebar badges (due now, active leads) and the morning summary note. */
function sideCounts(){
  const clients = cachedClients() || [];
  const due = clients.filter(c=>c.next_due && status(c.next_due)!=="upcoming").length;
  document.getElementById("countToday").textContent = due || "";
  document.getElementById("countLeads").textContent = clients.filter(isActive).length || "";
  loadSettings().then(s=>{
    const foot = document.getElementById("sideSummary");
    foot.querySelector("span").textContent = s.morning_summary ? `Morning summary at ${clock(s.summary_time)}` : "Morning summary off";
    foot.hidden = false;
  }).catch(()=>{});
}
window.addEventListener("klienku:clients", sideCounts);
window.addEventListener("klienku:settings", sideCounts);
matchMedia("(min-width: 1024px)").addEventListener("change", ()=>{ if (!document.querySelector(".layer")) render(); });

document.addEventListener("click", e=>{
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const url = new URL(a.href), path = url.pathname;
  if (path===location.pathname && a.closest(".tabbar, .side")) return render();
  go(path + url.search);
});
window.addEventListener("popstate", e=>{ depth = (e.state && e.state.depth) || 0; render(); });
// coming back to the app later: refresh what's due
document.addEventListener("visibilitychange", ()=>{
  if (document.visibilityState==="visible" && ["/", "/dashboard", "/leads"].includes(location.pathname) && !document.querySelector(".layer")) render();
});

/* Offline: a note at the top; back online: refresh what's on screen. */
function connection(){
  const offline = !navigator.onLine, bar = document.getElementById("offlineBar"), was = !bar.hidden;
  bar.hidden = !offline;
  document.body.classList.toggle("is-offline", offline);
  if (was && !offline && !document.querySelector(".layer")) render();
}
window.addEventListener("online", connection);
window.addEventListener("offline", connection);

async function start(){
  registerSW();
  const user = await currentUser();
  if (!user) return location.replace("/signin");
  depth = (history.state && history.state.depth) || 0;
  render();
  connection();
  refreshDevice();
  maybeShowSetup();
}
start();
