# KlienKu

Who to follow up with today, so no client is ever forgotten. A Kasah Kod app.

Live at https://klienku.kasahkod.cc — an installable web app (Add to Home Screen) with a
Cloudflare Worker behind it.

## Run it locally
```bash
npm install
npx wrangler d1 migrations apply DB --local   # local database tables
npm run dev:api                    # builds the app; app + API on http://localhost:8787
npm run dev                        # or: live-reload frontend on :5173 (API proxied to :8787)
```
Local settings go in `.dev.vars` (git-ignored): `VAPID_PRIVATE_KEY`, `BETTER_AUTH_SECRET`,
and `BETTER_AUTH_URL=http://localhost:8787`. Without `RESEND_API_KEY`, emails are printed
in the terminal.

## Deploy
Pushing to `main` deploys through Cloudflare Workers Builds
(build `npm run build`, deploy `npx wrangler deploy`).
Database changes (`migrations/`) must be applied before the code that needs them is pushed:
`npx wrangler d1 migrations apply DB --remote`.

## Backups
- **Automatic:** Cloudflare D1 Time Travel keeps restore points for every minute of the
  last 7 days (Workers free plan; 30 days on paid). Nothing to set up.
- **Your own copy:** Settings → Download my data (a CSV of every client and its history).

To roll the live database back to a moment in time (this replaces everything after it):
```bash
npx wrangler d1 time-travel info DB --timestamp=2026-10-31T09:00:00+08:00   # check the point
npx wrangler d1 time-travel restore DB --timestamp=2026-10-31T09:00:00+08:00
```
The restore prints a bookmark for undoing it.
