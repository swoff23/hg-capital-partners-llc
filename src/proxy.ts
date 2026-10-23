import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STAFF_PATH_HEADER } from "@/lib/next-path";
import { PORTAL_PATH_HEADER } from "@/lib/portal/next-path";

/**
 * Two jobs, neither of them an auth check.
 *
 * Public landing page at `/`. Signed-out visitors to `/` get the marketing page
 * rewritten in (the URL stays `/`); anyone carrying a session cookie falls
 * through to the dashboard. This is a presentation choice, not an auth check —
 * `requireUser()` in the (app) layout is still the real gate, so a forged
 * cookie just lands on /login.
 *
 * Back to the page asked for. Pages can't see their own URL, so every /p
 * request and every staff section request gets the path and query it asked
 * for as a request header (always overwritten, never trusted from the
 * client). requirePortalPrincipal() and requireUser() read it to send a
 * signed-out visitor to /login?next=<that page> (src/lib/portal/next-path.ts,
 * src/lib/next-path.ts), and are still the real gates.
 *
 * The cookie name mirrors SESSION_COOKIE in src/lib/session.ts, which can't be
 * imported here: it's server-only and pulls in node:crypto.
 */
const SESSION_COOKIE = "hgos_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/p" || pathname.startsWith("/p/")) return withPathHeader(request, PORTAL_PATH_HEADER, pathname + search);
  // Everything else the matcher lets through, apart from `/`, is a staff section.
  if (pathname !== "/") return withPathHeader(request, STAFF_PATH_HEADER, pathname + search);

  // The dashboard: set the header to "/" so one the client sent never reaches requireUser().
  if (request.cookies.has(SESSION_COOKIE)) return withPathHeader(request, STAFF_PATH_HEADER, "/");
  return NextResponse.rewrite(new URL("/welcome", request.url));
}

function withPathHeader(request: NextRequest, name: string, value: string): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(name, value);
  return NextResponse.next({ request: { headers } });
}

// The staff sections are STAFF_SECTIONS in src/lib/next-path.ts, spelled out
// because the matcher must be literal (src/proxy.test.ts checks they agree).
export const config = {
  matcher: [
    "/",
    "/p",
    "/p/:path*",
    "/contractors/:path*",
    "/deals/:path*",
    "/financials/:path*",
    "/properties/:path*",
    "/settings/:path*",
    "/tasks/:path*",
    "/templates/:path*",
  ],
};
