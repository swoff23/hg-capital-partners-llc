import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Public landing page at `/`.
 *
 * Signed-out visitors to `/` get the marketing page rewritten in (the URL stays
 * `/`); anyone carrying a session cookie falls through to the dashboard. This is
 * a presentation choice, not an auth check — `requireUser()` in the (app) layout
 * is still the real gate, so a forged cookie just lands on /login.
 *
 * The cookie name mirrors SESSION_COOKIE in src/lib/session.ts, which can't be
 * imported here: it's server-only and pulls in node:crypto.
 */
const SESSION_COOKIE = "hgos_session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.rewrite(new URL("/welcome", request.url));
}

export const config = {
  matcher: "/",
};
