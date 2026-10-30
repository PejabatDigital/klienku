/* KlienKu app: signed-out → /signin; otherwise a small router over the screens.
   /  Today · /clients  list · /clients/new  add · /clients/:id  detail ·
   /clients/:id/edit  edit · /settings */
import { registerSW } from "./pwa.js";
import { currentUser } from "./account.js";
import { closeSheet } from "./sheets.js";
import { today } from "./views/today.js";
import { clientsView } from "./views/clients.js";
import { clientView } from "./views/client.js";
import { addView, editView } from "./views/form.js";
import { settingsView } from "./views/settings.js";

const view = document.getElementById("view");
const tabbar = document.getElementById("tabbar"), fab = document.getElementById("fab");

const ROUTES = [
  [/^\/$/, today, { tabs: true, fab: true }],
  [/^\/clients$/, clientsView, { tabs: true, fab: true }],
  [/^\/clients\/new$/, addView, {}],
  [/^\/clients\/([\w-]+)\/edit$/, editView, {}],
  [/^\/clients\/([\w-]+)$/, clientView, {}],
  [/^\/settings$/, settingsView, { tabs: true }],
];

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
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const hit = ROUTES.map(([re, fn, opts])=>({ m: re.exec(path), fn, opts })).find(r=>r.m);
  if (!hit) return go("/", { replace: true });
  tabbar.hidden = !hit.opts.tabs;
  fab.hidden = !hit.opts.fab;
  document.body.classList.toggle("has-tabs", !!hit.opts.tabs);
  tabbar.querySelectorAll("[data-tab]").forEach(a=>a.classList.toggle("on", a.dataset.tab===path));
  view.scrollTop = 0; window.scrollTo(0, 0);
  hit.fn(view, { id: hit.m[1] }, { go, back });
}

document.addEventListener("click", e=>{
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const path = new URL(a.href).pathname;
  if (path===location.pathname && a.closest(".tabbar")) return render();
  go(path);
});
window.addEventListener("popstate", e=>{ depth = (e.state && e.state.depth) || 0; render(); });
// coming back to the app later: refresh what's due
document.addEventListener("visibilitychange", ()=>{
  if (document.visibilityState==="visible" && (location.pathname==="/" || location.pathname==="/clients") && !document.querySelector(".layer")) render();
});

async function start(){
  registerSW();
  const user = await currentUser();
  if (!user) return location.replace("/signin");
  depth = (history.state && history.state.depth) || 0;
  render();
}
start();
