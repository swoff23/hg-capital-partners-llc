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
 * `load` fetches once and everyone shares it. A fetch that fails (no signal,
 * a deploy that moved the chunk) is forgotten, so the next ask tries again.
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
