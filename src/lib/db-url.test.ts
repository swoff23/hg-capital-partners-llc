import { test } from "node:test";
import assert from "node:assert/strict";
import { TX_POOLER_CONNECTION_LIMIT, isTxPooler, runtimeDatabaseUrl } from "./db-url";

const SESSION = "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const TX = "postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
const LOCAL = "postgresql://connorswofford@localhost:5432/hg_capital_uiux";

test("production reads through the integration's transaction pooler", () => {
  const url = runtimeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX });
  assert.ok(url?.startsWith("postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x"));
  assert.match(url ?? "", /[?&]pgbouncer=true(&|$)/);
  assert.match(url ?? "", new RegExp(`[?&]connection_limit=${TX_POOLER_CONNECTION_LIMIT}(&|$)`));
});

test("a Preview or local build never reads POSTGRES_PRISMA_URL, which names production", () => {
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: undefined, POSTGRES_PRISMA_URL: TX }), undefined);
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: undefined, DATABASE_URL: LOCAL, POSTGRES_PRISMA_URL: TX }), LOCAL);
});

test("production without the integration URL keeps DATABASE_URL as it is", () => {
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: SESSION }), SESSION);
});

test("an existing pgbouncer or connection_limit is set, not repeated", () => {
  const url = runtimeDatabaseUrl({ DATABASE_URL: TX.replace("?", "?pgbouncer=true&connection_limit=1&") }) ?? "";
  assert.equal(url.match(/pgbouncer=/g)?.length, 1);
  assert.equal(url.match(/connection_limit=/g)?.length, 1);
  assert.match(url, new RegExp(`connection_limit=${TX_POOLER_CONNECTION_LIMIT}`));
  assert.match(url, /sslmode=require/);
});

test("a transaction pooler URL with no query string gets one", () => {
  const bare = "postgres://u:p@x.pooler.supabase.com:6543/postgres";
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: bare }), `${bare}?pgbouncer=true&connection_limit=${TX_POOLER_CONNECTION_LIMIT}`);
});

test("only the pooler host on 6543 counts as the transaction pooler", () => {
  assert.equal(isTxPooler(TX), true);
  assert.equal(isTxPooler(SESSION), false);
  assert.equal(isTxPooler(LOCAL), false);
});
