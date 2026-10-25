/**
 * Whether a save just failed in this tab, so the signed-in error page can say
 * "That didn't save" only when one did ((app)/error.tsx).
 *
 * Next sends every server action as a POST carrying a `next-action` header. A
 * thrown action comes back 500, an action the deploy retired 404, and one that
 * never reached the server rejects. A save that worked but whose refreshed
 * page then failed to render comes back 200: it saved, so it isn't counted.
 * Nothing in Next tells app code that an action failed (callAction catches
 * the ones it wraps, the rest throw straight into the error boundary), so this
 * watches fetch. It only observes: the request and response pass through.
 */

/** How long after a failed save the error page still blames it. */
export const FAILED_WRITE_WINDOW_MS = 10_000;

const ACTION_HEADER = "next-action";

/** Whether a fetch is a server action call. */
export function isServerActionRequest(init: RequestInit | undefined): boolean {
  if (!init?.headers || (init.method ?? "GET").toUpperCase() !== "POST") return false;
  const h = init.headers;
  if (typeof Headers !== "undefined" && h instanceof Headers) return h.has(ACTION_HEADER);
  const keys = Array.isArray(h) ? h.map(([k]) => k) : Object.keys(h);
  return keys.some((k) => k.toLowerCase() === ACTION_HEADER);
}

/** Whether a server action's response means it didn't save. Below 400 it did (a 303 is the action's redirect()). */
export function isFailedWriteStatus(status: number): boolean {
  return status >= 400;
}

type FetchHost = { fetch: typeof fetch };

/** A watcher over one host's fetch. The app uses the one below, on window. */
export function createWriteWatcher(clock: () => number = Date.now) {
  let lastFailedAt: number | null = null;
  let watching = false;
  const failed = () => {
    lastFailedAt = clock();
  };
  return {
    /** Starts watching the host's server action calls. Safe to call more than once. */
    watch(host: FetchHost) {
      if (watching) return;
      watching = true;
      const original = host.fetch;
      host.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const response = original.call(host, input, init);
        if (isServerActionRequest(init)) {
          response.then((r) => {
            if (isFailedWriteStatus(r.status)) failed();
          }, failed);
        }
        return response;
      };
    },
    /** Whether a server action failed in the last FAILED_WRITE_WINDOW_MS. */
    failedRecently(): boolean {
      return lastFailedAt !== null && clock() - lastFailedAt < FAILED_WRITE_WINDOW_MS;
    },
  };
}

const watcher = createWriteWatcher();

/** Starts watching this tab's server action calls; a no-op on the server. */
export function watchServerActions() {
  if (typeof window !== "undefined") watcher.watch(window);
}

/** Whether a server action failed in this tab in the last few seconds. */
export function writeFailedRecently(): boolean {
  return watcher.failedRecently();
}
