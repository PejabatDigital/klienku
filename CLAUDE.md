# KlienKu — project brief for Claude Code

KlienKu ("my client" in Malay) tells you who to follow up with today, so no lead is ever
forgotten. A Kasah Kod app.

**Version 2 (decided 31 Oct 2026) changes direction:** a lightweight lead CRM built for
Renovasi KL. See "Version 2 — lead CRM" below; where it differs from Version 1, Version 2 wins.

**Version 3 (decided 10 Nov 2026): the Google Sheet is the master.** KlienKu is the front
end for Amin's sheet "Renovasi KL Leads" on phone and Mac. See "Version 3 — Google Sheet
front end" below; where it differs from Versions 1–2, Version 3 wins.

## The concept (Version 1, as built in Phases 1–6)
- Clients come in from WhatsApp enquiries. Amin adds them by hand: name, phone, what they need.
  (Website form → lead is for later.)
- **Core rule: every open client always has one next step and a date.**
- Stages: New → Contacting (repeat follow-ups) → Site visit → Quote sent → Negotiating →
  Won / Closed (with a reason, including "I ended it").
- Marking a step done suggests the next one. Defaults, editable in Settings: no reply →
  follow up in 2 days; suggest closing after 3 tries; send quote within 2 days of a site
  visit; follow up a quote after 3 days.
- Reminders: a notification when a step is due, plus a morning summary (8:00 am). Both
  can be turned on or off in Settings.
- Close keeps the history; Delete is only for duplicates and mistakes.
- Phone and Mac (Android later). No bloat: not a CRM.

## Stack (same shape as MyDay)
- Frontend: vanilla HTML/CSS/JS with Vite — `index.html`, `src/`. No UI framework.
- One Cloudflare Worker serves the built app (`dist/`) and the API (`worker/`, `/api/*`).
  Config `wrangler.jsonc`. Live at **klienku.kasahkod.cc** (custom domain set in
  `wrangler.jsonc`). Deployed by Cloudflare Workers Builds when `main` changes.
- Phase 2 adds: D1 database, Better Auth email + password sign-in, emails via Resend from
  no-reply@kasahkod.cc (as MyDay). Every row belongs to a `user_id`.
- Reminders: Web Push sent from the Worker (`worker/push.js`, VAPID + aes128gcm with Web
  Crypto, no library); Phase 4 adds a Cron Trigger to send due reminders and the summary.
- Cloudflare Workers free plan: 10 ms CPU per request. Keep Worker code light.
- iPhone only gets web notifications when KlienKu is added to the Home Screen.

## How we work
- Amin is not a developer. Plain, simple English, short. After each phase, say what
  changed, what he should see, and exactly what to test on his phone.
- Work directly on `main`. No branches, no pull requests. Pushing to `main` updates the
  live app, so only push when a step works.
- One phase at a time. Don't start the next phase until Amin confirms the last one works.
- Don't reopen decisions already made, and don't add extras. Ask before adding any library.
- When Amin must do something himself (Cloudflare, accounts, keys), give numbered steps.
- Secrets only in `wrangler secret` / git-ignored `.dev.vars`. Never commit them.
- Keep this file current when a decision changes. `README.md` is for people; keep it short.

## Phases
1. ✅ **Set up** — project, GitHub, icons + manifest (Add to Home Screen), simple home page,
   iPhone notification test (`/api/push/test`, open to anyone for now, only sends to
   known push services; goes behind sign-in in Phase 2), live on klienku.kasahkod.cc.
   Confirmed by Amin 30 Oct 2026: a notification arrived on his locked iPhone.
   - Workers Builds has no build command; `wrangler.jsonc` `build.command` runs it.
   - Secret `VAPID_PRIVATE_KEY` is set (Amin adds secrets himself; Claude can't).
   - The desktop app's browser pane can't register service workers: test push and
     offline on a real device.
2. ✅ **Foundation** — D1 database (clients, history, settings), sign-in for Amin's account.
   Test: sign in on iPhone and Mac. Confirmed by Amin 31 Oct 2026: account created,
   emails arrive, signed in on iPhone and Mac.
   - D1 `klienku-production` (APAC), tables in `migrations/0001_init.sql`: Better Auth's
     `user`/`session`/`account`/`verification`, plus `clients`, `activity`, `settings`,
     `push_subscriptions`. Apply with `npx wrangler d1 migrations apply DB --remote`.
   - Better Auth email + password (`worker/auth.js`, PBKDF2 as MyDay), 60-day sessions.
     Only the first account can be created (`OPEN_SIGNUP` "false"); it must confirm its
     email. A password reset signs out every other device.
   - One page `/signin` (`signin.html`, `src/signin.js`) for Figma 12–15: sign in,
     first-time setup (only while no account exists), forgot password, check your email
     (Open Mail on iPhone/iPad, resend after 45 s), set a new password (live rules).
     Two-step code (Figma 16) is not built; first-time setup (17) waits for Phase 4.
   - Home page sends signed-out people to `/signin`; shows who's signed in + Sign out.
     `/api/push/test` needs sign-in and saves the device in `push_subscriptions`.
   - Local: `npm run dev:api` (`--local-upstream localhost:8787`, because the custom
     domain route otherwise makes requests look like they come from klienku.kasahkod.cc).
     Without `RESEND_API_KEY`, emails print in the terminal.
3. ✅ **Core loop** — Add client + list, client detail + edit, Mark done → next step, Today,
   Close + Delete, Settings (follow-up defaults). Test: add 5 real clients.
   Confirmed by Amin 31 Oct 2026: all working well with real clients.
   - Wording decided 31 Oct 2026: **"Clients"** everywhere (not "Leads").
   - Added an optional **Area** field (the Figma cards show "need · area");
     `migrations/0002_area_outcome.sql` also adds `outcome` (won | lost | ended).
   - API in `worker/api.js` (routes listed at its top). Next-step suggestions in
     `src/flow.js`, from FigJam "3. Suggested next steps"; stages only move forward.
   - Screens: `src/views/` today, clients, client, form (add/edit), settings; sheets and
     the confirm dialog in `src/sheets.js`; router in `src/app.js` (History API paths
     `/`, `/clients`, `/clients/new`, `/clients/:id`, `/clients/:id/edit`, `/settings`).
   - Due values are local time (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`); stored timestamps
     are UTC and shown with `localDay()`.
   - Settings: follow-up rules, a test notification, account. The reminder switches,
     editable stages and close reasons are not built (reminders come in Phase 4).
   - Claude can't run remote D1 migrations (auto mode): Amin runs
     `npx wrangler d1 migrations apply DB --remote` before code that needs them is pushed.
4. ✅ **Reminders** — notification when a step is due, 8:00 am morning summary.
   Confirmed by Amin: a due-step reminder and the morning summary both arrived.
   - Cron Trigger every 5 min (`wrangler.jsonc` `triggers`) → `worker/reminders.js`.
     `plan()` decides what to send (pure): steps with a time → `remind_before` minutes
     before (0/5/10/15/30/60, default 15), skipped if over an hour late; morning summary at
     `summary_time` (sent within 3 h, once a day via `settings.last_summary`, skipped when
     nothing is overdue/due); date-only steps get their own reminder at summary time only
     when the summary is off. Each step is reminded once (`clients.notified_due`).
   - Worked out in `settings.timezone`, updated from the device whenever Settings opens.
   - Devices: `POST/DELETE /api/push/subscribe`; the app re-sends its subscription on open
     (`refreshDevice`); 404/410 from a push service removes the device; signing out
     removes this device.
   - Settings has a Reminders section (this device, due-step switch, remind me, summary
     switch + time, test). First-time setup (`src/views/setup.js`, Figma 17) shows once
     per device until reminders are on there; Face ID left out (60-day sessions).
   - `migrations/0003_reminders.sql`. Local: `npx wrangler dev … --test-scheduled`, then
     POST `/cdn-cgi/local/explorer/api/local/scheduled?worker=klienku` with `{"cron":"*/5 * * * *"}`.
5. ✅ **Mac view** — sidebar layout, all-clients table.
   Confirmed by Amin: working well on the Mac.
   - Wide screens (≥ 1024 px, `isWide()` in `src/ui.js`; Mac and iPad landscape) get
     `body.wide`: sidebar (`<aside class="side">` in index.html: Add client, Today with
     due count, Clients with open count, Settings, morning-summary note) instead of the
     tab bar and +. Phone layout unchanged. Re-renders when the width crosses 1024 px.
   - Today (Figma 7): list left, chosen client right (`?c=<id>`), via
     `clientView(..., { embedded: true, onChange })`; saving in the pane redraws the list.
   - Clients (Figma 8): one table (Name, What they need, Stage, Next step, Due, Last
     contact; Won/Closed show Result, Reason, Closed), Sort: Due date / Name / Last
     contact / Recently added. Row → full client page. `GET /api/clients` adds
     `last_contact` (latest done / no reply / note).
   - Client page on wide: WhatsApp / Call / Edit top right, next step above stage.
     "Close this client" link at the bottom (phone and Mac). Sheets are centred dialogs.
6. ✅ **Polish and safety** — empty/loading/offline/error screens, profile + export, Terms +
   Privacy, backups, security check.
   Confirmed by Amin 31 Oct 2026: all working well on his iPhone.
   - Screens: offline note at the top (`#offlineBar`, lists keep showing what's saved on
     the device); "Couldn't load / You're offline" with Try again (`problem()` in
     `src/ui.js`); "Client not found" (`gone()`); "Page not found" for unknown paths.
   - Settings → Account: Change password (sheet, Better Auth `change-password`, signs out
     other devices), Download my data (`GET /api/export`, CSV with history; iPhone share
     sheet, Mac Downloads), Sign out. About: Privacy Policy, Terms of Use, Contact
     hello@kasahkod.cc. Danger zone: Delete my account (type DELETE; `DELETE /api/account`
     removes everything, clears the device, then setup is open again). In `src/views/account.js`.
   - `/privacy` and `/terms`: plain pages in `public/` (`legal.css`), linked from sign-in
     (setup says creating an account agrees to them) and Settings. Not legal advice;
     written plainly for Malaysia (PDPA 2010 mentioned). The service worker serves
     /signin, /privacy, /terms network-first, the app's own paths from cache.
   - Backups: D1 Time Travel (restore points for 7 days on the free plan, confirmed on);
     restore steps in README. Plus Download my data.
   - Security: Better Auth's rate limit was off in production (it needs NODE_ENV, which
     Workers don't set); now on, stored in D1 (`migrations/0004_rate_limit.sql`), by
     `cf-connecting-ip`: 3 sign-in tries per 10 s, 3 reset emails per minute. API
     changes from another site's Origin get 403. Security headers for all pages in
     `public/_headers` (CSP: own scripts only, no framing). CSV cells starting with = or @
     are made plain text. `npm audit`: 0 issues. Not built: two-step code (Figma 16),
     editable stages and close reasons.
7. **Go live** — two weeks of real use alongside pen and paper, then fix and adjust.
   Done: Amin used it and found it not smooth enough → Version 2.

## Version 2 — lead CRM
Source: Amin's "Renovasi KL Lead Management CRM — MVP Requirements" (v1.0, 8 pages; a PDF
on his Mac, not in the repo). Principle: every lead is accounted for, every conversation is
recorded, and every potential customer has a clear next action. Lightweight, not an
enterprise CRM. Mac: a full leads table; phone: a simpler version of the same.

Decisions (Amin, 31 Oct 2026):
- Built for **Renovasi KL** now; keep the KlienKu name. Statuses, project types and sources
  live in one place in the code so they can be made editable later.
- The word is **"Leads"** everywhere (replaces "Clients").
- Statuses, free dropdown, any order, each change logged: New, Contacted, Awaiting Customer,
  In Discussion, Site Visit, Quotation Sent, Negotiation, Won, Lost, On Hold.
- Fields: name, phone, location (was Area), project type, lead source, estimated budget (RM),
  general notes (always visible, editable), created, last contacted, next follow-up date +
  follow-up note, activity log. No visible lead ID.
- Project types: Bathroom, Kitchen, Full renovation, Extension, Roofing, Painting,
  Plumbing / electrical, Other. Sources: WhatsApp, Email, Social media, Other (changed
  1 Nov 2026; `migrations/0006_sources.sql` moved Facebook/Instagram → Social media, the
  rest → Other).
- **Follow-up date is optional, with no default.** Active leads without one show under
  "No follow-up scheduled" (Dashboard, and counted in the morning summary).
- Interaction log: type (WhatsApp, Call, Meeting, Site visit, Customer request, Quotation
  sent, Follow-up attempt, Other), date and time, description. Never overwritten.
- **Drop** the automatic next-step suggestions and the "tries" counter (and their Settings).
- **The follow-up is its own action** (Amin, 1 Nov 2026): set, changed or marked done only
  with its buttons on the lead page (Set follow-up / Done / Change). Add lead and Log
  interaction never touch it.
- Claude designs the new screens in code, in the current KlienKu style (tokens below);
  Amin reviews on phone and Mac. The Figma stays the reference for look and feel.
- Existing data moves across: Contacting → Contacted, Site visit → Site Visit, Quote sent →
  Quotation Sent, Negotiating → Negotiation, Won → Won, Closed (lost / ended) → Lost with
  its reason; Area → Location; "What they need" → start of General notes (project type left
  blank); next step + due → follow-up note + date. All history kept.
- Out of scope: WhatsApp automation, AI, forecasting, invoices/quotations, marketing,
  team permissions, project management.

Phases (one at a time, each confirmed by Amin):
- ✅ **V2.1 Lead record** — confirmed by Amin 1 Nov 2026 (live).
  - Lists in `src/lists.js` (imported by the app and the Worker). `migrations/0005_leads.sql`
    adds `project_type`, `source`, `budget` and moves old data across. The table is still
    `clients` and the API still `/api/clients`; columns: `stage` = status, `area` =
    location, `notes` = general notes, `next_due`/`next_step` = follow-up date/note.
  - `PATCH /api/clients/:id` changes details, status (`{stage, reason}`; Won/Lost clear the
    follow-up, set `closed_at`; Lost keeps the reason) and follow-up (`{next_due, next_step}`,
    null clears). Logged as `status` / `follow_up` history. `/steps`, `/close`, `/reopen`,
    `src/flow.js` suggestions and the follow-up rules in Settings are gone.
  - App paths `/leads`, `/leads/new`, `/leads/:id`, `/leads/:id/edit` (old `/clients…`
    links redirect). Views `src/views/leads.js`, `lead.js`, `form.js`. Lead page: status
    dropdown, next follow-up (or "No follow-up scheduled"), budget/source/last contacted/
    added, General notes (edit in place), History. Edit form has details only; Add form
    preselects WhatsApp as source, follow-up optional.
  - Today already lists "No follow-up scheduled" (between Today and Coming up) so undated
    leads aren't missed before V2.3. Colour for "no follow-up": `--none` #9A6F0A (mustard).
- ✅ **V2.2 Log interaction + follow-up** — confirmed by Amin 1 Nov 2026 (live).
  - `POST /api/clients/:id/interactions` `{type, text, at, stage?, reason?, next_due?,
    next_step?}`: one history row (kind `interaction`, text = type, then the description;
    `at` may be earlier, not in the future), plus the same status / follow-up changes as
    PATCH (shared `progress()` in `worker/api.js`). No migration. `/notes` is gone.
  - Types in `src/lists.js` `INTERACTION_TYPES`; `CONTACT_KINDS` drives Last contacted.
  - `logSheet()` in `src/sheets.js`: type pills (WhatsApp first), description, when (now,
    editable), status, next follow-up. An upcoming follow-up shows as "Keep · <date>" and is
    kept; a due/overdue one counts as done, so no new date = no follow-up.
  - Lead page: Log interaction in the follow-up card (and Won/Lost card) and the History
    heading; history shows date + time; interactions in accent, status/follow-up lines muted.
    The download's history lines include the time.
- ✅ **V2.3 Dashboard** — confirmed by Amin 1 Nov 2026 (live).
  - "Today" is now **Dashboard** (path `/`, `src/views/dashboard.js`, sidebar/tab bar,
    Back label). Numbers: Overdue, Due today, No follow-up, Upcoming (all future), Active
    leads (→ Leads), New this week (since Monday); tapping one jumps to its list.
  - Lists: Overdue, Due today, No follow-up scheduled, Coming up · next 7 days (+N later →
    Leads), New this week. Mac: numbers and "Leads by status" (8 active statuses as small
    bars, Won/Lost totals) across the top, list left, lead right. Phone has no status bars.
  - `/leads?status=<key>` opens Leads filtered to that status (used by the status bars).
- ✅ **V2.4 All Leads** — confirmed by Amin 1 Nov 2026 (live).
  - Mac table (`src/views/leads.js`): filters Status, Project, Source, Follow-up (Overdue,
    Due today, Next 7 days, Later, No follow-up) with Clear filters and "Showing N of M";
    sorts Follow-up date, Recently added, Oldest first, Last contacted, Name. Columns: Name,
    Project, Status, Source, Budget, Next follow-up, What to do, Last contacted (Won/Lost:
    Reason, Closed). Filters are kept for the session; the phone ignores all but status.
  - A row opens the lead in a panel on the right (`?c=<id>`, `leadView` with `onClose`):
    Close, Escape or clicking the row again closes it. With it open, `.opt` columns hide;
    under 1280 px Project hides too.
  - Add lead: name, phone, location, type, source, next follow-up first; budget and notes
    after ("can wait").
- ✅ **V2.5 Reminders tidy-up** — confirmed by Amin (live). Version 2 complete; next: real use, then small fixes.
- ✅ **V2.6 Follow-up as its own action + fewer sources** — live; 0006 applied by Amin 1 Nov 2026.
  - Follow-up card: Set follow-up (none) or Done + Change. Done = `PATCH {next_due: null,
    done: true}`, logged "Follow-up done". Log interaction is a separate button under the
    card (and in the History heading); its sheet has type, note, when, status only.
  - Add lead has no follow-up section. Sources as above.
- ✅ **V2.7 Today and Dashboard apart** — confirmed by Amin 1 Nov 2026 (live).
  - Today (`/`, `src/views/today.js`): date, a one-line count, Overdue / Due today / No
    follow-up scheduled / Coming up · next 7 days; Mac: list left, lead right. `?s=<list>`
    scrolls to a list.
  - Menu and tab bar: Today · Dashboard · Leads · Settings. Back from a lead says where
    it was opened from.
  - `runReminders` loads all active leads (not only those with a date); `plan()` adds
    "N with no follow-up" to the morning summary, and sends "Nothing due today. N leads
    have no follow-up date yet." when that's all there is. Due-step reminders unchanged.
  - No email summary (only if Amin asks).
- ✅ **V2.8 New Dashboard** — confirmed by Amin 1 Nov 2026 (live). Designed in Figma first:
  - Period switch: This month · Last 3 months · All time (calendar months; remembered on
    the device, `kk:dash-period`).
  - Active leads: every lead not Won/Lost, always "now" (ignores the period). Navy card.
  - For the period, counted by when the lead came in (`created_at`): Total leads; Win
    rate = Won ÷ Total leads; Won value = sum of estimated budget of the Won leads (says
    how many won leads have no budget); Leads by project type (count and share; most
    first; a "Not set" row only when some leads have no type).
  - Removed from the Dashboard: follow-up numbers (Today only), Leads by status, New this week.
  - `src/views/dashboard.js`; styles under "Dashboard (Figma 18, 19)" in `src/app.css`.
  - Figma: 18 · Desktop · Dashboard `24:311`, 19 · Dashboard `27:412` (phone, scrolling),
    components in section "Dashboard components" `23:311` (Period switch, Active leads
    card in navy #1E2A4A, Metric, Bar row and Bar row · compact with Fill variants).

- **V2.9 Menu order + Settings pages** (asked by Amin 1 Nov 2026):
  - Menu and tab bar: Dashboard · Today · Leads · Settings. The app still opens on Today (`/`).
  - Settings (`/settings`) is a short menu: Account, Notifications, About, each its own page
    (`/settings/account`, `/settings/notifications`, `/settings/about`) with Back to Settings.
    Notifications = the old Reminders section; the sidebar's morning-summary note opens it.
  - Account (`accountPage` in `src/views/account.js`): Name and Phone (tap → sheet, empty
    clears), Email (read only), Change password, Download my data, Sign out, then Danger
    zone: Delete my account.
  - Name is Better Auth's `user.name`; phone is `user.phone` (Better Auth `additionalFields`,
    `migrations/0007_profile.sql`). Saved with `POST /api/auth/update-user`; the auth hook
    refuses a name over 100 or a phone over 30 characters.
  - (V2.9 was built and pushed, not confirmed, before Version 3 replaced it.)

## Version 3 — Google Sheet front end
Why (Amin, 10 Nov 2026): V2 was slower to use than a spreadsheet, so he moved to Google
Sheets; what he wants is to write down a lead's details, keep them, and look them up. He
likes KlienKu's lead profile. No frills yet: no reminders, notifications, Today, Dashboard,
interaction log. Build the base, then add to it.

- Sheet: "Renovasi KL Leads" (`SHEET_ID` in `wrangler.jsonc`), tab **Leads** (one row per
  lead) and tab **Lists** (dropdowns; headers in row 2: Status, Project Type, Source,
  Stopped Reason). Amin owns the lists and may change them; the app reads them every load.
  The sheet's own Dashboard tab was removed (asked by Amin).
- Leads columns (found by header text, so they can move): Date, Name, Status, WhatsApp
  (an ARRAYFORMULA in D1 — never write column D), Phone, Source, Project Type, Location,
  What They Want, Last Contacted, Next Action, Next Follow-up, Stopped Reason, Notes, and a
  hidden **ID** (column O, added by Claude). The Worker gives any row without an ID one and
  writes it back, so each lead keeps its link when rows are sorted or moved.
- Statuses (Amin, 10 Nov 2026): New Lead, Contacting, Qualified, Site Visit, Quotation Sent,
  Won, Closed. Won and Closed (also Lost/Stopped) = finished, shown under Closed; Won in green.
- Connection: Google service account, JSON key in secret `GOOGLE_SERVICE_ACCOUNT`; the sheet
  is shared with its email as Editor. `worker/google.js` signs a JWT with Web Crypto (no
  library), token kept in memory. D1 keeps sign-in (Better Auth) and, from V3.5, the notes
  log (`lead_notes`); the old V2 leads stay in D1 untouched and aren't shown. The reminders
  cron is removed.
- API (`worker/api.js`): `GET /api/leads` → `{leads, lists, sheet_url}`; `POST /api/leads` (new
  row after the last one; Date = today in Malaysia, Status = first in the list); `PATCH
  /api/leads/:id` (only the fields sent); `DELETE /api/leads/:id` (removes the row);
  `DELETE /api/account`. Writes are typed cells via
  `updateCells` (`userEnteredValue` only: text stays text, dates are serials, the sheet's
  formats/dropdowns stay; column D is skipped). Choices must be in the Lists tab.
- App: menu Leads · Settings. `/` (and `/leads`) the list: Active / Closed, search, phone
  cards grouped by status, Mac table with Status/Project/Source filters and a sort, lead in a
  right panel. `/leads/:id` the profile: WhatsApp / Call, status, next action + follow-up
  date, what they want, source, last contacted, added, phone, notes, Open in Google Sheets
  (V3.4: removed). Settings: Google Sheet (opens it), Account, About.
  Helpers in `src/leads.js`; the list is cached on the device (`kk:leads`).

Phases (one at a time, each confirmed by Amin):
- ✅ **V3.1 Connect and view** (read only) — confirmed by Amin 10 Nov 2026 (live).
- ✅ **V3.2 Add and edit** — confirmed by Amin 10 Nov 2026 (live). Add lead (+ on the phone, Add lead in the sidebar) writes a new row;
  Edit (`src/views/form.js`, all columns incl. Last contacted / Date added, Stopped reason
  when Closed) sends only what changed; the profile's Status saves straight away, and
  closing (not Won) asks for the Stopped reason (optional).
- **V3.3 Delete + slide-away menu** (asked by Amin 10 Nov 2026):
  - Delete lead: a red link at the bottom of Edit, then a confirm dialog; the Worker removes
    the lead's whole row from the sheet (`deleteDimension`), the app drops it from `kk:leads`.
- **V3.4 Sidebar + Settings tidy-up** (asked by Amin 10 Nov 2026):
  - Mac sidebar is icons only (72 px, `--side-w`) and opens to 240 px over the page while
    the pointer is on it (or keyboard focus); no toggle button. Leads at the top, Settings
    at the very bottom. iPad (no hover) keeps the icons.
  - The Google Sheet link lives only in Settings (first row of the menu, opens the sheet).
    Gone from the lead page, the sidebar and Account.
- **V3.5 Notes log + laptop table order** (asked by Amin 10 Nov 2026; he liked V1's running
  notes and wants less emphasis on follow-ups):
  - Notes live in KlienKu's D1, not the sheet (Amin's choice; they move with the leads when
    Sheets is dropped). `migrations/0008_lead_notes.sql`: `lead_notes` (user_id, lead_id =
    the sheet's ID, at, text, from_sheet, deleted). `GET /api/leads` adds `log` (newest first)
    to each lead; `POST /api/leads/:id/notes {text}`; `DELETE /api/leads/:id/notes/:nid`
    (marks it deleted). Deleting a lead deletes its notes.
  - The sheet's Notes column is no longer shown or edited in the app: each lead's Notes cell
    is copied once into its log (dated on its Date; also for leads added in the sheet later).
    The sheet itself is left as it is.
  - Lead page: Notes = an "Add note" box, then the notes (date + time, Delete asks first).
    "Added" / "Date added" now say **First contact** (the sheet's Date column).
  - Laptop table order (Amin's, app only; the sheet stays as it is): First contact, Name,
    Phone, Project, Location, What they want, Next action, Follow up, Last contact, Status
    (Closed tab: Reason instead of Next action + Follow up). Default sort First contact,
    newest. Search also looks in notes. Phone cards unchanged.

## Design
**Source of truth:** Figma "Lead Follow-up App"
https://www.figma.com/design/XB2OhN539kQ4KY4O1ms9o2 (page "App screens"; "App icon" page
holds the icon). Read it with the Figma MCP server when connected.
- Phone screens (393×852): 1 Today `4:2`, 2 Leads `4:147`, 3 Lead detail `4:291`,
  4 Mark done → next step `4:385`, 5 Add lead `4:534`, 6 Settings `4:583`,
  9 Edit lead `8:311`, 10 Close lead `8:360`, 11 Delete confirm `8:419`.
- Desktop (1440×900): 7 Today `6:221`, 8 All leads table `7:311`, 18 Dashboard `24:311`.
- 19 Dashboard (phone, 393×1212) `27:412`.
- Account: 12 Sign in `9:312`, 13 Forgot password `9:346`, 14 Check your email `9:370`,
  15 Set new password `9:396`, 16 Two-step code `9:434`, 17 First-time setup `9:470`.
- Components: Lead card `3:51`, Tab bar `3:109`.
- Process flows (FigJam): https://www.figma.com/board/uW8Dc0gGEkisy4lKzGukds
- Phone keeps cards; the Mac "All leads" page is a compact table sorted by due date.
- The designs say "Leads"; the app says "Clients" (decided by Amin in Phase 3).

### Tokens (from the Figma "Colors" variables)
| Token | Value | Use |
| --- | --- | --- |
| `--bg` | #F5F4F1 | app background |
| `--surface` | #FFFFFF | cards, sheets |
| `--subtle` | #EFEDE9 | fields, chips |
| `--line` | #E6E3DD | borders |
| `--text` | #1C1B19 | primary text |
| `--text-muted` | #6B6862 | secondary text |
| `--accent` | #D9662A | primary actions (soft #FBEADF) |
| `--overdue` | #C93C3C | overdue (soft #FBE5E3) |
| `--today` | #D9662A | due today (soft #FBEADF) |
| `--upcoming` | #5B6B80 | upcoming (soft #E8EDF3) |
| `--won` | #2E8B57 | won (soft #E2F2E8) |
| `--whatsapp` | #25D366 | WhatsApp button |
Font: Inter (falls back to the system font until it's self-hosted).

### Brand
- Colours: dark orange #C9581E, mustard #D9A21B, navy #1E2A4A, white.
- Wordmark "KlienKu": navy, with "Ku" in dark orange.
- Icon: two pebbles ("you + client") — big dark-orange gradient (#E5803F → #B24C17),
  small mustard (#F0C04A → #C68E10), on white. Source files in `icons/` (from Amin);
  web copies in `public/icons/`. Don't redraw it in code.
