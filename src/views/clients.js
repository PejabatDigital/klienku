/* Clients (Figma 2): search, Open / Won / Closed, stage filter, cards grouped by stage. */
import { cachedClients, loadClients } from "../api.js";
import { STAGES } from "../flow.js";
import { card, esc, icon } from "../ui.js";

const KEY = "kk:clientsView";
let view = { tab: "open", stage: "all", q: "" };
try { view = { ...view, ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch(e){}
const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(view)); } catch(e){} };

const tabOf = c => c.stage==="won" ? "won" : c.stage==="closed" ? "closed" : "open";
const byDue = (a, b) => a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : 0;
const byClosed = (a, b) => (b.closed_at || "").localeCompare(a.closed_at || "");

/* Phone digits in local form, so "+60 12…" and "012…" match each other. */
const localDigits = s => { const d = (s || "").replace(/\D/g, ""); return d.startsWith("60") ? d.slice(1) : d; };

function matches(c, q){
  if (!q) return true;
  const t = q.toLowerCase(), digits = localDigits(q);
  return [c.name, c.need, c.area].some(v=>(v || "").toLowerCase().includes(t))
    || (digits.length >= 3 && localDigits(c.phone).includes(digits));
}

function drawList(root, clients){
  const found = clients.filter(c=>matches(c, view.q));
  const count = t => found.filter(c=>tabOf(c)===t).length;
  root.querySelector(".segment").innerHTML = ["open", "won", "closed"].map(t=>
    `<button type="button" data-tab="${t}" class="${view.tab===t ? "on" : ""}">${t[0].toUpperCase() + t.slice(1)} · ${count(t)}</button>`).join("");

  const inTab = found.filter(c=>tabOf(c)===view.tab);
  const filters = root.querySelector(".filters");
  filters.hidden = view.tab!=="open";
  filters.innerHTML = [{ key: "all", label: "All" }, ...STAGES].map(s=>{
    const n = s.key==="all" ? inTab.length : inTab.filter(c=>c.stage===s.key).length;
    return `<button type="button" class="pill${view.stage===s.key ? " on" : ""}" data-stage="${s.key}">${s.label} · ${n}</button>`;
  }).join("");

  let html;
  if (view.tab==="open"){
    const stages = STAGES.filter(s=>view.stage==="all" || s.key===view.stage);
    html = stages.map(s=>{
      const list = inTab.filter(c=>c.stage===s.key).sort(byDue);
      return list.length ? `<h2 class="section">${s.label} <span>${list.length}</span></h2><div class="cards">${list.map(card).join("")}</div>` : "";
    }).join("");
  } else {
    const list = inTab.sort(byClosed);
    html = list.length ? `<div class="cards">${list.map(card).join("")}</div>` : "";
  }
  root.querySelector(".list").innerHTML = html || `<div class="empty small"><p>${
    view.q ? `No clients match “${esc(view.q)}”.` : !clients.length ? "No clients yet. Tap + to add your first." : `Nothing here yet.`}</p></div>`;
  root.querySelector(".total").textContent = `${clients.length} total`;
}

export async function clientsView(root){
  root.innerHTML = `
    <header class="head row"><h1>Clients</h1><span class="total"></span></header>
    <label class="search">${icon("search")}<input type="search" placeholder="Search name or phone" value="${esc(view.q)}" autocomplete="off"></label>
    <div class="segment"></div>
    <div class="filters chips scroll"></div>
    <div class="list"><div class="loading">Loading…</div></div>`;
  let clients = cachedClients() || [];
  const redraw = () => drawList(root, clients);
  root.querySelector(".search input").addEventListener("input", e=>{ view.q = e.target.value.trim(); keep(); redraw(); });
  root.addEventListener("click", e=>{
    const t = e.target.closest("[data-tab]"), s = e.target.closest("[data-stage]");
    if (t){ view.tab = t.dataset.tab; view.stage = "all"; keep(); redraw(); }
    if (s){ view.stage = s.dataset.stage; keep(); redraw(); }
  });
  if (cachedClients()) redraw();
  try { clients = await loadClients(); redraw(); }
  catch(e){ if (!cachedClients()) root.querySelector(".list").innerHTML = `<div class="empty small"><p>${esc(e.message)}</p></div>`; }
}
