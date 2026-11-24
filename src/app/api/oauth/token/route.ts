import { otherMethodRoute, tokenRoute } from "@/lib/claude/oauth";

export const dynamic = "force-dynamic";

/**
 * Claude's token endpoint (docs/specs/tasks-from-claude.md, section 8), called
 * from Anthropic's servers with a form-encoded body. Swaps the one-time code,
 * with its PKCE verifier, for an access token (1 hour) and a refresh token (60
 * days), and swaps a refresh token for a new pair. Public on purpose: the code
 * or the refresh token is the credential (src/lib/claude/connections-core.ts).
 * Limited per IP. 404 for every method while CLAUDE_CONNECTOR_ENABLED is off.
 */
export function POST(request: Request): Promise<Response> {
  return tokenRoute(request);
}

/** No other method is served: 404 while the connector is off, 405 otherwise. */
const notServed = (): Response => otherMethodRoute(["POST"]);
export const GET = notServed;
export const HEAD = notServed;
export const PUT = notServed;
export const PATCH = notServed;
export const DELETE = notServed;
export const OPTIONS = notServed;
