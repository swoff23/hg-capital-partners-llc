import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { runtimePoolConfig } from "@/lib/db-url";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";

/**
 * The app's Prisma client, on node-postgres through @prisma/adapter-pg:
 * production reads through Supabase's transaction pooler, everything else
 * uses DATABASE_URL, with the pool settings in src/lib/db-url.ts.
 *
 * attachDatabasePool keeps a Vercel function alive until its idle connections
 * have closed, so none is left half-open while the instance is suspended. It
 * does nothing off Vercel.
 *
 * With no URL at all the client starts without the adapter, and Prisma
 * reports the missing DATABASE_URL at the first query, as before.
 *
 * The adapter reads a `timestamptz` result as if the session were in UTC (it
 * drops the offset). Supabase sessions are UTC, /api/health reports it as
 * dbTimeZone, and the app's columns are `timestamp` without a zone, which it
 * reads right in any session. Raw SQL converts instants explicitly
 * (`::timestamptz AT TIME ZONE 'UTC'`) and selects no timestamptz.
 */
function makeClient(): PrismaClient {
  const env = getEnv();
  const log: ("warn" | "error")[] = env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];
  const config = runtimePoolConfig(env);
  if (!config) return new PrismaClient({ log });
  const pool = new Pool(config);
  // An idle connection the server drops emits here; without a listener it would end the process.
  pool.on("error", (err) => logError("db:pool", err));
  attachDatabasePool(pool);
  // disposeExternalPool: a script's $disconnect() ends the pool, so it exits once its work is done.
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }), log });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (!getEnv().isProduction) globalForPrisma.prisma = prisma;
