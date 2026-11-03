"use client";
import { useState, type ComponentProps } from "react";
import type { Lightbox } from "@/components/lightbox";
import { useLazyModule } from "@/components/use-lazy-module";
import { lazyModule } from "@/lib/lazy-module";

const viewer = lazyModule(() => import("@/components/lightbox"));

/**
 * The photo and document viewer (components/lightbox.tsx), fetched with the
 * first open and kept mounted after, so the fade-out still plays. A grid or
 * list draws this where it would draw the `Lightbox`; the open state is
 * `useViewerLink` (viewer-link.ts). A page opened on a `?file=` link loads it
 * straight away, as `isOpen` is true from the start.
 */
export function LazyLightbox(props: ComponentProps<typeof Lightbox>) {
  const [wanted, setWanted] = useState(props.isOpen);
  if (props.isOpen && !wanted) setWanted(true);
  const code = useLazyModule(viewer, wanted);
  return code ? <code.Lightbox {...props} /> : null;
}
