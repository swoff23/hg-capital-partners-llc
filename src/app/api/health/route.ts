import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { healthDetailAllowed } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * Deploy / DB health probe. Curl-friendly, no session needed.
 *
 * Set HEALTH_TOKEN (Vercel env + local .env.prod) to unlock the detailed payload.
 * Without a configured token, or without a matching one, it still answers but
 * only with { ok, db, env, commit, at } — enough to see if the site is up, not
 * enough to enumerate the schema. Fails closed: no token configured means
 * nobody gets the detail (see src/lib/secrets.ts).
 *
 *   curl -s "$PROD/api/health?token=$HEALTH_TOKEN" | jq
 */
export async function GET(request: NextRequest) {
  const provided =
    new URL(request.url).searchParams.get("token") ?? request.headers.get("x-health-token");
  const detailed = healthDetailAllowed(process.env.HEALTH_TOKEN, provided);

  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null;

  let db: "up" | "down" = "down";
  let migrations: { name: string; appliedAt: string | null; rolledBackAt: string | null }[] = [];
  let dbError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
    if (detailed) {
      const rows = await prisma.$queryRaw<
        { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
      >`SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        ORDER BY started_at DESC
        LIMIT 25`;
      migrations = rows.map((r) => ({
        name: r.migration_name,
        appliedAt: r.finished_at?.toISOString() ?? null,
        rolledBackAt: r.rolled_back_at?.toISOString() ?? null,
      }));
    }
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const body: Record<string, unknown> = { ok: db === "up", db, env, commit, at: new Date().toISOString() };
  if (dbError && detailed) body.dbError = dbError;
  if (detailed) {
    body.node = process.version;
    body.migrations = migrations;
    body.latestMigration = migrations.find((m) => m.appliedAt && !m.rolledBackAt)?.name ?? null;
  }

  return NextResponse.json(body, { status: db === "up" ? 200 : 503 });
}
