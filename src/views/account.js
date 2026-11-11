/* Settings → Account (/settings/account): name and phone (typed straight into the page,
   saved when you leave the box), email, change password, sign out of other devices, sign
   out, and delete my account (type DELETE to confirm). Drawn at once from the user saved on
   this device, then checked with the server. */
import { api, forgetSheet } from "../api.js";
import { currentUser, knownUser, signOut, signOutOthers, updateUser } from "../account.js";
import { turnOff } from "../push.js";
import { closeSheet, confirmDialog, openSheet } from "../sheets.js";
import { esc, icon, toast } from "../ui.js";

const FIELDS = {
  name: { label: "Name", type: "text", max: 100, auto: "name", hint: "Add your name" },
  phone: { label: "Phone", type: "tel", max: 30, auto: "tel", hint: "Add your phone" },
};

export function accountPage(root){
  const user = knownUser() || { name: "", phone: "", email: "" };
  const input = key => { const f = FIELDS[key]; return `<label class="srow inrow"><span>${f.label}</span>
    <input name="${key}" type="${f.type}" value="${esc(user[key])}" aria-label="${f.label}" aria-label="${f.label}" placeholder="${f.hint}" maxlength="${f.max}" autocomplete="${f.auto}" enterkeyhint="done"></label>`; };
  root.insertAdjacentHTML("beforeend", `<div class="account">
    <p class="label">Profile</p>
    <div class="group">
      ${input("name")}${input("phone")}
      <div class="srow"><span>Email</span><b data-email>${esc(user.email)}</b></div>
    </div>
    <p class="label">Sign-in</p>
    <div class="group">
      <button type="button" class="srow" data-act="password"><span>Change password</span>${icon("chevron")}</button>
      <button type="button" class="srow" data-act="others"><span>Sign out of other devices<small>This one stays signed in</small></span></button>
      <button type="button" class="srow danger" data-act="signout"><span>Sign out</span></button>
    </div>
    <p class="label">Danger zone</p>
    <button type="button" class="group danger-row" data-act="delete"><b>Delete my account</b>
      <span>Removes your KlienKu account and your notes. Your leads stay in the Google Sheet.</span></button>
  </div>
  <p class="foot">KlienKu · { kasah kod }</p>`);
  const box = root.querySelector(".account");

  // name and phone: saved when the box is left (or Done / Return is pressed); empty clears it
  box.querySelectorAll(".inrow input").forEach(el=>{
    el.addEventListener("keydown", e=>{ if (e.key==="Enter"){ e.preventDefault(); el.blur(); } });
    el.addEventListener("change", async ()=>{
      const key = el.name, v = el.value.trim();
      if (v===(user[key] || "")) return;
      try { Object.assign(user, await updateUser({ [key]: v })); el.value = v; toast(`${FIELDS[key].label} saved`); }
      catch(err){ toast(err.message, true); el.value = user[key] || ""; }
    });
  });
  // the server's copy, in case it changed on another device (a box being typed in is left alone)
  currentUser().then(u=>{
    if (!u || !root.contains(box)) return;
    Object.assign(user, u);
    box.querySelector("[data-email]").textContent = u.email;
    box.querySelectorAll(".inrow input").forEach(el=>{ if (document.activeElement!==el) el.value = u[el.name] || ""; });
  });

  box.querySelector('[data-act="password"]').addEventListener("click", passwordSheet);
  box.querySelector('[data-act="others"]').addEventListener("click", async ()=>{
    if (!await confirmDialog({ title: "Sign out other devices?", text: "Every other phone or computer signed in to KlienKu will need your password again.", ok: "Sign out" })) return;
    try { await signOutOthers(); toast("Other devices signed out"); } catch(e){ toast(e.message, true); }
  });
  box.querySelector('[data-act="delete"]').addEventListener("click", ()=>deleteSheet(user.email));
  box.querySelector('[data-act="signout"]').addEventListener("click", async ()=>{
    try { await turnOff().catch(()=>{}); await signOut(); forgetSheet(); location.replace("/signin"); }
    catch(e){ toast("Couldn't sign out. Check your connection and try again.", true); }
  });
}

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

function passwordSheet(){
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

function deleteSheet(email){
  const sheet = openSheet(`
    <h2>Delete my account</h2>
    <p class="sub">This deletes your KlienKu account (${esc(email)}) and your notes for good. It can't be undone.
      Your leads aren't touched: they stay in the Google Sheet.</p>
    <p class="sub">Want your notes first? Settings → Data → Download leads and notes.</p>
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
    forgetSheet();
    try { Object.keys(localStorage).filter(k=>k.startsWith("kk:")).forEach(k=>localStorage.removeItem(k)); sessionStorage.clear(); } catch(e){}
    location.replace("/signin");
  });
}
