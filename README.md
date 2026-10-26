# HG Capital OS

Internal operating system for HG Capital: deals, the owned portfolio (units,
CapEx, loans, insurance, documents), tasks, vendors, and a read-only mirror of
the QuickBooks P&L. A small public site (`/welcome`, `/rentals`, `/residents`)
lives in the same app.

## Before you build

The working rules (planning, reuse, design references, copy, device check, landing) live in [CLAUDE.md](CLAUDE.md). Claude Code loads that file automatically, and it applies to people just the same.

1. **Plan first.** Feature-sized work gets its questions answered and a spec saved in `docs/` before any code.
2. **Check what we have.** Look up the job in [docs/components.md](docs/components.md) and search `src/components/`. Use what fits, or extend it with a prop instead of copying it.
3. **Nothing fits?** Research the pattern on Mobbin, then build it.
4. **Design for every size.** Every mock covers laptop (1280x800), tablet (768x1024) and mobile (375x667).
5. **Leave it findable.** Add a new reusable component to `docs/components.md` in the same commit.
6. **Check devices before handoff.** Run `npm run test:devices`, open each dialog and state you touched at 375 and 320, and look over `device-report/index.html`.

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
src/lib/<domain>/      services that own every database write: tasks, deals, properties, contractors
src/lib/quickbooks/    pure core (categorize, classify, compute, reconcile, report-parse, months) + sync/queries
src/lib/*.ts           shared pure helpers: env, dates, money, normalize, secrets, session-token, …
scripts/migrate/       one-time import of the Master Database xlsx
scripts/asana/         Asana backup (snapshot) and the open-task import
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
- **Don't hard-code what another business would set differently** (names,
  time zone, branding, senders). We may offer the app to other businesses
  later; see [docs/other-businesses-later.md](docs/other-businesses-later.md).
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

# a local login: set CONNOR_PASSWORD in .env, then hash it into your LOCAL User row
npm run db:dev-passwords

npm run dev                   # http://localhost:3000
```

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Dev server / production build / serve |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | All unit tests |
| `npm run test:devices` | Device check: every route on phones, iPad and desktop, report in `device-report/` |
| `npm run test:devices:known` | Same run, rewrites `tests/devices/known-issues.json` (owner's OK first) |
| `npm run migrate [step]` | Spreadsheet import (idempotent) |
| `npm run asana:snapshot` | Full read-only Asana backup to `_private/asana-snapshot/` (needs `ASANA_TOKEN`) |
| `npm run db:migrate` | Create + apply a new Prisma migration |
| `npm run db:studio` | Prisma Studio |
| `npm run db:dev-passwords` | Local only: set each user's password from their `*_PASSWORD` in `.env` |

## Runbook

**Add a user** — add a row to `SEED_USERS` in `scripts/migrate/00-users.ts`,
run `npm run migrate users`, set that person's `*_PASSWORD` env var in Vercel,
redeploy once (the build hashes it into the DB, then the var can be removed).

**Change a password** — passwords live in the DB. Set a new value in the
matching `*_PASSWORD` var, clear the user's `passwordHash` (Supabase SQL editor
or Prisma Studio), redeploy. Locally, just change the var in `.env` and run
`npm run db:dev-passwords` — it overwrites the local hash and refuses to run
against a non-localhost `DATABASE_URL`.

**Re-run the spreadsheet import** — safe anytime; idempotent on address. It no
longer touches tasks: those come from the Asana import in `scripts/asana/`
(docs/asana-migration-plan.md §5.5).

**Reset the local DB** — `dropdb hg_capital_dev && createdb hg_capital_dev &&
npx prisma migrate deploy && npm run migrate`.

**Move old documents to private storage** — Settings → Storage → one button.

**QuickBooks** — connect from Financials → Settings once the `QBO_*` vars are
set. The nightly cron rebuilds the last 3 months plus a rotating slice of
older history; "Refresh from QuickBooks" rebuilds everything.

**Production debugging** — `DEBUG.md`.
