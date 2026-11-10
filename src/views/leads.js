/* Leads, from the Google Sheet (Figma 2; Mac: Figma 8). Phone: search, Active / Closed,
   status pills, cards grouped by status. Wide screens: one table with filters (status,
   project type, source) and a sort; a row opens the lead in a panel on the right
   (?c=<id> keeps it). Opens with what's saved on the device, then refreshes. */
import { cachedSheet, loadSheet } from "../api.js";
import { dayMonth, dueShort, status } from "../dates.js";
import { byFollowUp, isClosed, isDate, statusList, statusName } from "../leads.js";
import { card, esc, icon, isWide, problem, toast } from "../ui.js";
import { leadView } from "./lead.js";

const KEY = "kk:leadsView";
const BLANK = { stage: "all", type: "all", source: "all" };
let view = { tab: "active", q: "", sort: "due", ...BLANK };
try { view = { ...view, ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch(e){}
if (!["active", "closed"].includes(view.tab)) view.tab = "active";
const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(view)); } catch(e){} };

const TABS = { active: "Active", closed: "Closed" };
const tabOf = l => isClosed(l) ? "closed" : "active";
const byContact = (a, b) => (b.last_contacted || "").localeCompare(a.last_contacted || "");

const SORTS = {
  due: ["Follow-up date", byFollowUp],
  added: ["Recently added", (a, b)=>(b.added || "").localeCompare(a.added || "")],
  oldest: ["Oldest first", (a, b)=>(a.added || "").localeCompare(b.added || "")],
  contact: ["Last contacted", byContact],
  name: ["Name", (a, b)=>(a.name || "").localeCompare(b.name || "")],
};

/* A sheet date as "4 Nov"; text the sheet couldn't read as a date is shown as it is. */
const shown = v => isDate(v) ? dayMonth(v) : v;

/* The table for wide screens. Columns marked "opt" hide while a lead is open beside it. */
function table(list, tab, chosen){
  const due = l => {
    if (!isDate(l.follow_up)) return l.follow_up ? esc(l.follow_up) : `<span class="due-none"><i></i>No follow-up</span>`;
    const s = status(l.follow_up), text = s==="today" ? "Today" : dueShort(l.follow_up);
    return s==="upcoming" ? esc(text) : `<span class="due-${s}"><i></i>${esc(text)}</span>`;
  };
  // [heading, classes, cell]; "muted" greys the text, "clip" cuts long text short
  const name = ["Name", "nw", l=>`<b>${esc(l.name || "No name")}</b>`];
  const stage = ["Status", "nw", l=>`<span class="chip chip-stage">${esc(statusName(l.status))}</span>`];
  const rest = [["Project", "opt2 muted clip short", l=>esc(l.type) || "—"], ["Location", "opt muted clip short", l=>esc(l.location) || "—"],
    ["What they want", "opt muted clip mid", l=>esc(l.want) || "—"]];
  const last = ["Last contact", "opt muted", l=>esc(shown(l.last_contacted)) || "—"];
  const cols = tab==="active"
    ? [name, stage, ["Follow-up", "nw", due], ["Next action", "clip", l=>esc(l.next_action) || "—"], ...rest, last]
    : [name, stage, ["Reason", "clip", l=>esc(l.reason) || "—"], ...rest, [last[0], "muted", last[2]]];
  const rows = list.map(l=>`<tr data-id="${esc(l.id)}" tabindex="0"${l.id===chosen ? ' class="sel"' : ""}>${
    cols.map(([, cls, cell])=>`<td${cls ? ` class="${cls}"` : ""}>${cell(l)}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table class="ctable"><thead><tr>${cols.map(([h, cls])=>`<th${cls ? ` class="${cls.replace(/ ?(muted|clip|short|mid|nw)/g, "")}"` : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* A filter shown as "Label: Value ⌄" over a native list. */
const filter = (name, label, value, options) => `<label class="filter${value!=="all" ? " on" : ""}">
  <span>${label}:</span> <b>${esc(value==="all" ? "All" : statusName(value))}</b>${icon("chevron")}
  <select name="${name}"><option value="all">All</option>${options.map(v=>`<option value="${esc(v)}"${v===value ? " selected" : ""}>${esc(statusName(v))}</option>`).join("")}</select>
</label>`;

/* Phone digits in local form, so "+60 12…" and "012…" match each other. */
const localDigits = s => { const d = (s || "").replace(/\D/g, ""); return d.startsWith("60") ? d.slice(1) : d; };

function matches(l, q){
  if (!q) return true;
  const t = q.toLowerCase(), digits = localDigits(q);
  return [l.name, l.type, l.location, l.want, l.next_action, l.reason, l.notes, l.phone].some(v=>(v || "").toLowerCase().includes(t))
    || (digits.length >= 3 && localDigits(l.phone).includes(digits));
}
const anyFilter = () => (view.tab==="active" && view.stage!=="all") || view.type!=="all" || view.source!=="all";

function drawList(root, sheet, chosen){
  const leads = sheet.leads, found = leads.filter(l=>matches(l, view.q)), wide = isWide();
  const count = t => found.filter(l=>tabOf(l)===t).length;
  root.querySelector(".segment").innerHTML = Object.entries(TABS).map(([t, label])=>
    `<button type="button" data-tab="${t}" class="${view.tab===t ? "on" : ""}">${label} · ${count(t)}</button>`).join("");
  const inTab = found.filter(l=>tabOf(l)===view.tab), filters = root.querySelector(".filters");
  const active = view.tab==="active";
  const stages = statusList(sheet).filter(s=>!isClosed({ status: s }));

  let html, list = [];
  if (wide){
    const used = key => [...new Set([...(sheet.lists[key] || []), ...leads.map(l=>l[key]).filter(Boolean)])];
    filters.innerHTML = (active ? filter("stage", "Status", view.stage, stages) : "")
      + filter("type", "Project", view.type, used("type")) + filter("source", "Source", view.source, used("source"))
      + (anyFilter() ? `<button type="button" class="link clear" data-act="clear">Clear filters</button>` : "");
    list = inTab.filter(l=>(!active || view.stage==="all" || l.status===view.stage)
      && (view.type==="all" || l.type===view.type) && (view.source==="all" || l.source===view.source))
      .sort((SORTS[view.sort] || SORTS.due)[1]);
    html = list.length ? table(list, view.tab, chosen) : "";
    root.querySelector(".shown").textContent = anyFilter() || view.q ? `Showing ${list.length} of ${leads.filter(l=>tabOf(l)===view.tab).length}` : "";
  } else {
    // status pills: only statuses that have leads (and the one chosen)
    filters.hidden = !active;
    filters.innerHTML = ["all", ...stages].map(s=>{
      const n = s==="all" ? inTab.length : inTab.filter(l=>l.status===s).length;
      return n || s==="all" || view.stage===s ? `<button type="button" class="pill${view.stage===s ? " on" : ""}" data-stage="${esc(s)}">${esc(s==="all" ? "All" : statusName(s))} · ${n}</button>` : "";
    }).join("");
    if (active){
      html = stages.filter(s=>view.stage==="all" || s===view.stage).map(s=>{
        const group = inTab.filter(l=>l.status===s).sort(byFollowUp);
        return group.length ? `<h2 class="section">${esc(statusName(s))} <span>${group.length}</span></h2><div class="cards">${group.map(card).join("")}</div>` : "";
      }).join("");
    } else {
      const group = inTab.sort(byContact);
      html = group.length ? `<div class="cards">${group.map(card).join("")}</div>` : "";
    }
  }
  root.querySelector(".list").innerHTML = html || `<div class="empty small"><p>${
    view.q ? `No leads match “${esc(view.q)}”.` : !leads.length ? "No leads in the sheet yet."
      : wide && anyFilter() ? "No leads match these filters." : "Nothing here."}</p></div>`;
  root.querySelector(".total").textContent = wide ? `${leads.filter(l=>tabOf(l)==="active").length} active` : `${leads.length} total`;
}

export async function leadsView(root, params, ctx){
  const { go } = ctx;
  const wide = isWide();
  const search = `<label class="search">${icon("search")}<input type="search" placeholder="Search name, phone, project or notes" value="${esc(view.q)}" autocomplete="off"></label>`;
  root.innerHTML = wide ? `<div class="lwrap"><div class="lmain">
    <header class="head row"><div><h1>Leads</h1><span class="total"></span></div>${search}</header>
    <div class="controls"><div class="segment two"></div>
      <label class="sort">Sort: <b>${(SORTS[view.sort] || SORTS.due)[0]}</b>${icon("chevron")}
        <select name="sort">${Object.entries(SORTS).map(([k, [label]])=>`<option value="${k}"${k===view.sort ? " selected" : ""}>${label}</option>`).join("")}</select></label></div>
    <div class="filters"></div><p class="shown"></p>
    <div class="list"><div class="loading">Loading…</div></div></div><aside class="lpane" hidden></aside></div>` : `<div class="lwrap">
    <header class="head row"><h1>Leads</h1><span class="total"></span></header>
    ${search}
    <div class="segment two"></div>
    <div class="filters chips scroll"></div>
    <div class="list"><div class="loading">Loading…</div></div></div>`;
  const box = root.firstElementChild, pane = root.querySelector(".lpane");
  let sheet = cachedSheet(), chosen = wide ? new URLSearchParams(location.search).get("c") : null;
  const redraw = () => { if (sheet) drawList(root, sheet, chosen); };

  /* Wide screens: open a lead beside the table, or close it. */
  const open = id => {
    chosen = id;
    history.replaceState(history.state, "", id ? `${location.pathname}?c=${id}` : location.pathname);
    box.classList.toggle("open", !!id);
    pane.hidden = !id;
    root.querySelectorAll("tr[data-id]").forEach(r=>r.classList.toggle("sel", r.dataset.id===id));
    if (id) leadView(pane, { id }, ctx, { embedded: true, onClose: ()=>open(null) });
  };

  box.querySelector(".search input").addEventListener("input", e=>{ view.q = e.target.value.trim(); keep(); redraw(); });
  box.addEventListener("click", e=>{
    const t = e.target.closest("[data-tab]"), s = e.target.closest("[data-stage]"), row = e.target.closest("tr[data-id]");
    if (t){ view.tab = t.dataset.tab; view.stage = "all"; keep(); redraw(); }
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

  redraw();
  if (chosen) open(chosen);
  try { sheet = await loadSheet(); redraw(); if (chosen) open(chosen); }
  catch(e){
    // with leads saved on the device, keep showing them; say why they may be out of date
    if (!cachedSheet()) problem(root.querySelector(".list"), e, ()=>leadsView(root, params, ctx));
    else if (!e.offline) toast(e.message, true);
  }
}
