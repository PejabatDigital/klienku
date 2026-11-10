/* Settings → Account (/settings/account): name, phone, email, change password, the Google
   Sheet, sign out, and delete my account (type DELETE to confirm). */
import { api, forgetSheet } from "../api.js";
import { currentUser, signOut, updateUser } from "../account.js";
import { turnOff } from "../push.js";
import { closeSheet, openSheet } from "../sheets.js";
import { esc, icon, problem, toast } from "../ui.js";

const FIELDS = {
  name: { label: "Name", type: "text", max: 100, auto: "name", hint: "e.g. Amin Rahman" },
  phone: { label: "Phone", type: "tel", max: 30, auto: "tel", hint: "e.g. 012-345 6789" },
};

/* Edit one profile field in a sheet; leaving it empty clears it. */
function fieldSheet(key, value, onSaved){
  const f = FIELDS[key];
  const sheet = openSheet(`
    <h2>${f.label}</h2>
    <form novalidate>
      <input class="note" name="v" type="${f.type}" value="${esc(value)}" placeholder="${f.hint}" maxlength="${f.max}" autocomplete="${f.auto}">
      <button class="btn btn-primary btn-lg">Save</button>
    </form>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const form = sheet.querySelector("form"), input = form.elements.v;
  form.addEventListener("submit", async e=>{
    e.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    try { const user = await updateUser({ [key]: input.value.trim() }); closeSheet(); toast("Saved"); onSaved(user); }
    catch(err){ toast(err.message, true); btn.disabled = false; }
  });
  input.focus();
}

export async function accountPage(root){
  root.insertAdjacentHTML("beforeend", `<div class="loading">Loading…</div>`);
  const user = await currentUser();
  if (!user) return problem(root.querySelector(".loading"), new Error("offline"), ()=>location.reload());
  const value = key => user[key] ? `<b>${esc(user[key])}</b>` : `<b class="unset">Add</b>`;
  root.querySelector(".loading").outerHTML = `<div class="account">
    <div class="group">
      <button type="button" class="srow" data-field="name"><span>Name</span>${value("name")}${icon("chevron")}</button>
      <button type="button" class="srow" data-field="phone"><span>Phone</span>${value("phone")}${icon("chevron")}</button>
      <div class="srow"><span>Email</span><b>${esc(user.email)}</b></div>
    </div>
    <div class="group gap">
      <button type="button" class="srow" data-act="password"><span>Change password</span>${icon("chevron")}</button>
      <button type="button" class="srow danger" data-act="signout"><span>Sign out</span></button>
    </div>
    <p class="label">Danger zone</p>
    <button type="button" class="group danger-row" data-act="delete"><b>Delete my account</b>
      <span>Removes your KlienKu account. Your leads stay in the Google Sheet.</span></button>
  </div>`;
  const box = root.querySelector(".account");
  box.querySelectorAll("[data-field]").forEach(b=>b.addEventListener("click", ()=>fieldSheet(b.dataset.field, user[b.dataset.field], u=>{
    Object.assign(user, u);
    b.querySelector("b").outerHTML = value(b.dataset.field);
  })));
  box.querySelector('[data-act="password"]').addEventListener("click", passwordSheet);
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
    <p class="sub">This deletes your KlienKu account (${esc(email)}) for good. It can't be undone.
      Your leads aren't touched: they stay in the Google Sheet.</p>
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
