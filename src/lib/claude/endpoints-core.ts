import { withNext } from "@/lib/next-path";
import { isWellFormedToken, newToken } from "@/lib/portal/tokens";
import { exchangeCode, refreshTokens, revokeToken, type AuditContext, type Db, type KeyOwner } from "./connections-core";
import {
  APPROVE_PATH,
  FORM_BODY_LIMIT,
  PENDING_VALUE_MAX,
  allowedClient,
  authorizationServerMetadata,
  parseAuthorizeRequest,
  parseForm,
  parseTokenRequest,
  pendingCookieHeader,
  printable,
  protectedResourceMetadata,
  signPending,
  wwwAuthenticateValue,
  type ConnectorConfig,
  type Refusal,
  type RefusalLog,
  type TokenError,
} from "./oauth-core";

/**
 * What each sign-in endpoint answers (docs/specs/tasks-from-claude.md, section
 * 8), as plain Request in, Response out, with the database, the clock, the
 * rate limit and the log handed in. No Next and no env, so oauth.pg.test.ts
 * drives the whole flow through these; oauth.ts supplies the real ones to the
 * routes.
 *
 * `cfg` is null while CLAUDE_CONNECTOR_ENABLED is off, and then every endpoint
 * is a 404 that does nothing else: no parsing, no rate-limit count, no query,
 * whatever the method. It is a plain 404 of this file's own (notFound), not
 * the page a path with no route gets, so the two can be told apart: off hides
 * what the routes do, not that they are deployed.
 *
 * Every request that is turned away tells `refused` why, in one word
 * (oauth-core.ts REFUSALS). The answer itself never says.
 */

export type RateResult = { ok: true } | { ok: false; retryAfterMs: number };

/** Nothing here may be kept by a browser or a proxy: a token answer above all (RFC 6749 section 5.1). */
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" } as const;

export function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

/**
 * A method a route doesn't serve. While the connector is off that is the same
 * plain 404 as every served method, OPTIONS and HEAD included, so no method
 * answers differently from another. On, it is a 405 that names the methods the
 * route does serve.
 */
export function methodNotAllowedEndpoint(cfg: ConnectorConfig | null, allow: readonly string[]): Response {
  if (!cfg) return notFound();
  return new Response("Method not allowed", { status: 405, headers: { ...NO_STORE, Allow: allow.join(", ") } });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function tooMany(rate: Extract<RateResult, { ok: false }>, body: BodyInit, contentType: string): Response {
  const seconds = Math.max(1, Math.ceil(rate.retryAfterMs / 1000));
  return new Response(body, { status: 429, headers: { ...NO_STORE, "Content-Type": contentType, "Retry-After": String(seconds) } });
}

/** An OAuth error answer. Only the code: nothing says which check failed. */
function oauthError(error: TokenError, status = 400): Response {
  return json({ error }, status);
}

function seeOther(location: string, setCookie?: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...NO_STORE, Location: location, "Referrer-Policy": "no-referrer", ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
  });
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * /.well-known/oauth-protected-resource/api/mcp/<key>: the RFC 9728 document
 * for that address, for any well-formed key. It never looks the key up, so it
 * never says whether the key is anyone's. A malformed key is a 404.
 */
export function protectedResourceEndpoint(cfg: ConnectorConfig | null, key: string): Response {
  return cfg && isWellFormedToken(key) ? json(protectedResourceMetadata(cfg, key)) : notFound();
}

/** /.well-known/oauth-authorization-server */
export function authorizationServerEndpoint(cfg: ConnectorConfig | null): Response {
  return cfg ? json(authorizationServerMetadata(cfg)) : notFound();
}

// ---------------------------------------------------------------------------
// /api/oauth/authorize
// ---------------------------------------------------------------------------

/** Shown in the browser to someone who followed a link that isn't Claude's. Plain text on purpose. */
export const AUTHORIZE_REFUSED = "This link can't connect Claude. Try again from Claude.";
/** Shown when the address a request names is nobody's (unknown, or retired by Disconnect), or is the other partner's. */
export const AUTHORIZE_WRONG_ADDRESS = "This address can't connect Claude. Tap Connect in Settings to get yours.";
export const AUTHORIZE_TOO_MANY = "Too many tries. Wait a minute, then try again.";

function plainRefusal(line: string): Response {
  return new Response(line, { status: 400, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
}

export interface AuthorizeInput {
  cfg: ConnectorConfig | null;
  url: URL;
  now: Date;
  /** Who is signed in in this browser, or null. */
  viewer: { id: string } | null;
  /** The partner whose current address carries a key (connections-core.ts ownerOfKey), or null. */
  ownerOfKey: (key: string) => Promise<KeyOwner | null>;
  /** The cookie's Secure flag and `__Host-` name: true in production. */
  secure: boolean;
  limit: () => RateResult;
  refused?: RefusalLog;
}

/**
 * Claude opens this in the partner's browser. A request that passes
 * parseAuthorizeRequest names a connector address, and the key in that address
 * decides everything else: the request is parked for that key's owner and for
 * nobody else, in the signed cookie, under an id of its own. The browser then
 * goes to the approval screen for that id, straight there when the owner is
 * signed in, through /login?next= when nobody is.
 *
 * A key that is nobody's, or a signed-in partner who isn't the owner, gets a
 * plain page and nothing more. No refusal here sets or clears a cookie, so a
 * request that fails a check can never disturb one that is waiting.
 */
export async function authorizeEndpoint(input: AuthorizeInput): Promise<Response> {
  const { cfg, url, now, viewer, secure } = input;
  if (!cfg) return notFound();
  const rate = input.limit();
  if (!rate.ok) {
    input.refused?.("rate-limited");
    return tooMany(rate, AUTHORIZE_TOO_MANY, "text/plain; charset=utf-8");
  }

  const outcome = parseAuthorizeRequest(url.searchParams, cfg);
  if (outcome.kind !== "ok") {
    input.refused?.(outcome.reason, outcome.detail);
    return outcome.kind === "refuse" ? plainRefusal(AUTHORIZE_REFUSED) : seeOther(outcome.redirectTo);
  }

  const owner = await input.ownerOfKey(outcome.request.key);
  if (!owner) {
    input.refused?.("unknown-address");
    return plainRefusal(AUTHORIZE_WRONG_ADDRESS);
  }
  if (viewer && viewer.id !== owner.id) {
    input.refused?.("not-owner", { userId: viewer.id });
    return plainRefusal(AUTHORIZE_WRONG_ADDRESS);
  }

  const rid = newToken();
  const parked = signPending(outcome.request, { secret: cfg.secret, now: now.getTime(), userId: owner.id, passwordChangedAt: owner.passwordChangedAt, rid });
  // A browser would drop a cookie this size without a word, and the approval screen would only say "expired".
  if (parked.length > PENDING_VALUE_MAX) {
    input.refused?.("too-large");
    return plainRefusal(AUTHORIZE_REFUSED);
  }
  const screen = `${APPROVE_PATH}?r=${rid}`;
  return seeOther(viewer ? screen : withNext("/login", screen), pendingCookieHeader(parked, secure));
}

// ---------------------------------------------------------------------------
// /api/oauth/token and /api/oauth/revoke
// ---------------------------------------------------------------------------

export interface TokenEndpointDeps extends AuditContext {
  cfg: ConnectorConfig | null;
  db: Db;
  now: Date;
  limit: () => RateResult;
  refused?: RefusalLog;
  /** How long a refresh may be repeated (oauth-core.ts REFRESH_GRACE_MS when left out). */
  refreshGraceMs?: number;
}

/** The form body of a POST, or null (parseForm), without reading more than the limit allows for. */
async function readForm(request: Request): Promise<URLSearchParams | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > FORM_BODY_LIMIT) return null;
  return parseForm(request.headers.get("content-type"), await request.text());
}

/**
 * POST, form-encoded, as Claude sends both the code exchange and every
 * refresh. Answers the tokens, or one of the four OAuth errors with a 400.
 */
export async function tokenEndpoint(request: Request, deps: TokenEndpointDeps): Promise<Response> {
  const { cfg, db, now } = deps;
  if (!cfg) return notFound();
  const rate = deps.limit();
  if (!rate.ok) {
    deps.refused?.("rate-limited");
    return tooMany(rate, JSON.stringify({ error: "temporarily_unavailable" }), "application/json");
  }

  const form = await readForm(request);
  if (!form) {
    deps.refused?.("bad-form");
    return oauthError("invalid_request");
  }
  const parsed = parseTokenRequest(form);
  if (!parsed.ok) {
    deps.refused?.(parsed.reason, parsed.detail);
    return oauthError(parsed.error);
  }

  const ctx = { now, ipHash: deps.ipHash ?? null };
  const result =
    parsed.request.grant === "authorization_code"
      ? await exchangeCode(db, cfg, parsed.request, ctx)
      : await refreshTokens(db, cfg, parsed.request, { ...ctx, ...(deps.refreshGraceMs === undefined ? {} : { refreshGraceMs: deps.refreshGraceMs }) });
  if (!result.ok) {
    deps.refused?.(result.reason, result.detail);
    return oauthError(result.error);
  }
  // Answered, and still written down: a refresh's first answer given again (connections-core.ts refreshTokens).
  if (result.repeat) deps.refused?.("refresh-repeat", result.repeat);
  return json(result.body);
}

/**
 * RFC 7009. Always 200 once the request is well formed, whether or not the
 * token meant anything, so the answer can't be used to test tokens.
 */
export async function revokeEndpoint(request: Request, deps: TokenEndpointDeps): Promise<Response> {
  const { cfg, db, now } = deps;
  if (!cfg) return notFound();
  const rate = deps.limit();
  if (!rate.ok) {
    deps.refused?.("rate-limited");
    return tooMany(rate, JSON.stringify({ error: "temporarily_unavailable" }), "application/json");
  }

  const form = await readForm(request);
  const token = form?.get("token");
  if (!form || !token) {
    deps.refused?.(form ? "missing-field" : "bad-form");
    return oauthError("invalid_request");
  }
  const clientId = form.get("client_id");
  if (clientId !== null && !allowedClient(clientId)) {
    deps.refused?.("unknown-client", { clientId: printable(clientId) });
    return oauthError("invalid_client");
  }

  const outcome = await revokeToken(db, token, clientId, { now, ipHash: deps.ipHash ?? null });
  if (outcome.did === "nothing") deps.refused?.(outcome.reason, outcome.detail);
  return new Response(null, { status: 200, headers: NO_STORE });
}

// ---------------------------------------------------------------------------
// The connector's 401
// ---------------------------------------------------------------------------

/**
 * What /api/mcp/<key> answers a call it won't serve: 404 while the connector
 * is off or for a malformed key, otherwise the 401 whose WWW-Authenticate
 * header starts Claude's sign-in, the same for every well-formed key. A call
 * that did send a token gets `error="invalid_token"`, which is what makes
 * Claude refresh.
 */
export function unauthorizedEndpoint(cfg: ConnectorConfig | null, key: string, headers: { get(name: string): string | null }): Response {
  if (!cfg || !isWellFormedToken(key)) return notFound();
  const invalid = headers.get("authorization") !== null;
  return json(invalid ? { error: "invalid_token" } : { error: "unauthorized" }, 401, { "WWW-Authenticate": wwwAuthenticateValue(cfg, key, { invalid }) });
}

/** How often one reason for turning a bearer token away is written down (oncePerMinute). */
export const BEARER_LOG_EVERY_MS = 60_000;

/**
 * A log for the bearer check that writes each reason at most once a minute
 * and drops the rest. A turned-away token is the ordinary event there: every
 * access token runs out after an hour, and the 401 is what makes Claude
 * refresh. Anyone can also send junk tokens with no limit before the check
 * (see the route), so a line for each would let a stranger fill the logs. The
 * reasons come from the fixed list, so this remembers a handful of times and
 * nothing a caller sent.
 */
export function oncePerMinute(log: RefusalLog, clock: () => number = Date.now): RefusalLog {
  const last = new Map<Refusal, number>();
  return (reason, detail) => {
    const now = clock();
    const before = last.get(reason);
    if (before !== undefined && now - before < BEARER_LOG_EVERY_MS) return;
    last.set(reason, now);
    log(reason, detail);
  };
}
