/* Add lead (Figma 5) and Edit lead (Figma 9), written straight into the Google Sheet. Only
   the name is needed. The choices (status, project type, source, stopped reason) come from
   the sheet's Lists tab. Editing sends only what changed, so a change made in the sheet
   meanwhile isn't overwritten. Delete (at the bottom of Edit) removes the lead's row. */
import { api, cachedSheet, dropLead, keepLead, loadSheet } from "../api.js";
import { confirmDialog } from "../sheets.js";
import { isClosed, isDate } from "../leads.js";
import { esc, gone, icon, pills, problem, toast, wirePills } from "../ui.js";

/* A list from the sheet, plus the lead's own value when the list no longer has it. */
const withValue = (list, v) => v && !list.includes(v) ? [...list, v] : list;
const shouldAskReason = status => isClosed({ status }) && !/^won$/i.test(status);

function fields(l, lists, editing){
  const input = (name, label, attrs = "") => `<label class="gfield"><span>${label}</span><input name="${name}" value="${esc(l[name])}" autocomplete="off" ${attrs}></label>`;
  const date = (name, label) => `<label class="gfield"><span>${label}</span><input name="${name}" type="date" value="${isDate(l[name]) ? l[name] : ""}"></label>`;
  const statuses = withValue(lists.status, l.status);
  return `
    <p class="label">Lead</p>
    <div class="group">
      ${input("name", "Name", 'maxlength="120" autocapitalize="words" required')}
      ${input("phone", "Phone", 'type="tel" maxlength="40" placeholder="012-345 6789"')}
      ${input("location", "Location", 'maxlength="120" placeholder="e.g. Wangsa Maju"')}
    </div>
    <p class="label">Project type</p>
    ${pills("type", withValue(lists.type, l.type), l.type)}
    <p class="label">Source</p>
    ${pills("source", withValue(lists.source, l.source), l.source)}
    <p class="label">What they want</p>
    <textarea class="notes" name="want" rows="2" maxlength="1000" placeholder="e.g. Full bathroom renovation, change tiles">${esc(l.want)}</textarea>
    <label class="row-select status-pick"><span>Status</span>
      <b class="val">${esc(l.status || "Choose")}</b>${icon("chevron")}
      <select name="status">${statuses.map(s=>`<option${s===l.status ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <div class="reason"${shouldAskReason(l.status) ? "" : " hidden"}>
      <p class="label">Stopped reason</p>
      ${pills("reason", withValue(lists.reason, l.reason), l.reason)}
    </div>
    <p class="label">Next step</p>
    <div class="group">
      ${input("next_action", "Next action", 'maxlength="300" placeholder="e.g. Send quotation"')}
      ${date("follow_up", "Next follow-up")}
    </div>
    ${editing ? `<p class="label">Dates</p><div class="group">${date("last_contacted", "Last contacted")}${date("added", "Date added")}</div>` : ""}
    <p class="label">Notes</p>
    <textarea class="notes" name="notes" rows="3" maxlength="5000" placeholder="Anything worth keeping about this lead">${esc(l.notes)}</textarea>`;
}

function wire(form){
  form.querySelectorAll("textarea").forEach(t=>{
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
    t.addEventListener("input", fit); fit();
  });
  const sel = form.elements.status;
  sel.addEventListener("change", ()=>{
    sel.parentElement.querySelector("b").textContent = sel.value;
    form.querySelector(".reason").hidden = !shouldAskReason(sel.value);
  });
  return wirePills(form);
}

/* Everything in the form, as the sheet's fields. */
function read(form, pick, original){
  const f = Object.fromEntries(new FormData(form));
  const out = { name: f.name, phone: f.phone, location: f.location, want: f.want, status: f.status,
    type: pick("type"), source: pick("source"), reason: shouldAskReason(f.status) ? pick("reason") : (original.reason || ""),
    next_action: f.next_action, follow_up: f.follow_up, notes: f.notes };
  if ("added" in f){ out.added = f.added; out.last_contacted = f.last_contacted; }
  for (const k in out) out[k] = (out[k] || "").trim();
  // a date the sheet holds as text can't show in a date box: left empty, it stays as it is
  for (const k of ["added", "last_contacted", "follow_up"]) if (k in out && !out[k] && original[k] && !isDate(original[k])) delete out[k];
  return out;
}

const busy = (form, on) => form.querySelectorAll("button").forEach(b=>b.disabled = on);

async function sheetData(root, retry){
  if (cachedSheet()) return cachedSheet();
  root.innerHTML = `<div class="loading">Loading…</div>`;
  try { return await loadSheet(); } catch(e){ problem(root, e, retry); return null; }
}

export async function addView(root, params, { back, go }){
  const sheet = await sheetData(root, ()=>addView(root, params, { back, go }));
  if (!sheet) return;
  const lists = sheet.lists, start = { status: lists.status[0] || "", source: lists.source.includes("WhatsApp") ? "WhatsApp" : "" };
  root.innerHTML = `
    <form class="form" novalidate>
      <nav class="topbar"><button type="button" class="link" data-act="cancel">Cancel</button><b>New lead</b><button class="link strong">Save</button></nav>
      ${fields(start, lists, false)}
      <p class="hint">Only the name is needed. It's added as a new row at the bottom of the Google Sheet.</p>
      <button class="btn btn-primary btn-lg">Save lead</button>
    </form>`;
  const form = root.querySelector("form"), pick = wire(form);
  form.querySelector('[data-act="cancel"]').addEventListener("click", ()=>back("/"));
  form.elements.name.focus();
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const body = read(form, pick, {});
    if (!body.name) return toast("Please enter a name.", true);
    for (const k in body) if (!body[k]) delete body[k];
    busy(form, true);
    try {
      const { lead } = await api("/leads", { method: "POST", body });
      keepLead(lead); toast("Lead added");
      go(`/leads/${lead.id}`, { replace: true });
    } catch(err){ toast(err.message, true); busy(form, false); }
  });
}

export async function editView(root, { id }, ctx){
  const { back } = ctx;
  const sheet = await sheetData(root, ()=>editView(root, { id }, ctx));
  if (!sheet) return;
  const l = sheet.leads.find(x=>x.id===id);
  if (!l) return gone(root);
  root.innerHTML = `
    <form class="form" novalidate>
      <nav class="topbar"><button type="button" class="link" data-act="cancel">Cancel</button><b>Edit lead</b><button class="link strong">Save</button></nav>
      ${fields(l, sheet.lists, true)}
      <button class="btn btn-primary btn-lg">Save changes</button>
      <button type="button" class="link center danger-link" data-act="delete">Delete lead</button>
    </form>`;
  const form = root.querySelector("form"), pick = wire(form);
  form.querySelector('[data-act="cancel"]').addEventListener("click", ()=>back(`/leads/${id}`));
  form.querySelector('[data-act="delete"]').addEventListener("click", async ()=>{
    const ok = await confirmDialog({ title: `Delete ${l.name || "this lead"}?`,
      text: "Their row is removed from the Google Sheet. This can't be undone here." });
    if (!ok) return;
    busy(form, true);
    try {
      await api(`/leads/${id}`, { method: "DELETE" });
      dropLead(id); toast("Lead deleted");
      ctx.go("/", { replace: true });
    } catch(err){
      toast(err.message, true); busy(form, false);
      if (err.status===404){ dropLead(id); ctx.go("/", { replace: true }); }
    }
  });
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const all = read(form, pick, l), body = {};
    if (!all.name) return toast("Please enter a name.", true);
    for (const k in all) if (all[k]!==(l[k] || "")) body[k] = all[k];
    if (!Object.keys(body).length) return back(`/leads/${id}`);
    busy(form, true);
    try {
      const { lead } = await api(`/leads/${id}`, { method: "PATCH", body });
      keepLead(lead); toast("Saved");
      back(`/leads/${id}`);
    } catch(err){ toast(err.message, true); busy(form, false); }
  });
}
