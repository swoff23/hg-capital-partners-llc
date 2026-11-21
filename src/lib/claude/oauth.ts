import "server-only";
import { cookies, headers } from "next/headers";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logError, logWarning } from "@/lib/log";
import { isWellFormedToken, keyedHash } from "@/lib/portal/tokens";
import { RateLimiter, clientIp } from "@/lib/rate-limit";
import * as core from "./connections-core";
import type { ApproveResult, ConnectionRow, DisconnectResult, VerifiedAccess } from "./connections-core";
import * as endpoints from "./endpoints-core";
import { allowedClient, bearerToken, connectorConfigFor, pendingCookieName, secretStrongEnough, type ConnectorConfig, type RefusalLog } from "./oauth-core";

/**
 * Sign-in for Claude, bound to the app (docs/specs/tasks-from-claude.md,
 * sections 7 and 8): the env, the database, the request and the cookie jar.
 * The rules are in oauth-core.ts, the rows in connections-core.ts and the HTTP
 * answers in endpoints-core.ts; this file only supplies what they need, so
 * each function here is a few lines and decides nothing itself.
 *
 * Three callers: the routes under /api/oauth and /.well-known, Settings ›
 * Claude with its approval screen, and /api/mcp/<key> (verifyAccessToken and
 * unauthorizedResponse).
 */

export { CLAUDE_CLIENT_ID, FALLBACK_CLIENT_ID, CLAUDE_CALLBACK, APPROVE_PATH, SCOPE } from "./oauth-core";
export type { PendingAuthorization } from "./oauth-core";
export type { ApproveResult, ConnectionRow, DisconnectResult, VerifiedAccess } from "./connections-core";

// ---------------------------------------------------------------------------
// The flag and the addresses
// ---------------------------------------------------------------------------

let saidSecretIsShort = false;

/**
 * The connector's origin and secret, or null while the connector is off. It
 * also stays off, whatever the flag says, over a SESSION_SECRET shorter than
 * 32 characters (oauth-core.ts MIN_SECRET_LENGTH), and says so in the logs
 * once per server instance.
 *
 * Outside production a blank SESSION_SECRET reads as the repo's dev secret
 * (src/lib/env.ts), which is long enough to pass, so a local server with the
 * flag on runs the connector over a secret anyone can read. Left as it is:
 * that server's own sessions are signed with the same secret, so the connector
 * opens nothing they don't. Set a real secret before a dev server is put
 * behind a tunnel. Production refuses to start without one.
 */
export function connectorConfig(): ConnectorConfig | null {
  const env = getEnv();
  if (!env.claudeConnectorEnabled) return null;
  const secret = env.sessionSecret;
  if (!secretStrongEnough(secret)) {
    if (!saidSecretIsShort) {
      saidSecretIsShort = true;
      logError("claude:config", new Error("CLAUDE_CONNECTOR_ENABLED is on but SESSION_SECRET is under 32 characters, so the Claude connector stays off."));
    }
    return null;
  }
  return connectorConfigFor(env.appUrl, secret);
}

/** Is the connector on? Off: the approval screen, every endpoint here and /api/mcp/<key> answer 404, and Connect is not offered. */
export function claudeConnectorEnabled(): boolean {
  return connectorConfig() !== null;
}

/**
 * The app's own origin, for judging a stored address in Settings. Unlike
 * connectorConfig it doesn't depend on the flag, because Settings lists the
 * rows while the connector is switched off. Read only when a stored address is
 * there to judge, so a deployment that never had a connection never asks for
 * APP_URL here.
 */
const appOrigin = {
  get issuer(): string {
    return new URL(getEnv().appUrl).origin;
  },
};

// ---------------------------------------------------------------------------
// Request facts
// ---------------------------------------------------------------------------

/** Per IP and per server instance (src/lib/rate-limit.ts): soft caps, enough to slow a script. */
const authorizeLimiter = new RateLimiter(20, 60_000);
const tokenLimiter = new RateLimiter(60, 60_000);
const revokeLimiter = new RateLimiter(30, 60_000);

function limitBy(limiter: RateLimiter, ip: string, now: Date): () => endpoints.RateResult {
  return () => {
    const result = limiter.allow(ip, now.getTime());
    limiter.prune(now.getTime());
    return result;
  };
}

/** SecurityEvent.ipHash, as the portal's audit rows key it (src/lib/portal/request.ts). */
function ipHashOf(h: { get(name: string): string | null }): string {
  return keyedHash("ip", clientIp(h), getEnv().sessionSecret);
}

/**
 * One line in Vercel's logs for every sign-in request that is turned away,
 * with its reason from the fixed list (oauth-core.ts REFUSALS) and nothing a
 * caller could use. A warning in the logs and to the reporter, never an
 * error: a refusal is the endpoint working, and it never emails.
 */
function refusalLog(scope: string): RefusalLog {
  return (reason, detail = {}) => logWarning(scope, new Error(reason), { reason, ...detail });
}

/**
 * The bearer check's log, quieter still (endpoints-core.ts oncePerMinute): at
 * most one warning line per reason per minute per server instance, and nothing
 * to the reporter. A token turned away at /api/mcp/<key> is how every hour of
 * a healthy connection ends, and how Claude learns to refresh.
 */
const bearerRefusalLog: RefusalLog = endpoints.oncePerMinute((reason, detail = {}) => logWarning("claude:mcp-token", new Error(reason), { reason, ...detail }, { report: false }));

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

/** GET /.well-known/oauth-protected-resource/api/mcp/<key> */
export function protectedResourceRoute(key: string): Response {
  return endpoints.protectedResourceEndpoint(connectorConfig(), key);
}

/** GET /.well-known/oauth-authorization-server */
export function authorizationServerRoute(): Response {
  return endpoints.authorizationServerEndpoint(connectorConfig());
}

/**
 * Every method a route doesn't serve: 404 while the connector is off, 405 with
 * `Allow` otherwise. A route under a key passes it, and a malformed key is a
 * 404 either way.
 */
export function otherMethodRoute(allow: readonly string[], key?: string): Response {
  if (key !== undefined && !isWellFormedToken(key)) return endpoints.notFound();
  return endpoints.methodNotAllowedEndpoint(connectorConfig(), allow);
}

/**
 * GET /api/oauth/authorize. `signedIn` is the route's getCurrentUser, asked
 * only when the connector is on, so while it is off not even the session
 * cookie is read.
 */
export async function authorizeRoute(request: Request, signedIn: () => Promise<SessionUser | null>): Promise<Response> {
  const cfg = connectorConfig();
  if (!cfg) return endpoints.notFound();
  const now = new Date();
  const user = await signedIn();
  return endpoints.authorizeEndpoint({
    cfg,
    url: new URL(request.url),
    now,
    viewer: user ? { id: user.id } : null,
    ownerOfKey: (key) => core.ownerOfKey(prisma, key),
    secure: getEnv().isProduction,
    limit: limitBy(authorizeLimiter, clientIp(request.headers), now),
    refused: refusalLog("claude:authorize"),
  });
}

async function tokenLike(scope: string, request: Request, limiter: RateLimiter, run: typeof endpoints.tokenEndpoint): Promise<Response> {
  const cfg = connectorConfig();
  if (!cfg) return endpoints.notFound();
  const now = new Date();
  try {
    return await run(request, { cfg, db: prisma, now, ipHash: ipHashOf(request.headers), limit: limitBy(limiter, clientIp(request.headers), now), refused: refusalLog(scope) });
  } catch (err) {
    // Not invalid_grant: that would tell Claude the partner has to connect again, and this is ours to fix.
    logError(scope, err);
    return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  }
}

/** POST /api/oauth/token */
export function tokenRoute(request: Request): Promise<Response> {
  return tokenLike("claude:token", request, tokenLimiter, endpoints.tokenEndpoint);
}

/** POST /api/oauth/revoke */
export function revokeRoute(request: Request): Promise<Response> {
  return tokenLike("claude:revoke", request, revokeLimiter, endpoints.revokeEndpoint);
}

// ---------------------------------------------------------------------------
// Settings › Claude
// ---------------------------------------------------------------------------

/**
 * The signed-in partner's own connector address, e.g.
 * "https://app.example.com/api/mcp/<key>", made the first time they ask.
 * Asking again gives the same address; only Disconnect retires it. Null while
 * the connector is off, for a user who can't sign in, and in the one case the
 * address can't be shown again while a connection still runs on it
 * (connections-core.ts connectAddress): Disconnect first.
 */
export async function connectAddress(user: Pick<SessionUser, "id">, now: Date = new Date()): Promise<string | null> {
  const cfg = connectorConfig();
  return cfg ? core.connectAddress(prisma, cfg, user.id, now) : null;
}

/**
 * Every partner who can sign in, by name, each with their live connection or
 * null. Live means Claude can still use it: a connection whose refresh token
 * has run out reads as not connected. Works with the connector off.
 */
export function listConnections(now: Date = new Date()): Promise<ConnectionRow[]> {
  return core.listConnections(prisma, appOrigin, now);
}

/**
 * Does any partner have a live connection? Works with the connector off: it
 * decides whether Settings still shows the Claude tab then, and the Settings
 * layout asks it for every tab. One small query that reads no user when
 * nobody is connected (connections-core.ts anyLiveConnection). A read that
 * fails is logged and answers false: it hides the Claude tab for that one
 * render, and never takes the other tabs down with it.
 */
export async function anyLiveConnection(now: Date = new Date()): Promise<boolean> {
  try {
    return await core.anyLiveConnection(prisma, appOrigin, now);
  } catch (err) {
    logError("claude:settings", err);
    return false;
  }
}

/**
 * A partner tapped Disconnect, on their own row or the other's. Ends every
 * connection that partner has, retires their address, logs
 * CLAUDE_DISCONNECTED and records who did it. `name` in the answer is the
 * partner who was disconnected, for the toast. Works with the connector off.
 */
export async function disconnect(target: { userId: string } | { connectionId: string }, byUser: Pick<SessionUser, "id">, now: Date = new Date()): Promise<DisconnectResult> {
  return core.disconnect(prisma, target, byUser, { now, ipHash: ipHashOf(await headers()) });
}

// ---------------------------------------------------------------------------
// The approval screen
// ---------------------------------------------------------------------------

/** What the approval screen shows. */
export type PendingApproval =
  | {
      state: "ready";
      /** The signed-in partner's name (their email when they have none), for the heading. */
      userName: string;
      /** Who is asking. Ours ("Claude"), never a name the request carried. */
      clientName: string;
      /** Where Allow sends the browser: "claude.ai". The screen doesn't draw it (see CLAUDE_CALLBACK in oauth-core.ts). */
      redirectHost: string;
      /** When this request stops being approvable. */
      expiresAt: Date;
    }
  /** Every reason there is nothing to approve: no request, past its 10 minutes, another request took its place, not this partner's, the address retired. */
  | { state: "expired" };

async function parkedCookie(): Promise<string | undefined> {
  return (await cookies()).get(pendingCookieName(getEnv().isProduction))?.value;
}

/**
 * Drops the parked request. Set, not delete: a `__Host-` cookie is only
 * replaced by one with the same Secure and Path, and delete() writes neither.
 */
async function dropParkedCookie(): Promise<void> {
  const secure = getEnv().isProduction;
  (await cookies()).set(pendingCookieName(secure), "", { path: "/", secure, httpOnly: true, sameSite: "lax", maxAge: 0 });
}

/**
 * For the approval page (/settings/claude/approve?r=<rid>), after
 * requireUser(): is the request the address names waiting in this browser,
 * and is it this partner's to approve? `rid` is the page's `r` as it came.
 * Reads only; safe in a Server Component.
 */
export async function readPendingApproval(user: SessionUser, rid: unknown, now: Date = new Date()): Promise<PendingApproval> {
  const cfg = connectorConfig();
  if (!cfg) return { state: "expired" };
  const check = await core.readApproval(prisma, cfg, { cookie: await parkedCookie(), rid, userId: user.id, now });
  const client = check.ok ? allowedClient(check.pending.clientId) : null;
  if (!check.ok || !client) {
    refusalLog("claude:approve")(check.ok ? "stale-request" : check.why, { userId: user.id });
    return { state: "expired" };
  }
  return {
    state: "ready",
    userName: check.owner.name?.trim() || check.owner.email,
    clientName: client.name,
    redirectHost: new URL(check.pending.redirectUri).host,
    expiresAt: new Date(check.pending.exp),
  };
}

/**
 * The Allow button's whole job, for a Server Action that has called
 * requireUser(): approves the request parked in this browser when it is the
 * one the form names (`rid`, the hidden field as it came) and this partner's,
 * then drops the cookie whatever the answer. Redirect the browser to
 * `redirectTo` (an address at claude.ai). `expired` means show the approval
 * screen's one line.
 */
export async function approvePending(user: Pick<SessionUser, "id">, rid: unknown, now: Date = new Date()): Promise<ApproveResult> {
  const cfg = connectorConfig();
  const result: ApproveResult = cfg
    ? await core.approveParked(prisma, cfg, { cookie: await parkedCookie(), rid, userId: user.id, now, ipHash: ipHashOf(await headers()) })
    : { ok: false, reason: "expired", why: "expired" };
  // Dropped once there's an answer either way: approved, it's spent; refused, it can never be approved.
  await dropParkedCookie();
  if (!result.ok) refusalLog("claude:approve")(result.why, { userId: user.id });
  return result;
}

/**
 * The Cancel button's whole job, for a Server Action that has called
 * requireUser(): drops the parked request and returns the address that tells
 * Claude nothing was granted. Null when the request in this browser isn't the
 * one the form names or isn't this partner's: Claude is told nothing, and the
 * partner goes back to Settings.
 */
export async function denyPending(user: Pick<SessionUser, "id">, rid: unknown, now: Date = new Date()): Promise<{ redirectTo: string } | null> {
  const cfg = connectorConfig();
  const denied = cfg ? core.denyParked(cfg, { cookie: await parkedCookie(), rid, userId: user.id, now }) : { why: "expired" as const };
  await dropParkedCookie();
  if ("redirectTo" in denied) return denied;
  refusalLog("claude:approve")(denied.why, { userId: user.id });
  return null;
}

// ---------------------------------------------------------------------------
// /api/mcp/<key>
// ---------------------------------------------------------------------------

/**
 * The bearer check for /api/mcp/<key>: the partner and connection behind the
 * request's `Authorization: Bearer` token, or null. `key` is the key in the
 * address the call came to. Null while the connector is off, and for a token
 * that is missing, unknown, expired, issued for another address, on an ended
 * connection, older than the partner's last password change, or whose partner
 * can't sign in. Marks the connection used, at most once a minute.
 *
 * A token that was sent and turned away is logged with its reason, quietly
 * (bearerRefusalLog). A call with no token is not: that is how every sign-in
 * begins.
 */
export async function verifyAccessToken(request: { headers: { get(name: string): string | null } }, key: string, now: Date = new Date()): Promise<VerifiedAccess | null> {
  const cfg = connectorConfig();
  if (!cfg) return null;
  const check = await core.checkAccessToken(prisma, cfg, bearerToken(request.headers), key, now);
  if (check.ok) return check.access;
  if (check.reason !== "no-token") bearerRefusalLog(check.reason, check.detail);
  return null;
}

/**
 * The whole answer for a call /api/mcp/<key> won't serve: 404 while the
 * connector is off or for a malformed key, otherwise 401 with the
 * WWW-Authenticate header that points Claude at that address's discovery
 * document (with `error="invalid_token"` when the request sent an
 * Authorization header), a small JSON body and no-store. Return it before the
 * MCP handler runs: Claude starts sign-in only on a real HTTP 401.
 */
export function unauthorizedResponse(request: { headers: { get(name: string): string | null } }, key: string): Response {
  return endpoints.unauthorizedEndpoint(connectorConfig(), key, request.headers);
}
