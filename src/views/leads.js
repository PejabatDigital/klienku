/* Leads (Figma 2; Mac: Figma 8). Phone: search, Active / Won / Lost, status pills, cards
   grouped by status. Wide screens: one table with filters (status, project type, source,
   follow-up) and a sort; a row opens the lead in a panel on the right (?c=<id> keeps it). */
import { cachedClients, loadClients } from "../api.js";
import { ACTIVE_STATUSES, followUpText, money, statusLabel } from "../flow.js";
import { addDays, clock, dayMonth, dueShort, localDay, status, timeOf } from "../dates.js";
import { PROJECT_TYPES, SOURCES } from "../lists.js";
import { card, esc, icon, isWide, problem } from "../ui.js";
import { leadView } from "./lead.js";

const KEY = "kk:leadsView";
const BLANK = { stage: "all", type: "all", source: "all", due: "all" };
let view = { tab: "active", q: "", sort: "due", ...BLANK };
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
  added: ["Recently added", (a, b)=>b.created_at.localeCompare(a.created_at)],
  oldest: ["Oldest first", (a, b)=>a.created_at.localeCompare(b.created_at)],
  contact: ["Last contacted", (a, b)=>(b.last_contact || "").localeCompare(a.last_contact || "")],
  name: ["Name", (a, b)=>a.name.localeCompare(b.name)],
};
/* Follow-up filter (active leads only). */
const DUE = {
  overdue: ["Overdue", c=>c.next_due && status(c.next_due)==="overdue"],
  today: ["Due today", c=>c.next_due && status(c.next_due)==="today"],
  week: ["Next 7 days", c=>c.next_due && status(c.next_due)!=="overdue" && c.next_due.slice(0, 10) <= addDays(7)],
  later: ["Later", c=>c.next_due && c.next_due.slice(0, 10) > addDays(7)],
  none: ["No follow-up", c=>!c.next_due],
};

/* The table for wide screens. Columns marked "opt" hide while a lead is open beside it. */
function table(list, tab, chosen){
  const due = c => {
    if (!c.next_due) return `<span class="due-none"><i></i>No follow-up</span>`;
    const s = status(c.next_due), t = timeOf(c.next_due);
    const text = s==="today" ? (t ? "Today, " + clock(t) : "Today") : dueShort(c.next_due);
    return s==="upcoming" ? esc(text) : `<span class="due-${s}"><i></i>${esc(text)}</span>`;
  };
  const day = iso => iso ? esc(dayMonth(localDay(iso))) : "—";
  const cols = tab==="active"
    ? [["Name"], ["Project", "opt2"], ["Status"], ["Source", "opt"], ["Budget", "opt num"], ["Next follow-up"], ["What to do", "opt"], ["Last contacted", "opt"]]
    : [["Name"], ["Project", "opt2"], ["Status"], ["Source", "opt"], ["Budget", "opt num"], [tab==="lost" ? "Reason" : "", "opt"], ["Closed"], ["Last contacted", "opt"]];
  const rows = list.map(c=>{
    const cells = [`<b>${esc(c.name)}</b>`, esc([c.project_type, c.area].filter(Boolean).join(" · ")) || "—",
      `<span class="chip chip-stage">${esc(statusLabel(c.stage))}</span>`, esc(c.source) || "—", esc(money(c.budget)) || "—",
      ...(tab==="active" ? [due(c), c.next_due ? esc(followUpText(c)) : "—"] : [esc(c.close_reason || ""), day(c.closed_at)]), day(c.last_contact)];
    const muted = [1, 3, 4, 7].concat(tab==="active" ? [6] : [5]);
    return `<tr data-id="${c.id}" tabindex="0"${c.id===chosen ? ' class="sel"' : ""}>${cells.map((v, i)=>
      `<td class="${[cols[i][1] || "", muted.includes(i) ? "muted" : ""].join(" ").trim()}">${v}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="ctable"><thead><tr>${cols.map(([h, cls])=>`<th${cls ? ` class="${cls}"` : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* A filter shown as "Label: Value ⌄" over a native list. */
const filter = (name, label, value, options) => `<label class="filter${value!=="all" ? " on" : ""}">
  <span>${label}:</span> <b>${esc(value==="all" ? "All" : (options.find(o=>o[0]===value) || [, value])[1])}</b>${icon("chevron")}
  <select name="${name}"><option value="all">All</option>${options.map(([v, l])=>`<option value="${esc(v)}"${v===value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
</label>`;

/* Phone digits in local form, so "+60 12…" and "012…" match each other. */
const localDigits = s => { const d = (s || "").replace(/\D/g, ""); return d.startsWith("60") ? d.slice(1) : d; };

function matches(c, q){
  if (!q) return true;
  const t = q.toLowerCase(), digits = localDigits(q);
  return [c.name, c.project_type, c.area, c.notes].some(v=>(v || "").toLowerCase().includes(t))
    || (digits.length >= 3 && localDigits(c.phone).includes(digits));
}

/* Wide screens: everything the filters allow, sorted. */
function filtered(inTab){
  const active = view.tab==="active";
  return inTab.filter(c=>(!active || view.stage==="all" || c.stage===view.stage)
      && (view.type==="all" || c.project_type===view.type) && (view.source==="all" || c.source===view.source)
      && (!active || view.due==="all" || !DUE[view.due] || DUE[view.due][1](c)))
    .sort((SORTS[view.sort] && SORTS[view.sort][1]) || (active ? byDue : byClosed));
}
const anyFilter = () => (view.tab==="active" && (view.stage!=="all" || view.due!=="all")) || view.type!=="all" || view.source!=="all";

function drawList(root, clients, chosen){
  const found = clients.filter(c=>matches(c, view.q)), wide = isWide();
  const count = t => found.filter(c=>tabOf(c)===t).length;
  root.querySelector(".segment").innerHTML = Object.entries(TABS).map(([t, label])=>
    `<button type="button" data-tab="${t}" class="${view.tab===t ? "on" : ""}">${label} · ${count(t)}</button>`).join("");
  const inTab = found.filter(c=>tabOf(c)===view.tab), filters = root.querySelector(".filters");

  let html, list = [];
  if (wide){
    const active = view.tab==="active";
    filters.innerHTML = (active ? filter("stage", "Status", view.stage, ACTIVE_STATUSES.map(s=>[s.key, s.label])) : "")
      + filter("type", "Project", view.type, PROJECT_TYPES.map(t=>[t, t])) + filter("source", "Source", view.source, SOURCES.map(s=>[s, s]))
      + (active ? filter("due", "Follow-up", view.due, Object.entries(DUE).map(([k, [l]])=>[k, l])) : "")
      + (anyFilter() ? `<button type="button" class="link clear" data-act="clear">Clear filters</button>` : "");
    list = filtered(inTab);
    html = list.length ? table(list, view.tab, chosen) : "";
    root.querySelector(".shown").textContent = anyFilter() || view.q ? `Showing ${list.length} of ${clients.filter(c=>tabOf(c)===view.tab).length}` : "";
  } else {
    // status pills: only statuses that have leads (and the one chosen)
    filters.hidden = view.tab!=="active";
    filters.innerHTML = [{ key: "all", label: "All" }, ...ACTIVE_STATUSES].map(s=>{
      const n = s.key==="all" ? inTab.length : inTab.filter(c=>c.stage===s.key).length;
      return n || s.key==="all" || view.stage===s.key ? `<button type="button" class="pill${view.stage===s.key ? " on" : ""}" data-stage="${s.key}">${s.label} · ${n}</button>` : "";
    }).join("");
    if (view.tab==="active"){
      html = ACTIVE_STATUSES.filter(s=>view.stage==="all" || s.key===view.stage).map(s=>{
        const group = inTab.filter(c=>c.stage===s.key).sort(byDue);
        return group.length ? `<h2 class="section">${s.label} <span>${group.length}</span></h2><div class="cards">${group.map(card).join("")}</div>` : "";
      }).join("");
    } else {
      const group = inTab.sort(byClosed);
      html = group.length ? `<div class="cards">${group.map(card).join("")}</div>` : "";
    }
  }
  root.querySelector(".list").innerHTML = html || `<div class="empty small"><p>${
    view.q ? `No leads match “${esc(view.q)}”.` : !clients.length ? (wide ? "No leads yet. Use Add lead to add your first." : "No leads yet. Tap + to add your first.")
      : wide && anyFilter() ? "No leads match these filters." : "Nothing here yet."}</p></div>`;
  const active = clients.filter(c=>tabOf(c)==="active").length;
  root.querySelector(".total").textContent = wide ? `${active} active` : `${clients.length} total`;
  return list;
}

export async function leadsView(root, params, ctx){
  const { go } = ctx;
  // /leads?status=<key> (from the Dashboard): show that status, nothing else filtered
  const asked = new URLSearchParams(location.search).get("status");
  if (asked){
    if (ACTIVE_STATUSES.some(s=>s.key===asked)) Object.assign(view, BLANK, { tab: "active", stage: asked, q: "" });
    else if (asked==="won" || asked==="lost") Object.assign(view, BLANK, { tab: asked, q: "" });
    keep();
    history.replaceState(history.state, "", "/leads");
  }
  const wide = isWide();
  const search = `<label class="search">${icon("search")}<input type="search" placeholder="Search name, phone or project" value="${esc(view.q)}" autocomplete="off"></label>`;
  root.innerHTML = wide ? `<div class="lwrap"><div class="lmain">
    <header class="head row"><div><h1>Leads</h1><span class="total"></span></div>${search}</header>
    <div class="controls"><div class="segment"></div>
      <label class="sort">Sort: <b>${SORTS[view.sort] ? SORTS[view.sort][0] : "Follow-up date"}</b>${icon("chevron")}
        <select name="sort">${Object.entries(SORTS).map(([k, [label]])=>`<option value="${k}"${k===view.sort ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>
    <div class="filters"></div><p class="shown"></p>
    <div class="list"><div class="loading">Loading…</div></div></div><aside class="lpane" hidden></aside></div>` : `<div class="lwrap">
    <header class="head row"><h1>Leads</h1><span class="total"></span></header>
    ${search}
    <div class="segment"></div>
    <div class="filters chips scroll"></div>
    <div class="list"><div class="loading">Loading…</div></div></div>`;
  const box = root.firstElementChild, pane = root.querySelector(".lpane");
  let clients = cachedClients() || [], chosen = wide ? new URLSearchParams(location.search).get("c") : null;
  const redraw = () => drawList(root, clients, chosen);

  /* Wide screens: open a lead beside the table, or close it. */
  const open = id => {
    chosen = id;
    history.replaceState(history.state, "", id ? `/leads?c=${id}` : "/leads");
    box.classList.toggle("open", !!id);
    pane.hidden = !id;
    root.querySelectorAll("tr[data-id]").forEach(r=>r.classList.toggle("sel", r.dataset.id===id));
    if (id) leadView(pane, { id }, ctx, { embedded: true, onChange: ()=>{ clients = cachedClients() || clients; redraw(); }, onClose: ()=>open(null) });
  };

  box.querySelector(".search input").addEventListener("input", e=>{ view.q = e.target.value.trim(); keep(); redraw(); });
  box.addEventListener("click", e=>{
    const t = e.target.closest("[data-tab]"), s = e.target.closest("[data-stage]"), row = e.target.closest("tr[data-id]");
    if (t){ view.tab = t.dataset.tab; view.stage = "all"; view.due = "all"; keep(); redraw(); }
    if (s){ view.stage = s.dataset.stage; keep(); redraw(); }
    if (e.target.closest('[data-act="clear"]')){ Object.assign(view, BLANK); keep(); redraw(); }
    if (row) wide ? open(row.dataset.id===chosen ? null : row.dataset.id) : go(`/leads/${row.dataset.id}`);
  });
  box.addEventListener("keydown", e=>{
    const row = e.target.closest("tr[data-id]");
    if (row && e.key==="Enter") wide ? open(row.dataset.id) : go(`/leads/${row.dataset.id}`);
    if (e.key==="Escape" && chosen && !document.querySelector(".layer")) open(null);
  });
  box.addEventListener("change", e=>{
    const el = e.target;
    if (el.name==="sort"){ view.sort = el.value; el.parentElement.querySelector("b").textContent = SORTS[view.sort][0]; }
    else if (el.closest(".filter")) view[el.name] = el.value;
    else return;
    keep(); redraw();
  });

  if (cachedClients()) redraw();
  if (chosen) open(chosen);
  try { clients = await loadClients(); redraw(); }
  catch(e){ if (!cachedClients()) problem(root.querySelector(".list"), e, ()=>leadsView(root, params, ctx)); }
}
