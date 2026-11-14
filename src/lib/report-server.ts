import "server-only";
import * as Sentry from "@sentry/nextjs";
import { waitUntil } from "@vercel/functions";
import type { Instrumentation } from "next";
import { getEnv } from "./env";
import { DATA_COLLECTION, areaOfRoute, kindOfArea, scrubBreadcrumb, scrubEvent } from "./error-report";
import { logError, setErrorReporter } from "./log";

/**
 * The server half of error alerts (docs/specs/error-alerts.md): the one file
 * that imports @sentry/nextjs at run time (eslint.config.mjs holds the rest
 * to that). Started by src/instrumentation.ts. Reports only in production
 * with a DSN set, so local runs, the device check and preview deployments
 * send nothing.
 *
 * Three ways in:
 *  - onRequestError, for anything that escapes a page, a route handler, a
 *    server action or the proxy;
 *  - logError (src/lib/log.ts), for the places that catch an error and carry on;
 *  - the background jobs' check-in, once a minute from the email job.
 */

const FLUSH_MS = 2000;

/** The cron monitor (section 3 of the spec). Sent with every check-in, so the monitor's settings live in code. */
export const JOBS_MONITOR_SLUG = "background-jobs";
const JOBS_MONITOR_CONFIG = {
  schedule: { type: "crontab" as const, value: "* * * * *" },
  checkinMargin: 1,
  failureIssueThreshold: 5,
  recoveryThreshold: 1,
  timezone: "UTC",
};

const STARTED = Symbol.for("hg.sentryServerStarted");

function started(): boolean {
  return (globalThis as { [STARTED]?: boolean })[STARTED] === true;
}

/** Starts Sentry once per server instance. False when reporting is off here (not production, or no DSN). */
export function startServerReporting(): boolean {
  if (started()) return true;
  const env = getEnv();
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || env.VERCEL_ENV !== "production") return false;

  Sentry.init({
    dsn,
    environment: "production",
    release: env.VERCEL_GIT_COMMIT_SHA,
    dataCollection: DATA_COLLECTION,
    // Errors only. Tracing stays off because tracesSampleRate is left unset (0 would still turn
    // tracing on, with nothing sampled). Console calls stay out of the click trail (scrubBreadcrumb).
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  (globalThis as { [STARTED]?: boolean })[STARTED] = true;

  setErrorReporter((scope, err, ctx, level) => {
    Sentry.withScope((s) => {
      s.setLevel(level);
      s.setTag("scope", scope);
      s.setExtras(ctx);
      Sentry.captureException(err);
    });
    flushLater();
  });
  return true;
}

/** Keeps the function alive until the report is sent: Vercel can freeze it as soon as the response is out. */
function flushLater(): void {
  try {
    waitUntil(Sentry.flush(FLUSH_MS).catch(() => false));
  } catch {
    // Outside a request (a script, a test) there is nothing to extend.
  }
}

/** Next's onRequestError, with the route's area, staff or contractor, and the digest the error screen shows (Q18). */
export async function reportRequestError(...[err, request, context]: Parameters<Instrumentation.onRequestError>): Promise<void> {
  if (!startServerReporting()) return;
  const area = areaOfRoute(context.routePath);
  const kind = kindOfArea(area);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : null;
  Sentry.withScope((s) => {
    if (area) s.setTag("area", area);
    if (kind) s.setTag("kind", kind);
    if (digest) s.setTag("digest", digest);
    s.setTag("routeType", context.routeType);
    Sentry.captureRequestError(err, request, context);
  });
  await Sentry.flush(FLUSH_MS).catch(() => false);
}

/** One check-in for the email job's run: "ok", or "error" when a stopped-job rule tripped (src/lib/jobs-health.ts). */
export async function checkInJobs(status: "ok" | "error"): Promise<void> {
  if (!startServerReporting()) return;
  try {
    Sentry.captureCheckIn({ monitorSlug: JOBS_MONITOR_SLUG, status }, JOBS_MONITOR_CONFIG);
    await Sentry.flush(FLUSH_MS);
  } catch (err) {
    // A failed check-in is only logged: the missed one alerts on its own.
    logError("jobs:check-in", err, {}, { report: false });
  }
}
