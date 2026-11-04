import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { makeClient } from "./db-client";
import { POOL_MAX, TRANSACTION_MAX_WAIT_MS } from "./db-url";

/**
 * ADP-1: a test against a real database built its client with a bare
 * `new PrismaClient({ datasourceUrl })`, which runs the Rust engine, not the
 * node-postgres adapter the app runs. makeClient is the app's own recipe, with
 * no side effects, for those tests to call. Built here without connecting.
 */

type Built = { _engineConfig?: { adapter?: { adapterName?: string }; transactionOptions?: { maxWait?: number } } };

test("makeClient builds the app's client: the node-postgres adapter, and the maxWait a transaction really gets", async () => {
  const client = makeClient({ DATABASE_URL: "postgresql://u@localhost:5432/hg_never_connected" });
  const config = (client as unknown as Built)._engineConfig;
  assert.equal(config?.adapter?.adapterName, "@prisma/adapter-pg");
  assert.equal(config?.transactionOptions?.maxWait, TRANSACTION_MAX_WAIT_MS);
  await client.$disconnect();
});

test("lows 3: a Production client off the transaction pooler logs it once; on the pooler, or off Production, nothing", async (t) => {
  const SESSION = "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  const TX = "postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";
  const errors = t.mock.method(console, "error", () => {});
  // Built, never connected: the pool opens its first connection at the first query.
  const clients = [
    makeClient({ VERCEL_ENV: "production", DATABASE_URL: SESSION, POSTGRES_PRISMA_URL: TX }),
    makeClient({ VERCEL_ENV: "preview", DATABASE_URL: SESSION }),
    makeClient({ DATABASE_URL: SESSION }),
  ];
  assert.equal(errors.mock.callCount(), 0);
  clients.push(makeClient({ VERCEL_ENV: "production", DATABASE_URL: SESSION }), makeClient({ VERCEL_ENV: "production", DATABASE_URL: SESSION }));
  assert.equal(errors.mock.callCount(), 1);
  const raw = String(errors.mock.calls[0]?.arguments[0]);
  const line = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(line.level, "error");
  assert.equal(line.scope, "db:pooler");
  assert.equal(line.message, "POSTGRES_PRISMA_URL is missing, so production reads DATABASE_URL through the session pooler");
  assert.equal(line.dbVia, "session pooler");
  assert.equal(line.dbPool, POOL_MAX);
  assert.doesNotMatch(raw, /:pw@|supabase\.com/);
  await Promise.all(clients.map((c) => c.$disconnect()));
});

test("lows 3: once per process, not per copy of the module: the flag another copy set keeps this one quiet", async (t) => {
  // A production build loads db-client once for the route handlers and once for the pages, each with its own module
  // variables, so the line has to be remembered where both copies see it.
  const SESSION = "postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  const flag = globalThis as unknown as { __hgPoolerWarned?: boolean };
  const was = flag.__hgPoolerWarned;
  const errors = t.mock.method(console, "error", () => {});
  try {
    flag.__hgPoolerWarned = true;
    const client = makeClient({ VERCEL_ENV: "production", DATABASE_URL: SESSION });
    assert.equal(errors.mock.callCount(), 0, "the other copy already said it");
    await client.$disconnect();
    flag.__hgPoolerWarned = false;
    const next = makeClient({ VERCEL_ENV: "production", DATABASE_URL: SESSION });
    assert.equal(errors.mock.callCount(), 1);
    assert.equal(flag.__hgPoolerWarned, true, "and it marks the process, for the next copy");
    await next.$disconnect();
  } finally {
    flag.__hgPoolerWarned = was;
  }
});

test("db.ts builds its client with makeClient, so the two never drift", () => {
  const src = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(src, /export const prisma = globalForPrisma\.prisma \?\? makeClient\(getEnv\(\)\);/);
  assert.doesNotMatch(src, /new PrismaClient\(/);
});

test("every test against a real database builds its client with makeClient", () => {
  // ADP-1 again, for the ones a merge brings in (job-batch.pg.test.ts came with late photos, before makeClient).
  const root = new URL("../", import.meta.url);
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".pg.test.ts"));
  assert.ok(files.length > 0, "finds the *.pg.test.ts files");
  for (const f of files) {
    const src = readFileSync(new URL(f, root), "utf8");
    assert.match(src, /makeClient\(\{ DATABASE_URL: /, f);
    assert.doesNotMatch(src, /new PrismaClient\(/, f);
  }
});
