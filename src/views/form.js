/* Add lead (Figma 5) and Edit lead (Figma 9, with Delete → Figma 11). Only the name is
   required; the rest can be filled in later. Status and follow-up are set on the lead's
   page, not here. */
import { api, updateClient } from "../api.js";
import { PROJECT_TYPES, SOURCES } from "../lists.js";
import { confirmDialog } from "../sheets.js";
import { esc, gone, pills, problem, toast, wirePills } from "../ui.js";

/* "15,000", "RM 15k" → 15000; empty → null; anything else → NaN. */
function ringgit(v){
  const t = v.trim().toLowerCase().replace(/^rm\s*/, "").replace(/,/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(t);
  return m ? Math.round(Number(m[1]) * (m[2] ? 1000 : 1)) : NaN;
}

const details = (c = {}) => `
  <p class="label">Lead</p>
  <div class="group">
    <label class="gfield"><span>Name</span><input name="name" value="${esc(c.name)}" required maxlength="120" autocomplete="off" autocapitalize="words"></label>
    <label class="gfield"><span>Phone</span><input name="phone" type="tel" value="${esc(c.phone)}" maxlength="40" placeholder="012-345 6789" autocomplete="off"></label>
    <label class="gfield"><span>Location</span><input name="area" value="${esc(c.area)}" maxlength="120" placeholder="e.g. Wangsa Maju" autocomplete="off"></label>
  </div>
  <p class="label">Project type</p>
  ${pills("project_type", PROJECT_TYPES, c.project_type)}
  <p class="label">Lead source</p>
  ${pills("source", SOURCES, c.source)}`;
/* Can wait until later: budget and general notes. */
const extras = (c = {}) => `
  <p class="label">Estimated budget</p>
  <div class="group"><label class="gfield money"><span>RM</span><input name="budget" inputmode="decimal" value="${c.budget==null ? "" : c.budget.toLocaleString("en-MY")}" placeholder="e.g. 15,000" maxlength="20" autocomplete="off"></label></div>
  <p class="label">General notes</p>
  <textarea class="notes" name="notes" rows="3" maxlength="5000" placeholder="House type, sizes, what they want, timing…">${esc(c.notes)}</textarea>`;

function wireAutogrow(root){
  root.querySelectorAll("textarea").forEach(t=>{
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
    t.addEventListener("input", fit); fit();
  });
}

/* The lead details from the form, or null (with a message) when something needs fixing. */
function read(form, pick){
  const f = Object.fromEntries(new FormData(form)), budget = ringgit(f.budget);
  if (!f.name.trim()){ toast("Please enter a name.", true); return null; }
  if (Number.isNaN(budget)){ toast("Please write the budget as a number, e.g. 15000.", true); return null; }
  return { name: f.name, phone: f.phone, area: f.area, project_type: pick("project_type"), source: pick("source"), budget, notes: f.notes };
}

export function addView(root, params, { back, go }){
  root.innerHTML = `
    <form class="form" novalidate>
      <nav class="topbar"><button type="button" class="link" data-act="cancel">Cancel</button><b>New lead</b><button class="link strong">Save</button></nav>
      ${details({ source: "WhatsApp" })}
      <p class="hint">Only the name is needed. Budget and notes can wait. Set the follow-up on the lead's page after saving.</p>
      ${extras()}
      <button class="btn btn-primary btn-lg">Save lead</button>
    </form>`;
  const form = root.querySelector("form"), pick = wirePills(form);
  wireAutogrow(root);
  form.querySelector('[data-act="cancel"]').addEventListener("click", ()=>back("/"));
  form.querySelector("[name=name]").focus();
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const body = read(form, pick);
    if (!body) return;
    form.querySelectorAll("button").forEach(b=>b.disabled = true);
    try {
      const { client } = await api("/clients", { method: "POST", body });
      updateClient(client); toast("Lead added");
      go(`/leads/${client.id}`, { replace: true });
    } catch(err){ toast(err.message, true); form.querySelectorAll("button").forEach(b=>b.disabled = false); }
  });
}

export async function editView(root, { id }, { back, go }){
  root.innerHTML = `<div class="loading">Loading…</div>`;
  let c;
  try { c = (await api(`/clients/${id}`)).client; }
  catch(e){ if (e.status===404) gone(root); else problem(root, e, ()=>editView(root, { id }, { back, go })); return; }
  root.innerHTML = `
    <form class="form" novalidate>
      <nav class="topbar"><button type="button" class="link" data-act="cancel">Cancel</button><b>Edit lead</b><button class="link strong">Save</button></nav>
      ${details(c)}${extras(c)}
      <p class="hint">Change the status and the next follow-up on the lead's page.</p>
      <p class="label">Danger zone</p>
      <button type="button" class="group danger-row" data-act="delete"><b>Delete lead</b>
        <span>For duplicates or mistakes only. To finish with a lead, set its status to Won or Lost so the history is kept.</span></button>
    </form>`;
  const form = root.querySelector("form"), pick = wirePills(form);
  wireAutogrow(root);
  form.querySelector('[data-act="cancel"]').addEventListener("click", ()=>back(`/leads/${id}`));
  form.querySelector('[data-act="delete"]').addEventListener("click", async ()=>{
    if (!(await confirmDialog({ title: `Delete ${c.name}?`, text: "This removes the lead and all its history. It can't be undone." }))) return;
    try { await api(`/clients/${id}`, { method: "DELETE" }); updateClient(c, true); toast("Deleted"); go("/leads", { replace: true }); }
    catch(err){ toast(err.message, true); }
  });
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const body = read(form, pick);
    if (!body) return;
    form.querySelectorAll("button").forEach(b=>b.disabled = true);
    try {
      const { client } = await api(`/clients/${id}`, { method: "PATCH", body });
      updateClient(client); toast("Saved"); back(`/leads/${id}`);
    } catch(err){ toast(err.message, true); form.querySelectorAll("button").forEach(b=>b.disabled = false); }
  });
}
