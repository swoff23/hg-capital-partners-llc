/**
 * One-line JSON error logging. Vercel captures console.error per invocation,
 * so a single structured line per failure is what shows up in the Logs tab
 * and can be searched by `scope`. No dependency; safe to call from scripts.
 *
 * Every line is also handed to the error reporter when one is set
 * (docs/specs/error-alerts.md, Q13). src/instrumentation.ts sets it at start-up
 * in production, so the 34 places that catch an error and carry on reach
 * Sentry too. Scripts and tests never set one, so for them this only logs.
 * The reporter lives on globalThis: Next bundles the instrumentation file and
 * the app's server code as separate module copies, and a module variable set
 * in one would be invisible in the other.
 */

/** "warning" is recorded but never emails: cleanup that's allowed to fail (an old file left behind, a "seen" mark). */
export type ReportLevel = "error" | "warning";

export interface LogOptions {
  /** false: the Vercel line only. Use it where something else reports the same error (withLog rethrows to onRequestError). */
  report?: boolean;
  level?: ReportLevel;
}

export type ErrorReporter = (scope: string, err: Error, ctx: Record<string, unknown>, level: ReportLevel) => void;

/** One report per scope and message per minute per server instance, so a loop can't spend the month's quota (risk 2). */
const REPORT_EVERY_MS = 60_000;
const MAX_REMEMBERED = 500;

interface ReporterState {
  reporter: ErrorReporter | null;
  lastSent: Map<string, number>;
}

const STATE_KEY = Symbol.for("hg.errorReporter");

function state(): ReporterState {
  const g = globalThis as { [STATE_KEY]?: ReporterState };
  return (g[STATE_KEY] ??= { reporter: null, lastSent: new Map() });
}

/** Set once at start-up (src/lib/report-server.ts); null turns reporting off again, for tests. */
export function setErrorReporter(reporter: ErrorReporter | null): void {
  const s = state();
  s.reporter = reporter;
  s.lastSent.clear();
}

export function logError(scope: string, err: unknown, ctx: Record<string, unknown> = {}, opts: LogOptions = {}): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = (e as { digest?: string }).digest;
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      name: e.name,
      message: e.message,
      ...(digest ? { digest } : {}),
      ...ctx,
      stack: e.stack?.split("\n").slice(1, 5).map((l) => l.trim()),
      at: new Date().toISOString(),
    }),
  );
  if (opts.report === false) return;
  report(scope, e, ctx, opts.level ?? "error");
}

function report(scope: string, err: Error, ctx: Record<string, unknown>, level: ReportLevel): void {
  const s = state();
  if (!s.reporter) return;
  const key = `${scope}\n${err.message}`;
  const now = Date.now();
  const last = s.lastSent.get(key);
  if (last !== undefined && now - last < REPORT_EVERY_MS) return;
  if (s.lastSent.size >= MAX_REMEMBERED) s.lastSent.clear();
  s.lastSent.set(key, now);
  try {
    s.reporter(scope, err, ctx, level);
  } catch {
    // Reporting never breaks the caller; the line above is already in Vercel's logs.
  }
}
