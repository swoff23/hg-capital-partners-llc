import { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";

/**
 * Normalize the connection string for serverless + Supabase's PgBouncer pooler.
 * The transaction pooler (port 6543) requires `pgbouncer=true`; without it Prisma
 * errors on prepared statements at runtime.
 */
function connectionUrl(): string | undefined {
  const url = getEnv().DATABASE_URL;
  if (!url) return url;
  const isTxPooler = /pooler\.supabase\.com:6543/.test(url);
  if (isTxPooler && !/[?&]pgbouncer=/.test(url)) {
    return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true&connection_limit=1";
  }
  return url;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: getEnv().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (!getEnv().isProduction) globalForPrisma.prisma = prisma;
