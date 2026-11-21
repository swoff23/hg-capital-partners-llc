import { authorizationServerRoute, otherMethodRoute } from "@/lib/claude/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 8414 authorization server metadata (docs/specs/tasks-from-claude.md,
 * section 8): where Claude signs in and swaps tokens, S256 only, and no
 * registration endpoint. Public by design and holds no data. 404 for every
 * method while CLAUDE_CONNECTOR_ENABLED is off.
 */
export function GET(): Response {
  return authorizationServerRoute();
}

export const HEAD = GET;

/** No other method is served: 404 while the connector is off, 405 otherwise. */
const notServed = (): Response => otherMethodRoute(["GET", "HEAD"]);
export const POST = notServed;
export const PUT = notServed;
export const PATCH = notServed;
export const DELETE = notServed;
export const OPTIONS = notServed;
