/* Phase 1 home page: the KlienKu logo and a notification check for this device. */
import { registerSW, isIOS } from "./pwa.js";
import { pushState, sendTest } from "./push.js";

const box = document.getElementById("notify");
const status = document.getElementById("status");
const say = (text, kind = "") => { status.textContent = text; status.className = "status " + kind; };

const views = {
  install: () => `
    <p>On iPhone, notifications only work once KlienKu is on your Home Screen.</p>
    <ol class="steps">
      <li>Tap the <b>Share</b> button in Safari.</li>
      <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
      <li>Open KlienKu from your Home Screen and come back here.</li>
    </ol>`,
  unsupported: () => `
    <p>This browser can't show notifications. ${isIOS() ? "Use Safari and add KlienKu to your Home Screen." : "Try Safari, Chrome or Edge."}</p>`,
  blocked: () => `
    <p>Notifications are turned off for KlienKu.</p>
    <p class="muted">${isIOS() ? "Turn them on in iPhone Settings → Notifications → KlienKu, then reopen the app." : "Allow notifications for this site in your browser settings, then reload."}</p>`,
  ready: () => `
    <p>Tap a button. The first time, allow notifications when asked.</p>
    <button class="btn btn-primary" data-delay="0">Send a test now</button>
    <button class="btn btn-secondary" data-delay="10">Send in 10 seconds</button>
    <p class="muted" style="margin:12px 0 0">Use "10 seconds", then close the app or lock your phone, to check it arrives like a real reminder.</p>`
};

function render(){
  const state = pushState();
  box.innerHTML = views[state]();
  box.querySelectorAll("[data-delay]").forEach(b=>b.addEventListener("click", ()=>test(Number(b.dataset.delay))));
}

async function test(delay){
  const buttons = box.querySelectorAll("button");
  buttons.forEach(b=>b.disabled = true);
  say("Sending…");
  try {
    await sendTest(delay);
    say(delay ? `On its way in ${delay} seconds. Close the app or lock your phone now.` : "Sent. It should appear in a moment.", "ok");
  } catch(e){
    if (e.message==="blocked") return render();
    say(e.message==="dismissed" ? "Notifications weren't allowed. Tap again and choose Allow." : "Couldn't send: " + e.message, "err");
  } finally {
    buttons.forEach(b=>b.disabled = false);
  }
}

registerSW();
render();
