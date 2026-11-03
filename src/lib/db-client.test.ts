import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeClient } from "./db-client";
import { TRANSACTION_MAX_WAIT_MS } from "./db-url";

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

test("db.ts builds its client with makeClient, so the two never drift", () => {
  const src = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(src, /export const prisma = globalForPrisma\.prisma \?\? makeClient\(getEnv\(\)\);/);
  assert.doesNotMatch(src, /new PrismaClient\(/);
});
