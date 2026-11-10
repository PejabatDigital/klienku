/* Settings (Figma 6): a short menu — the Google Sheet (opens it), then pages of their own:
   /settings/account (in account.js) and /settings/about. Reminders are off in Version 3. */
import { currentUser } from "../account.js";
import { cachedSheet, loadSheet } from "../api.js";
import { accountPage } from "./account.js";
import { esc, icon } from "../ui.js";

/* Sub-pages start with Back to Settings and their title. */
export const subHead = title => `<nav class="topbar"><button class="back" data-act="back">${icon("back")}Settings</button></nav>
  <header class="head"><h1>${title}</h1></header>`;

/* /settings/about */
function aboutPage(root){
  root.insertAdjacentHTML("beforeend", `<div class="group">
      <a class="srow" href="/privacy"><span>Privacy Policy</span>${icon("chevron")}</a>
      <a class="srow" href="/terms"><span>Terms of Use</span>${icon("chevron")}</a>
      <a class="srow" href="mailto:hello@kasahkod.cc?subject=KlienKu"><span>Contact</span><b>hello@kasahkod.cc</b></a>
    </div>
    <p class="foot">KlienKu · { kasah kod }</p>`);
}

const PAGES = { account: ["Account", accountPage], about: ["About", aboutPage] };

export async function settingsView(root, { id } = {}, { back } = {}){
  root.onclick = e=>{ if (e.target.closest('[data-act="back"]')) back("/settings"); };
  if (PAGES[id]){
    const [title, page] = PAGES[id];
    root.innerHTML = subHead(title);
    return page(root);
  }
  // the menu: each row says what's set inside
  const [user, sheet] = await Promise.all([currentUser().catch(()=>null), cachedSheet() || loadSheet().catch(()=>null)]);
  const inner = (ic, label, sub) => `<i class="ico">${icon(ic)}</i><span>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</span>${icon("chevron")}`;
  const row = (path, ic, label, sub) => `<a class="srow menu" href="/settings/${path}" data-link>${inner(ic, label, sub)}</a>`;
  root.innerHTML = `<header class="head"><h1>Settings</h1></header>
    ${sheet ? `<div class="group"><a class="srow menu" href="${esc(sheet.sheet_url)}" target="_blank" rel="noopener">${inner("sheet", "Google Sheet", "Renovasi KL Leads, where your leads are kept")}</a></div>` : ""}
    <div class="group${sheet ? " gap" : ""}">
      ${row("account", "user", "Account", user ? (user.name ? `${user.name} · ${user.email}` : user.email) : "")}
      ${row("about", "info", "About", "Privacy, terms and contact")}
    </div>
    <p class="foot">KlienKu · { kasah kod }</p>`;
}
