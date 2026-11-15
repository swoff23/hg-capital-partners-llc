"use client";
import { useState } from "react";
import { UNSAFE_PortalProvider } from "react-aria/PortalProvider";

/**
 * The public site's ground: the `data-surface="public"` wrapper that takes the
 * dark tokens whatever the theme toggle says (docs/brand-guidelines.md,
 * section 4), for the marketing layout, the sign-in frame and the root
 * not-found page. React Aria overlays opened inside it (stock Popover, Modal
 * and Tooltip, and HG's own until they go stock) portal into this element
 * instead of <body>, so they keep the public tokens with no prop of their own
 * (docs/specs/design-foundation.md, section 5.5).
 *
 * A client component, since the portal target is a function a server
 * component can't pass. The element is kept in state rather than a ref, so an
 * overlay that mounts open finds it on the render after the first.
 */
export function PublicSurface({ children }: { children: React.ReactNode }) {
  const [ground, setGround] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setGround} data-surface="public" className="flex min-h-screen flex-col bg-canvas text-foreground">
      <UNSAFE_PortalProvider getContainer={() => ground}>{children}</UNSAFE_PortalProvider>
    </div>
  );
}
