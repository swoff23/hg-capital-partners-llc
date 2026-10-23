/**
 * Where a contractor goes back to after signing in (docs/asana-migration-plan.md
 * §5.1). An email's "Open job" link sends a signed-out contractor to /login;
 * the page they asked for rides along as ?next= through sign-in and the
 * first-password step, and they land on it at the end.
 *
 * Only portal paths pass. Anything else (another site, the staff app, a path
 * that only turns into one of those after decoding) falls back to My jobs.
 * The checks every ?next= goes through, and the staff app's own return path,
 * are in src/lib/next-path.ts.
 *
 * Pure, and imports only that pure file: src/proxy.ts uses the header name.
 * See next-path.test.ts.
 */
import { MAX_NEXT_LENGTH, pathOf, safeReturnPath, withNext } from "@/lib/next-path";

export { MAX_NEXT_LENGTH, withNext };

/** My jobs: the default landing, so it's never spelled out as ?next=. */
export const PORTAL_HOME = "/p";

/** Where a contractor still holding a starting password is sent. */
export const WELCOME_PASSWORD_PATH = "/p/welcome/password";

/**
 * Request header src/proxy.ts sets on every /p request: the path and query the
 * browser asked for. A client can send its own on other routes, so whatever
 * reads it still runs it through portalReturnPath.
 */
export const PORTAL_PATH_HEADER = "x-hg-portal-path";

function isPortalPath(path: string): boolean {
  return path === PORTAL_HOME || path.startsWith(PORTAL_HOME + "/");
}

/**
 * `raw` when it's a portal path that's safe to redirect to, else null: "/p" or
 * "/p/...", with an optional query, and no "//", backslash, control character
 * or dot segment. Checked as given and again after one round of
 * percent-decoding, so "%2F%2Fevil.com" or "%2e%2e" can't slip past; anything
 * that won't decode is refused.
 */
export function safePortalPath(raw: unknown): string | null {
  return safeReturnPath(raw, isPortalPath);
}

/**
 * The page to come back to after sign-in, or null for My jobs. The
 * first-password page carries its own ?next=, so coming back to it means
 * coming back to that page instead.
 */
export function portalReturnPath(raw: unknown): string | null {
  let safe = safePortalPath(raw);
  if (safe && pathOf(safe) === WELCOME_PASSWORD_PATH) {
    const query = safe.includes("?") ? safe.slice(safe.indexOf("?") + 1).split("#", 1)[0] : "";
    safe = safePortalPath(new URLSearchParams(query).get("next"));
    if (safe && pathOf(safe) === WELCOME_PASSWORD_PATH) return null;
  }
  return safe === PORTAL_HOME ? null : safe;
}

/**
 * Where a contractor goes once signed in: the first-password page while the
 * starting password is in use (still carrying `next`), else `next` or My jobs.
 */
export function afterPortalSignIn(mustChangePassword: boolean, next: string | null): string {
  return mustChangePassword ? withNext(WELCOME_PASSWORD_PATH, next) : (next ?? PORTAL_HOME);
}
