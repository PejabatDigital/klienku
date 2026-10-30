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
2. **Foundation** — D1 database (clients, history, settings), sign-in for Amin's account.
   Test: sign in on iPhone and Mac.
3. **Core loop** — Add client + list, client detail + edit, Mark done → next step, Today,
   Close + Delete, Settings (follow-up defaults). Test: add 5 real clients.
4. **Reminders** — notification when a step is due, 8:00 am morning summary.
5. **Mac view** — sidebar layout, all-clients table.
6. **Polish and safety** — empty/loading/offline/error screens, profile + export, Terms +
   Privacy, backups, security check.
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
- The designs say "Leads"; the brand speaks of clients. Confirm wording with Amin in Phase 3.

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
