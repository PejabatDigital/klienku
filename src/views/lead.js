/* Lead profile, from its row in the Google Sheet: WhatsApp / Call, status, the next action
   and follow-up date (closed leads: why), what they want, details, notes, and a link to
   the row in the sheet. Read only for now (V3.1); changes are made in the sheet. */
import { cachedSheet, loadSheet } from "../api.js";
import { dayMonth, dueLong } from "../dates.js";
import { isDate, leadState, statusName, telLink, whatsapp } from "../leads.js";
import { esc, gone, icon, isWide, problem } from "../ui.js";

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

/* The lead page. `embedded` puts it beside the Leads table on wide screens (no Back; a
   Close button when `onClose` is given; the table refreshes it). On its own page it shows
   what's saved on the device, then what the sheet says now. */
export async function leadView(root, { id }, ctx, { embedded = false, onClose, fresh = false } = {}){
  const { back } = ctx;
  let sheet = cachedSheet();
  const find = () => sheet && sheet.leads.find(l=>l.id===id);
  if (!find()){
    root.innerHTML = `<div class="loading">Loading…</div>`;
    try { sheet = await loadSheet(); fresh = true; }
    catch(e){ return problem(root, e, ()=>leadView(root, { id }, ctx, { embedded, onClose })); }
    if (!find()) return gone(root);
  }
  const l = find(), wa = whatsapp(l.phone), tel = telLink(l.phone), wide = isWide();
  const rowLink = `${sheet.sheet_url}#gid=0&range=A${l.row}`;

  const contact = (wa ? `<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>` : "")
    + (tel ? `<a class="btn btn-white" href="tel:${esc(tel)}">${icon("phone")}Call</a>` : "");
  const who = `<div>
      <h1>${esc(l.name || "No name")}</h1>
      ${l.type || l.location ? `<p>${esc([l.type, l.location].filter(Boolean).join(" · "))}</p>` : ""}
      ${l.phone ? `<p class="meta">${esc(l.phone)}</p>` : ""}
    </div>`;
  const body = `<div class="row-select status-row"><span>Status</span><b class="val">${esc(statusName(l.status))}</b></div>`
    + nextCard(l) + facts(l) + notesBox(l)
    + `<a class="btn btn-white sheet-link" href="${esc(rowLink)}" target="_blank" rel="noopener">${icon("sheet")}Open in Google Sheets</a>`;

  root.innerHTML = wide ? `
    ${embedded ? (onClose ? `<nav class="topbar"><button class="back" data-act="close">${icon("x")}Close</button></nav>` : "") : `<nav class="topbar"><button class="back" data-act="back">${icon("back")}Leads</button></nav>`}
    <header class="who wide">${who}<div class="who-actions">${contact}</div></header>
    ${body}` : `
    <nav class="topbar"><button class="back" data-act="back">${icon("back")}Leads</button></nav>
    <header class="who">${who}</header>
    ${contact ? `<div class="contact${wa && tel ? "" : " one"}">${contact}</div>` : ""}
    ${body}`;

  const act = (name, fn) => { const b = root.querySelector(`[data-act="${name}"]`); if (b) b.addEventListener("click", fn); };
  act("back", ()=>back("/"));
  if (onClose) act("close", onClose);

  root.dataset.lead = id;
  if (!embedded && !fresh) loadSheet().then(()=>{
    if (root.dataset.lead===id && location.pathname===`/leads/${id}`) leadView(root, { id }, ctx, { fresh: true });
  }).catch(()=>{});
}
