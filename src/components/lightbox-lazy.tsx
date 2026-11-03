"use client";
import { useEffect, useState, type ComponentProps } from "react";
import type { Lightbox } from "@/components/lightbox";
import { useToast } from "@/components/toast";
import { useLazyModule } from "@/components/use-lazy-module";
import { lazyModule, openFailedToast, warmWhenIdle } from "@/lib/lazy-module";

const viewer = lazyModule(() => import("@/components/lightbox"));

/**
 * The photo and document viewer (components/lightbox.tsx), fetched with the
 * first open and kept mounted after, so the fade-out still plays. A grid or
 * list draws this where it would draw the `Lightbox`; the open state is
 * `useViewerLink` (viewer-link.ts). A page opened on a `?file=` link loads it
 * straight away, as `isOpen` is true from the start, and every page that
 * draws one warms it once the page has settled, so the first tap finds it.
 *
 * Code that can't be fetched closes the viewer with one toast whose Reload
 * brings it back (lib/lazy-module.ts openFailedToast), instead of throwing to
 * the error screen, which would replace the whole page. That open asks no
 * more: the next open, after this one has closed, asks again.
 */
export function LazyLightbox(props: ComponentProps<typeof Lightbox>) {
  const { toast } = useToast();
  const [wanted, setWanted] = useState(props.isOpen);
  // Set when this open's fetch failed, until the viewer is closed, so an open the parent hasn't closed yet doesn't
  // ask again and toast a second time.
  const [failed, setFailed] = useState(false);
  if (!props.isOpen && failed) setFailed(false);
  if (props.isOpen && !wanted && !failed) setWanted(true);
  const { onOpenChange } = props;
  const code = useLazyModule(viewer, wanted, () => {
    setWanted(false);
    setFailed(true);
    onOpenChange(false);
    toast(openFailedToast());
  });
  useEffect(() => warmWhenIdle(viewer), []);
  return code ? <code.Lightbox {...props} /> : null;
}
