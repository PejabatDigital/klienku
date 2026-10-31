/* First-time setup (Figma 17), shown once per device over the app when this device doesn't
   get reminders yet: allow notifications, morning summary. ("Unlock with Face ID" isn't
   built: sessions last 60 days, so there's no password to skip.) */
import { loadSettings, saveSettings } from "../api.js";
import { clock } from "../dates.js";
import { isIOS } from "../pwa.js";
import { deviceOn, pushState, turnOn } from "../push.js";
import { esc, toast } from "../ui.js";

const KEY = "kk:setupDone";
const BELL = '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>';
const svg = p => `<i class="ico"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${p}</svg></i>`;

export async function maybeShowSetup(){
  try { if (localStorage.getItem(KEY)) return; } catch(e){ return; }
  const state = pushState();
  if (state==="unsupported" || await deviceOn()) { try { localStorage.setItem(KEY, "1"); } catch(e){} return; }
  const s = await loadSettings().catch(()=>null);
  if (!s) return;

  const notifyRow = state==="install"
    ? `<span><b>Notifications</b><small>First add KlienKu to your Home Screen: Share → Add to Home Screen, then open it from there.</small></span>`
    : state==="blocked"
    ? `<span><b>Notifications</b><small>Turned off. ${isIOS() ? "You can turn them on in iPhone Settings → Notifications → KlienKu." : "You can allow them for this site in your browser settings."}</small></span>`
    : `<span><b>Notifications</b><small>Alert me when a follow-up is due</small></span><button type="button" class="allow" data-act="allow">Allow</button>`;

  const layer = document.createElement("div");
  layer.className = "setup";
  layer.innerHTML = `<div class="setup-in">
    <span class="tag">Quick setup · 1 minute</span>
    <h1>Never miss a follow-up</h1>
    <p class="lead">Turn these on so KlienKu can remind you. You can change them later in Settings.</p>
    <div class="group">
      <div class="srow">${svg(BELL)}${notifyRow}</div>
      <label class="srow">${svg(SUN)}<span><b>Morning summary</b><small>Every day at ${esc(clock(s.summary_time))}</small></span>
        <input type="checkbox" class="switch" name="morning_summary"${s.morning_summary ? " checked" : ""}></label>
    </div>
    <button class="btn btn-primary btn-lg" data-act="done">Get started</button>
  </div>`;
  document.body.append(layer);
  document.body.classList.add("locked");

  const allow = layer.querySelector('[data-act="allow"]');
  if (allow) allow.addEventListener("click", async ()=>{
    allow.disabled = true;
    try { await turnOn(); allow.textContent = "On ✓"; allow.classList.add("on"); }
    catch(e){
      allow.disabled = false;
      toast(e.message==="blocked" ? "Notifications are turned off for KlienKu." : e.message==="dismissed" ? "Tap Allow, then choose Allow." : e.message, true);
    }
  });
  layer.querySelector("[name=morning_summary]").addEventListener("change", e=>{
    saveSettings({ morning_summary: e.target.checked }).catch(err=>{ e.target.checked = !e.target.checked; toast(err.message, true); });
  });
  layer.querySelector('[data-act="done"]').addEventListener("click", ()=>{
    try { localStorage.setItem(KEY, "1"); } catch(e){}
    layer.remove();
    document.body.classList.remove("locked");
  });
}
