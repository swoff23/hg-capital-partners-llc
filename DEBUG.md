# Debugging production

The goal: diagnose prod issues without a human in the loop. Two capabilities —
a health probe anyone can curl, and a read-only DB connection for deeper digging.

## 1. Health probe — `GET /api/health`

No session needed. Reports whether the site is up and its DB reachable:

```bash
curl -s https://www.hgcapitalpartners.com/api/health | jq
# { "ok": true, "db": "up", "env": "production", "commit": "d9a923b", ... }
```

With the token it also lists applied migrations and the running Node version —
enough to spot schema drift (column missing, migration not applied) after a deploy:

```bash
curl -s "$PROD_URL/api/health?token=$HEALTH_TOKEN" | jq
# adds: migrations[], latestMigration, node, dbError (on failure)
```

Returns **503** when the DB is unreachable, **200** otherwise.

### One-time setup

Set `HEALTH_TOKEN` (any long random string) in the Vercel project env vars, and
the same value in local `.env.prod`. Without the token the endpoint still works
but only returns `{ ok, db, env, commit }`.

## 2. Read-only prod access — `scripts/prod`

A SELECT-only Postgres role means prod data can be inspected freely with zero
risk of mutation. Writes to prod only ever happen through migrations, which
apply automatically on deploy.

```bash
scripts/prod psql                             # psql shell on prod
scripts/prod npx prisma studio                # browse prod data in the UI
scripts/prod npx tsx scripts/some-check.ts    # run a debug script against prod
```

### One-time setup

**a. Create the read-only role.** In the Supabase SQL editor for the prod project:

```sql
CREATE ROLE claude_ro LOGIN PASSWORD '<pick-a-strong-password>';
GRANT USAGE ON SCHEMA public TO claude_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO claude_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO claude_ro;
```

To revoke later: `DROP ROLE claude_ro;` (drop dependent grants first if it complains).

**b. Build its connection string.** Take the prod "Session pooler" URL from
Supabase → Connection string, swap the user from `postgres` to `claude_ro` and
the password to the one you just set.

**c.** `cp .env.prod.example .env.prod` and fill in `PROD_DATABASE_URL`,
`HEALTH_TOKEN`, `PROD_URL`. `.env.prod` is gitignored.

## 3. Migrations

`prisma migrate deploy` runs during the **production** Vercel build only
(gated on `VERCEL_ENV` in `scripts/prebuild.mjs` — a preview/branch build never
touches the schema), so a `git push` to `main` that adds a migration applies it
to prod automatically. Verify after a deploy:

```bash
curl -s "$PROD_URL/api/health?token=$HEALTH_TOKEN" | jq '.latestMigration'
```

If a migration ever needs to be applied out-of-band (e.g. build skipped it),
run it through a **direct** connection — never the transaction pooler (6543):

```bash
scripts/prod npx prisma migrate deploy   # only if scripts/prod points at a role with DDL rights
```

The read-only role above can't do this; use the `postgres` URL for a one-off, or
paste the migration SQL into the Supabase editor and record it in
`_prisma_migrations`.
