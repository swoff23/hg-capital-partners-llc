"use client";
import { useEffect, useState } from "react";
import type { LazyModule } from "@/lib/lazy-module";

/**
 * The module of a `lazyModule`, once it has arrived: null until then, and from
 * the first render when it is already here. Fetching starts when `wanted`
 * turns true (the first tap that needs it). The caller renders the module's
 * component when this returns it, so there is no Suspense fallback in between
 * (see lib/lazy-module.ts for why that matters).
 *
 * A fetch that fails throws here, which is what `next/dynamic` does too: the
 * nearest error boundary shows it, with Try again.
 */
export function useLazyModule<M>(source: LazyModule<M>, wanted = true): M | null {
  const [mod, setMod] = useState<M | null>(() => source.loaded());
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  if (failure) throw failure.error;
  useEffect(() => {
    if (!wanted || mod) return;
    let live = true;
    source.load().then(
      (m) => {
        if (live) setMod(m);
      },
      (error: unknown) => {
        if (live) setFailure({ error });
      },
    );
    return () => {
      live = false;
    };
  }, [source, wanted, mod]);
  return mod;
}
