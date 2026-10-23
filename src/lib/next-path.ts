/**
 * Back to the page asked for, after sign-in. A signed-out visit to a page
 * that needs a session goes to /login?next=<that page>, and the sign-in sends
 * them on to it. src/proxy.ts hands each guarded page its own path in a
 * request header, since pages can't see their own URL.
 *
 * This file holds the checks every ?next= goes through (safeReturnPath) and
 * the staff app's own rules: a staff page is Home or a path under one of the
 * app's sections, nothing else. The contractor portal's rules (/p paths only,
 * and the first-password step) are in src/lib/portal/next-path.ts, which
 * uses the same checks. The two never overlap, so one `next` field on /login
 * can't steer a contractor into the staff app or the other way round.
 *
 * Pure, no imports: src/proxy.ts uses the header name. See next-path.test.ts.
 */

export const MAX_NEXT_LENGTH = 512;

// C0 and C1 control characters, which covers CR/LF and the tab and newline
// that browsers silently strip out of URLs.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** "/tasks/abc" for "/tasks/abc?x=1#y". */
export function pathOf(s: string): string {
  return s.split(/[?#]/, 1)[0];
}

function hasSafeShape(s: string, inScope: (path: string) => boolean): boolean {
  if (CONTROL_CHARS.test(s) || s.includes("\\") || s.includes("//")) return false;
  const path = pathOf(s);
  if (!path.startsWith("/") || !inScope(path)) return false;
  // "/p/../tasks" would leave the scope once the browser resolves it.
  return !path.split("/").some((segment) => segment === "." || segment === "..");
}

/**
 * `raw` when it's a same-site path that's safe to redirect to and that
 * `inScope` accepts, else null. Starts with "/", an optional query, and no
 * "//", backslash, control character or dot segment. Checked as given and
 * again after one round of percent-decoding, so "%2F%2Fevil.com" or "%2e%2e"
 * can't slip past; anything that won't decode is refused.
 */
export function safeReturnPath(raw: unknown, inScope: (path: string) => boolean): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  // Only printable ASCII as given. The proxy always hands over a
  // percent-encoded path, and Node refuses anything else in a Location header.
  if (/[^\x21-\x7e]/.test(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return hasSafeShape(raw, inScope) && hasSafeShape(decoded, inScope) ? raw : null;
}

/** `path` with ?next= (or &next=) added when there's a page to return to. */
export function withNext(path: string, next: string | null): string {
  if (!next) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------
// The staff app
// ---------------------------------------------------------------------------

/** The dashboard: the default landing, so it's never spelled out as ?next=. */
export const STAFF_HOME = "/";

/**
 * The staff app's top-level sections, one per folder in src/app/(app).
 * src/proxy.ts lists the same ones in its matcher. next-path.test.ts checks
 * the folders, src/proxy.test.ts the matcher. A section missing here only
 * means its links land on Home.
 */
export const STAFF_SECTIONS = ["contractors", "deals", "financials", "properties", "settings", "tasks", "templates"] as const;

/**
 * Request header src/proxy.ts sets on every staff section request: the path
 * and query the browser asked for. A client can send its own on other routes,
 * so whatever reads it still runs it through staffReturnPath.
 */
export const STAFF_PATH_HEADER = "x-hg-app-path";

/** A gated file (src/app/api/files): a signed-out file link comes back to the file after sign-in. */
const FILE_PATH = /^\/api\/files\/(task|property)\/[A-Za-z0-9_-]{1,64}$/;

function isStaffPath(path: string): boolean {
  return path === STAFF_HOME || FILE_PATH.test(path) || STAFF_SECTIONS.some((section) => path === `/${section}` || path.startsWith(`/${section}/`));
}

/** `raw` when it's a staff page that's safe to redirect to (safeReturnPath), else null. */
export function safeStaffPath(raw: unknown): string | null {
  return safeReturnPath(raw, isStaffPath);
}

/** The staff page to come back to after sign-in, or null for the dashboard. */
export function staffReturnPath(raw: unknown): string | null {
  const safe = safeStaffPath(raw);
  return safe === STAFF_HOME ? null : safe;
}

/** Where staff go once signed in: the page they asked for (already checked with staffReturnPath), else the dashboard. */
export function afterStaffSignIn(next: string | null): string {
  return next ?? STAFF_HOME;
}
