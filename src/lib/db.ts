import type { PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { getEnv } from "@/lib/env";

/**
 * The app's Prisma client, on node-postgres through @prisma/adapter-pg:
 * production reads through Supabase's transaction pooler, everything else
 * uses DATABASE_URL, with the pool settings in src/lib/db-url.ts. It is built
 * by src/lib/db-client.ts makeClient, which a test against a real database
 * calls too, so both run the same driver.
 *
 * The adapter reads a `timestamptz` result as if the session were in UTC (it
 * drops the offset). Supabase sessions are UTC, /api/health reports it as
 * dbTimeZone, and the app's columns are `timestamp` without a zone, which it
 * reads right in any session. Raw SQL converts instants explicitly
 * (`${date.toISOString()}::timestamptz AT TIME ZONE 'UTC'`) and selects no
 * timestamptz.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient(getEnv());

if (!getEnv().isProduction) globalForPrisma.prisma = prisma;
