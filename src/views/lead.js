/* Lead profile, from its row in the Google Sheet: WhatsApp / Call, Edit, status (changed
   here, saved to the sheet straight away), the next action and follow-up date (closed
   leads: why), what they want, details and notes. */
import { api, cachedSheet, keepLead, loadSheet } from "../api.js";
import { dayMonth, dueLong } from "../dates.js";
import { isClosed, isDate, leadState, statusName, telLink, whatsapp } from "../leads.js";
import { closeSheet, openSheet } from "../sheets.js";
import { esc, gone, icon, isWide, pills, problem, toast, wirePills } from "../ui.js";

const shown = v => isDate(v) ? dayMonth(v) : v;

function nextCard(l){
  const s = leadState(l);
  if (s==="won") return `<div class="next s-won">
    <p class="label">Won</p>
    <h2>${icon("trophy")}Customer confirmed</h2>
  </div>`;
  if (s==="closed") return `<div class="next s-closed">
    <p class="label">${esc(statusName(l.status))}</p>
    <h2>${icon("archive")}${esc(l.reason || "No reason given")}</h2>
  </div>`;
  if (s==="none") return `<div class="next s-none">
    <p class="label">Next action</p>
    <h2>${esc(l.next_action || "No follow-up scheduled")}</h2>
    <p class="when">${l.follow_up ? esc(l.follow_up) : "No follow-up date"}</p>
  </div>`;
  return `<div class="next s-${s}">
    <p class="label">Next action</p>
    <h2>${esc(l.next_action || "Follow up")}</h2>
    <p class="when">${icon("clock")}${esc(dueLong(l.follow_up))}</p>
  </div>`;
}

function facts(l){
  const row = (label, value, wide = false) => `<div${wide ? ' class="full"' : ""}><dt>${label}</dt><dd${value ? "" : ' class="none"'}>${esc(value || "—")}</dd></div>`;
  return `<dl class="box facts">
    ${row("What they want", l.want, true)}
    ${row("Source", l.source)}${row("Last contacted", shown(l.last_contacted))}
    ${row("Added", shown(l.added))}${row("Project type", l.type)}
  </dl>`;
}

const notesBox = l => `<p class="label section-label">Notes</p>
  <div class="box gnotes">${l.notes ? `<p>${esc(l.notes)}</p>` : `<p class="none">No notes yet.</p>`}</div>`;

const statusRow = (l, list) => `<label class="row-select status-row">
  <span>Status</span><b class="val">${esc(statusName(l.status))}</b>${icon("chevron")}
  <select name="status">${(l.status && !list.includes(l.status) ? [...list, l.status] : list).map(s=>
    `<option${s===l.status ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
</label>`;

/* Closing a lead (not Won): why? The reason is optional. Resolves to the reason, or null
   when cancelled. */
function reasonSheet(l, reasons){
  return new Promise(resolve=>{
    const sheet = openSheet(`<h2>Why is ${esc(l.name || "this lead")} closed?</h2>
      <p class="sub">Saved as the Stopped reason. You can skip it.</p>
      ${pills("reason", reasons, l.reason)}
      <button class="btn btn-primary btn-lg" data-act="save">Close lead</button>
      <button type="button" class="link center" data-close>Cancel</button>`);
    const pick = wirePills(sheet);
    let done = false;
    sheet.querySelector('[data-act="save"]').addEventListener("click", ()=>{ done = true; resolve(pick("reason")); closeSheet(); });
    // closed any other way (Cancel, tapping outside): nothing changes
    new MutationObserver((m, o)=>{ if (!sheet.isConnected){ o.disconnect(); if (!done) resolve(null); } }).observe(document.body, { childList: true });
  });
}

/* The lead page. `embedded` puts it beside the Leads table on wide screens (no Back; a
   Close button when `onClose` is given; `onChange` runs after a change is saved). On its
   own page it shows what's saved on the device, then what the sheet says now. */
export async function leadView(root, { id }, ctx, { embedded = false, onClose, onChange, fresh = false } = {}){
  const { back } = ctx;
  let sheet = cachedSheet();
  const find = () => sheet && sheet.leads.find(l=>l.id===id);
  if (!find()){
    root.innerHTML = `<div class="loading">Loading…</div>`;
    try { sheet = await loadSheet(); fresh = true; }
    catch(e){ return problem(root, e, ()=>leadView(root, { id }, ctx, { embedded, onClose, onChange })); }
    if (!find()) return gone(root);
  }
  const l = find(), wa = whatsapp(l.phone), tel = telLink(l.phone), wide = isWide();

  const contact = (wa ? `<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>` : "")
    + (tel ? `<a class="btn btn-white" href="tel:${esc(tel)}">${icon("phone")}Call</a>` : "");
  const who = `<div>
      <h1>${esc(l.name || "No name")}</h1>
      ${l.type || l.location ? `<p>${esc([l.type, l.location].filter(Boolean).join(" · "))}</p>` : ""}
      ${l.phone ? `<p class="meta">${esc(l.phone)}</p>` : ""}
    </div>`;
  const body = statusRow(l, sheet.lists.status)
    + nextCard(l) + facts(l) + notesBox(l);

  root.innerHTML = wide ? `
    ${embedded ? (onClose ? `<nav class="topbar"><button class="back" data-act="close">${icon("x")}Close</button></nav>` : "") : `<nav class="topbar"><button class="back" data-act="back">${icon("back")}Leads</button></nav>`}
    <header class="who wide">${who}<div class="who-actions">${contact}<a class="btn btn-white" href="/leads/${esc(l.id)}/edit" data-link>Edit</a></div></header>
    ${body}` : `
    <nav class="topbar"><button class="back" data-act="back">${icon("back")}Leads</button><a class="link" href="/leads/${esc(l.id)}/edit" data-link>Edit</a></nav>
    <header class="who">${who}</header>
    ${contact ? `<div class="contact${wa && tel ? "" : " one"}">${contact}</div>` : ""}
    ${body}`;

  const act = (name, fn) => { const b = root.querySelector(`[data-act="${name}"]`); if (b) b.addEventListener("click", fn); };
  act("back", ()=>back("/"));
  if (onClose) act("close", onClose);

  // status: saved as soon as it's chosen; closing (not Won) asks why first
  const again = () => leadView(root, { id }, ctx, { embedded, onClose, onChange, fresh: true });
  const sel = root.querySelector("[name=status]");
  sel.addEventListener("change", async ()=>{
    const want = sel.value, body = { status: want };
    sel.value = l.status;
    if (isClosed({ status: want }) && !/^won$/i.test(want)){
      const reason = await reasonSheet(l, sheet.lists.reason);
      if (reason==null) return;
      body.reason = reason;
    }
    sel.disabled = true;
    try {
      const { lead } = await api(`/leads/${id}`, { method: "PATCH", body });
      keepLead(lead); toast("Status: " + statusName(want));
      sheet = cachedSheet(); again(); if (onChange) onChange();
    } catch(err){ toast(err.message, true); sel.disabled = false; }
  });

  root.dataset.lead = id;
  if (!embedded && !fresh) loadSheet().then(()=>{
    if (root.dataset.lead===id && location.pathname===`/leads/${id}`) leadView(root, { id }, ctx, { fresh: true });
  }).catch(()=>{});
}
