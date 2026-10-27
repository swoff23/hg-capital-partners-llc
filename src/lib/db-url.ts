/**
 * The connection string the app's Prisma client uses at runtime.
 *
 * Production reads through Supabase's transaction pooler (port 6543), which
 * the Vercel Supabase integration provides as POSTGRES_PRISMA_URL. The session
 * pooler that DATABASE_URL names holds a server connection for as long as each
 * function instance keeps its client open, and it allows 15 at once, so a few
 * warm instances used them all ("max clients reached in session mode", Oct 27).
 * The transaction pooler lends a server connection per transaction instead.
 *
 * Only a Production deployment reads POSTGRES_PRISMA_URL: the integration
 * gives Preview the same production database, and a branch build must never
 * reach it. Migrations keep DATABASE_URL (scripts/prebuild.mjs), because the
 * transaction pooler can't run DDL.
 *
 * On the transaction pooler Prisma needs `pgbouncer=true` (no prepared
 * statements). Each instance keeps a few client connections, not one, so a
 * query made outside an open interactive transaction never waits on it.
 */
export const TX_POOLER_CONNECTION_LIMIT = 5;

export function runtimeDatabaseUrl(env: {
  DATABASE_URL?: string;
  POSTGRES_PRISMA_URL?: string;
  VERCEL_ENV?: string;
}): string | undefined {
  const url = env.VERCEL_ENV === "production" && env.POSTGRES_PRISMA_URL ? env.POSTGRES_PRISMA_URL : env.DATABASE_URL;
  if (!url || !isTxPooler(url)) return url;
  return withParam(withParam(url, "pgbouncer", "true"), "connection_limit", String(TX_POOLER_CONNECTION_LIMIT));
}

/** Supabase's transaction pooler: the pooler host on port 6543. */
export function isTxPooler(url: string): boolean {
  return /pooler\.supabase\.com:6543\//.test(url);
}

/** Sets one query parameter, replacing its value when the URL already has it. */
function withParam(url: string, key: string, value: string): string {
  const existing = new RegExp(`([?&])${key}=[^&#]*`);
  if (existing.test(url)) return url.replace(existing, `$1${key}=${value}`);
  return url + (url.includes("?") ? "&" : "?") + `${key}=${value}`;
}
