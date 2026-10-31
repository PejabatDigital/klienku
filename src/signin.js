/* The sign-in page (/signin): sign in, first-time setup (only while no account exists),
   forgot password, check your email, and set a new password. Talks to Better Auth's
   routes under /api/auth (see worker/auth.js). */
import { isIOS } from "./pwa.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const ICONS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
};

const MODES = {
  signin: { title: "Welcome back", intro: "Sign in to see who to follow up with today.", button: "Sign in",
            email: true, password: "current-password", forgot: true, brand: true, note: true },
  setup:  { title: "Set up KlienKu", intro: "Create your account. Only you will be able to sign in.", button: "Create account",
            email: true, password: "new-password", confirm: true, brand: true, agree: true },
  forgot: { title: "Forgot password?", intro: "Enter your email and we'll send you a link to set a new password.", button: "Send reset link",
            email: true, back: true, badge: "mail" },
  sent:   { title: "Check your email", back: true, badge: "mail", sent: true },
  reset:  { title: "Set a new password", intro: "", button: "Save password",
            password: "new-password", passwordLabel: "New password", confirm: true, badge: "shield" },
};

let mode, sentTo = "", sentKind = "", timer;

function show(m, message = "", isError = false){
  mode = m;
  const c = MODES[m];
  $("title").textContent = c.title;
  $("intro").textContent = c.intro || "";
  $("intro").hidden = !c.intro && m!=="sent";
  $("submit").textContent = c.button || "";
  $("form").hidden = !!c.sent;
  $("emailField").hidden = !c.email;
  $("passwordField").hidden = !c.password;
  if (c.password) $("password").autocomplete = c.password;
  $("passwordLabel").textContent = c.passwordLabel || "Password";
  $("confirmField").hidden = $("rules").hidden = !c.confirm;
  $("forgotLink").hidden = !c.forgot;
  $("agree").hidden = !c.agree;
  $("back").hidden = !c.back;
  $("brand").hidden = !c.brand;
  $("badge").hidden = !c.badge;
  if (c.badge) $("badge").innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[c.badge]}</svg>`;
  $("privateNote").hidden = !c.note;
  $("sent").hidden = $("spamTip").hidden = !c.sent;
  if (c.sent) startSent();
  $("password").value = $("confirm").value = "";
  checkRules();
  say(message, isError);
}

function say(text, isError){ $("msg").textContent = text; $("msg").className = "msg" + (isError ? " err" : ""); }

/* Live password rules (setup and reset). Returns true when all pass. */
function checkRules(){
  const p = $("password").value, ok = {
    length: p.length >= 8,
    number: /\d/.test(p),
    match: p.length > 0 && p===$("confirm").value,
  };
  document.querySelectorAll("[data-rule]").forEach(li=>li.classList.toggle("ok", ok[li.dataset.rule]));
  return ok.length && ok.number && ok.match;
}

/* "Check your email": what was sent, the Mail button (iPhone/iPad only), and a resend countdown. */
function startSent(){
  $("intro").textContent = `We sent ${sentKind==="reset" ? "a reset link" : "a link to confirm your email"} to ${sentTo}. The link works for 1 hour.`;
  $("openMail").hidden = !isIOS();
  clearInterval(timer);
  let left = 45;
  const tick = () => {
    $("resend").disabled = left > 0;
    $("resend").textContent = left > 0 ? `Resend in 0:${String(left).padStart(2, "0")}` : "Resend";
    if (left-- <= 0) clearInterval(timer);
  };
  tick(); timer = setInterval(tick, 1000);
}

async function post(path, body){
  const r = await fetch("/api/auth/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(()=>({}));
  if (!r.ok){ const e = new Error(d.message || "HTTP " + r.status); e.code = d.code; e.status = r.status; throw e; }
  return d;
}

function friendly(e){
  if (!navigator.onLine) return "You're offline. Try again when you're back online.";
  switch (e.code){
    case "INVALID_EMAIL_OR_PASSWORD": return "That email and password don't match.";
    case "INVALID_EMAIL": return "Please check the email address.";
    case "PASSWORD_TOO_SHORT": return "Please use at least 8 characters.";
    case "PASSWORD_TOO_LONG": return "Please use at most 128 characters.";
    case "EMAIL_NOT_VERIFIED": return "Please confirm your email first. We've sent you a new link.";
    case "INVALID_TOKEN": return "That link has expired or was already used. Ask for a new one.";
    case "SIGNUP_CLOSED": return "KlienKu is private. Only its owner can sign in.";
    case "USER_ALREADY_EXISTS": case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL": return "There's already an account for that email. Sign in instead.";
  }
  if (e.status===429) return "Too many tries. Please wait a minute and try again.";
  return "Something went wrong. Please try again.";
}

const callbackURL = "/signin?mode=verified";

$("form").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const c = MODES[mode], email = $("email").value.trim(), password = $("password").value;
  if (c.email && !email) return say("Please enter your email.", true);
  if (c.password && !password) return say("Please enter your password.", true);
  if (c.confirm && !checkRules()) return say("Please meet all the password rules above.", true);
  $("submit").disabled = true;
  say("");
  try {
    if (mode==="signin"){
      await post("sign-in/email", { email, password, callbackURL });
      location.replace("/");
      return;
    }
    if (mode==="setup"){
      await post("sign-up/email", { email, password, name: "", callbackURL });
      sentTo = email; sentKind = "verify"; show("sent");
    } else if (mode==="forgot"){
      await post("request-password-reset", { email, redirectTo: "/signin?mode=reset" });
      sentTo = email; sentKind = "reset"; show("sent");
    } else if (mode==="reset"){
      await post("reset-password", { newPassword: password, token: params.get("token") });
      history.replaceState(null, "", "/signin");
      show("signin", "Your new password is saved. You can sign in now.");
    }
  } catch(e){
    if (e.code==="INVALID_TOKEN") show("forgot", friendly(e), true);
    else if (e.code==="EMAIL_NOT_VERIFIED"){ sentTo = email; sentKind = "verify"; show("sent"); }
    else say(friendly(e), true);
  } finally {
    $("submit").disabled = false;
  }
});

$("resend").addEventListener("click", async ()=>{
  $("resend").disabled = true;
  try {
    if (sentKind==="reset") await post("request-password-reset", { email: sentTo, redirectTo: "/signin?mode=reset" });
    else await post("send-verification-email", { email: sentTo, callbackURL });
    startSent();
  } catch(e){ $("resend").textContent = friendly(e); }
});

$("forgotLink").addEventListener("click", e=>{ e.preventDefault(); const email = $("email").value; show("forgot"); $("email").value = email; });
$("back").addEventListener("click", ()=>{ history.replaceState(null, "", "/signin"); start(); });
$("password").addEventListener("input", checkRules);
$("confirm").addEventListener("input", checkRules);
document.querySelectorAll("[data-show]").forEach(b=>b.addEventListener("click", ()=>{
  const input = $(b.dataset.show), hidden = input.type==="password";
  input.type = hidden ? "text" : "password";
  if (mode!=="signin") $("confirm").type = input.type;
  b.textContent = hidden ? "Hide" : "Show";
}));

/* Opening the page: from an email link, or straight to sign in (or setup, if no account yet). */
async function start(){
  const m = params.get("mode");
  if (m==="reset" && params.get("token")) return show("reset");
  if (m==="reset" && params.get("error")) return show("forgot", friendly({ code: "INVALID_TOKEN" }), true);
  if (m==="verified"){
    if (params.get("error")) return show("signin", "That confirmation link has expired or was already used. Sign in to get a new one.", true);
    const s = await fetch("/api/auth/get-session").then(r=>r.json()).catch(()=>null);
    if (s && s.user) return location.replace("/");
    return show("signin", "Your email is confirmed. You can sign in now.");
  }
  const setup = await fetch("/api/setup").then(r=>r.json()).catch(()=>({ open: false }));
  show(setup.open ? "setup" : "signin");
}
start();
