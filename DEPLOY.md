# Deploying HG Capital OS

Production is Vercel + Supabase Postgres, live at https://www.hgcapitalpartners.com
(custom domain on the `hgcapitalpartners.com` GoDaddy zone; the `.vercel.app`
URL works too). Every push to `main` builds and deploys in ~2 minutes; the
production build applies pending Prisma migrations first (`scripts/prebuild.mjs`,
production builds only).

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Required | What |
|---|---|---|
| `DATABASE_URL` | yes | Supabase connection string. Use the **session** pooler or direct URL so migrations can run; the transaction pooler (port 6543) skips them. |
| `SESSION_SECRET` | yes | 32+ random chars. Signs the login cookie and the QuickBooks OAuth state. Rotating it signs everyone out. |
| `HEALTH_TOKEN` | recommended | Unlocks the detailed `/api/health` payload. Without it the probe still answers, but only `{ ok, db, env, commit, at }`. |
| `CRON_SECRET` | before QuickBooks | Vercel sends it as `Authorization: Bearer …` on the nightly cron. Until it is set, `/api/quickbooks/sync` answers 503 and never runs. |
| `BLOB_READ_WRITE_TOKEN` | yes | Added automatically when the Blob store is connected under Storage. |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_TOKEN_SECRET` | for Financials | Intuit production keys; redirect URI is `https://www.hgcapitalpartners.com/api/quickbooks/callback`; token secret is 32 random bytes base64. All four or nothing — the Connect button appears only when all are present. |
| `QBO_ENVIRONMENT` | for Financials | `production` (defaults to `sandbox`). |
| `QBO_HISTORY_START` | optional | First month to pull, `YYYY-MM`. Defaults to `2026-01`. |
| `CONNOR_PASSWORD`, `PIETER_PASSWORD` | one-time | Hashed into the DB by the build (only when the user's hash is empty). Safe to delete once both users can sign in. |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The Supabase integration also adds a dozen `SUPABASE_*` / `POSTGRES_*` /
`NEXT_PUBLIC_SUPABASE_*` variables. The app reads none of them.

## Preview deployments

Preview deployments have no `DATABASE_URL` (it is scoped to Production only) and
therefore do not work. Either attach a branch database to the Preview
environment or ignore previews.

## First-time setup (already done for production)

1. Import the GitHub repo into a Vercel project.
2. Storage → create a Blob store and connect it.
3. Add the environment variables above.
4. Deploy. The build runs migrations and the password backfill.
5. From a machine that has `_private/`, run the data import against the
   production `DATABASE_URL` once: `DATABASE_URL=… npm run migrate`.
6. Sign in. Settings → Storage → "Move documents to private storage" (no-op on
   a fresh install).

## After a deploy

```bash
curl -s "https://www.hgcapitalpartners.com/api/health?token=$HEALTH_TOKEN" | jq '.commit, .latestMigration'
```

Sessions issued before September 2026 used an older cookie format; users sign
in again once.
