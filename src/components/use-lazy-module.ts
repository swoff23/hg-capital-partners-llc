"use client";
import { useEffect, useRef, useState } from "react";
import { fetchModule, type LazyModule } from "@/lib/lazy-module";

/**
 * The module of a `lazyModule`, once it has arrived: null until then, and from
 * the first render when it is already here. Fetching starts when `wanted`
 * turns true (the first tap that needs it). The caller renders the module's
 * component when this returns it, so there is no Suspense fallback in between
 * (see lib/lazy-module.ts for why that matters).
 *
 * A fetch that fails throws here, which is what `next/dynamic` does too: the
 * nearest error boundary shows it, with Try again. That replaces the whole
 * page, so a caller that can say it another way passes `onFail` (close the
 * sheet, toast `OPEN_FAILED_LINE`) and nothing is thrown. Turn `wanted` off
 * in `onFail`, and the next tap that turns it on fetches again.
 */
export function useLazyModule<M>(source: LazyModule<M>, wanted = true, onFail?: (error: unknown) => void): M | null {
  const [mod, setMod] = useState<M | null>(() => source.loaded());
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  // The latest onFail, read when the fetch fails, so a new closure each render doesn't restart the fetch.
  const answer = useRef(onFail);
  useEffect(() => {
    answer.current = onFail;
  });
  if (failure) throw failure.error;
  useEffect(() => {
    if (!wanted || mod) return;
    return fetchModule(source, {
      arrived: (m) => setMod(m),
      failed: (error) => (answer.current ? answer.current(error) : setFailure({ error })),
    });
  }, [source, wanted, mod]);
  return mod;
}

/**
 * Props that warm a module when the pointer reaches an element, it takes
 * focus, or it is pressed: the tap that follows finds the code ready, or has
 * a head start on it. For a plain element; a React Aria button takes
 * `onHoverStart`, `onFocus` and `onPressStart` with `source.warm`.
 */
export function warmOnIntent(source: Pick<LazyModule<unknown>, "warm">) {
  const warm = () => source.warm();
  return { onPointerEnter: warm, onFocus: warm, onPointerDown: warm };
}
