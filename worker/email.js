/* Account emails (confirm email, reset password), sent through Resend from
   no-reply@kasahkod.cc. Needs the secret RESEND_API_KEY. Running locally without it,
   the email is printed in the terminal instead. */
const FROM = "KlienKu <no-reply@kasahkod.cc>";

export async function sendEmail(env, to, subject, text){
  if (!env.RESEND_API_KEY && env.BETTER_AUTH_URL.startsWith("http://localhost")){
    console.log(`[email] to ${to} · ${subject}\n${text}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + await r.text());
}
