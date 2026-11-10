/* KlienKu app: signed-out → /signin; otherwise a small router over the screens.
   / (and /leads)  the leads from the Google Sheet · /leads/:id  a lead's profile ·
   /settings (+ /account, /about). Old links (/dashboard, /clients…) go to the leads.
   Wide screens (≥ 1024 px, see isWide) get the sidebar instead of the tab bar. */
import { registerSW } from "./pwa.js";
import { currentUser } from "./account.js";
import { closeSheet } from "./sheets.js";
import { cachedSheet } from "./api.js";
import { isClosed } from "./leads.js";
import { icon, isWide } from "./ui.js";
import { leadsView } from "./views/leads.js";
import { leadView } from "./views/lead.js";
import { settingsView } from "./views/settings.js";

const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar"), side = document.getElementById("side");

const ROUTES = [
  [/^\/(?:leads)?$/, leadsView, { tabs: true }],
  [/^\/leads\/([\w-]+)$/, leadView, {}],
  [/^\/settings(?:\/(account|about))?$/, settingsView, { tabs: true }],
  [/./, notFound, {}],
];

function notFound(root){
  root.innerHTML = `<div class="empty">${icon("search_off")}<h2>Page not found</h2>
    <p>This page doesn't exist. It may be an old or mistyped link.</p><a class="btn btn-primary" href="/" data-link>Go to Leads</a></div>`;
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
  if (/^\/(clients|dashboard|leads\/new)(\/|$)|\/edit$|^\/settings\/notifications$/.test(location.pathname))
    history.replaceState(history.state, "", location.pathname.startsWith("/settings") ? "/settings" : "/");
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const hit = ROUTES.map(([re, fn, opts])=>({ m: re.exec(path), fn, opts })).find(r=>r.m);
  const wide = isWide();
  document.body.classList.toggle("wide", wide);
  tabbar.hidden = wide || !hit.opts.tabs;
  document.body.classList.toggle("has-tabs", !wide && !!hit.opts.tabs);
  const section = path.startsWith("/settings") ? "/settings" : path==="/" || path.startsWith("/leads") ? "/" : path;
  tabbar.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("on", a.dataset.tab===section));
  side.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("on", a.dataset.tab===section));
  view.className = "view v-" + (path==="/" || path==="/leads" ? "leads" : path.startsWith("/settings") ? "settings" : "page");
  view.scrollTop = 0; window.scrollTo(0, 0);
  hit.fn(view, { id: hit.m[1] }, { go, back });
  sideCounts();
}

/* Sidebar: active leads, and the link to the Google Sheet. */
function sideCounts(){
  const sheet = cachedSheet(), foot = document.getElementById("sideSheet");
  document.getElementById("countLeads").textContent = sheet ? sheet.leads.filter(l=>!isClosed(l)).length || "" : "";
  if (sheet){ foot.href = sheet.sheet_url; foot.hidden = false; }
}
window.addEventListener("klienku:leads", sideCounts);
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
// coming back to the app later: refresh the list (the sheet may have changed)
document.addEventListener("visibilitychange", ()=>{
  if (document.visibilityState==="visible" && ["/", "/leads"].includes(location.pathname) && !document.querySelector(".layer")) render();
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
}
start();
