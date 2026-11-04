/**
 * A module fetched on first use (docs/specs/performance.md, fix 5): the edit
 * sheets, the calendar, the photo viewer and the upload code stay out of the
 * page and arrive with the first tap that needs them.
 *
 *   const sheet = lazyModule(() => import("./unit-sheet"));
 *   sheet.warm();            // on hover, focus or press: the tap that follows finds it ready
 *   const { UnitSheet } = useLazyModule(sheet, wanted) ?? {};   // components/use-lazy-module.ts
 *
 * Not `next/dynamic` or `React.lazy`: a component that suspends commits a
 * fallback and React holds the real content back for about 300 ms, so a sheet
 * whose chunk arrived in 20 ms still opened 400 ms after the tap. Here the
 * caller renders the module once it has arrived, so nothing waits on that.
 *
 * `load` fetches once and everyone shares it. A fetch that fails is
 * forgotten here, so the next ask calls the importer again, and in the browser
 * that fetches the chunk again: Turbopack's runtime (Next 16.3.3,
 * .next/static/chunks/turbopack-*.js) retries a chunk that failed once, 200 to
 * 600 ms later, then forgets the failure too. So a dropped signal heals on the
 * next tap or retry. What no fetch fixes is a deploy that removed the chunk
 * (a 404): only a reload brings the new page. A failure says so
 * (`openFailedToast`, and the error screen's Reload, `isChunkLoadError`).
 *
 * A sheet that is slow to arrive gives no sign until it opens, so its page
 * warms it ahead of the tap: `warmWhenIdle` once the page has settled, and
 * `warm` on a trigger's hover, focus and press. And a sheet whose code never
 * arrives is closed with a toast (`openFailedToast`, via `fetchModule`'s
 * `failed`) rather than thrown to the error screen, which would replace the
 * whole record page.
 */
export type LazyModule<M> = {
  /** The module, fetching it the first time. */
  load: () => Promise<M>;
  /** Starts fetching, for an intent that may not turn into a tap. Never throws. */
  warm: () => void;
  /** The module once it has arrived, else null. */
  loaded: () => M | null;
};

export function lazyModule<M>(importer: () => Promise<M>): LazyModule<M> {
  let pending: Promise<M> | null = null;
  let value: M | null = null;
  const load = (): Promise<M> =>
    (pending ??= Promise.resolve()
      .then(importer)
      .then(
        (m) => {
          value = m;
          return m;
        },
        (err: unknown) => {
          pending = null;
          throw err;
        },
      ));
  return { load, warm: () => void load().catch(() => {}), loaded: () => value };
}

/**
 * The toast when a sheet's or the viewer's code didn't arrive and it was
 * closed. Short enough to show whole on a phone (TOAST_PHONE_CHARS in
 * lib/toast-line.ts). The next step is the toast's Reload (RELOAD_LABEL),
 * which works whatever the cause. Another tap would fetch the chunk again
 * ("Couldn't open it. Try again."): enough after a dropped signal, and no use
 * after a deploy removed the chunk.
 */
export const OPEN_FAILED_LINE = "Couldn't open it.";

/** The action that brings a failed chunk back: the page, loaded again. */
export const RELOAD_LABEL = "Reload";

/** Loads the page again, which fetches every chunk afresh. */
export function reloadPage(): void {
  window.location.reload();
}

/**
 * The toast for code that didn't arrive: OPEN_FAILED_LINE with Reload. One
 * key, so a second failure replaces the first instead of stacking another.
 */
export function openFailedToast(): { message: string; key: string; action: { label: string; onAction: () => void } } {
  return { message: OPEN_FAILED_LINE, key: "lazy-open-failed", action: { label: RELOAD_LABEL, onAction: reloadPage } };
}

/**
 * Whether an error is a chunk of the page's own code that didn't load
 * (Turbopack names it ChunkLoadError; webpack's message says "Loading chunk
 * 123 failed"). After a deploy moved the chunk, Try again re-renders with the
 * same URLs and fails the same way, so the error screens offer Reload for it
 * instead.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && /\b(?:Failed to load chunk|Loading (?:CSS )?chunk \S+ failed)/.test(message);
}

/**
 * Fetches `source` for a caller that answers a failed fetch itself. Calls
 * `arrived` with the module, or `failed` with the error, unless the returned
 * cancel ran first (the caller went away). A failed fetch is forgotten by the
 * module, so asking again retries.
 */
export function fetchModule<M>(
  source: Pick<LazyModule<M>, "load">,
  handlers: { arrived: (module: M) => void; failed: (error: unknown) => void },
): () => void {
  let live = true;
  source.load().then(
    (m) => {
      if (live) handlers.arrived(m);
    },
    (error: unknown) => {
      if (live) handlers.failed(error);
    },
  );
  return () => {
    live = false;
  };
}

/** What `warmWhenIdle` needs of the window, so a test can stand in for it. */
export type IdleEnv = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => unknown;
  setTimeout: (callback: () => void, ms: number) => unknown;
  navigator?: { onLine?: boolean };
};

/**
 * Starts fetching when the browser has a moment (at most 4 seconds on), for a
 * page whose visitor will probably open the module soon: a property page's
 * edit sheets, the photo viewer. Safe to call often, and on the server, where
 * it does nothing. Not while the device says it's offline: the fetch would
 * only fail, and the tap that follows fetches the code when there is a signal.
 */
export function warmWhenIdle(source: Pick<LazyModule<unknown>, "warm">, env: IdleEnv | undefined = typeof window === "undefined" ? undefined : window): void {
  if (!env) return;
  const start = () => {
    if (env.navigator?.onLine !== false) source.warm();
  };
  if (env.requestIdleCallback) env.requestIdleCallback(start, { timeout: 4000 });
  else env.setTimeout(start, 1500);
}
