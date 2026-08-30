# HG Capital OS

Internal operating system for HG Capital — v1 consolidates the Master Database
(deals, properties, contractors) and Asana tasks into one app.

Plan: `~/.claude/plans/i-run-a-real-keen-meadow.md`

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Postgres via Prisma 6 (Supabase in production)
- Auth: Supabase (Google sign-in) in prod; a dev user-picker when Supabase env
  vars are absent
- Deploy target: Vercel

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

Without Supabase configured, `/login` shows a dev user picker (Connor / Pieter).

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

## Production setup (when ready)

1. Create a Supabase project. Put its URL + anon key + service role key in the
   deployment env (`.env.example` lists the names), and set `DATABASE_URL` to the
   Supabase connection string.
2. Supabase → Authentication → enable Google; add the OAuth client; set the
   callback to `https://<domain>/auth/callback`.
3. Confirm the two allowed emails in `src/lib/auth-allowlist.ts` match Connor's
   and Pieter's Google accounts; run `npm run migrate users`.
4. `npx prisma migrate deploy` against the Supabase DB, then `npm run migrate`.
5. Deploy to Vercel (Hobby for staging; Pro or Cloudflare Pages for production —
   Vercel Hobby disallows commercial use).

## Runbook

**Re-run the migration** — safe anytime; idempotent on address / Asana ID.
Against a fresh database it produces the cleanest result (stale rows from earlier
runs are not deleted).

**Restore a Supabase backup** — Supabase dashboard → Database → Backups →
restore. For local dev: `dropdb hg_capital_dev && createdb hg_capital_dev &&
npx prisma migrate deploy && npm run migrate`.

**Add a user** — add the email to `src/lib/auth-allowlist.ts` and to
`SEED_USERS` in `scripts/migrate/00-users.ts`, then `npm run migrate users`.

**Sensitive data** — contractor bank/routing numbers are never imported (dropped
in `scripts/migrate/02-contractors.ts` and logged). `_private/` and all
`*.xlsx` / `*.csv` are gitignored.
