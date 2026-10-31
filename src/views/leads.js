/* Leads (Figma 2; Mac: Figma 8): search, Active / Won / Lost, status filter. Phone: cards
   grouped by status. Wide screens: one compact table, sorted by follow-up date (or as chosen). */
import { cachedClients, loadClients } from "../api.js";
import { ACTIVE_STATUSES, followUpText, statusLabel } from "../flow.js";
import { clock, dayMonth, dueShort, localDay, status, timeOf } from "../dates.js";
import { card, esc, icon, isWide, problem } from "../ui.js";

const KEY = "kk:leadsView";
let view = { tab: "active", stage: "all", q: "", sort: "due" };
try { view = { ...view, ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch(e){}
if (!["active", "won", "lost"].includes(view.tab)) view.tab = "active";
const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(view)); } catch(e){} };

const TABS = { active: "Active", won: "Won", lost: "Lost" };
const tabOf = c => c.stage==="won" || c.stage==="lost" ? c.stage : "active";
/* Leads with no follow-up first (they need one), then by date. */
const byDue = (a, b) => !a.next_due || !b.next_due ? (a.next_due ? 1 : 0) - (b.next_due ? 1 : 0) : a.next_due < b.next_due ? -1 : a.next_due > b.next_due ? 1 : 0;
const byClosed = (a, b) => (b.closed_at || "").localeCompare(a.closed_at || "");

const SORTS = {
  due: ["Follow-up date", null],
  name: ["Name", (a, b)=>a.name.localeCompare(b.name)],
  contact: ["Last contacted", (a, b)=>(b.last_contact || "").localeCompare(a.last_contact || "")],
  added: ["Recently added", (a, b)=>b.created_at.localeCompare(a.created_at)],
};

/* The table for wide screens. Active: status and follow-up; won / lost: how it ended. */
function table(list, tab){
  const due = c => {
    if (!c.next_due) return `<span class="due-none"><i></i>No follow-up</span>`;
    const s = status(c.next_due), t = timeOf(c.next_due);
    const text = s==="today" ? (t ? "Today, " + clock(t) : "Today") : dueShort(c.next_due);
    return s==="upcoming" ? esc(text) : `<span class="due-${s}"><i></i>${esc(text)}</span>`;
  };
  const last = c => c.last_contact ? esc(dayMonth(localDay(c.last_contact))) : "—";
  const head = tab==="active"
    ? ["Name", "Project", "Status", "Next follow-up", "What to do", "Last contacted"]
    : ["Name", "Project", "Status", tab==="lost" ? "Reason" : "", "Closed", "Last contacted"];
  const rows = list.map(c=>{
    const project = esc([c.project_type, c.area].filter(Boolean).join(" · ")) || "—";
    const cells = tab==="active"
      ? [due(c), c.next_due ? esc(followUpText(c)) : "—"]
      : [esc(c.close_reason || ""), c.closed_at ? esc(dayMonth(localDay(c.closed_at))) : "—"];
    return `<tr data-id="${c.id}" tabindex="0"><td><b>${esc(c.name)}</b></td><td class="muted">${project}</td>
      <td><span class="chip chip-stage">${esc(statusLabel(c.stage))}</span></td><td>${cells[0]}</td><td${tab==="active" ? "" : ' class="muted"'}>${cells[1]}</td><td class="muted">${last(c)}</td></tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="ctable"><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* Phone digits in local form, so "+60 12…" and "012…" match each other. */
const localDigits = s => { const d = (s || "").replace(/\D/g, ""); return d.startsWith("60") ? d.slice(1) : d; };

function matches(c, q){
  if (!q) return true;
  const t = q.toLowerCase(), digits = localDigits(q);
  return [c.name, c.project_type, c.area, c.notes].some(v=>(v || "").toLowerCase().includes(t))
    || (digits.length >= 3 && localDigits(c.phone).includes(digits));
}

function drawList(root, clients){
  const found = clients.filter(c=>matches(c, view.q));
  const count = t => found.filter(c=>tabOf(c)===t).length;
  root.querySelector(".segment").innerHTML = Object.entries(TABS).map(([t, label])=>
    `<button type="button" data-tab="${t}" class="${view.tab===t ? "on" : ""}">${label} · ${count(t)}</button>`).join("");

  const inTab = found.filter(c=>tabOf(c)===view.tab);
  // status pills: only statuses that have leads (and the one chosen)
  const filters = root.querySelector(".filters");
  filters.hidden = view.tab!=="active";
  filters.innerHTML = [{ key: "all", label: "All" }, ...ACTIVE_STATUSES].map(s=>{
    const n = s.key==="all" ? inTab.length : inTab.filter(c=>c.stage===s.key).length;
    return n || s.key==="all" || view.stage===s.key ? `<button type="button" class="pill${view.stage===s.key ? " on" : ""}" data-stage="${s.key}">${s.label} · ${n}</button>` : "";
  }).join("");

  let html;
  const sorter = SORTS[view.sort] && SORTS[view.sort][1];
  if (isWide()){
    const list = inTab.filter(c=>view.tab!=="active" || view.stage==="all" || c.stage===view.stage)
      .sort(sorter || (view.tab==="active" ? byDue : byClosed));
    html = list.length ? table(list, view.tab) : "";
  } else if (view.tab==="active"){
    const stages = ACTIVE_STATUSES.filter(s=>view.stage==="all" || s.key===view.stage);
    html = stages.map(s=>{
      const list = inTab.filter(c=>c.stage===s.key).sort(byDue);
      return list.length ? `<h2 class="section">${s.label} <span>${list.length}</span></h2><div class="cards">${list.map(card).join("")}</div>` : "";
    }).join("");
  } else {
    const list = inTab.sort(byClosed);
    html = list.length ? `<div class="cards">${list.map(card).join("")}</div>` : "";
  }
  root.querySelector(".list").innerHTML = html || `<div class="empty small"><p>${
    view.q ? `No leads match “${esc(view.q)}”.` : !clients.length ? (isWide() ? "No leads yet. Use Add lead to add your first." : "No leads yet. Tap + to add your first.") : `Nothing here yet.`}</p></div>`;
  const active = clients.filter(c=>tabOf(c)==="active").length;
  root.querySelector(".total").textContent = isWide() ? `${active} active` : `${clients.length} total`;
}

export async function leadsView(root, params, { go }){
  const search = `<label class="search">${icon("search")}<input type="search" placeholder="Search name, phone or project" value="${esc(view.q)}" autocomplete="off"></label>`;
  root.innerHTML = isWide() ? `
    <header class="head row"><div><h1>Leads</h1><span class="total"></span></div>${search}</header>
    <div class="controls"><div class="segment"></div><div class="filters chips"></div>
      <label class="sort">Sort: <b>${SORTS[view.sort] ? SORTS[view.sort][0] : "Follow-up date"}</b>${icon("chevron")}
        <select name="sort">${Object.entries(SORTS).map(([k, [label]])=>`<option value="${k}"${k===view.sort ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>
    <div class="list"><div class="loading">Loading…</div></div>` : `
    <header class="head row"><h1>Leads</h1><span class="total"></span></header>
    ${search}
    <div class="segment"></div>
    <div class="filters chips scroll"></div>
    <div class="list"><div class="loading">Loading…</div></div>`;
  let clients = cachedClients() || [];
  const redraw = () => drawList(root, clients);
  root.querySelector(".search input").addEventListener("input", e=>{ view.q = e.target.value.trim(); keep(); redraw(); });
  root.addEventListener("click", e=>{
    const t = e.target.closest("[data-tab]"), s = e.target.closest("[data-stage]"), row = e.target.closest("tr[data-id]");
    if (t){ view.tab = t.dataset.tab; view.stage = "all"; keep(); redraw(); }
    if (s){ view.stage = s.dataset.stage; keep(); redraw(); }
    if (row) go(`/leads/${row.dataset.id}`);
  });
  root.addEventListener("keydown", e=>{ const row = e.target.closest("tr[data-id]"); if (row && e.key==="Enter") go(`/leads/${row.dataset.id}`); });
  const sort = root.querySelector("[name=sort]");
  if (sort) sort.addEventListener("change", ()=>{ view.sort = sort.value; keep(); sort.parentElement.querySelector("b").textContent = SORTS[view.sort][0]; redraw(); });
  if (cachedClients()) redraw();
  try { clients = await loadClients(); redraw(); }
  catch(e){ if (!cachedClients()) problem(root.querySelector(".list"), e, ()=>leadsView(root, params, { go })); }
}
