import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { TRANSACTION_MAX_WAIT_MS, runtimePoolConfig, runtimeSchema } from "@/lib/db-url";
import { logError } from "@/lib/log";

/**
 * A Prisma client built the way the app's is (src/lib/db.ts), from an env:
 * node-postgres through @prisma/adapter-pg, with the pool settings, TLS and
 * schema of src/lib/db-url.ts. No side effects of its own, so a test that
 * runs against a real database (a *.pg.test.ts on a scratch database) builds
 * its client here with `makeClient({ DATABASE_URL: url })` and exercises the
 * driver production runs, not the Rust engine a bare `new PrismaClient` gets.
 *
 * attachDatabasePool keeps a Vercel function alive until its idle connections
 * have closed, so none is left half-open while the instance is suspended. It
 * does nothing off Vercel.
 *
 * With no URL at all the client starts without the adapter, and Prisma
 * reports the missing DATABASE_URL at the first query, as before.
 *
 * Every interactive transaction waits for a connection as long as the pool
 * lets it, whatever maxWait it asks (TRANSACTION_MAX_WAIT_MS says why), so
 * that is the default the client states.
 */
export function makeClient(env: { DATABASE_URL?: string; POSTGRES_PRISMA_URL?: string; VERCEL_ENV?: string; NODE_ENV?: string }): PrismaClient {
  const log: ("warn" | "error")[] = env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];
  const transactionOptions = { maxWait: TRANSACTION_MAX_WAIT_MS };
  const config = runtimePoolConfig(env);
  if (!config) return new PrismaClient({ log, transactionOptions });
  const pool = new Pool(config);
  // An idle connection the server drops emits here; without a listener it would end the process.
  pool.on("error", (err) => logError("db:pool", err));
  attachDatabasePool(pool);
  const schema = runtimeSchema(env);
  // disposeExternalPool: a script's $disconnect() ends the pool, so it exits once its work is done.
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true, ...(schema ? { schema } : {}) }), log, transactionOptions });
}
