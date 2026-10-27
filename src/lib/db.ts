import { PrismaClient } from "@prisma/client";
import { runtimeDatabaseUrl } from "@/lib/db-url";
import { getEnv } from "@/lib/env";

/**
 * The connection string for serverless + Supabase's pooler: production reads
 * through the transaction pooler with `pgbouncer=true` (src/lib/db-url.ts);
 * everything else uses DATABASE_URL.
 */
function connectionUrl(): string | undefined {
  return runtimeDatabaseUrl(getEnv());
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: getEnv().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (!getEnv().isProduction) globalForPrisma.prisma = prisma;
