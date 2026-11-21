import { otherMethodRoute, protectedResourceRoute } from "@/lib/claude/oauth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ key: string }> };

/**
 * RFC 9728 protected resource metadata for one partner's connector address
 * (docs/specs/tasks-from-claude.md, section 8), at the path-suffixed place the
 * RFC gives a resource with a path: this is where /api/mcp/<key>'s 401 points
 * Claude, and where Claude looks first without that pointer. It names that
 * address as the resource and this app as its authorization server.
 *
 * Public by design. It holds no data and never looks the key up, so it answers
 * the same for every well-formed key and says nothing about whose it is. A
 * malformed key is a 404. There is no document without a key: the two shorter
 * addresses have no route. 404 for every method while
 * CLAUDE_CONNECTOR_ENABLED is off.
 */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  return protectedResourceRoute((await params).key);
}

export const HEAD = GET;

/** No other method is served: 404 while the connector is off or for a malformed key, 405 otherwise. */
async function notServed(_request: Request, { params }: Context): Promise<Response> {
  return otherMethodRoute(["GET", "HEAD"], (await params).key);
}
export const POST = notServed;
export const PUT = notServed;
export const PATCH = notServed;
export const DELETE = notServed;
export const OPTIONS = notServed;
