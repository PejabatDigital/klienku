/* Lead profile, from its row in the Google Sheet: WhatsApp / Call, Edit, status, the next
   action and follow-up date (or "No action for now"; closed leads: why), what they want,
   details, and the notes log (kept in KlienKu, not the sheet: add a note, newest first,
   delete one). Everything but the notes is changed right here: tap it, change it in a
   sheet, and it's saved to the Google Sheet straight away (only that field is sent). */
import { api, cachedSheet, keepLead, loadSheet } from "../api.js";
import { dayMonth, dueLong, noteWhen } from "../dates.js";
import { NO_ACTION, isClosed, isDate, leadState, statusName, telLink, whatsapp } from "../leads.js";
import { closeSheet, confirmDialog, openSheet } from "../sheets.js";
import { esc, gone, icon, isWide, pills, problem, toast, wirePills } from "../ui.js";

const pen = icon("pen", "pen");

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
    <div class="btns one"><button type="button" class="btn btn-white" data-act="reason">Change reason</button></div>
  </div>`;
  const change = `<div class="btns one"><button type="button" class="btn btn-white" data-act="next">${s==="none" ? "Set next action" : "Change"}</button></div>`;
  if (s==="hold") return `<div class="next s-hold">
    <p class="label">Next action</p>
    <h2>${icon("pause")}No action for now</h2>
    <p class="when">On hold · no follow-up needed</p>${change}
  </div>`;
  if (s==="none") return `<div class="next s-none">
    <p class="label">Next action</p>
    <h2>${esc(l.next_action || "No follow-up scheduled")}</h2>
    <p class="when">${l.follow_up ? esc(l.follow_up) : "No follow-up date"}</p>${change}
  </div>`;
  return `<div class="next s-${s}">
    <p class="label">Next action</p>
    <h2>${esc(l.next_action || "Follow up")}</h2>
    <p class="when">${icon("clock")}${esc(dueLong(l.follow_up))}</p>${change}
  </div>`;
}

/* The details, each one a button: tap to change it. */
function facts(l){
  const row = (key, label, value, wide = false) => `<button type="button" class="fact${wide ? " full" : ""}" data-edit="${key}">
    <span class="dt">${label}${pen}</span><span class="dd${value ? "" : " none"}">${esc(value || "—")}</span></button>`;
  return `<div class="box facts">
    ${row("want", "What they want", l.want, true)}
    ${row("phone", "Phone", l.phone)}${row("location", "Location", l.location)}
    ${row("type", "Project type", l.type)}${row("source", "Source", l.source)}
    ${row("last_contacted", "Last contacted", shown(l.last_contacted))}${row("added", "First contact", shown(l.added))}
  </div>`;
}

/* A list from the sheet, plus the lead's own value when the list no longer has it. */
const withValue = (list, v) => v && !list.includes(v) ? [...list, v] : list;

/* The fields changed one at a time on this page. */
const FIELDS = {
  name: { label: "Name", max: 120, attrs: 'autocapitalize="words" autocomplete="off"' },
  phone: { label: "Phone", max: 40, attrs: 'type="tel" autocomplete="off" placeholder="012-345 6789"' },
  location: { label: "Location", max: 120, attrs: 'autocomplete="off" placeholder="e.g. Wangsa Maju"' },
  want: { label: "What they want", max: 1000, area: true, attrs: 'placeholder="e.g. Full bathroom renovation, change tiles"' },
  type: { label: "Project type", list: "type" },
  source: { label: "Source", list: "source" },
  last_contacted: { label: "Last contacted", date: true },
  added: { label: "First contact", date: true },
};

/* Change one field in a sheet. Resolves to {field: value} to save, or null (cancelled or
   unchanged). An empty box clears the field (but a name is needed). */
function fieldSheet(l, key, lists){
  const f = FIELDS[key], now = l[key] || "";
  let box;
  if (f.list) box = pills("v", withValue(lists[f.list] || [], now), now)
    + `<p class="hint">Tap the chosen one again to clear it.</p>`;
  else if (f.date) box = `<input class="note" name="v" type="date" value="${isDate(now) ? now : ""}">`
    + (now && !isDate(now) ? `<p class="hint">The sheet has “${esc(now)}”, which isn't a date. Leave it empty to keep it.</p>` : "");
  else if (f.area) box = `<textarea class="note" name="v" rows="3" maxlength="${f.max}" ${f.attrs}>${esc(now)}</textarea>`;
  else box = `<input class="note" name="v" value="${esc(now)}" maxlength="${f.max}" ${f.attrs}>`;
  return new Promise(resolve=>{
    const sheet = openSheet(`<h2>${f.label}</h2>
      <form novalidate>${box}<button class="btn btn-primary btn-lg">Save</button></form>
      <button type="button" class="link center" data-close>Cancel</button>`);
    const form = sheet.querySelector("form"), pick = wirePills(sheet), input = form.elements.v;
    let done = false;
    whenClosed(sheet, ()=>{ if (!done) resolve(null); });
    if (input && input.tagName==="TEXTAREA"){
      const fit = () => { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; };
      input.addEventListener("input", fit); requestAnimationFrame(fit);
    }
    form.addEventListener("submit", e=>{
      e.preventDefault();
      const v = (f.list ? pick("v") : input.value).trim();
      if (key==="name" && !v) return toast("Please enter a name.", true);
      done = true; closeSheet();
      resolve(v===now || (f.date && !v && now && !isDate(now)) ? null : { [key]: v });
    });
    if (input && !f.date) input.focus();
  });
}

/* Next action and follow-up date, or "No action for now" (on hold: no date needed).
   Resolves to {next_action, follow_up} to save, or null. */
function nextSheet(l){
  const hold = leadState(l)==="hold";
  return new Promise(resolve=>{
    const sheet = openSheet(`<h2>Next action</h2>
      <form novalidate>
        <div class="group">
          <label class="gfield"><span>What to do next</span><input name="next_action" value="${hold ? "" : esc(l.next_action)}" maxlength="300" autocomplete="off" placeholder="e.g. Send quotation"></label>
          <label class="gfield"><span>Follow-up date</span><input name="follow_up" type="date" value="${isDate(l.follow_up) ? l.follow_up : ""}"></label>
        </div>
        <button class="btn btn-primary btn-lg">Save</button>
      </form>
      ${hold ? "" : `<button type="button" class="btn btn-white btn-lg hold-btn" data-act="hold">${icon("pause")}No action for now</button>
      <p class="hint">When the discussion is on hold. The follow-up date is cleared.</p>`}
      <button type="button" class="link center" data-close>Cancel</button>`);
    const form = sheet.querySelector("form");
    let done = false;
    const finish = body => { done = true; closeSheet(); resolve(body); };
    whenClosed(sheet, ()=>{ if (!done) resolve(null); });
    form.addEventListener("submit", e=>{
      e.preventDefault();
      const next_action = form.elements.next_action.value.trim(), follow_up = form.elements.follow_up.value;
      const body = {};
      if (next_action!==(hold ? "" : l.next_action || "")) body.next_action = next_action;
      // a date the sheet holds as text can't show in a date box: left empty, it stays as it is
      if (follow_up!==(l.follow_up || "") && !(!follow_up && l.follow_up && !isDate(l.follow_up))) body.follow_up = follow_up;
      if (hold && !("next_action" in body) && "follow_up" in body) body.next_action = ""; // a date ends "no action"
      finish(Object.keys(body).length ? body : null);
    });
    const h = sheet.querySelector('[data-act="hold"]');
    if (h) h.addEventListener("click", ()=>finish({ next_action: NO_ACTION, follow_up: "" }));
  });
}

/* Runs `fn` once the sheet is gone (Save, Cancel or tapping outside). */
function whenClosed(sheet, fn){
  new MutationObserver((m, o)=>{ if (!sheet.isConnected){ o.disconnect(); fn(); } }).observe(document.body, { childList: true });
}

const notesBox = l => `<p class="label section-label">Notes</p>
  <form class="box gnotes addnote"><textarea name="text" rows="2" maxlength="5000" placeholder="What did you talk about?" aria-label="New note"></textarea>
    <div class="gnotes-btns"><button class="btn btn-primary" disabled>Add note</button></div></form>
  ${(l.log || []).length ? `<ol class="log">${l.log.map(n=>`<li>
    <div class="log-top"><span>${esc(noteWhen(n.at))}</span><button type="button" class="link" data-del="${n.id}">Delete</button></div>
    <p>${esc(n.text)}</p></li>`).join("")}</ol>` : `<p class="log-empty">No notes yet.</p>`}`;

const statusRow = (l, list) => `<label class="row-select status-row">
  <span>Status</span><b class="val">${esc(statusName(l.status))}</b>${icon("chevron")}
  <select name="status">${(l.status && !list.includes(l.status) ? [...list, l.status] : list).map(s=>
    `<option${s===l.status ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
</label>`;

/* Closing a lead (not Won): why? The reason is optional. Resolves to the reason, or null
   when cancelled. */
function reasonSheet(l, reasons, ok = "Close lead"){
  return new Promise(resolve=>{
    const sheet = openSheet(`<h2>Why is ${esc(l.name || "this lead")} closed?</h2>
      <p class="sub">Saved as the Stopped reason. You can skip it.</p>
      ${pills("reason", withValue(reasons, l.reason), l.reason)}
      <button class="btn btn-primary btn-lg" data-act="save">${ok}</button>
      <button type="button" class="link center" data-close>Cancel</button>`);
    const pick = wirePills(sheet);
    let done = false;
    sheet.querySelector('[data-act="save"]').addEventListener("click", ()=>{ done = true; resolve(pick("reason")); closeSheet(); });
    // closed any other way (Cancel, tapping outside): nothing changes
    whenClosed(sheet, ()=>{ if (!done) resolve(null); });
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
      <h1><button type="button" class="name-edit" data-edit="name">${esc(l.name || "No name")}${pen}</button></h1>
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

  const again = () => leadView(root, { id }, ctx, { embedded, onClose, onChange, fresh: true });
  /* Saves some fields to the sheet, then shows the page again. */
  const save = async (body, done = "Saved") => {
    try {
      const { lead } = await api(`/leads/${id}`, { method: "PATCH", body });
      keepLead(lead); toast(done);
      sheet = cachedSheet(); again(); if (onChange) onChange();
    } catch(err){ toast(err.message, true); }
  };
  root.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", async ()=>{
    const body = await fieldSheet(l, b.dataset.edit, sheet.lists);
    if (body) save(body);
  }));
  act("next", async ()=>{
    const body = await nextSheet(l);
    if (body) save(body, body.next_action===NO_ACTION && !body.follow_up ? "No action for now" : "Saved");
  });
  act("reason", async ()=>{
    const reason = await reasonSheet(l, sheet.lists.reason, "Save");
    if (reason!=null && reason!==(l.reason || "")) save({ reason });
  });

  // status: saved as soon as it's chosen; closing (not Won) asks why first
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

  // notes: add (newest at the top), delete after asking
  const add = root.querySelector(".addnote"), area = add.elements.text, addBtn = add.querySelector("button");
  const fit = () => { area.style.height = "auto"; area.style.height = area.scrollHeight + "px"; addBtn.disabled = !area.value.trim(); };
  area.addEventListener("input", fit);
  add.addEventListener("submit", async e=>{
    e.preventDefault();
    const text = area.value.trim();
    if (!text) return;
    addBtn.disabled = true;
    try {
      const { note } = await api(`/leads/${id}/notes`, { method: "POST", body: { text } });
      keepLead({ ...l, log: [note, ...(l.log || [])] }); toast("Note added");
      sheet = cachedSheet(); again(); if (onChange) onChange();
    } catch(err){ toast(err.message, true); addBtn.disabled = false; }
  });
  root.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", async ()=>{
    const nid = Number(b.dataset.del);
    if (!await confirmDialog({ title: "Delete this note?", text: "It can't be brought back." })) return;
    try {
      await api(`/leads/${id}/notes/${nid}`, { method: "DELETE" });
      keepLead({ ...l, log: (l.log || []).filter(n=>n.id!==nid) }); toast("Note deleted");
      sheet = cachedSheet(); again(); if (onChange) onChange();
    } catch(err){ toast(err.message, true); }
  }));

  root.dataset.lead = id;
  if (!embedded && !fresh) loadSheet().then(()=>{
    if (root.dataset.lead===id && location.pathname===`/leads/${id}`) leadView(root, { id }, ctx, { fresh: true });
  }).catch(()=>{});
}
