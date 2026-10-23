/**
 * Where the Asana import may write, and with what input. Pure; the scripts
 * in scripts/asana/ do the I/O (reading DATABASE_URL, statting the backup,
 * running pg_restore) and ask these functions. target.test.ts covers them.
 */

/** The production Supabase project (docs/asana-migration-plan.md §5.5). The other one, named after the company, is empty. */
export const PROD_REF = "ywdjaygwkqyrmbdnvaai";

/** HG Capital's Asana project (scripts/asana/10-snapshot.ts), the only one ever imported into a non-local database. */
export const HG_PROJECT_GID = "1208826670424350";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface Target {
  host: string;
  database: string;
  /** A local development database. A production URL is never local, whatever its host (an SSH tunnel, a local pooler). */
  local: boolean;
  isProdRef: boolean;
}

export function describeDatabaseUrl(url: string): Target {
  const u = new URL(url);
  const isProdRef = url.includes(PROD_REF);
  return { host: u.hostname, database: u.pathname.replace(/^\//, ""), local: LOCAL_HOSTS.has(u.hostname) && !isProdRef, isProdRef };
}

/** Why writing to `t` is refused, or null when it's allowed. Anywhere but a local database needs `--confirm-prod` and the production URL. */
export function writeRefusal(t: Target, opts: { apply: boolean; confirmProd: string | undefined }): string | null {
  if (!opts.apply || t.local) return null;
  if (opts.confirmProd !== PROD_REF) return `refusing to write to ${t.host}: pass --confirm-prod ${PROD_REF} to write to production`;
  if (!t.isProdRef) return `refusing to write: DATABASE_URL isn't the production project ${PROD_REF} (host ${t.host})`;
  return null;
}

/**
 * Why applying this Asana input to `t` is refused, or null. A synthetic
 * fixture (made-up tasks, or real CSV gids with made-up completions) and
 * any project but HG's only ever go to a local database.
 */
export function inputRefusal(t: Target, input: { apply: boolean; synthetic: boolean; projectGid: string }): string | null {
  if (!input.apply || t.local) return null;
  if (input.synthetic) return "refusing to --apply a SYNTHETIC fixture to a non-local database";
  if (input.projectGid !== HG_PROJECT_GID) {
    return `refusing to --apply Asana project ${input.projectGid} to a non-local database: only HG Capital (${HG_PROJECT_GID}) is imported there`;
  }
  return null;
}

/** How old a backup may be when a production write starts. */
export const BACKUP_MAX_AGE_MS = 30 * 60_000;

export interface BackupFacts {
  exists: boolean;
  bytes: number;
  mtimeMs: number;
  /** Inside a git work tree and not ignored, so `git add` could pick it up. */
  trackable: boolean;
  /** The database name in the dump's header (`pg_restore -l`), or null when it couldn't be read. */
  dumpDbname: string | null;
}

/** Why `file` doesn't count as the backup taken right before writing to `t`, or null when it does. */
export function backupRefusal(file: string, b: BackupFacts, t: Target, now: number): string | null {
  if (!b.exists) return `--backup ${file} doesn't exist`;
  if (b.bytes <= 0) return `--backup ${file} is empty`;
  const age = now - b.mtimeMs;
  if (age > BACKUP_MAX_AGE_MS) return `--backup ${file} is ${Math.round(age / 60_000)} minutes old; take a fresh one (at most ${BACKUP_MAX_AGE_MS / 60_000})`;
  if (b.trackable) return `--backup ${file} is inside the repo and not gitignored; keep it under _private/`;
  if (b.dumpDbname !== null && b.dumpDbname !== t.database) {
    return `--backup ${file} is a dump of database "${b.dumpDbname}", not "${t.database}" on ${t.host}`;
  }
  return null;
}

/** The database name in `pg_restore -l` output. */
export function dumpDbname(listing: string): string | null {
  return listing.match(/^;\s*dbname:\s*(\S+)\s*$/m)?.[1] ?? null;
}

/** Query parameters Prisma reads that libpq (pg_dump) rejects. */
const PRISMA_ONLY_PARAMS = ["pgbouncer", "connection_limit", "pool_timeout", "schema", "statement_cache_size", "socket_timeout"];

/**
 * A pg_dump command that backs up the same database this run writes to.
 * The run's DATABASE_URL usually comes from `tsx --env-file=<file>`, which
 * sets it only inside this process, so the command reads it from that same
 * file rather than from the operator's shell. The dump goes under the
 * gitignored _private/ folder.
 */
export function backupCommand(envFile: string | null, label: string): string {
  const strip = `const u=new URL(process.env.DATABASE_URL);for(const k of ${JSON.stringify(PRISMA_ONLY_PARAMS)})u.searchParams.delete(k);u.href`;
  const url = envFile ? `"$(node --env-file=${shellQuote(envFile)} -p '${strip}')"` : `"$DATABASE_URL"`;
  return `mkdir -p _private/backups && pg_dump ${url} -Fc -f _private/backups/hg-before-${label}-$(date +%Y%m%d-%H%M).dump`;
}

function shellQuote(s: string): string {
  return /^[A-Za-z0-9._/-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The file `--env-file` loaded for this process (tsx passes it through to node's execArgv), or null. */
export function envFileOf(execArgv: readonly string[]): string | null {
  let found: string | null = null;
  for (let i = 0; i < execArgv.length; i++) {
    const a = execArgv[i];
    if (a.startsWith("--env-file=")) found = a.slice("--env-file=".length);
    else if (a === "--env-file" && execArgv[i + 1]) found = execArgv[++i];
  }
  return found;
}
