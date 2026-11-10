/* Bottom sheets (centred dialogs on wide screens) and the confirm dialog (Figma 11 Delete). */
import { esc } from "./ui.js";

/* Opens a sheet with `html`; returns its panel. Tapping outside or [data-close] closes it. */
export function openSheet(html, cls = ""){
  closeSheet();
  const layer = document.createElement("div");
  layer.className = "layer";
  layer.innerHTML = `<div class="backdrop" data-close></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.append(layer);
  document.body.classList.add("locked");
  requestAnimationFrame(()=>layer.classList.add("in"));
  layer.addEventListener("click", e=>{ if (e.target.closest("[data-close]")) closeSheet(); });
  return layer.querySelector(".sheet");
}
export function closeSheet(){
  document.querySelectorAll(".layer").forEach(l=>l.remove());
  document.body.classList.remove("locked");
}

/* ── Confirm dialog (Figma 11) ── resolves true when confirmed. */
export function confirmDialog({ title, text, ok = "Delete" }){
  return new Promise(resolve=>{
    closeSheet();
    const layer = document.createElement("div");
    layer.className = "layer center in";
    layer.innerHTML = `<div class="backdrop"></div><div class="alert" role="alertdialog" aria-modal="true">
      <h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="alert-btns"><button type="button" data-a="0">Cancel</button><button type="button" class="danger" data-a="1">${esc(ok)}</button></div></div>`;
    document.body.append(layer);
    layer.addEventListener("click", e=>{
      const a = e.target.closest("[data-a]");
      if (!a && !e.target.classList.contains("backdrop")) return;
      layer.remove();
      resolve(!!a && a.dataset.a==="1");
    });
  });
}
