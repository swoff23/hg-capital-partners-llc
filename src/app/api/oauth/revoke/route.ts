import { otherMethodRoute, revokeRoute } from "@/lib/claude/oauth";

export const dynamic = "force-dynamic";

/**
 * RFC 7009 revocation (docs/specs/tasks-from-claude.md, section 8). A live
 * refresh token ends its connection, and so does one swapped in the last
 * minute whose new pair nobody has used; an access token ends only itself.
 * Public on purpose: the token is the credential, and the answer is the same
 * whether or not it meant anything. Limited per IP. 404 for every method while
 * CLAUDE_CONNECTOR_ENABLED is off.
 */
export function POST(request: Request): Promise<Response> {
  return revokeRoute(request);
}

/** No other method is served: 404 while the connector is off, 405 otherwise. */
const notServed = (): Response => otherMethodRoute(["POST"]);
export const GET = notServed;
export const HEAD = notServed;
export const PUT = notServed;
export const PATCH = notServed;
export const DELETE = notServed;
export const OPTIONS = notServed;
