/* Renovasi KL's lists, in one place (CLAUDE.md "Version 2"). The app and the Worker both
   import this file, so a change here changes both. Statuses are stored by key; project
   types and sources are stored as the text shown. */

export const STATUSES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "awaiting", label: "Awaiting Customer" },
  { key: "discussion", label: "In Discussion" },
  { key: "site_visit", label: "Site Visit" },
  { key: "quotation", label: "Quotation Sent" },
  { key: "negotiation", label: "Negotiation" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "on_hold", label: "On Hold" },
];
/* Won and Lost leads are finished: no follow-up. Every other status is active. */
export const CLOSED = ["won", "lost"];

export const PROJECT_TYPES = ["Bathroom", "Kitchen", "Full renovation", "Extension", "Roofing",
  "Painting", "Plumbing / electrical", "Other"];

export const SOURCES = ["WhatsApp", "Facebook", "Instagram", "Google", "Website", "Referral", "Walk-in", "Other"];

/* Offered when a lead is marked Lost (the reason is optional). */
export const LOST_REASONS = ["No reply", "Too expensive", "Went with someone else", "Project postponed",
  "Not a good fit", "Outside our area"];

/* What can be logged as an interaction with a lead. */
export const INTERACTION_TYPES = ["WhatsApp", "Call", "Meeting", "Site visit", "Customer request",
  "Quotation sent", "Follow-up attempt", "Other"];
/* History kinds that count as being in touch ("Last contacted"). Version 1 kept done,
   no_reply and note; Version 2 logs interactions. */
export const CONTACT_KINDS = ["interaction", "done", "no_reply", "note"];
