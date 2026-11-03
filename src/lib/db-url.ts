/**
 * The connection the app's Prisma client uses at runtime (src/lib/db.ts).
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
 * Queries go through node-postgres (@prisma/adapter-pg), which sends each one
 * as an unnamed statement in a single round trip. That is what a transaction
 * pooler accepts, so the Rust engine's `pgbouncer=true` mode (BEGIN,
 * DEALLOCATE ALL, the query and COMMIT, one after another) isn't needed, and
 * its `pgbouncer` and `connection_limit` parameters are dropped from the URL.
 */

/**
 * Connections each function instance keeps. Enough that a page's parallel
 * reads run in one wave and a query outside an open interactive transaction
 * never waits on it; the transaction pooler shares its server connections
 * among all of them (docs/specs/performance.md, fix 12).
 */
export const POOL_MAX = 10;
/** An idle connection closes after this long (node-postgres's default), so a quiet instance holds none. */
export const POOL_IDLE_MS = 10_000;
/** How long a query waits to connect or for a free connection before it fails. */
export const POOL_CONNECT_TIMEOUT_MS = 10_000;

type DbEnv = { DATABASE_URL?: string; POSTGRES_PRISMA_URL?: string; VERCEL_ENV?: string };

/** The URL for this deployment: production's transaction pooler, otherwise DATABASE_URL. */
export function runtimeDatabaseUrl(env: DbEnv): string | undefined {
  const url = env.VERCEL_ENV === "production" && env.POSTGRES_PRISMA_URL ? env.POSTGRES_PRISMA_URL : env.DATABASE_URL;
  if (!url) return url;
  return withSsl(withoutParam(withoutParam(url, "pgbouncer"), "connection_limit"));
}

/** The node-postgres pool settings for this deployment, or null when there's no URL. */
export function runtimePoolConfig(env: DbEnv): {
  connectionString: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle: boolean;
} | null {
  const connectionString = runtimeDatabaseUrl(env);
  if (!connectionString) return null;
  return {
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_MS,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    // Scripts under scripts/ end once their work is done; a server's open socket keeps it running anyway.
    allowExitOnIdle: true,
  };
}

/**
 * How this deployment reaches the database, for /api/health's detail: the
 * driver, whether it goes through the transaction pooler, and the pool size.
 * Read from the same settings src/lib/db.ts builds its client from.
 */
export function dbConnectionSummary(env: DbEnv): {
  dbDriver: "node-postgres" | "none";
  dbVia: "transaction pooler" | "direct" | null;
  dbPool: number | null;
} {
  const pool = runtimePoolConfig(env);
  if (!pool) return { dbDriver: "none", dbVia: null, dbPool: null };
  return { dbDriver: "node-postgres", dbVia: isTxPooler(pool.connectionString) ? "transaction pooler" : "direct", dbPool: pool.max };
}

/** Supabase's transaction pooler: the pooler host on port 6543. */
export function isTxPooler(url: string): boolean {
  return /pooler\.supabase\.com:6543\//.test(url);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * TLS as the Rust engine had it. node-postgres reads `sslmode=require` as
 * verify-full, a check the engine never made, and Supabase signs with its own
 * CA, which Node doesn't carry. `uselibpqcompat=true` gives sslmode libpq's
 * meaning, as the engine read it: encrypted, certificate not checked. A remote
 * URL without an sslmode gets `require`, since node-postgres would otherwise
 * connect in plain text where the engine's default `prefer` used TLS. A local
 * URL is left as it is.
 */
function withSsl(url: string): string {
  if (hasParam(url, "uselibpqcompat")) return url;
  const mode = paramValue(url, "sslmode");
  if (mode) return mode === "disable" ? url : withParam(url, "uselibpqcompat", "true");
  if (isLocal(url)) return url;
  return withParam(withParam(url, "sslmode", "require"), "uselibpqcompat", "true");
}

function isLocal(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function paramValue(url: string, key: string): string | null {
  return new RegExp(`[?&]${key}=([^&#]*)`).exec(url)?.[1] ?? null;
}

function hasParam(url: string, key: string): boolean {
  return paramValue(url, key) !== null;
}

/** Sets one query parameter, replacing its value when the URL already has it. */
function withParam(url: string, key: string, value: string): string {
  const existing = new RegExp(`([?&])${key}=[^&#]*`);
  if (existing.test(url)) return url.replace(existing, `$1${key}=${value}`);
  return url + (url.includes("?") ? "&" : "?") + `${key}=${value}`;
}

/** Drops one query parameter, keeping the rest of the query string in order. */
function withoutParam(url: string, key: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const kept = url
    .slice(q + 1)
    .split("&")
    .filter((part) => part !== "" && part.split("=")[0] !== key);
  return url.slice(0, q) + (kept.length ? "?" + kept.join("&") : "");
}
