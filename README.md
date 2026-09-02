# HG Capital OS

Internal operating system for HG Capital: deals, the owned portfolio (units,
CapEx, loans, insurance, documents), tasks, vendors, and a read-only mirror of
the QuickBooks P&L. A small public site (`/welcome`, `/rentals`, `/residents`)
lives in the same app.

## Stack

- Next.js 16 (App Router, React Compiler) + TypeScript + Tailwind v4
- Postgres on Supabase, via Prisma 6 — the app connects as the table owner and
  never uses PostgREST or the Supabase client
- Auth: email + password (scrypt hash in `User.passwordHash`), signed cookie
  session with a 30-day expiry, per-email login throttle. Two users, no roles.
- Files: Vercel Blob. Documents and task attachments are private and served
  through `/api/files`; rental photos are public.
- Deploy: Vercel, auto-deploy on push to `main`. See `DEPLOY.md`.

## Layout

```
src/app/(app)/*        signed-in pages; each area has a thin actions.ts
src/app/(marketing)/*  public pages
src/app/api/*          health, search, blob token minting, file delivery, QuickBooks OAuth + cron
src/lib/<domain>/      services that own every database write: tasks, deals, properties
src/lib/quickbooks/    pure core (categorize, classify, compute, reconcile, report-parse, months) + sync/queries
src/lib/*.ts           shared pure helpers: env, dates, money, normalize, secrets, session-token, …
scripts/migrate/       one-time import of the Master Database xlsx + Asana CSV
prisma/                schema + migrations
```

Rules of the road:

- **Server actions only authenticate, validate, and call a service.** Anything
  that touches Prisma lives in `src/lib/<domain>/service.ts`.
- **Pure helpers get tests.** `npm test` runs every `*.test.ts` (node:test via
  tsx); CI runs typecheck + lint + test on every push.
- **Dates that are calendar dates go through `src/lib/dates.ts`**, money
  through `src/lib/money.ts`, addresses through `src/lib/normalize.ts`.
- **Whole-blob saves carry a version.** Units, building CapEx, listings, and
  the two settings blobs send the `updatedAt` they rendered with and refuse to
  overwrite a newer row.
- **`process.env` is read in exactly one place**, `src/lib/env.ts`.
- **A migration that adds a table must enable RLS on it**
  (`ALTER TABLE "Foo" ENABLE ROW LEVEL SECURITY;`); `src/lib/db-rls.test.ts`
  fails otherwise. Never `FORCE ROW LEVEL SECURITY`.

## Local development

Prereqs: Node 20+, local Postgres (`brew install postgresql@16`).

```bash
createdb hg_capital_dev
cp .env.example .env          # fill DATABASE_URL; leave SESSION_SECRET blank locally
npm install
npx prisma migrate deploy

# one-time data import (source files in _private/, never committed)
npm run migrate

# a local login: hashes the value into your LOCAL User row (only fills empty hashes)
CONNOR_PASSWORD=whatever npx tsx scripts/backfill-password-hashes.ts

npm run dev                   # http://localhost:3000
```

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Dev server / production build / serve |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | All unit tests |
| `npm run migrate [step]` | Spreadsheet/Asana import (idempotent) |
| `npm run db:migrate` | Create + apply a new Prisma migration |
| `npm run db:studio` | Prisma Studio |

## Runbook

**Add a user** — add a row to `SEED_USERS` in `scripts/migrate/00-users.ts`,
run `npm run migrate users`, set that person's `*_PASSWORD` env var in Vercel,
redeploy once (the build hashes it into the DB, then the var can be removed).

**Change a password** — passwords live in the DB. Set a new value in the
matching `*_PASSWORD` var, clear the user's `passwordHash` (Supabase SQL editor
or Prisma Studio), redeploy.

**Re-run the import** — safe anytime; idempotent on address / Asana ID.

**Reset the local DB** — `dropdb hg_capital_dev && createdb hg_capital_dev &&
npx prisma migrate deploy && npm run migrate`.

**Move old documents to private storage** — Settings → Storage → one button.

**QuickBooks** — connect from Financials → Settings once the `QBO_*` vars are
set. The nightly cron rebuilds the last 3 months plus a rotating slice of
older history; "Refresh from QuickBooks" rebuilds everything.

**Production debugging** — `DEBUG.md`.
