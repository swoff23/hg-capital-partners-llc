import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import {
  POOL_CONNECT_TIMEOUT_MS,
  POOL_MAX,
  TRANSACTION_MAX_WAIT_MS,
  dbConnectionSummary,
  isPrivateHost,
  isTxPooler,
  runtimeDatabaseUrl,
  runtimePoolConfig,
  runtimeSchema,
} from "./db-url";

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

test("ADP-4: a unix socket or a server on the local network stays plain, as the engine's prefer left it", () => {
  for (const url of [
    "postgresql://u@/hg?host=/var/run/postgresql",
    "postgresql://u@/hg?host=%2Ftmp",
    "postgresql://u@192.168.1.20:5432/hg",
    "postgresql://u@10.0.0.5/hg",
    "postgresql://u@172.20.0.3/hg",
    "postgresql://u@169.254.10.1/hg",
    "postgresql://u@[fd12:3456::1]:5432/hg",
    "postgresql://u@[fe80::1]/hg",
    "postgresql://u@db:5432/hg",
    "postgresql://u@postgres.local/hg",
    "postgresql://u@host.docker.internal/hg",
    "postgresql://u@api.localhost/hg",
  ]) {
    assert.equal(runtimeDatabaseUrl({ DATABASE_URL: url }), url, url);
  }
  // Anything public still gets TLS.
  for (const url of [SESSION, "postgresql://u@db.abcd.supabase.co:5432/postgres", "postgresql://u@172.32.0.1/hg", "postgresql://u@8.8.8.8/hg", "postgresql://u@[2001:db8::1]/hg"]) {
    assert.ok(!isPrivateHost(url), url);
    assert.match(runtimeDatabaseUrl({ DATABASE_URL: url }) ?? "", /sslmode=require&uselibpqcompat=true$/, url);
  }
});

test("ADP-5: a schema= in the URL reaches the client and the session, and node-postgres never sees it", () => {
  const url = "postgresql://u@localhost:5432/hg?schema=hg_test";
  assert.equal(runtimeDatabaseUrl({ DATABASE_URL: url }), "postgresql://u@localhost:5432/hg");
  assert.equal(runtimeSchema({ DATABASE_URL: url }), "hg_test");
  assert.equal(runtimePoolConfig({ DATABASE_URL: url })?.options, "-c search_path=hg_test");
  // public, none, or a name that isn't a plain identifier: nothing changes.
  for (const plain of [`${SESSION}?schema=public`, SESSION, `${LOCAL}?schema=a%20b`, `${LOCAL}?schema=x;drop`]) {
    assert.equal(runtimeSchema({ DATABASE_URL: plain }), null, plain);
    assert.equal(runtimePoolConfig({ DATABASE_URL: plain })?.options, undefined, plain);
  }
  assert.doesNotMatch(runtimeDatabaseUrl({ DATABASE_URL: `${SESSION}?schema=public` }) ?? "", /schema=/);
});

test("maxWait: the client's default is the pool's connect timeout, the wait a transaction really gets", () => {
  // Measured on the scratch database: with every connection busy, a transaction asked to wait 500 ms waited 5.7 s,
  // because Prisma's maxWait doesn't reach the adapter's pool.connect; only POOL_CONNECT_TIMEOUT_MS bounds it.
  assert.equal(TRANSACTION_MAX_WAIT_MS, POOL_CONNECT_TIMEOUT_MS);
  assert.equal(runtimePoolConfig({ DATABASE_URL: LOCAL })?.connectionTimeoutMillis, TRANSACTION_MAX_WAIT_MS);
});
