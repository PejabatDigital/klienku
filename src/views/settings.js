/* Settings (Figma 6): a short menu, each part on its own page — /settings/account (in
   account.js) and /settings/about. Reminders are off in Version 3 for now. */
import { currentUser } from "../account.js";
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
  const user = await currentUser().catch(()=>null);
  const row = (path, ic, label, sub) => `<a class="srow menu" href="/settings/${path}" data-link>
    <i class="ico">${icon(ic)}</i><span>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</span>${icon("chevron")}</a>`;
  root.innerHTML = `<header class="head"><h1>Settings</h1></header><div class="group">
      ${row("account", "user", "Account", user ? (user.name ? `${user.name} · ${user.email}` : user.email) : "")}
      ${row("about", "info", "About", "Privacy, terms and contact")}
    </div>
    <p class="foot">KlienKu · { kasah kod }</p>`;
}
