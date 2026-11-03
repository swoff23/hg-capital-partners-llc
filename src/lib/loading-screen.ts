/**
 * A route's loading screen (`LoadingScreen` in components/skeleton.tsx) marks
 * its root with this attribute, so the app shell can tell the screen from the
 * page it stands in for: after a route change, focus waits until the page has
 * landed before it moves to the page's h1 (components/app-shell.tsx).
 */
export const LOADING_SCREEN_ATTR = "data-loading-screen";

export const LOADING_SCREEN_SELECTOR = `[${LOADING_SCREEN_ATTR}]`;
