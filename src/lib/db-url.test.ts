import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { POOL_MAX, dbConnectionSummary, isTxPooler, runtimeDatabaseUrl, runtimePoolConfig } from "./db-url";

const SESSION = "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const TX = "postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
const LOCAL = "postgresql://connorswofford@localhost:5432/hg_capital_uiux";

/** What node-postgres makes of a URL's TLS settings, without connecting. */
function sslOf(url: string): unknown {
  return (new Client({ connectionString: url }) as unknown as { connectionParameters: { ssl: unknown } }).connectionParameters.ssl;
}

test("production reads through the integration's transaction pooler, with no Rust-engine parameters", () => {
  const url = runtimeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX }) ?? "";
  assert.ok(url.startsWith("postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x"));
  assert.doesNotMatch(url, /pgbouncer|connection_limit/);
});

test("a Preview or local build never reads POSTGRES_PRISMA_URL, which names production", () => {
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: undefined, POSTGRES_PRISMA_URL: TX }), undefined);
  assert.equal(runtimeDatabaseUrl({ VERCEL_ENV: undefined, DATABASE_URL: LOCAL, POSTGRES_PRISMA_URL: TX }), LOCAL);
  assert.equal(runtimePoolConfig({ VERCEL_ENV: "preview", POSTGRES_PRISMA_URL: TX }), null);
});

test("production without the integration URL keeps DATABASE_URL", () => {
  const url = runtimeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: SESSION }) ?? "";
  assert.ok(url.startsWith(SESSION + "?"));
});

test("a pgbouncer or connection_limit left in a URL is dropped, and the rest is kept in order", () => {
  const url = runtimeDatabaseUrl({ DATABASE_URL: TX.replace("?", "?pgbouncer=true&connection_limit=1&") }) ?? "";
  assert.doesNotMatch(url, /pgbouncer|connection_limit/);
  assert.match(url, /\?sslmode=require&supa=base-pooler\.x/);
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: LOCAL + "?pgbouncer=true" }), LOCAL);
});

test("sslmode=require keeps the engine's meaning: encrypted, certificate not checked", () => {
  const url = runtimeDatabaseUrl({ DATABASE_URL: TX }) ?? "";
  assert.match(url, /[?&]uselibpqcompat=true(&|$)/);
  assert.deepEqual(sslOf(url), { rejectUnauthorized: false });
  // Without the flag node-postgres would verify the chain against Node's public CAs.
  assert.deepEqual(sslOf(TX), {});
});

test("a remote URL with no sslmode still uses TLS; a local one stays plain", () => {
  const remote = runtimeDatabaseUrl({ DATABASE_URL: SESSION }) ?? "";
  assert.deepEqual(sslOf(remote), { rejectUnauthorized: false });
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: LOCAL }), LOCAL);
  assert.equal(sslOf(LOCAL), false);
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: "postgresql://u@127.0.0.1:15432/db" }), "postgresql://u@127.0.0.1:15432/db");
});

test("an explicit sslmode=disable or uselibpqcompat is left alone", () => {
  const off = `${SESSION}?sslmode=disable`;
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: off }), off);
  const own = `${SESSION}?sslmode=verify-full&uselibpqcompat=true`;
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: own }), own);
});

test("every deployment gets the same pool size", () => {
  assert.equal(runtimePoolConfig({ VERCEL_ENV: "production", POSTGRES_PRISMA_URL: TX })?.max, POOL_MAX);
  assert.equal(runtimePoolConfig({ DATABASE_URL: LOCAL })?.max, POOL_MAX);
  assert.equal(runtimePoolConfig({ DATABASE_URL: LOCAL })?.connectionString, LOCAL);
});

test("only the pooler host on 6543 counts as the transaction pooler", () => {
  assert.equal(isTxPooler(TX), true);
  assert.equal(isTxPooler(SESSION), false);
  assert.equal(isTxPooler(LOCAL), false);
});

test("the health detail names the driver, the route and the pool", () => {
  assert.deepEqual(dbConnectionSummary({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX }), {
    dbDriver: "node-postgres",
    dbVia: "transaction pooler",
    dbPool: POOL_MAX,
  });
  // Production without the integration's URL falls back to the session pooler, which health shows as direct.
  assert.equal(dbConnectionSummary({ VERCEL_ENV: "production", DATABASE_URL: SESSION }).dbVia, "direct");
  assert.deepEqual(dbConnectionSummary({ VERCEL_ENV: "preview", POSTGRES_PRISMA_URL: TX }), { dbDriver: "none", dbVia: null, dbPool: null });
});
