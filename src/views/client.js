/* Client detail (Figma 3): WhatsApp / Call, stage, next step with Mark done / Reschedule,
   history and notes. Won and closed clients show how they ended and can be reopened. */
import { api, loadSettings, updateClient } from "../api.js";
import { addDays, dayMonth, dueLong, localDay, status } from "../dates.js";
import { STAGES, isOpen, stageLabel, stepLabel, whatsapp } from "../flow.js";
import { closeSheet, doneSheet, moveSheet, openSheet, whenChips, wireWhen } from "../sheets.js";
import { esc, icon, toast } from "../ui.js";

const KIND = { created: "Added", note: "Note", done: "Done", no_reply: "No reply", moved: "Rescheduled",
  closed: "Closed", reopened: "Reopened", stage: "Stage changed", edited: "Edited" };

function stepper(stage){
  const at = STAGES.findIndex(s=>s.key===stage);
  return `<div class="box"><p class="label">Stage</p><ol class="stepper">${STAGES.map((s, i)=>
    `<li class="${i < at ? "done" : i===at ? "now" : ""}"><i>${i < at ? icon("check") : ""}</i><span>${s.label}</span></li>`).join("")}</ol></div>`;
}

function nextCard(c){
  const s = status(c.next_due);
  return `<div class="next s-${s}">
    <p class="label">Next step</p>
    <h2>${esc(stepLabel(c))}</h2>
    <p class="when">${icon("clock")}${esc(dueLong(c.next_due))}</p>
    <div class="btns"><button class="btn btn-primary" data-act="done">${icon("check")}Mark done</button><button class="btn btn-white" data-act="move">Reschedule</button></div>
  </div>`;
}

function endedCard(c){
  const won = c.stage==="won";
  const title = won ? "Won" : c.outcome==="ended" ? "You ended it" : "Lost";
  return `<div class="next s-${won ? "won" : "closed"}">
    <p class="label">${won ? "Won" : "Closed"}${c.closed_at ? " · " + dayMonth(localDay(c.closed_at)) : ""}</p>
    <h2>${icon(won ? "trophy" : "archive")}${esc(title)}</h2>
    ${c.close_reason ? `<p class="when">${esc(c.close_reason)}</p>` : ""}
    <div class="btns"><button class="btn btn-white" data-act="reopen">Reopen</button></div>
  </div>`;
}

function historyBox(activity){
  return `<p class="label section-label">History & notes</p>
  <div class="box history">
    <form class="addnote"><input name="note" placeholder="Add a note…" maxlength="5000" autocomplete="off"><button class="link" hidden>Save</button></form>
    ${activity.map(a=>{
      const [first, ...rest] = a.text.split("\n");
      const title = a.kind==="note" ? "Note" : first, body = a.kind==="note" ? a.text : rest.join("\n");
      return `<div class="event"><time>${esc(dayMonth(localDay(a.at)))}</time><div><b>${esc(title || KIND[a.kind] || a.kind)}</b>${body ? `<p>${esc(body)}</p>` : ""}</div></div>`;
    }).join("")}
  </div>`;
}

/* Reopen: choose the next step and when. */
function reopenSheet(c, onSaved){
  const sheet = openSheet(`
    <h2>Reopen ${esc(c.name)}</h2>
    <p class="sub">What's the next step?</p>
    <input class="note" name="step" value="Follow up" maxlength="120">
    <p class="label">When?</p>
    <div data-when>${whenChips([{ label: "Today", due: addDays(0) }, { label: "Tomorrow", due: addDays(1) }, { label: "In 3 days", due: addDays(3) }, { label: "Next week", due: addDays(7) }], 1)}</div>
    <button class="btn btn-primary btn-lg" data-act="save">Reopen</button>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const getDue = wireWhen(sheet.querySelector("[data-when]"));
  sheet.querySelector('[data-act="save"]').addEventListener("click", async e=>{
    const next_step = sheet.querySelector("[name=step]").value.trim(), next_due = getDue();
    if (!next_step || !next_due) return toast("Please fill in the step and when.", true);
    e.target.disabled = true;
    try {
      const { client } = await api(`/clients/${c.id}/reopen`, { method: "POST", body: { next_step, next_due } });
      updateClient(client); closeSheet(); toast("Reopened"); onSaved();
    } catch(err){ toast(err.message, true); e.target.disabled = false; }
  });
}

export async function clientView(root, { id }, { back, go }){
  root.innerHTML = `<div class="loading">Loading…</div>`;
  let data;
  try { data = await api(`/clients/${id}`); }
  catch(e){ root.innerHTML = `<div class="empty small"><h2>Couldn't open this client</h2><p>${esc(e.message)}</p><a class="btn btn-white" href="/clients" data-link>All clients</a></div>`; return; }
  const c = data.client, wa = whatsapp(c.phone);
  updateClient(c);
  const reload = () => clientView(root, { id }, { back, go });
  const from = history.state && history.state.from==="/" ? "Today" : "Clients";

  root.innerHTML = `
    <nav class="topbar"><button class="back" data-act="back">${icon("back")}${from}</button><a class="link" href="/clients/${c.id}/edit" data-link>Edit</a></nav>
    <header class="who">
      <h1>${esc(c.name)}</h1>
      ${c.need || c.area ? `<p>${esc([c.need, c.area].filter(Boolean).join(" · "))}</p>` : ""}
      <p class="meta">${esc([c.phone, "Added " + dayMonth(localDay(c.created_at))].filter(Boolean).join(" · "))}</p>
    </header>
    ${c.phone ? `<div class="contact">
      ${wa ? `<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>` : ""}
      <a class="btn btn-white" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${icon("phone")}Call</a></div>` : ""}
    ${isOpen(c) ? stepper(c.stage) + nextCard(c) : endedCard(c)}
    ${historyBox(data.activity)}`;

  root.querySelector('[data-act="back"]').addEventListener("click", ()=>back(from==="Today" ? "/" : "/clients"));
  const act = (name, fn) => { const b = root.querySelector(`[data-act="${name}"]`); if (b) b.addEventListener("click", fn); };
  act("done", async ()=>doneSheet(c, await loadSettings().catch(()=>({ follow_up_days: 2, max_tries: 3, quote_after_visit_days: 2, quote_follow_up_days: 3 })), reload));
  act("move", ()=>moveSheet(c, reload));
  act("reopen", ()=>reopenSheet(c, reload));

  const form = root.querySelector(".addnote"), input = form.querySelector("input"), save = form.querySelector("button");
  input.addEventListener("input", ()=>{ save.hidden = !input.value.trim(); });
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    save.disabled = true;
    try { await api(`/clients/${c.id}/notes`, { method: "POST", body: { text } }); reload(); }
    catch(err){ toast(err.message, true); save.disabled = false; }
  });
}
