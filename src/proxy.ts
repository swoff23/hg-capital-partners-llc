import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
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
 * The contractor portal at `/p`. Pages can't see their own URL, so every /p
 * request gets the path and query it asked for as a request header (always
 * overwritten, never trusted from the client). requirePortalPrincipal() reads
 * it to send a signed-out contractor to /login?next=<that page>
 * (src/lib/portal/next-path.ts) and is still the real gate.
 *
 * The cookie name mirrors SESSION_COOKIE in src/lib/session.ts, which can't be
 * imported here: it's server-only and pulls in node:crypto.
 */
const SESSION_COOKIE = "hgos_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/p" || pathname.startsWith("/p/")) {
    const headers = new Headers(request.headers);
    headers.set(PORTAL_PATH_HEADER, pathname + search);
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.rewrite(new URL("/welcome", request.url));
}

export const config = {
  matcher: ["/", "/p", "/p/:path*"],
};
