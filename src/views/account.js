/* Account sheets opened from Settings: change password, download my data (CSV), and
   delete my account (type DELETE to confirm). */
import { api, forgetClients } from "../api.js";
import { isIOS } from "../pwa.js";
import { turnOff } from "../push.js";
import { closeSheet, openSheet } from "../sheets.js";
import { esc, toast } from "../ui.js";

/* Better Auth routes under /api/auth (worker/auth.js). */
async function auth(path, body){
  let r;
  try { r = await fetch("/api/auth/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
  catch(e){ throw new Error("You're offline. Try again when you're back online."); }
  const d = await r.json().catch(()=>({}));
  if (r.status===429) throw new Error("Too many tries. Please wait a minute and try again.");
  if (d.code==="INVALID_PASSWORD") throw new Error("Your current password isn't right.");
  if (d.code==="PASSWORD_TOO_LONG") throw new Error("Please use at most 128 characters.");
  if (!r.ok) throw new Error("Couldn't change your password. Please try again.");
  return d;
}

export function passwordSheet(){
  const sheet = openSheet(`
    <h2>Change password</h2>
    <p class="sub">Your other devices will be signed out. This one stays signed in.</p>
    <form class="pw" novalidate>
      <label class="field"><span>Current password</span><input name="current" type="password" autocomplete="current-password"></label>
      <label class="field"><span>New password</span><input name="password" type="password" autocomplete="new-password"></label>
      <label class="field"><span>Confirm new password</span><input name="confirm" type="password" autocomplete="new-password"></label>
      <ul class="rules">
        <li data-rule="length">At least 8 characters</li>
        <li data-rule="number">Includes a number</li>
        <li data-rule="match">Passwords match</li>
      </ul>
      <button class="btn btn-primary btn-lg">Save password</button>
    </form>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const form = sheet.querySelector("form"), f = name => form.elements[name];
  const rules = () => {
    const p = f("password").value, ok = { length: p.length >= 8, number: /\d/.test(p), match: p.length > 0 && p===f("confirm").value };
    form.querySelectorAll("[data-rule]").forEach(li=>li.classList.toggle("ok", ok[li.dataset.rule]));
    return ok.length && ok.number && ok.match;
  };
  form.addEventListener("input", rules);
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    if (!f("current").value) return toast("Please enter your current password.", true);
    if (!rules()) return toast("Please meet all the password rules.", true);
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      await auth("change-password", { currentPassword: f("current").value, newPassword: f("password").value, revokeOtherSessions: true });
      closeSheet(); toast("Password changed");
    } catch(err){ toast(err.message, true); btn.disabled = false; }
  });
  f("current").focus();
}

/* Gets the file first, then saves it on the tap (iPhone's share sheet needs a fresh tap):
   iPhone/iPad → share sheet (Save to Files, AirDrop, Mail…); Mac → Downloads. */
export function downloadSheet(){
  const sheet = openSheet(`
    <h2>Download my data</h2>
    <p class="sub">All your clients and their history, as a spreadsheet file you can open in Numbers, Excel or Google Sheets.</p>
    <button class="btn btn-primary btn-lg" data-act="save" disabled>Preparing…</button>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const btn = sheet.querySelector('[data-act="save"]');
  let file;
  (async ()=>{
    try {
      const r = await fetch("/api/export");
      if (r.status===401) return location.replace("/signin");
      if (!r.ok) throw new Error();
      const name = (/filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "") || [])[1] || "klienku-clients.csv";
      file = new File([await r.blob()], name, { type: "text/csv" });
      btn.disabled = false; btn.textContent = "Save file";
    } catch(e){ btn.textContent = navigator.onLine ? "Couldn't prepare it. Try again later." : "You're offline"; }
  })();
  btn.addEventListener("click", async ()=>{
    if (!file) return;
    if (isIOS() && navigator.canShare && navigator.canShare({ files: [file] })){
      try { await navigator.share({ files: [file] }); closeSheet(); return; }
      catch(e){ if (e.name==="AbortError") return; }
    }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: file.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 10_000);
    closeSheet(); toast("Saved to Downloads");
  });
}

export function deleteSheet(email){
  const sheet = openSheet(`
    <h2>Delete my account</h2>
    <p class="sub">This deletes your account (${esc(email)}) and everything in it for good: all your clients, their
      history and your settings. Reminders stop on every device. It can't be undone.</p>
    <p class="sub">Want a copy first? Use Download my data.</p>
    <label class="field"><span>Type DELETE to confirm</span><input name="confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"></label>
    <button class="btn btn-danger btn-lg" data-act="delete" disabled>Delete my account</button>
    <button type="button" class="link center" data-close>Cancel</button>`, "delete-account");
  const input = sheet.querySelector("[name=confirm]"), btn = sheet.querySelector('[data-act="delete"]');
  input.addEventListener("input", ()=>{ btn.disabled = input.value.trim()!=="DELETE"; });
  btn.addEventListener("click", async ()=>{
    btn.disabled = input.disabled = true;
    try {
      await turnOff().catch(()=>{});
      await api("/account", { method: "DELETE" });
    } catch(e){ toast(e.message, true); btn.disabled = input.disabled = false; return; }
    // clear this device too
    forgetClients();
    try { Object.keys(localStorage).filter(k=>k.startsWith("kk:")).forEach(k=>localStorage.removeItem(k)); sessionStorage.clear(); } catch(e){}
    location.replace("/signin");
  });
}
