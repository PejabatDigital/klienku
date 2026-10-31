/* Settings (Figma 6): reminders (this device, due-step notifications, morning summary),
   follow-up rules, account (change password, download my data, sign out), about, and
   delete my account. Changes save straight away. */
import { forgetClients, loadSettings, saveSettings } from "../api.js";
import { currentUser, signOut } from "../account.js";
import { clock } from "../dates.js";
import { isIOS } from "../pwa.js";
import { deviceOn, pushState, sendTest, turnOff, turnOn } from "../push.js";
import { closeSheet, openSheet } from "../sheets.js";
import { deleteSheet, downloadSheet, passwordSheet } from "./account.js";
import { esc, icon, problem, toast } from "../ui.js";

const RULES = [
  { key: "follow_up_days", label: "No reply → follow up after", unit: "day", max: 14 },
  { key: "quote_after_visit_days", label: "After site visit → quote within", unit: "day", max: 14 },
  { key: "quote_follow_up_days", label: "After quote → follow up after", unit: "day", max: 14 },
  { key: "max_tries", label: "Suggest closing after", unit: "try", max: 10 },
];
const amount = (n, unit) => unit==="try" ? `${n} ${n===1 ? "try" : "tries"}` : `${n} day${n===1 ? "" : "s"}`;
const BEFORE = [0, 5, 10, 15, 30, 60];
const before = n => n ? `${n} min before` : "At the time";
const TIMES = Array.from({ length: 15 }, (_, i)=>`${String(5 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`); // 05:00–12:00

/* A row with a value that opens a list of choices. */
const pick = (name, label, value, options, show) => `<label class="srow">
  <span>${label}</span><b>${esc(show(value))}</b>${icon("chevron")}
  <select name="${name}">${options.map(o=>`<option value="${o}"${String(o)===String(value) ? " selected" : ""}>${esc(show(o))}</option>`).join("")}</select>
</label>`;
const toggle = (name, label, on, sub = "") => `<label class="srow">
  <span>${label}${sub ? `<small>${sub}</small>` : ""}</span>
  <input type="checkbox" class="switch" name="${name}"${on ? " checked" : ""}>
</label>`;

/* "Notifications on this device": a switch, or why it isn't possible yet. */
async function deviceRow(){
  const state = pushState();
  if (state==="install") return `<div class="srow"><span>This device<small>Add KlienKu to your Home Screen first (Share → Add to Home Screen), then open it from there.</small></span></div>`;
  if (state==="unsupported") return `<div class="srow"><span>This device<small>This browser can't show notifications.</small></span></div>`;
  if (state==="blocked") return `<div class="srow"><span>This device<small>${isIOS() ? "Notifications are off. Turn them on in iPhone Settings → Notifications → KlienKu." : "Notifications are blocked for this site in your browser settings."}</small></span></div>`;
  return toggle("device", "Notifications on this device", await deviceOn());
}

function testSheet(){
  const sheet = openSheet(`<h2>Test notification</h2>
    <p class="sub">Use "10 seconds", then lock your phone, to see it arrive like a real reminder.</p>
    <button class="btn btn-primary btn-lg" data-delay="0">Send a test now</button>
    <button class="btn btn-white btn-lg" data-delay="10">Send in 10 seconds</button>
    <button type="button" class="link center" data-close>Close</button>`);
  sheet.querySelectorAll("[data-delay]").forEach(b=>b.addEventListener("click", async ()=>{
    const d = Number(b.dataset.delay);
    try { await sendTest(d); closeSheet(); toast(d ? "On its way in 10 seconds" : "Sent"); }
    catch(e){ toast(e.message==="dismissed" ? "Notifications weren't allowed." : e.message==="blocked" ? "Notifications are turned off." : "Couldn't send: " + e.message, true); }
  }));
}

export async function settingsView(root){
  root.innerHTML = `<header class="head"><h1>Settings</h1></header><div class="loading">Loading…</div>`;
  let s, user, device;
  try { [s, user, device] = await Promise.all([loadSettings(), currentUser(), deviceRow()]); }
  catch(e){ problem(root, e, ()=>settingsView(root)); root.insertAdjacentHTML("afterbegin", `<header class="head"><h1>Settings</h1></header>`); return; }

  // reminders use the time zone of the device last used here
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone && zone!==s.timezone) saveSettings({ timezone: zone }).then(n=>{ s = n; }).catch(()=>{});

  root.innerHTML = `
    <header class="head"><h1>Settings</h1></header>
    <p class="label">Reminders</p>
    <div class="group">
      ${device}
      ${toggle("notify_due", "Notify when a step is due", s.notify_due)}
      ${pick("remind_before", "Remind me", s.remind_before, BEFORE, before)}
      ${toggle("morning_summary", "Morning summary", s.morning_summary)}
      ${pick("summary_time", "Summary time", s.summary_time, TIMES.includes(s.summary_time) ? TIMES : [s.summary_time, ...TIMES], clock)}
      ${pushState()==="ready" ? `<button type="button" class="srow" data-act="test"><span>Send a test notification</span>${icon("chevron")}</button>` : ""}
    </div>
    <p class="hint">Steps with a time remind you before. Steps with only a date are in the morning summary.</p>
    <p class="label">Follow-up rules</p>
    <div class="group">${RULES.map(r=>pick(r.key, r.label, s[r.key], Array.from({ length: r.max }, (_, i)=>i + 1), n=>amount(Number(n), r.unit))).join("")}</div>
    <p class="hint">KlienKu uses these to suggest the next step when you tap Mark done.</p>
    <p class="label">Account</p>
    <div class="group">
      <div class="srow"><span>Email</span><b>${esc(user && user.email)}</b></div>
      <button type="button" class="srow" data-act="password"><span>Change password</span>${icon("chevron")}</button>
      <button type="button" class="srow" data-act="download"><span>Download my data<small>Your clients and their history, as a spreadsheet</small></span>${icon("chevron")}</button>
      <button type="button" class="srow danger" data-act="signout"><span>Sign out</span></button>
    </div>
    <p class="label">About</p>
    <div class="group">
      <a class="srow" href="/privacy"><span>Privacy Policy</span>${icon("chevron")}</a>
      <a class="srow" href="/terms"><span>Terms of Use</span>${icon("chevron")}</a>
      <a class="srow" href="mailto:hello@kasahkod.cc?subject=KlienKu"><span>Contact</span><b>hello@kasahkod.cc</b></a>
    </div>
    <p class="label">Danger zone</p>
    <button type="button" class="group danger-row" data-act="delete"><b>Delete my account</b>
      <span>Removes your account and all your clients for good.</span></button>
    <p class="foot">KlienKu · { kasah kod }</p>`;

  // settings saved on the server
  root.querySelectorAll("select, input.switch:not([name=device])").forEach(el=>el.addEventListener("change", async ()=>{
    const value = el.type==="checkbox" ? el.checked : el.name==="summary_time" ? el.value : Number(el.value);
    try { s = await saveSettings({ [el.name]: value }); toast("Saved"); }
    catch(e){ toast(e.message, true); if (el.type==="checkbox") el.checked = !!s[el.name]; else el.value = s[el.name]; }
    if (el.tagName==="SELECT") el.parentElement.querySelector("b").textContent = el.selectedOptions[0].textContent;
  }));
  // this device: ask permission and subscribe, or unsubscribe
  const dev = root.querySelector("[name=device]");
  if (dev) dev.addEventListener("change", async ()=>{
    try {
      if (dev.checked){ await turnOn(); toast("Reminders on for this device"); }
      else { await turnOff(); toast("Reminders off for this device"); }
    } catch(e){
      dev.checked = !dev.checked;
      toast(e.message==="dismissed" ? "Notifications weren't allowed." : e.message==="blocked" ? "Notifications are turned off for KlienKu." : e.message, true);
      if (e.message==="blocked") settingsView(root);
    }
  });
  const test = root.querySelector('[data-act="test"]');
  if (test) test.addEventListener("click", testSheet);
  root.querySelector('[data-act="password"]').addEventListener("click", passwordSheet);
  root.querySelector('[data-act="download"]').addEventListener("click", downloadSheet);
  root.querySelector('[data-act="delete"]').addEventListener("click", ()=>deleteSheet(user && user.email));
  root.querySelector('[data-act="signout"]').addEventListener("click", async ()=>{
    try { await turnOff().catch(()=>{}); await signOut(); forgetClients(); location.replace("/signin"); }
    catch(e){ toast("Couldn't sign out. Check your connection and try again.", true); }
  });
}
