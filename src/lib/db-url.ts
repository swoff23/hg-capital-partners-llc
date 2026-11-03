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

/**
 * An interactive transaction's maxWait, the client's default (src/lib/db-client.ts). On this driver Prisma's own
 * maxWait timer covers only the engine's hand-off, never the wait for a free connection: measured on the scratch
 * database, a transaction asked to wait 500 ms for a pool whose connections were all busy waited 5.7 s for one to free
 * up (and, with them held longer, failed at the pool's connect timeout, not at maxWait). That wait is the pool's
 * POOL_CONNECT_TIMEOUT_MS whatever a caller asks, so this is the true bound and the default says so; the callers that
 * ask for 10 s (tasks/bulk.ts, properties/service.ts) get what they asked for. A shorter wait would need a pool that
 * knows each transaction's maxWait, which the engine doesn't hand it.
 */
export const TRANSACTION_MAX_WAIT_MS = POOL_CONNECT_TIMEOUT_MS;

type DbEnv = { DATABASE_URL?: string; POSTGRES_PRISMA_URL?: string; VERCEL_ENV?: string };

/** The URL for this deployment: production's transaction pooler, otherwise DATABASE_URL. */
function chosenUrl(env: DbEnv): string | undefined {
  return env.VERCEL_ENV === "production" && env.POSTGRES_PRISMA_URL ? env.POSTGRES_PRISMA_URL : env.DATABASE_URL;
}

/**
 * The URL node-postgres connects with: the deployment's (chosenUrl) less the Rust engine's own parameters, which
 * node-postgres doesn't know: `pgbouncer`, `connection_limit` and `schema` (runtimeSchema carries that one).
 */
export function runtimeDatabaseUrl(env: DbEnv): string | undefined {
  const url = chosenUrl(env);
  if (!url) return url;
  return withSsl(withoutParam(withoutParam(withoutParam(url, "pgbouncer"), "connection_limit"), "schema"));
}

/**
 * The URL's `schema=` parameter, when it names one other than public. The Rust engine read it (the tables Prisma
 * migrates into, and the session's search_path); node-postgres ignores it, so the client would have queried public
 * while migrations wrote elsewhere. db-client.ts hands it to the adapter, and the pool sets the search_path to it, so
 * raw SQL reads the same tables. Only a plain identifier is taken; public, or none, is left as it was.
 */
export function runtimeSchema(env: DbEnv): string | null {
  const url = chosenUrl(env);
  const raw = url ? paramValue(url, "schema") : null;
  if (!raw) return null;
  let schema: string;
  try {
    schema = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) && schema !== "public" ? schema : null;
}

/** The node-postgres pool settings for this deployment, or null when there's no URL. */
export function runtimePoolConfig(env: DbEnv): {
  connectionString: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  allowExitOnIdle: boolean;
  /** The URL's schema (runtimeSchema) as the session's search_path; absent for public. */
  options?: string;
} | null {
  const connectionString = runtimeDatabaseUrl(env);
  if (!connectionString) return null;
  const schema = runtimeSchema(env);
  return {
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: POOL_IDLE_MS,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    // Scripts under scripts/ end once their work is done; a server's open socket keeps it running anyway.
    allowExitOnIdle: true,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
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
 * connect in plain text where the engine's default `prefer` used TLS. A URL
 * that stays on this machine or its network (isPrivateHost) is left as it is:
 * `prefer` fell back to plain text there, and forcing TLS on a unix socket or
 * a LAN server without it (a Docker or home-lab Postgres) only refused the
 * connection.
 */
function withSsl(url: string): string {
  if (hasParam(url, "uselibpqcompat")) return url;
  const mode = paramValue(url, "sslmode");
  if (mode) return mode === "disable" ? url : withParam(url, "uselibpqcompat", "true");
  if (isPrivateHost(url)) return url;
  return withParam(withParam(url, "sslmode", "require"), "uselibpqcompat", "true");
}

/**
 * Whether a URL's server is this machine or its own network: a unix socket (no
 * host, or a `host=` path), localhost and loopback, the private and link-local
 * IPv4 ranges (10/8, 172.16/12, 192.168/16, 169.254/16), IPv6 unique-local and
 * link-local addresses, and a name with no dot or under .local, .localhost or
 * .internal (a Docker service, a LAN box). Never true for a public host such as
 * Supabase's pooler.
 */
export function isPrivateHost(url: string): boolean {
  const hostParam = paramValue(url, "host");
  if (hostParam && decodeURIComponentSafe(hostParam).startsWith("/")) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "" || LOCAL_HOSTS.has(host)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.startsWith("[")) return /^\[(?:f[cd][0-9a-f]{0,2}|fe[89ab][0-9a-f]?):/.test(host);
  return !host.includes(".") || /\.(?:local|localhost|internal)$/.test(host);
}

function decodeURIComponentSafe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
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
