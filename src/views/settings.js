/* Settings (Figma 6): a short menu — Account, Data, About — each its own page with Back.
   Every page is the same: a title, then white cards on the background, each card under a
   small heading. Moving between them slides (see app.js). Pages draw straight away from
   what's saved on the device, so the slide never waits for the network.
   /settings/data     the Google Sheet (open it, refresh), download leads + notes
   /settings/account  in account.js
   /settings/about    Privacy Policy and Terms of Use, shown in the app (/settings/privacy,
                      /settings/terms) from the same pages people see signed out
                      (public/privacy.html, terms.html). */
import { knownUser } from "../account.js";
import { cachedSheet, loadSheet } from "../api.js";
import { isClosed } from "../leads.js";
import { isIOS } from "../pwa.js";
import { closeSheet, openSheet } from "../sheets.js";
import { accountPage } from "./account.js";
import { esc, icon, toast } from "../ui.js";

/* Sub-pages start with Back (to their parent) and their title. */
const subHead = (title, parent) => `<nav class="topbar"><button class="back" data-act="back">${icon("back")}${parent}</button></nav>
  <header class="head"><h1>${title}</h1></header>`;
const foot = `<p class="foot">KlienKu · { kasah kod }</p>`;
/* A menu row: icon, label (and a line under it), chevron. */
const inner = (ic, label, sub, end = icon("chevron")) => `${ic ? `<i class="ico">${icon(ic)}</i>` : ""}<span>${label}${sub ? `<small>${sub}</small>` : ""}</span>${end}`;

/* ── Data ── */
function ago(t){
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
const updated = s => s && s.loaded_at ? `Updated ${ago(s.loaded_at)}` : "Get the latest from the sheet";
function sheetLine(sheet){
  if (!sheet) return "Not loaded yet";
  const active = sheet.leads.filter(l=>!isClosed(l)).length;
  return `${sheet.leads.length} leads · ${active} active`;
}

function dataPage(root){
  const sheet = cachedSheet();
  root.insertAdjacentHTML("beforeend", `<p class="label">Google Sheet</p>
    <div class="group">
      ${sheet ? `<a class="srow menu" href="${esc(sheet.sheet_url)}" target="_blank" rel="noopener">${inner("sheet", "Open in Google Sheets", `Renovasi KL Leads · <span data-count>${esc(sheetLine(sheet))}</span>`, icon("external"))}</a>` : ""}
      <button type="button" class="srow menu" data-act="refresh">${inner("refresh", "Refresh from sheet", `<span data-ago>${updated(sheet)}</span>`, "")}</button>
    </div>
    <p class="hint">Changed the sheet directly? Refresh to see it here straight away.</p>
    <p class="label">Your copy</p>
    <div class="group">
      <button type="button" class="srow menu" data-act="download">${inner("download", "Download leads and notes", "One spreadsheet file, with every note")}</button>
    </div>
    <p class="hint">Your notes are kept in KlienKu, not in the Google Sheet. This file is your backup of them.</p>
    ${foot}`);
  const refresh = root.querySelector('[data-act="refresh"]');
  refresh.addEventListener("click", async ()=>{
    refresh.disabled = true; refresh.classList.add("busy");
    try {
      const s = await loadSheet();
      root.querySelector("[data-ago]").textContent = updated(s);
      const count = root.querySelector("[data-count]");
      if (count) count.textContent = sheetLine(s);
      toast("Up to date");
    } catch(e){ toast(e.message, true); }
    refresh.disabled = false; refresh.classList.remove("busy");
  });
  root.querySelector('[data-act="download"]').addEventListener("click", downloadSheet);
}

/* Every lead (the sheet's columns, in its order) with its notes in the last column, newest
   first. Cells starting with = or @ are kept as plain text in Excel / Numbers. */
const NOTE_DAY = at => at.length===10 ? at : new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
function toCsv(leads){
  const cols = [["First contact", "added"], ["Name", "name"], ["Status", "status"], ["Phone", "phone"], ["Source", "source"],
    ["Project type", "type"], ["Location", "location"], ["What they want", "want"], ["Last contacted", "last_contacted"],
    ["Next action", "next_action"], ["Next follow-up", "follow_up"], ["Stopped reason", "reason"]];
  const cell = v => { let s = String(v ?? ""); if (/^[=@]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [...leads].sort((a, b)=>(a.added || "").localeCompare(b.added || "")).map(l=>[
    ...cols.map(([, k])=>l[k]),
    (l.log || []).map(n=>`${NOTE_DAY(n.at)} — ${n.text}`).join("\n\n"),
  ]);
  return "﻿" + [[...cols.map(([h])=>h), "Notes"], ...rows].map(r=>r.map(cell).join(",")).join("\r\n");
}

/* Gets the latest leads first, then saves on the tap (iPhone's share sheet needs a fresh
   tap): iPhone/iPad → share sheet (Save to Files, AirDrop, Mail…); Mac → Downloads. */
function downloadSheet(){
  const sheet = openSheet(`
    <h2>Download leads and notes</h2>
    <p class="sub">Every lead from the Google Sheet, with all its notes, as a spreadsheet file you can open in Numbers, Excel or Google Sheets.</p>
    <button class="btn btn-primary btn-lg" data-act="save" disabled>Preparing…</button>
    <button type="button" class="link center" data-close>Cancel</button>`);
  const btn = sheet.querySelector('[data-act="save"]');
  let file;
  (async ()=>{
    try {
      const s = await loadSheet();
      const day = new Date().toLocaleDateString("en-CA");
      file = new File([toCsv(s.leads)], `klienku-leads-${day}.csv`, { type: "text/csv" });
      btn.disabled = false; btn.textContent = "Save file";
    } catch(e){ btn.textContent = e.offline ? "You're offline" : "Couldn't prepare it. Try again later."; }
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

/* ── About, Privacy Policy, Terms of Use ── */
const LEGAL = { privacy: "/privacy", terms: "/terms" };
const legalText = {};
/* The page's text without its own header and footer; links between the two stay in the app. */
async function loadLegal(key){
  if (legalText[key]) return legalText[key];
  const r = await fetch(LEGAL[key]);
  if (!r.ok) throw new Error("Couldn't load it. Please try again.");
  const doc = new DOMParser().parseFromString(await r.text(), "text/html"), main = doc.querySelector("main");
  main.querySelectorAll(".back, .brand, h1, footer").forEach(e=>e.remove());
  main.querySelectorAll('a[href="/privacy"], a[href="/terms"]').forEach(a=>{ a.setAttribute("href", "/settings" + a.getAttribute("href")); a.setAttribute("data-link", ""); });
  return legalText[key] = main.innerHTML;
}

function aboutPage(root){
  root.insertAdjacentHTML("beforeend", `<div class="group">
      <a class="srow menu" href="/settings/privacy" data-link>${inner("shield", "Privacy Policy", "What KlienKu keeps, and where")}</a>
      <a class="srow menu" href="/settings/terms" data-link>${inner("doc", "Terms of Use", "The rules, in plain words")}</a>
    </div>${foot}`);
  Object.keys(LEGAL).forEach(k=>loadLegal(k).catch(()=>{})); // ready before they're opened
}

function legalPage(key){
  return root => {
    root.insertAdjacentHTML("beforeend", `<article class="box legaltext">${legalText[key] || `<div class="loading">Loading…</div>`}</article>${foot}`);
    if (legalText[key]) return;
    const box = root.querySelector(".legaltext");
    loadLegal(key).then(html=>{ box.innerHTML = html; })
      .catch(e=>{ box.innerHTML = `<p>${esc(navigator.onLine ? e.message : "You're offline. Connect to the internet, then try again.")}</p>`; });
  };
}

/* id → [title, page, Back label, Back path] */
const PAGES = {
  data: ["Data", dataPage, "Settings", "/settings"],
  account: ["Account", accountPage, "Settings", "/settings"],
  about: ["About", aboutPage, "Settings", "/settings"],
  privacy: ["Privacy Policy", legalPage("privacy"), "About", "/settings/about"],
  terms: ["Terms of Use", legalPage("terms"), "About", "/settings/about"],
};
/* How deep a Settings path is (for the slide's direction): menu 1, pages 2, Privacy/Terms 3. */
export const settingsLevel = path => {
  const m = /^\/settings(?:\/(\w+))?$/.exec(path);
  return !m ? 0 : !m[1] ? 1 : m[1]==="privacy" || m[1]==="terms" ? 3 : 2;
};

export function settingsView(root, { id } = {}, { back } = {}){
  const page = PAGES[id];
  root.onclick = e=>{ if (e.target.closest('[data-act="back"]')) back(page ? page[3] : "/settings"); };
  if (page){
    const [title, draw, parent] = page;
    root.innerHTML = subHead(title, parent);
    return draw(root);
  }
  const user = knownUser(), sheet = cachedSheet();
  const row = (path, ic, label, sub) => `<a class="srow menu" href="/settings/${path}" data-link>${inner(ic, label, sub ? esc(sub) : "")}</a>`;
  root.innerHTML = `<header class="head"><h1>Settings</h1></header>
    <div class="group">
      ${row("account", "user", "Account", user ? (user.name ? `${user.name} · ${user.email}` : user.email) : "")}
      ${row("data", "sheet", "Data", sheet ? `Google Sheet · ${sheetLine(sheet)}` : "Google Sheet and download")}
      ${row("about", "info", "About", "Privacy and terms")}
    </div>${foot}`;
}
