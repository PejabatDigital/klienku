/* Bottom sheets (Figma 4 Mark done, 10 Close) and the confirm dialog (11 Delete). */
import { addDays, ordinal, today } from "./dates.js";
import { api, updateClient } from "./api.js";
import { STAGES, stageLabel, suggestAfterDone, suggestAfterNoReply } from "./flow.js";
import { esc, icon, toast } from "./ui.js";

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

/* ── "When?" chips. options: [{label, due}] plus Pick date (date + optional time). ── */
export function whenChips(options, selected){
  return `<div class="chips when">
    ${options.map((o, i)=>`<button type="button" class="pill${i===selected ? " on" : ""}" data-due="${o.due}">${esc(o.label)}</button>`).join("")}
    <button type="button" class="pill${selected===-1 ? " on" : ""}" data-due="pick">Pick date</button>
  </div>
  <div class="pick"${selected===-1 ? "" : " hidden"}>
    <label class="field"><span>Date</span><input type="date" name="date" value="${addDays(1)}" min="${today()}"></label>
    <label class="field"><span>Time (optional)</span><input type="time" name="time"></label>
  </div>`;
}
/* Wires the chips inside `root`; returns a function giving the chosen due value. */
export function wireWhen(root){
  const pick = root.querySelector(".pick");
  root.querySelectorAll("[data-due]").forEach(b=>b.addEventListener("click", ()=>{
    root.querySelectorAll("[data-due]").forEach(x=>x.classList.toggle("on", x===b));
    pick.hidden = b.dataset.due!=="pick";
  }));
  return () => {
    const on = root.querySelector("[data-due].on");
    if (!on) return null;
    if (on.dataset.due!=="pick") return on.dataset.due;
    const d = root.querySelector("[name=date]").value, t = root.querySelector("[name=time]").value;
    return d ? d + (t ? "T" + t : "") : null;
  };
}
/* Chips for "in N days", with the suggestion selected (or Pick date for "pick"). */
function dayOptions(days){
  const opts = [{ label: "Tomorrow", n: 1 }, { label: "In 2 days", n: 2 }, { label: "In 3 days", n: 3 }, { label: "Next week", n: 7 }];
  if (typeof days==="number" && !opts.some(o=>o.n===days)) opts.splice(opts.findIndex(o=>o.n > days), 0, { label: `In ${days} days`, n: days });
  return { options: opts.map(o=>({ label: o.label, due: addDays(o.n) })), selected: days==="pick" ? -1 : opts.findIndex(o=>o.n===days) };
}

const stageSelect = (current, min) => `<label class="row-select">
  <span>Move stage to</span>
  <select name="stage">${STAGES.map((s, i)=>`<option value="${s.key}"${s.key===current ? " selected" : ""}${i < min ? " disabled" : ""}>${s.label}</option>`).join("")}</select>
  <b class="val">${esc(stageLabel(current))}</b>${icon("chevron")}
</label>`;

/* ── Mark done → next step (Figma 4) ── */
export function doneSheet(client, settings, onSaved){
  const done = suggestAfterDone(client, settings), none = suggestAfterNoReply(client, settings);
  const minStage = STAGES.findIndex(s=>s.key===client.stage);
  const sheet = openSheet(`
    <h2>${esc(client.next_step)}</h2>
    <p class="sub">How did it go?</p>
    <div class="seg2"><button type="button" class="on" data-outcome="done">${icon("check")}Done</button><button type="button" data-outcome="no_reply">No reply</button></div>
    <div data-pane="done">
      <p class="label">What's next?</p>
      <div class="radios">
        ${[done.next, ...done.others].map((s, i)=>`<label class="radio"><input type="radio" name="next" value="${esc(s)}"${i===0 ? " checked" : ""}><span>${esc(s)}</span>${i===0 ? '<em class="tag">Suggested</em>' : ""}</label>`).join("")}
        <label class="radio"><input type="radio" name="next" value=""><span>Something else…</span></label>
        <input class="other" name="other" placeholder="What's the next step?" maxlength="120" hidden>
      </div>
      <p class="label">When?</p>
      <div data-when="done">${(o=>whenChips(o.options, o.selected))(dayOptions(done.days))}</div>
      ${stageSelect(done.stage, minStage)}
    </div>
    <div data-pane="no_reply" hidden>
      ${none.suggestClose ? `<div class="banner">That's ${none.tries} tries with no reply. Time to close this client?
        <button type="button" class="link" data-act="close">Close client</button></div>` : ""}
      <p class="label">Try again</p>
      <div class="radios"><label class="radio"><input type="radio" checked disabled><span>Follow up</span><em class="tag">${ordinal(none.tries + 1)} try</em></label></div>
      <p class="label">When?</p>
      <div data-when="no_reply">${(o=>whenChips(o.options, o.selected))(dayOptions(none.days))}</div>
    </div>
    <input class="note" name="note" placeholder="Add a note (optional)" maxlength="2000">
    <button class="btn btn-primary btn-lg" data-act="save">Save next step</button>
    <button type="button" class="link center" data-act="close">Close this client instead</button>`);

  let outcome = "done";
  const getDue = { done: wireWhen(sheet.querySelector('[data-when="done"]')), no_reply: wireWhen(sheet.querySelector('[data-when="no_reply"]')) };
  const other = sheet.querySelector("[name=other]"), sel = sheet.querySelector("[name=stage]");
  sheet.querySelectorAll("[data-outcome]").forEach(b=>b.addEventListener("click", ()=>{
    outcome = b.dataset.outcome;
    sheet.querySelectorAll("[data-outcome]").forEach(x=>x.classList.toggle("on", x===b));
    sheet.querySelectorAll("[data-pane]").forEach(p=>p.hidden = p.dataset.pane!==outcome);
  }));
  sheet.querySelectorAll("[name=next]").forEach(r=>r.addEventListener("change", ()=>{ other.hidden = r.value!=="" || !r.checked; if (!other.hidden) other.focus(); }));
  sel.addEventListener("change", ()=>{ sheet.querySelector(".row-select .val").textContent = stageLabel(sel.value); });
  sheet.querySelectorAll('[data-act="close"]').forEach(b=>b.addEventListener("click", ()=>closeClientSheet(client, onSaved)));
  sheet.querySelector('[data-act="save"]').addEventListener("click", async e=>{
    const chosen = sheet.querySelector("[name=next]:checked");
    const next_step = outcome==="no_reply" ? "Follow up" : (chosen.value || other.value.trim());
    const next_due = getDue[outcome]();
    if (!next_step) return toast("Please write the next step.", true);
    if (!next_due) return toast("Please choose when.", true);
    e.target.disabled = true;
    try {
      const { client: c } = await api(`/clients/${client.id}/steps`, { method: "POST", body: {
        outcome, next_step, next_due, note: sheet.querySelector("[name=note]").value, ...(outcome==="done" ? { stage: sel.value } : {}),
      }});
      updateClient(c); closeSheet(); toast("Saved. Next: " + c.next_step); onSaved(c);
    } catch(err){ toast(err.message, true); e.target.disabled = false; }
  });
}

/* ── Reschedule: same step, new date ── */
export function moveSheet(client, onSaved){
  const o = dayOptions(1);
  const sheet = openSheet(`
    <h2>Reschedule</h2>
    <p class="sub">${esc(client.next_step)}. When should it be?</p>
    <div data-when>${whenChips(o.options, o.selected)}</div>
    <input class="note" name="note" placeholder="Why? (optional)" maxlength="2000">
    <button class="btn btn-primary btn-lg" data-act="save">Save new date</button>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const getDue = wireWhen(sheet.querySelector("[data-when]"));
  sheet.querySelector('[data-act="save"]').addEventListener("click", async e=>{
    const next_due = getDue();
    if (!next_due) return toast("Please choose a date.", true);
    e.target.disabled = true;
    try {
      const { client: c } = await api(`/clients/${client.id}/steps`, { method: "POST", body: {
        outcome: "moved", next_step: client.next_step, next_due, note: sheet.querySelector("[name=note]").value,
      }});
      updateClient(c); closeSheet(); toast("Moved"); onSaved(c);
    } catch(err){ toast(err.message, true); e.target.disabled = false; }
  });
}

/* ── Close client (Figma 10): Won / Lost / I ended it ── */
const REASONS = {
  won: [],
  lost: ["No reply", "Too expensive", "Went with someone else", "Project postponed"],
  ended: ["Not a good fit", "Outside my area", "Budget too small", "Not serious"],
};
const CLOSE_BUTTON = { won: ["Close as won", "btn-won"], lost: ["Close as lost", "btn-danger"], ended: ["Close client", "btn-dark"] };

export function closeClientSheet(client, onSaved){
  const sheet = openSheet(`
    <h2>Close client</h2>
    <p class="sub">${esc([client.name, client.need].filter(Boolean).join(" · "))}</p>
    <div class="seg3"><button type="button" data-out="won">Won</button><button type="button" class="on" data-out="lost">Lost</button><button type="button" data-out="ended">I ended it</button></div>
    <div data-reasons></div>
    <input class="note" name="note" placeholder="Add a note (optional)" maxlength="2000">
    <button class="btn btn-lg" data-act="save"></button>
    <button type="button" class="link center" data-close>Cancel</button>`);
  let out;
  const show = o => {
    out = o;
    sheet.querySelectorAll("[data-out]").forEach(b=>b.classList.toggle("on", b.dataset.out===o));
    sheet.querySelector("[data-reasons]").innerHTML = REASONS[o].length ? `
      <p class="label">${o==="lost" ? "Why was it lost?" : "Why did you end it?"}</p>
      <div class="radios">${[...REASONS[o], "Other…"].map(r=>`<label class="radio"><input type="radio" name="reason" value="${r==="Other…" ? "" : esc(r)}"><span>${esc(r)}</span></label>`).join("")}
      <input class="other" name="other" placeholder="What happened?" maxlength="200" hidden></div>`
      : `<div class="won-note">${icon("trophy")}<span>Nice work. It moves to Won and keeps its history.</span></div>`;
    const other = sheet.querySelector("[name=other]");
    sheet.querySelectorAll("[name=reason]").forEach(r=>r.addEventListener("change", ()=>{ other.hidden = r.value!==""; if (!other.hidden) other.focus(); }));
    const btn = sheet.querySelector('[data-act="save"]');
    btn.textContent = CLOSE_BUTTON[o][0];
    btn.className = "btn btn-lg " + CLOSE_BUTTON[o][1];
  };
  sheet.querySelectorAll("[data-out]").forEach(b=>b.addEventListener("click", ()=>show(b.dataset.out)));
  show("lost");
  sheet.querySelector('[data-act="save"]').addEventListener("click", async e=>{
    const r = sheet.querySelector("[name=reason]:checked");
    const reason = r ? (r.value || sheet.querySelector("[name=other]").value.trim()) : "";
    if (out!=="won" && !r) return toast("Please choose a reason.", true);
    e.target.disabled = true;
    try {
      const { client: c } = await api(`/clients/${client.id}/close`, { method: "POST", body: { outcome: out, reason, note: sheet.querySelector("[name=note]").value } });
      updateClient(c); closeSheet(); toast(out==="won" ? "Marked as won" : "Client closed"); onSaved(c);
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
