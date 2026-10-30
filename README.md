# KlienKu

Who to follow up with today, so no client is ever forgotten. A Kasah Kod app.

Live at https://klienku.kasahkod.cc — an installable web app (Add to Home Screen) with a
Cloudflare Worker behind it.

## Run it locally
```bash
npm install
npm run build && npm run dev:api   # the built app + API on http://localhost:8787
npm run dev                        # or: live-reload frontend on :5173 (API proxied to :8787)
```
Local secrets go in `.dev.vars` (git-ignored): `VAPID_PRIVATE_KEY=…`.

## Deploy
Pushing to `main` deploys through Cloudflare Workers Builds
(build `npm run build`, deploy `npx wrangler deploy`).
