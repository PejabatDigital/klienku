/* Settings (Figma 6): a short menu, each part on its own page — /settings/account (in
   account.js), /settings/notifications (this device, follow-up reminders, morning
   summary) and /settings/about. Changes save straight away. */
import { loadSettings, saveSettings } from "../api.js";
import { currentUser } from "../account.js";
import { clock } from "../dates.js";
import { isIOS } from "../pwa.js";
import { deviceOn, pushState, sendTest, turnOff, turnOn } from "../push.js";
import { closeSheet, openSheet } from "../sheets.js";
import { accountPage } from "./account.js";
import { esc, icon, problem, toast } from "../ui.js";

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

/* Sub-pages start with Back to Settings and their title. */
export const subHead = title => `<nav class="topbar"><button class="back" data-act="back">${icon("back")}Settings</button></nav>
  <header class="head"><h1>${title}</h1></header>`;

/* Reminders use the time zone of the device last used here. */
function syncZone(s){
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone && zone!==s.timezone) saveSettings({ timezone: zone }).catch(()=>{});
}

/* /settings/notifications */
async function notificationsPage(root){
  root.insertAdjacentHTML("beforeend", `<div class="loading">Loading…</div>`);
  let s, device;
  try { [s, device] = await Promise.all([loadSettings(), deviceRow()]); }
  catch(e){ return problem(root.querySelector(".loading"), e, ()=>settingsView(root, { id: "notifications" })); }
  syncZone(s);
  root.querySelector(".loading").outerHTML = `
    <div class="group">
      ${device}
      ${toggle("notify_due", "Notify when a follow-up is due", s.notify_due)}
      ${pick("remind_before", "Remind me", s.remind_before, BEFORE, before)}
    </div>
    <p class="hint">Follow-ups with a time remind you before. Follow-ups with only a date, and leads with no follow-up yet, are in the morning summary.</p>
    <p class="label">Morning summary</p>
    <div class="group">
      ${toggle("morning_summary", "Morning summary", s.morning_summary)}
      ${pick("summary_time", "Summary time", s.summary_time, TIMES.includes(s.summary_time) ? TIMES : [s.summary_time, ...TIMES], clock)}
    </div>
    ${pushState()==="ready" ? `<div class="group gap"><button type="button" class="srow" data-act="test"><span>Send a test notification</span>${icon("chevron")}</button></div>` : ""}`;

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
      if (e.message==="blocked") settingsView(root, { id: "notifications" });
    }
  });
  const test = root.querySelector('[data-act="test"]');
  if (test) test.addEventListener("click", testSheet);
}

/* /settings/about */
function aboutPage(root){
  root.insertAdjacentHTML("beforeend", `<div class="group">
      <a class="srow" href="/privacy"><span>Privacy Policy</span>${icon("chevron")}</a>
      <a class="srow" href="/terms"><span>Terms of Use</span>${icon("chevron")}</a>
      <a class="srow" href="mailto:hello@kasahkod.cc?subject=KlienKu"><span>Contact</span><b>hello@kasahkod.cc</b></a>
    </div>
    <p class="foot">KlienKu · { kasah kod }</p>`);
}

const PAGES = { account: ["Account", accountPage], notifications: ["Notifications", notificationsPage], about: ["About", aboutPage] };

export async function settingsView(root, { id } = {}, { back } = {}){
  root.onclick = e=>{ if (e.target.closest('[data-act="back"]')) back("/settings"); };
  if (PAGES[id]){
    const [title, page] = PAGES[id];
    root.innerHTML = subHead(title);
    return page(root);
  }
  // the menu: each row says what's set inside
  root.innerHTML = `<header class="head"><h1>Settings</h1></header><div class="loading">Loading…</div>`;
  let s, user, on;
  try { [s, user, on] = await Promise.all([loadSettings(), currentUser(), deviceOn().catch(()=>false)]); }
  catch(e){ return problem(root.querySelector(".loading"), e, ()=>settingsView(root, {}, { back })); }
  syncZone(s);
  const row = (path, ic, label, sub) => `<a class="srow menu" href="/settings/${path}" data-link>
    <i class="ico">${icon(ic)}</i><span>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</span>${icon("chevron")}</a>`;
  const device = pushState()==="ready" && on ? "On" : "Off";
  root.querySelector(".loading").outerHTML = `<div class="group">
      ${row("account", "user", "Account", user ? (user.name ? `${user.name} · ${user.email}` : user.email) : "")}
      ${row("notifications", "bell", "Notifications", `${device} on this device · ${s.morning_summary ? `summary ${clock(s.summary_time)}` : "no summary"}`)}
      ${row("about", "info", "About", "Privacy, terms and contact")}
    </div>
    <p class="foot">KlienKu · { kasah kod }</p>`;
}
