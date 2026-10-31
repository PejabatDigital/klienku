/* Lead helpers: statuses (from src/lists.js), the follow-up text, the WhatsApp link.
   Statuses can change in any order; Won and Lost have no follow-up. */
import { CLOSED, STATUSES } from "./lists.js";

export const statusLabel = key => (STATUSES.find(s=>s.key===key) || {}).label || key;
export const isActive = c => !CLOSED.includes(c.stage);
/* The statuses a lead can be in while active, in list order. */
export const ACTIVE_STATUSES = STATUSES.filter(s=>!CLOSED.includes(s.key));

/* What the next follow-up is about; "Follow up" when no note was written. */
export const followUpText = c => c.next_step || "Follow up";

/* "RM 15,000", or "" when there's no budget. */
export const money = n => n==null ? "" : "RM " + Number(n).toLocaleString("en-MY");

/* WhatsApp link for a Malaysian or international number: 012-345 6789 → 60123456789. */
export function whatsapp(phone){
  let n = (phone || "").replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("0")) n = "60" + n.slice(1);
  return n.length >= 8 ? "https://wa.me/" + n : null;
}
