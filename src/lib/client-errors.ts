import type { Area } from "./error-report";
import { isChunkLoadError } from "./lazy-module";
import { isOfflineError } from "./offline-error";

/**
 * The browser's error catcher (docs/specs/error-alerts.md, Q6 and Q18). Tiny
 * on purpose: it ships with every page, before hydration, while Sentry's
 * browser package loads only once the page is idle (src/instrumentation-client.ts,
 * src/lib/sentry-browser.ts). Until then errors wait here, and the click trail
 * starts when Sentry does.
 *
 * Off unless src/instrumentation-client.ts turned it on, which only a
 * production build with a DSN does. The state sits on globalThis so the
 * error screens and the instrumentation file share one copy whichever bundle
 * loaded them.
 */

/** `upload`: a file Blob itself refused (attachments/engine.ts deps.report), which no screen or handler sees. */
export type ClientErrorSource = "boundary" | "window" | "rejection" | "upload";

export interface ClientError {
  error: unknown;
  source: ClientErrorSource;
  /** The boundary's own area when it knows better than the address (the public site's `/`). */
  area?: Area;
}

type Send = (item: ClientError) => void;

interface CatcherState {
  on: boolean;
  queue: ClientError[];
  send: Send | null;
  seen: Set<string>;
}

const KEY = Symbol.for("hg.clientErrors");
/** Errors held before Sentry loads; a page that throws more than this before it's idle has one problem, not twenty. */
const MAX_QUEUED = 20;

function state(): CatcherState {
  const g = globalThis as { [KEY]?: CatcherState };
  return (g[KEY] ??= { on: false, queue: [], send: null, seen: new Set() });
}

/**
 * Whether the browser should report this at all (Q7, Q18). Not a server
 * error that reached the screen with only its digest: the server already
 * reported the full one. Not a dropped connection, and not a chunk of an old
 * deploy that didn't load: the screens handle both, and neither is a bug.
 */
export function shouldReportClientError(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (typeof error === "object" && typeof (error as { digest?: unknown }).digest === "string") return false;
  if (isOfflineError(error) || isChunkLoadError(error)) return false;
  return true;
}

/** The same error twice on one page load is one report (risk 2). */
function fingerprint(error: unknown): string {
  if (error instanceof Error) return `${error.name}:${error.message}:${error.stack?.split("\n")[1] ?? ""}`;
  return `value:${String(error)}`;
}

export function reportClientError(error: unknown, source: ClientErrorSource, area?: Area): void {
  const s = state();
  if (!s.on || !shouldReportClientError(error)) return;
  const key = fingerprint(error);
  if (s.seen.has(key)) return;
  s.seen.add(key);
  const item: ClientError = { error, source, ...(area ? { area } : {}) };
  if (s.send) s.send(item);
  else if (s.queue.length < MAX_QUEUED) s.queue.push(item);
}

/** Called by src/instrumentation-client.ts, in production with a DSN only. */
export function turnOnClientErrors(): void {
  state().on = true;
}

/** Hands what's waiting to Sentry once it has loaded, and sends the rest straight to it. */
export function attachClientErrorSender(send: Send): void {
  const s = state();
  s.send = send;
  for (const item of s.queue.splice(0)) send(item);
}
