# KlienKu — project brief for Claude Code

KlienKu ("my client" in Malay) tells you who to follow up with today, so no client is ever
forgotten. Built for Amin's own WhatsApp enquiries first, but generic and ready for anyone
to use later: not tied to any industry or company. A Kasah Kod app.

## The concept
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

## Design
**Source of truth:** Figma "Lead Follow-up App"
https://www.figma.com/design/XB2OhN539kQ4KY4O1ms9o2 (page "App screens"; "App icon" page
holds the icon). Read it with the Figma MCP server when connected.
- Phone screens (393×852): 1 Today `4:2`, 2 Leads `4:147`, 3 Lead detail `4:291`,
  4 Mark done → next step `4:385`, 5 Add lead `4:534`, 6 Settings `4:583`,
  9 Edit lead `8:311`, 10 Close lead `8:360`, 11 Delete confirm `8:419`.
- Desktop (1440×900): 7 Today `6:221`, 8 All leads table `7:311`.
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
