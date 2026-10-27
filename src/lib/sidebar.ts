/** Cookie the sidebar writes client-side and the (app) layout reads on the server,
 *  so the rail renders in its last-used state on first paint (no width flash). */
export const SIDEBAR_COOKIE = "hgos-sidebar-pinned";

/**
 * The desktop rail's state. Pinned, it stays open beside the page. Unpinned,
 * it opens over the page while the pointer is on it, and the same while
 * keyboard focus is inside it, so a Tab onto Pin sidebar open or onto a nav
 * icon shows what has focus, with its label, as a hover does. A mouse click
 * leaves no keyboard focus behind, so the rail still closes when the pointer
 * leaves. `floating` is the shadow it casts while open over the page.
 */
export function railState(s: { pinned: boolean; hovered: boolean; keyboardFocus: boolean }): { expanded: boolean; floating: boolean } {
  const peeking = s.hovered || s.keyboardFocus;
  return { expanded: s.pinned || peeking, floating: peeking && !s.pinned };
}
