/* Stages and the suggested next step after finishing one (FigJam "3. Suggested next steps").
   Days can be a number or the name of a follow-up rule in Settings; "pick" means choose a date. */
import { ordinal } from "./dates.js";

export const STAGES = [
  { key: "new", label: "New" },
  { key: "contacting", label: "Contacting" },
  { key: "site_visit", label: "Site visit" },
  { key: "quote_sent", label: "Quote sent" },
  { key: "negotiating", label: "Negotiating" },
];
export const stageLabel = key => key==="won" ? "Won" : key==="closed" ? "Closed" : (STAGES.find(s=>s.key===key) || {}).label || key;
const rank = key => STAGES.findIndex(s=>s.key===key);
export const isOpen = c => rank(c.stage) >= 0;

const AFTER = {
  "reply to first message": { next: "Ask for details", days: 1, stage: "contacting" },
  "ask for details":        { next: "Book site visit", days: 1, stage: "site_visit" },
  "call":                   { next: "Book site visit", days: 1, stage: "site_visit" },
  "book site visit":        { next: "Do site visit", days: "pick", stage: "site_visit" },
  "do site visit":          { next: "Send quote", days: "quote_after_visit_days", stage: "site_visit" },
  "send quote":             { next: "Follow up on quote", days: "quote_follow_up_days", stage: "quote_sent" },
  "follow up on quote":     { next: "Call to discuss", days: 2, stage: "negotiating" },
  "call to discuss":        { next: "Follow up", days: "follow_up_days", stage: "negotiating" },
};
/* When the finished step isn't one of the above (e.g. "Follow up" or something typed in). */
const BY_STAGE = {
  new:         { next: "Ask for details", days: 1, stage: "contacting" },
  contacting:  { next: "Book site visit", days: 1, stage: "site_visit" },
  site_visit:  { next: "Send quote", days: "quote_after_visit_days", stage: "site_visit" },
  quote_sent:  { next: "Follow up on quote", days: "quote_follow_up_days", stage: "quote_sent" },
  negotiating: { next: "Follow up", days: "follow_up_days", stage: "negotiating" },
};
/* Other choices offered under the suggestion, per stage. */
const OTHERS = {
  new:         ["Follow up", "Call", "Book site visit"],
  contacting:  ["Follow up", "Call", "Book site visit"],
  site_visit:  ["Send quote", "Follow up", "Book another site visit"],
  quote_sent:  ["Follow up on quote", "Call to discuss", "Book another site visit"],
  negotiating: ["Follow up", "Call to discuss", "Book another site visit"],
};

const days = (d, settings) => typeof d==="string" && d!=="pick" ? settings[d] : d;

/* After marking the client's current step done: {next, days, stage, others}. Stages only move forward. */
export function suggestAfterDone(client, settings){
  const rule = AFTER[(client.next_step || "").toLowerCase()] || BY_STAGE[client.stage] || BY_STAGE.contacting;
  const stage = rank(rule.stage) > rank(client.stage) ? rule.stage : client.stage;
  const others = OTHERS[stage].filter(s=>s!==rule.next);
  return { next: rule.next, days: days(rule.days, settings), stage, others };
}

/* After "No reply": try again later; suggest closing once the tries run out. */
export function suggestAfterNoReply(client, settings){
  const tries = client.tries + 1;
  return { next: "Follow up", days: settings.follow_up_days, stage: client.stage, tries, suggestClose: tries >= settings.max_tries };
}

/* "Follow up · 2nd try" once there's been no reply before. */
export const stepLabel = c => c.next_step + (c.tries > 0 ? ` · ${ordinal(c.tries + 1)} try` : "");

/* WhatsApp link for a Malaysian or international number: 012-345 6789 → 60123456789. */
export function whatsapp(phone){
  let n = (phone || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("0")) n = "60" + n.slice(1);
  return n.length >= 8 ? "https://wa.me/" + n : null;
}
