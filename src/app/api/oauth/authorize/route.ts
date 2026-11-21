import { getCurrentUser } from "@/lib/auth";
import { authorizeRoute, otherMethodRoute } from "@/lib/claude/oauth";

export const dynamic = "force-dynamic";

/**
 * Where Claude sends a partner's browser to sign in
 * (docs/specs/tasks-from-claude.md, section 8). Checks that the request is
 * Claude's and names a partner's own connector address
 * (src/lib/claude/oauth-core.ts parseAuthorizeRequest), parks it for that
 * address's owner in a signed 10-minute cookie, and sends them to the approval
 * screen, through /login first when signed out. Anyone else gets a plain page.
 *
 * Public on purpose, and it grants nothing itself: only Allow on the approval
 * screen does, behind requireUser. Who is signed in (getCurrentUser) is asked
 * only once the connector is on. Limited per IP. 404 for every method while
 * CLAUDE_CONNECTOR_ENABLED is off.
 */
export function GET(request: Request): Promise<Response> {
  return authorizeRoute(request, getCurrentUser);
}

export const HEAD = GET;

/** No other method is served: 404 while the connector is off, 405 otherwise. */
const notServed = (): Response => otherMethodRoute(["GET", "HEAD"]);
export const POST = notServed;
export const PUT = notServed;
export const PATCH = notServed;
export const DELETE = notServed;
export const OPTIONS = notServed;
