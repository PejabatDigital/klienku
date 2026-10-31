/* Lead page: WhatsApp / Call, status (any order), next follow-up with Log interaction,
   details, general notes, and the history. Won and Lost leads show how they ended; changing the status back
   makes them active again. */
import { api, updateClient } from "../api.js";
import { clock, dayMonth, dueLong, localDay, status } from "../dates.js";
import { CONTACT_KINDS, STATUSES } from "../lists.js";
import { followUpText, isActive, money, statusLabel, whatsapp } from "../flow.js";
import { followUpSheet, logSheet, lostSheet } from "../sheets.js";
import { cardState, esc, gone, icon, isWide, problem, toast } from "../ui.js";

const KIND = { created: "Added", note: "Note", done: "Done", no_reply: "No reply", moved: "Rescheduled",
  closed: "Closed", reopened: "Reopened", stage: "Stage changed", edited: "Edited", status: "Status changed", follow_up: "Follow-up",
  interaction: "Interaction" };

const statusRow = c => `<label class="row-select status-row">
  <span>Status</span>
  <select name="status">${STATUSES.map(s=>`<option value="${s.key}"${s.key===c.stage ? " selected" : ""}>${s.label}</option>`).join("")}</select>
  <b class="val">${esc(statusLabel(c.stage))}</b>${icon("chevron")}
</label>`;

function followUpCard(c){
  if (!c.next_due) return `<div class="next s-none">
    <p class="label">Next follow-up</p>
    <h2>No follow-up scheduled</h2>
    <p class="when">Set a date so this lead isn't forgotten.</p>
    <div class="btns"><button class="btn btn-primary" data-act="log">Log interaction</button><button class="btn btn-white" data-act="follow">Set follow-up</button></div>
  </div>`;
  return `<div class="next s-${status(c.next_due)}">
    <p class="label">Next follow-up</p>
    <h2>${esc(followUpText(c))}</h2>
    <p class="when">${icon("clock")}${esc(dueLong(c.next_due))}</p>
    <div class="btns"><button class="btn btn-primary" data-act="log">Log interaction</button><button class="btn btn-white" data-act="follow">Change date</button></div>
  </div>`;
}

function endedCard(c){
  const won = c.stage==="won";
  return `<div class="next s-${cardState(c)}">
    <p class="label">${won ? "Won" : "Lost"}${c.closed_at ? " · " + dayMonth(localDay(c.closed_at)) : ""}</p>
    <h2>${icon(won ? "trophy" : "archive")}${won ? "Customer confirmed" : "Not proceeding"}</h2>
    ${c.close_reason ? `<p class="when">${esc(c.close_reason)}</p>` : ""}
    <div class="btns one"><button class="btn btn-white" data-act="log">Log interaction</button></div>
  </div>`;
}

function facts(c, activity){
  const last = activity.find(a=>CONTACT_KINDS.includes(a.kind));
  const row = (label, value) => `<div><dt>${label}</dt><dd${value ? "" : ' class="none"'}>${esc(value || "—")}</dd></div>`;
  return `<dl class="box facts">
    ${row("Estimated budget", money(c.budget))}${row("Lead source", c.source)}
    ${row("Last contacted", last && dayMonth(localDay(last.at)))}${row("Added", dayMonth(localDay(c.created_at)))}
  </dl>`;
}

const notesBox = c => `<p class="label section-label row-label">General notes<button type="button" class="link" data-act="notes">${c.notes ? "Edit" : "Add"}</button></p>
  <div class="box gnotes">${c.notes ? `<p>${esc(c.notes)}</p>` : `<p class="none">House type, sizes, budget, timing… anything worth keeping about this lead.</p>`}</div>`;

/* Newest first. Interactions stand out; status and follow-up changes are quieter. */
function historyBox(activity){
  const at = iso => { const d = new Date(iso); return clock(`${d.getHours()}:${d.getMinutes()}`); };
  return `<p class="label section-label row-label">History<button type="button" class="link" data-act="log">Log interaction</button></p>
  <div class="box history">
    ${activity.map(a=>{
      const [first, ...rest] = a.text.split("\n");
      const title = a.kind==="note" ? "Note" : first, body = a.kind==="note" ? a.text : rest.join("\n");
      const quiet = ["status", "follow_up", "created", "edited", "stage", "moved"].includes(a.kind);
      return `<div class="event${a.kind==="interaction" ? " talk" : quiet ? " quiet" : ""}"><time>${esc(dayMonth(localDay(a.at)))}<small>${esc(at(a.at))}</small></time>
        <div><b>${esc(title || KIND[a.kind] || a.kind)}</b>${body ? `<p>${esc(body)}</p>` : ""}</div></div>`;
    }).join("") || `<p class="none">Nothing logged yet.</p>`}
  </div>`;
}

/* The lead page. `embedded` puts it beside the Today list on wide screens (no Back);
   `onChange` runs after anything is saved, so that list can refresh. */
export async function leadView(root, { id }, { back, go }, { embedded = false, onChange } = {}){
  root.innerHTML = `<div class="loading">Loading…</div>`;
  let data;
  try { data = await api(`/clients/${id}`); }
  catch(e){
    if (e.status===404) gone(root); else problem(root, e, ()=>leadView(root, { id }, { back, go }, { embedded, onChange }));
    return;
  }
  const c = data.client, wa = whatsapp(c.phone), wide = isWide();
  updateClient(c);
  const reload = () => { leadView(root, { id }, { back, go }, { embedded, onChange }); if (onChange) onChange(); };
  const from = history.state && history.state.from==="/" ? "Today" : "Leads";

  const contact = (wa ? `<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>` : "")
    + (c.phone ? `<a class="btn btn-white" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${icon("phone")}Call</a>` : "");
  const who = `<div>
      <h1>${esc(c.name)}</h1>
      ${c.project_type || c.area ? `<p>${esc([c.project_type, c.area].filter(Boolean).join(" · "))}</p>` : ""}
      ${c.phone ? `<p class="meta">${esc(c.phone)}</p>` : ""}
    </div>`;
  const body = statusRow(c) + (isActive(c) ? followUpCard(c) : endedCard(c)) + facts(c, data.activity) + notesBox(c) + historyBox(data.activity);

  root.innerHTML = wide ? `
    ${embedded ? "" : `<nav class="topbar"><button class="back" data-act="back">${icon("back")}${from}</button></nav>`}
    <header class="who wide">${who}<div class="who-actions">${contact}<a class="btn btn-white" href="/leads/${c.id}/edit" data-link>Edit</a></div></header>
    ${body}` : `
    <nav class="topbar"><button class="back" data-act="back">${icon("back")}${from}</button><a class="link" href="/leads/${c.id}/edit" data-link>Edit</a></nav>
    <header class="who">${who}</header>
    ${contact ? `<div class="contact">${contact}</div>` : ""}
    ${body}`;

  const act = (name, fn) => { const b = root.querySelector(`[data-act="${name}"]`); if (b) b.addEventListener("click", fn); };
  act("back", ()=>back(from==="Today" ? "/" : "/leads"));
  act("follow", ()=>followUpSheet(c, reload));
  root.querySelectorAll('[data-act="log"]').forEach(b=>b.addEventListener("click", ()=>logSheet(c, reload)));
  act("notes", ()=>editNotes(root, c, reload));

  // status: saved as soon as it's chosen; Lost asks why first
  const sel = root.querySelector("[name=status]");
  sel.addEventListener("change", async ()=>{
    const want = sel.value;
    sel.value = c.stage;
    if (want==="lost") return lostSheet(c, reload);
    sel.disabled = true;
    try {
      const { client } = await api(`/clients/${c.id}`, { method: "PATCH", body: { stage: want } });
      updateClient(client); toast(want==="won" ? "Marked as Won" : "Status: " + statusLabel(want)); reload();
    } catch(err){ toast(err.message, true); sel.disabled = false; }
  });
}

/* General notes, edited in place. */
function editNotes(root, c, onSaved){
  const box = root.querySelector(".gnotes");
  box.innerHTML = `<textarea name="gnotes" rows="5" maxlength="5000" placeholder="e.g. Double-storey terrace. Bathroom about 5' x 8'. Wants to keep the floor tiles.">${esc(c.notes)}</textarea>
    <div class="gnotes-btns"><button type="button" class="link" data-a="cancel">Cancel</button><button type="button" class="btn btn-primary" data-a="save">Save notes</button></div>`;
  root.querySelector('[data-act="notes"]').hidden = true;
  const t = box.querySelector("textarea");
  const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
  t.addEventListener("input", fit); fit(); t.focus();
  box.querySelector('[data-a="cancel"]').addEventListener("click", onSaved);
  box.querySelector('[data-a="save"]').addEventListener("click", async e=>{
    e.target.disabled = true;
    try {
      const { client } = await api(`/clients/${c.id}`, { method: "PATCH", body: { notes: t.value } });
      updateClient(client); toast("Notes saved"); onSaved();
    } catch(err){ toast(err.message, true); e.target.disabled = false; }
  });
}
