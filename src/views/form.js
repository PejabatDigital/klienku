/* Add client (Figma 5) and Edit client (Figma 9, with Delete → Figma 11). */
import { api, updateClient } from "../api.js";
import { addDays, timeOf, today } from "../dates.js";
import { STAGES, isOpen } from "../flow.js";
import { confirmDialog, whenChips, wireWhen } from "../sheets.js";
import { esc, toast } from "../ui.js";

const FIRST = [
  { label: "Reply / contact", step: "Reply to first message" },
  { label: "Call", step: "Call" },
  { label: "Site visit", step: "Book site visit" },
  { label: "Other", step: "" },
];

/* "Later today": a couple of hours from now, on the hour (tomorrow morning if it's late). */
function laterToday(){
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 2);
  if (d.getHours() >= 22 || d.getDate()!==new Date().getDate()) return addDays(1) + "T09:00";
  return today() + "T" + String(d.getHours()).padStart(2, "0") + ":00";
}

const details = (c = {}) => `
  <p class="label">Client</p>
  <div class="group">
    <label class="gfield"><span>Name</span><input name="name" value="${esc(c.name)}" required maxlength="120" autocomplete="off" autocapitalize="words"></label>
    <label class="gfield"><span>Phone</span><input name="phone" type="tel" value="${esc(c.phone)}" maxlength="40" placeholder="012-345 6789" autocomplete="off"></label>
    <label class="gfield"><span>What they need</span><textarea name="need" rows="2" maxlength="500" placeholder="e.g. Kitchen renovation">${esc(c.need)}</textarea></label>
    <label class="gfield"><span>Area (optional)</span><input name="area" value="${esc(c.area)}" maxlength="120" placeholder="e.g. Shah Alam" autocomplete="off"></label>
  </div>`;

function wireAutogrow(root){
  root.querySelectorAll("textarea").forEach(t=>{
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
    t.addEventListener("input", fit); fit();
  });
}

export function addView(root, params, { back, go }){
  root.innerHTML = `
    <form class="form" novalidate>
      <nav class="topbar"><button type="button" class="link" data-act="cancel">Cancel</button><b>New client</b><button class="link strong">Save</button></nav>
      ${details()}
      <p class="label">First step</p>
      <div class="chips first">${FIRST.map((f, i)=>`<button type="button" class="pill${i===0 ? " on" : ""}" data-step="${esc(f.step)}">${f.label}</button>`).join("")}</div>
      <input class="note other" name="other" placeholder="What's the first step?" maxlength="120" hidden>
      <p class="label">Due</p>
      <div data-when>${whenChips([{ label: "Now", due: today() }, { label: "Later today", due: laterToday() }, { label: "Tomorrow", due: addDays(1) }], 0)}</div>
      <p class="label">Notes (optional)</p>
      <textarea class="notes" name="notes" rows="3" maxlength="5000" placeholder="Anything worth remembering…"></textarea>
      <button class="btn btn-primary btn-lg">Save client</button>
    </form>`;
  const form = root.querySelector("form"), other = form.querySelector("[name=other]");
  const getDue = wireWhen(form.querySelector("[data-when]"));
  wireAutogrow(root);
  form.querySelectorAll("[data-step]").forEach(b=>b.addEventListener("click", ()=>{
    form.querySelectorAll("[data-step]").forEach(x=>x.classList.toggle("on", x===b));
    other.hidden = b.dataset.step!==""; if (!other.hidden) other.focus();
  }));
  form.querySelector('[data-act="cancel"]').addEventListener("click", ()=>back("/"));
  form.querySelector("[name=name]").focus();
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const chosen = form.querySelector("[data-step].on").dataset.step;
    const next_step = chosen || f.other.trim(), next_due = getDue();
    if (!f.name.trim()) return toast("Please enter a name.", true);
    if (!next_step) return toast("Please write the first step.", true);
    if (!next_due) return toast("Please choose when it's due.", true);
    form.querySelectorAll("button").forEach(b=>b.disabled = true);
    try {
      const { client } = await api("/clients", { method: "POST", body: { name: f.name, phone: f.phone, need: f.need, area: f.area, notes: f.notes, next_step, next_due } });
      updateClient(client); toast("Client added");
      go(`/clients/${client.id}`, { replace: true });
    } catch(err){ toast(err.message, true); form.querySelectorAll("button").forEach(b=>b.disabled = false); }
  });
}

export async function editView(root, { id }, { back, go }){
  root.innerHTML = `<div class="loading">Loading…</div>`;
  let c;
  try { c = (await api(`/clients/${id}`)).client; }
  catch(e){ root.innerHTML = `<div class="empty small"><p>${esc(e.message)}</p></div>`; return; }
  const open = isOpen(c), due = c.next_due || "";
  root.innerHTML = `
    <form class="form" novalidate>
      <nav class="topbar"><button type="button" class="link" data-act="cancel">Cancel</button><b>Edit client</b><button class="link strong">Save</button></nav>
      ${details(c)}
      ${open ? `<p class="label">Progress</p>
      <div class="group">
        <label class="gfield"><span>Stage</span><select name="stage">${STAGES.map(s=>`<option value="${s.key}"${s.key===c.stage ? " selected" : ""}>${s.label}</option>`).join("")}</select></label>
        <label class="gfield"><span>Next step</span><input name="next_step" value="${esc(c.next_step)}" maxlength="120"></label>
        <div class="gfield two"><label><span>Due</span><input type="date" name="date" value="${due.slice(0, 10)}"></label><label><span>Time (optional)</span><input type="time" name="time" value="${timeOf(due)}"></label></div>
      </div>
      <p class="hint">Usually these update on their own when you tap Mark done. Change them here only to fix a mistake.</p>` : ""}
      <p class="label">Danger zone</p>
      <button type="button" class="group danger-row" data-act="delete"><b>Delete client</b>
        <span>For duplicates or mistakes only. To finish with a client, use Close instead so the history is kept.</span></button>
    </form>`;
  const form = root.querySelector("form");
  wireAutogrow(root);
  form.querySelector('[data-act="cancel"]').addEventListener("click", ()=>back(`/clients/${id}`));
  form.querySelector('[data-act="delete"]').addEventListener("click", async ()=>{
    if (!(await confirmDialog({ title: `Delete ${c.name}?`, text: "This removes the client and all their notes. It can't be undone." }))) return;
    try { await api(`/clients/${id}`, { method: "DELETE" }); updateClient(c, true); toast("Deleted"); go("/clients", { replace: true }); }
    catch(err){ toast(err.message, true); }
  });
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.name.trim()) return toast("Please enter a name.", true);
    const body = { name: f.name, phone: f.phone, need: f.need, area: f.area };
    if (open){
      if (!f.next_step.trim() || !f.date) return toast("Please fill in the next step and its date.", true);
      Object.assign(body, { stage: f.stage, next_step: f.next_step, next_due: f.date + (f.time ? "T" + f.time : "") });
    }
    form.querySelectorAll("button").forEach(b=>b.disabled = true);
    try {
      const { client } = await api(`/clients/${id}`, { method: "PATCH", body });
      updateClient(client); toast("Saved"); back(`/clients/${id}`);
    } catch(err){ toast(err.message, true); form.querySelectorAll("button").forEach(b=>b.disabled = false); }
  });
}
