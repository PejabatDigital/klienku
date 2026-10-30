/* Settings (Figma 6): follow-up rules, a notification test, account. Reminder switches
   arrive with Phase 4. */
import { forgetClients, loadSettings, saveSettings } from "../api.js";
import { currentUser, signOut } from "../account.js";
import { isIOS } from "../pwa.js";
import { pushState, sendTest } from "../push.js";
import { closeSheet, openSheet } from "../sheets.js";
import { esc, icon, toast } from "../ui.js";

const RULES = [
  { key: "follow_up_days", label: "No reply → follow up after", unit: "day", max: 14 },
  { key: "quote_after_visit_days", label: "After site visit → quote within", unit: "day", max: 14 },
  { key: "quote_follow_up_days", label: "After quote → follow up after", unit: "day", max: 14 },
  { key: "max_tries", label: "Suggest closing after", unit: "try", max: 10 },
];
const amount = (n, unit) => unit==="try" ? `${n} ${n===1 ? "try" : "tries"}` : `${n} day${n===1 ? "" : "s"}`;

const row = (r, value) => `<label class="srow">
  <span>${r.label}</span><b>${amount(value, r.unit)}</b>${icon("chevron")}
  <select name="${r.key}">${Array.from({ length: r.max }, (_, i)=>i + 1).map(n=>`<option value="${n}"${n===value ? " selected" : ""}>${amount(n, r.unit)}</option>`).join("")}</select>
</label>`;

/* The Phase 1 check, kept here until Phase 4 adds real reminders. */
function testSheet(){
  const state = pushState();
  const msg = {
    install: "On iPhone, notifications only work once KlienKu is on your Home Screen: Share → Add to Home Screen, then open it from there.",
    unsupported: "This browser can't show notifications.",
    blocked: isIOS() ? "Notifications are off. Turn them on in iPhone Settings → Notifications → KlienKu." : "Notifications are blocked for this site in your browser settings.",
  }[state];
  const sheet = openSheet(`<h2>Test notification</h2>
    ${msg ? `<p class="sub">${msg}</p>` : `<p class="sub">Use "10 seconds", then lock your phone, to see it arrive like a real reminder.</p>
    <button class="btn btn-primary btn-lg" data-delay="0">Send a test now</button>
    <button class="btn btn-white btn-lg" data-delay="10">Send in 10 seconds</button>`}
    <button type="button" class="link center" data-close>Close</button>`);
  sheet.querySelectorAll("[data-delay]").forEach(b=>b.addEventListener("click", async ()=>{
    const d = Number(b.dataset.delay);
    try { await sendTest(d); closeSheet(); toast(d ? "On its way in 10 seconds" : "Sent"); }
    catch(e){ toast(e.message==="dismissed" ? "Notifications weren't allowed." : e.message==="blocked" ? "Notifications are turned off." : "Couldn't send: " + e.message, true); }
  }));
}

export async function settingsView(root){
  root.innerHTML = `<header class="head"><h1>Settings</h1></header><div class="loading">Loading…</div>`;
  let s, user;
  try { [s, user] = await Promise.all([loadSettings(), currentUser()]); }
  catch(e){ root.innerHTML = `<header class="head"><h1>Settings</h1></header><div class="empty small"><p>${esc(e.message)}</p></div>`; return; }

  root.innerHTML = `
    <header class="head"><h1>Settings</h1></header>
    <p class="label">Follow-up rules</p>
    <div class="group rules">${RULES.map(r=>row(r, s[r.key])).join("")}</div>
    <p class="hint">KlienKu uses these to suggest the next step when you tap Mark done.</p>
    <p class="label">Notifications</p>
    <div class="group"><button type="button" class="srow" data-act="test"><span>Send a test notification</span>${icon("chevron")}</button></div>
    <p class="hint">Reminders when a step is due, and a morning summary, are coming next.</p>
    <p class="label">Account</p>
    <div class="group">
      <div class="srow"><span>Email</span><b>${esc(user && user.email)}</b></div>
      <button type="button" class="srow danger" data-act="signout"><span>Sign out</span></button>
    </div>
    <p class="foot">KlienKu · { kasah kod }</p>`;

  root.querySelectorAll(".rules select").forEach(sel=>sel.addEventListener("change", async ()=>{
    const r = RULES.find(x=>x.key===sel.name), n = Number(sel.value);
    sel.parentElement.querySelector("b").textContent = amount(n, r.unit);
    try { s = await saveSettings({ [r.key]: n }); toast("Saved"); }
    catch(e){ toast(e.message, true); sel.value = s[r.key]; sel.parentElement.querySelector("b").textContent = amount(s[r.key], r.unit); }
  }));
  root.querySelector('[data-act="test"]').addEventListener("click", testSheet);
  root.querySelector('[data-act="signout"]').addEventListener("click", async ()=>{
    try { await signOut(); forgetClients(); location.replace("/signin"); }
    catch(e){ toast("Couldn't sign out. Check your connection and try again.", true); }
  });
}
