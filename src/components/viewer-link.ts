"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { MediaItem, MediaUrlFor } from "@/components/lightbox";
import { taskFileUrl } from "@/lib/attachments/media";

/**
 * The viewer's open state and its address, apart from the viewer itself
 * (lightbox.tsx), so a grid or a list can hold them without carrying the
 * viewer: `LazyLightbox` (lightbox-lazy.tsx) loads that with the first open.
 */

/** Where a task file's bytes are, for grids that show task files (the default `urlFor`). */
export const taskMediaUrl: MediaUrlFor = (item: MediaItem, variant) => taskFileUrl(item.id, variant);

/**
 * Opening items in the viewer from a link and back (uploads 2.6, G1D-003):
 * opening one pushes `?file=<id>`, so the browser's Back closes the viewer and
 * a pasted link opens straight to that file; stepping replaces it, so Back
 * doesn't walk through every photo. With `enabled` false the viewer is plain
 * local state (a strip in a comment, a row with a mouse that opened nothing).
 * Only the record's own list turns it on (MediaGrid `link`, once per page).
 * Two lists that hold the same photo and both read `?file=` would open two
 * viewers on top of each other, each making the other inert, so the Activity
 * and update grids stay local.
 *
 *   const viewer = useViewerLink(items, true);
 *   <Lightbox items={items} index={viewer.index} onIndexChange={viewer.setIndex} isOpen={viewer.isOpen} onOpenChange={viewer.onOpenChange} />
 *   <Tile onOpen={() => viewer.openAt(i)} />
 */
export function useViewerLink(items: readonly { id: string }[], enabled: boolean) {
  const params = useSearchParams();
  const wanted = enabled ? params.get("file") : null;
  const fromUrl = wanted === null ? -1 : items.findIndex((it) => it.id === wanted);
  const [local, setLocal] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  // The index it was last at, kept after closing so the fade-out still shows the item that was open.
  const [last, setLast] = useState(0);
  const pushed = useRef(false);

  const isOpen = enabled ? fromUrl >= 0 : local.open;
  const index = enabled ? (fromUrl >= 0 ? fromUrl : last) : local.index;

  const urlWith = useCallback((id: string | null) => {
    const u = new URL(window.location.href);
    if (id === null) u.searchParams.delete("file");
    else u.searchParams.set("file", id);
    return `${u.pathname}${u.search}${u.hash}`;
  }, []);

  const openAt = useCallback(
    (i: number) => {
      const target = items[i];
      if (!target) return;
      setLast(i);
      if (!enabled) return setLocal({ open: true, index: i });
      window.history.pushState(null, "", urlWith(target.id));
      pushed.current = true;
    },
    [enabled, items, urlWith],
  );

  const setIndex = useCallback(
    (i: number) => {
      const target = items[i];
      if (!target) return;
      setLast(i);
      if (!enabled) return setLocal((l) => ({ ...l, index: i }));
      window.history.replaceState(null, "", urlWith(target.id));
    },
    [enabled, items, urlWith],
  );

  const close = useCallback(() => {
    if (!enabled) return setLocal((l) => ({ ...l, open: false }));
    // Opened by this page: Back is the way out. Opened by a pasted link: there is nothing behind it to go back to.
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else window.history.replaceState(null, "", urlWith(null));
  }, [enabled, urlWith]);

  const onOpenChange = useCallback((open: boolean) => (open ? undefined : close()), [close]);

  return useMemo(() => ({ isOpen, index, openAt, setIndex, close, onOpenChange }), [isOpen, index, openAt, setIndex, close, onOpenChange]);
}
