/* Bottom sheets (log interaction, next follow-up, mark as Lost) and the confirm dialog
   (Figma 11 Delete). */
import { addDays, timeOf, ymd } from "./dates.js";
import { api, updateClient } from "./api.js";
import { statusLabel } from "./flow.js";
import { INTERACTION_TYPES, LOST_REASONS, STATUSES } from "./lists.js";
import { esc, icon, pills, toast, wirePills } from "./ui.js";

/* Opens a sheet with `html`; returns its panel. Tapping outside or [data-close] closes it. */
export function openSheet(html, cls = ""){
  closeSheet();
  const layer = document.createElement("div");
  layer.className = "layer";
  layer.innerHTML = `<div class="backdrop" data-close></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.append(layer);
  document.body.classList.add("locked");
  requestAnimationFrame(()=>layer.classList.add("in"));
  layer.addEventListener("click", e=>{ if (e.target.closest("[data-close]")) closeSheet(); });
  return layer.querySelector(".sheet");
}
export function closeSheet(){
  document.querySelectorAll(".layer").forEach(l=>l.remove());
  document.body.classList.remove("locked");
}

/* ── "When?" chips. options: [{label, due}] plus Pick date (date + optional time).
   `selected` is the chip that starts on (-1: Pick date; none if out of range); `picked`
   fills Pick date with a due value. ── */
export function whenChips(options, selected, picked = ""){
  return `<div class="chips when">
    ${options.map((o, i)=>`<button type="button" class="pill${i===selected ? " on" : ""}" data-due="${o.due}">${esc(o.label)}</button>`).join("")}
    <button type="button" class="pill${selected===-1 ? " on" : ""}" data-due="pick">Pick date</button>
  </div>
  <div class="pick"${selected===-1 ? "" : " hidden"}>
    <label class="field"><span>Date</span><input type="date" name="date" value="${picked ? picked.slice(0, 10) : addDays(1)}"></label>
    <label class="field"><span>Time (optional)</span><input type="time" name="time" value="${timeOf(picked)}"></label>
  </div>`;
}
/* Wires the chips inside `root`; returns a function giving the chosen due value (or null).
   Tapping the chosen chip again unchooses it. */
export function wireWhen(root){
  const pick = root.querySelector(".pick");
  root.querySelectorAll("[data-due]").forEach(b=>b.addEventListener("click", ()=>{
    const on = !b.classList.contains("on");
    root.querySelectorAll("[data-due]").forEach(x=>x.classList.toggle("on", on && x===b));
    pick.hidden = !(on && b.dataset.due==="pick");
  }));
  return () => {
    const on = root.querySelector("[data-due].on");
    if (!on) return null;
    if (on.dataset.due!=="pick") return on.dataset.due;
    const d = root.querySelector("[name=date]").value, t = root.querySelector("[name=time]").value;
    return d ? d + (t ? "T" + t : "") : null;
  };
}
/* The usual follow-up choices. */
export const FOLLOW_UP_DAYS = () => [
  { label: "Today", due: addDays(0) }, { label: "Tomorrow", due: addDays(1) },
  { label: "In 3 days", due: addDays(3) }, { label: "Next week", due: addDays(7) },
];

/* ── Next follow-up: when, and a short note on what to do. Remove it if there's one. ── */
export function followUpSheet(lead, onSaved){
  const has = !!lead.next_due;
  const sheet = openSheet(`
    <h2>Next follow-up</h2>
    <p class="sub">${esc(lead.name)}</p>
    <p class="label">When?</p>
    <div data-when>${whenChips(FOLLOW_UP_DAYS(), has ? -1 : null, lead.next_due || "")}</div>
    <p class="label">What to do (optional)</p>
    <input class="note" name="step" value="${esc(lead.next_step)}" placeholder="e.g. Ask for photos of the bathroom" maxlength="200">
    <button class="btn btn-primary btn-lg" data-act="save">Save follow-up</button>
    ${has ? `<button type="button" class="link center danger-link" data-act="remove">Remove follow-up</button>` : ""}
    <button type="button" class="link center" data-close>Cancel</button>`);
  const getDue = wireWhen(sheet.querySelector("[data-when]"));
  const send = async (btn, body, done) => {
    btn.disabled = true;
    try {
      const { client } = await api(`/clients/${lead.id}`, { method: "PATCH", body });
      updateClient(client); closeSheet(); toast(done); onSaved(client);
    } catch(err){ toast(err.message, true); btn.disabled = false; }
  };
  sheet.querySelector('[data-act="save"]').addEventListener("click", e=>{
    const next_due = getDue();
    if (!next_due) return toast("Please choose when.", true);
    send(e.target, { next_due, next_step: sheet.querySelector("[name=step]").value }, "Follow-up saved");
  });
  const remove = sheet.querySelector('[data-act="remove"]');
  if (remove) remove.addEventListener("click", e=>send(e.target, { next_due: null }, "Follow-up removed"));
}

/* ── Log interaction: what happened and when, and the status if it changed. The
   follow-up is separate (its own buttons on the lead page). ── */
export function logSheet(lead, onSaved){
  const d = new Date(), now = `${ymd(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sheet = openSheet(`
    <h2>Log interaction</h2>
    <p class="sub">${esc(lead.name)}</p>
    <p class="label">What happened?</p>
    ${pills("type", INTERACTION_TYPES, "WhatsApp")}
    <textarea class="note" name="text" rows="3" maxlength="5000" placeholder="e.g. Asked for a rough price. Will send photos of the bathroom."></textarea>
    <label class="row-input"><span>When</span><input type="datetime-local" name="at" value="${now}" max="${now}"></label>
    <label class="row-select">
      <span>Status</span>
      <select name="stage">${STATUSES.map(s=>`<option value="${s.key}"${s.key===lead.stage ? " selected" : ""}>${s.label}</option>`).join("")}</select>
      <b class="val">${esc(statusLabel(lead.stage))}</b>${icon("chevron")}
    </label>
    <input class="note" name="reason" list="lost-reasons" placeholder="Why was it lost? (optional)" maxlength="200" hidden>
    <datalist id="lost-reasons">${LOST_REASONS.map(r=>`<option value="${esc(r)}">`).join("")}</datalist>
    <button class="btn btn-primary btn-lg" data-act="save">Save</button>
    <button type="button" class="link center" data-close>Cancel</button>`, "log");
  const pick = wirePills(sheet), sel = sheet.querySelector("[name=stage]"), reason = sheet.querySelector("[name=reason]");
  sel.addEventListener("change", ()=>{
    sheet.querySelector(".row-select .val").textContent = statusLabel(sel.value);
    reason.hidden = sel.value!=="lost";
  });
  sheet.querySelector('[data-act="save"]').addEventListener("click", async e=>{
    const type = pick("type"), at = sheet.querySelector("[name=at]").value;
    if (!type) return toast("Please choose what happened.", true);
    if (!at) return toast("Please choose when it happened.", true);
    // left at "now": the exact time, so it sorts after anything earlier in the same minute
    const body = { type, text: sheet.querySelector("[name=text]").value, at: (at===now ? new Date() : new Date(at)).toISOString(), stage: sel.value };
    if (sel.value==="lost") body.reason = reason.value;
    e.target.disabled = true;
    try {
      const { client } = await api(`/clients/${lead.id}/interactions`, { method: "POST", body });
      updateClient(client); closeSheet(); toast("Logged"); onSaved(client);
    } catch(err){ toast(err.message, true); e.target.disabled = false; }
  });
}

/* ── Mark as Lost, with an optional reason ── */
export function lostSheet(lead, onSaved){
  const sheet = openSheet(`
    <h2>Mark as Lost</h2>
    <p class="sub">${esc(lead.name)}. Its history is kept, and you can change the status back later.</p>
    <p class="label">Why? (optional)</p>
    <div class="radios">${[...LOST_REASONS, "Other…"].map(r=>`<label class="radio"><input type="radio" name="reason" value="${r==="Other…" ? "" : esc(r)}"><span>${esc(r)}</span></label>`).join("")}
      <input class="other" name="other" placeholder="What happened?" maxlength="200" hidden></div>
    <button class="btn btn-danger btn-lg" data-act="save">Mark as Lost</button>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const other = sheet.querySelector("[name=other]");
  sheet.querySelectorAll("[name=reason]").forEach(r=>r.addEventListener("change", ()=>{ other.hidden = r.value!==""; if (!other.hidden) other.focus(); }));
  sheet.querySelector('[data-act="save"]').addEventListener("click", async e=>{
    const r = sheet.querySelector("[name=reason]:checked");
    const reason = r ? (r.value || other.value.trim()) : "";
    e.target.disabled = true;
    try {
      const { client } = await api(`/clients/${lead.id}`, { method: "PATCH", body: { stage: "lost", reason } });
      updateClient(client); closeSheet(); toast("Marked as Lost"); onSaved(client);
    } catch(err){ toast(err.message, true); e.target.disabled = false; }
  });
}

/* ── Confirm dialog (Figma 11) ── resolves true when confirmed. */
export function confirmDialog({ title, text, ok = "Delete" }){
  return new Promise(resolve=>{
    closeSheet();
    const layer = document.createElement("div");
    layer.className = "layer center in";
    layer.innerHTML = `<div class="backdrop"></div><div class="alert" role="alertdialog" aria-modal="true">
      <h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="alert-btns"><button type="button" data-a="0">Cancel</button><button type="button" class="danger" data-a="1">${esc(ok)}</button></div></div>`;
    document.body.append(layer);
    layer.addEventListener("click", e=>{
      const a = e.target.closest("[data-a]");
      if (!a && !e.target.classList.contains("backdrop")) return;
      layer.remove();
      resolve(!!a && a.dataset.a==="1");
    });
  });
}
