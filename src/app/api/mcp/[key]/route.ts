import { otherMethodRoute, unauthorizedResponse, verifyAccessToken } from "@/lib/claude/oauth";
import { CALLS_PER_MINUTE, HOUR_MS, MINUTE_MS, SAVES_PER_HOUR, handleMcp, type McpDeps } from "@/lib/claude/tools";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/log";
import { RateLimiter } from "@/lib/rate-limit";
import { saveDrafts, staffPrincipal } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";
// A full save is 25 drafts in one transaction; the reads are a handful of queries.
export const maxDuration = 60;

/**
 * Claude's connector (docs/specs/tasks-from-claude.md, section 5): one MCP
 * endpoint with two tools, get_directory and save_drafts, at each partner's
 * own address, /api/mcp/<key>. Called from Anthropic's servers with the
 * partner's own access token.
 *
 * Public on purpose, and no session cookie is read: the bearer token is the
 * check (verifyAccessToken, src/lib/claude/oauth.ts), and it has to have been
 * issued for the address the call came to. Without a good one the answer is
 * the 401 that starts Claude's sign-in, the same for every well-formed key,
 * so it never says whether a key is anyone's. A malformed key is a 404, and so
 * is everything while CLAUDE_CONNECTOR_ENABLED is off. Plain /api/mcp has no
 * route. Every write goes through the task service as the partner the token
 * stands for (staffPrincipal). The protocol, the tools and their checks are in
 * src/lib/claude/tools.ts.
 *
 * Limits are per connection and per server instance (src/lib/rate-limit.ts),
 * so they are soft caps: 30 calls a minute, 10 saves an hour.
 *
 * Nothing is counted per caller address before the bearer check, on purpose.
 * Every Claude call comes from Anthropic's shared range, so one stranger's
 * Claude would spend the partners' budget, and a 429 where the 401 belongs
 * would stop a partner's Claude from refreshing its token. For the same reason
 * the caller's address is not checked against Anthropic's range: it can
 * change, and a stale list would cut Claude off. A turned-away token costs one
 * indexed read, and at most one log line a minute for its reason
 * (src/lib/claude/endpoints-core.ts oncePerMinute): it is what every hour of a
 * healthy connection ends with, and what tells Claude to refresh.
 */
const limits = { calls: new RateLimiter(CALLS_PER_MINUTE, MINUTE_MS), saves: new RateLimiter(SAVES_PER_HOUR, HOUR_MS) };

type Context = { params: Promise<{ key: string }> };

/** What handleMcp needs, for a call to one partner's address: the key in it decides which tokens count there. */
function depsFor(key: string): McpDeps {
  return {
    verify: (request, now) => verifyAccessToken(request, key, now),
    unauthorized: (request) => unauthorizedResponse(request, key),
    db: prisma,
    save: (user, batchKey, drafts, check) => saveDrafts(batchKey, drafts, staffPrincipal(user), check),
    appUrl: () => getEnv().appUrl,
    limits,
    now: () => new Date(),
    logError: (scope, err) => logError(scope, err),
  };
}

async function serve(request: Request, { params }: Context): Promise<Response> {
  return handleMcp(request, depsFor((await params).key));
}

/** Every JSON-RPC message arrives as its own POST. */
export const POST = serve;
/** There is no stream to open: 405 for a signed-in caller, the 401 for anyone else. */
export const GET = serve;
export const HEAD = serve;
/** There is no session to end: the same. */
export const DELETE = serve;

/** No other method is served: 404 while the connector is off or for a malformed key, 405 otherwise. */
async function notServed(_request: Request, { params }: Context): Promise<Response> {
  return otherMethodRoute(["POST"], (await params).key);
}
export const PUT = notServed;
export const PATCH = notServed;
export const OPTIONS = notServed;
