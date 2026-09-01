# HG Capital OS

Internal operating system for HG Capital — v1 consolidates the Master Database
(deals, properties, contractors) and Asana tasks into one app.

Plan: `~/.claude/plans/i-run-a-real-keen-meadow.md`

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Postgres via Prisma 6
- Auth: signed-cookie session, per-user password from env vars in production; a
  dev user-picker when no password env vars are set
- Deploy target: Vercel (+ Vercel/Neon Postgres). See `DEPLOY.md`.

## Local development

Prereqs: Node 20+, local Postgres (`brew install postgresql@16`).

```bash
# one time
createdb hg_capital_dev
cp .env.example .env          # DATABASE_URL defaults to the local db
npm install
npx prisma migrate deploy

# import the Master Database + Asana export (place the source files in _private/)
#   _private/HG Master Database.xlsx
#   _private/HG_Capital.csv
npm run migrate               # idempotent; writes migration-report.md

npm run dev                   # http://localhost:3000
```

With no `*_PASSWORD` env vars set, `/login` shows a dev user picker (Connor /
Pieter) — no password needed locally.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run migrate` | Full data migration (or `npm run migrate deals` for one step) |
| `npm run db:migrate` | Create + apply a new Prisma migration |
| `npm run db:studio` | Prisma Studio |

## Data model (v1)

`User` · `Deal` (+ `DealNote` timeline) · `Property` (per-unit access / utilities
/ equipment in a JSON `units` array) · `Contact` (contractors) · `Task` (from
Asana, linked to a Property or Deal).

No money, leases, tenants, roles, or external portals in v1 — see the plan's
"OUT of v1" list.

## Production setup

Full click-by-click guide in **`DEPLOY.md`**. In short: Vercel project + Vercel
(Neon) Postgres + three env vars (`SESSION_SECRET`, `CONNOR_PASSWORD`,
`PIETER_PASSWORD`). The build runs `prisma migrate deploy`; the data import
(`npm run migrate`) runs once from a machine that has `_private/`.

## Runbook

**Re-run the migration** — safe anytime; idempotent on address / Asana ID.
Against a fresh database it produces the cleanest result (stale rows from earlier
runs are not deleted).

**Reset local dev DB** — `dropdb hg_capital_dev && createdb hg_capital_dev &&
npx prisma migrate deploy && npm run migrate`.

**Add a user** — add a row (with a `passwordEnv`) to `SEED_USERS` in
`scripts/migrate/00-users.ts`, run `npm run migrate users`, set that env var in
Vercel, and deploy — the next production build hashes it into
`User.passwordHash` automatically (see `scripts/backfill-password-hashes.ts`).

**Sensitive data** — contractor bank/routing numbers are never imported (dropped
in `scripts/migrate/02-contractors.ts` and logged). `_private/` and all
`*.xlsx` / `*.csv` are gitignored.

**Row level security** — Supabase serves `public` over PostgREST, so every table
must have RLS enabled or it is readable with the project's `anon` key. There are
no policies: the app connects as the table owner (`postgres`) via Prisma, and an
owner bypasses RLS unless `FORCE ROW LEVEL SECURITY` is set — never set it.
**A migration that adds a table must also enable RLS on it**
(`ALTER TABLE "Foo" ENABLE ROW LEVEL SECURITY;`); `src/lib/db-rls.test.ts` fails
if one is missed.
