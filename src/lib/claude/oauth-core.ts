import crypto from "node:crypto";
import { hashToken, isWellFormedToken } from "@/lib/portal/tokens";
import { safeEqual } from "@/lib/secrets";

/**
 * Sign-in for Claude (docs/specs/tasks-from-claude.md, sections 7 and 8): the
 * app is a small OAuth 2.1 authorization server for exactly one client,
 * Claude. This file is the protocol with nothing behind it: no database, no
 * env, no request. connections-core.ts has the rows, endpoints-core.ts the
 * HTTP answers, oauth.ts binds them to the app. See oauth-core.test.ts.
 *
 * Each partner has a connector address of their own, <APP_URL>/api/mcp/<key>.
 * Claude names the address it was given in every sign-in request (`resource`),
 * so a request reaches one partner's approval screen and nobody else's: only a
 * Claude that was handed that address can ask that partner for anything. There
 * is no window to open, and no link someone else's Claude can send.
 *
 * What Claude does, rechecked on Nov 20, 2026 against
 * https://claude.com/docs/connectors/building/authentication.md and the MCP
 * authorization spec (2025-11-25):
 *
 *  - It reads the 401's WWW-Authenticate `resource_metadata`, then the RFC 9728
 *    document, then the first `authorization_servers` entry's RFC 8414 document.
 *    The RFC 9728 document's `resource` must equal the address as entered, path
 *    included.
 *  - It names itself with a Client ID Metadata Document (its client_id is an
 *    https URL) when our metadata says `client_id_metadata_document_supported`
 *    and lists "none" as a token endpoint auth method. Otherwise it looks for a
 *    registration endpoint, which this server does not have, on purpose.
 *  - Its callback from claude.ai on the web, Desktop, mobile and Cowork is one
 *    fixed address. Claude Code uses a loopback address on any port instead,
 *    which any program on that computer could claim, so it is not allowed here.
 *  - Every request carries a PKCE S256 challenge and the RFC 8707 `resource`,
 *    set to the connector address in canonical form.
 *  - Token and refresh calls are form-encoded. A dead refresh token must answer
 *    `invalid_grant`. Claude waits 10 seconds for discovery and token answers
 *    and 30 for a refresh, and counts a late answer as a failure.
 */

// ---------------------------------------------------------------------------
// Who may connect
// ---------------------------------------------------------------------------

/**
 * Where Claude's hosted apps take the code back. The only return address this
 * server sends anyone to.
 *
 * The approval screen does not show its host (claude.ai) as where Allow goes.
 * The MCP authorization spec asks a consent screen to show it; Connor chose to
 * leave it off while this one address is pinned (Nov 20, 2026). Whoever adds a
 * second return address or client brings that question back.
 */
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

/**
 * Claude's published identity: the Client ID Metadata Document Anthropic hosts
 * for claude.ai, Desktop, mobile and Cowork. It lists CLAUDE_CALLBACK as its
 * one redirect address and "none" as its token endpoint auth method. The
 * document is never fetched: the two values are pinned here, so nothing a
 * caller sends can make this server call out.
 */
export const CLAUDE_CLIENT_ID = "https://claude.ai/oauth/mcp-oauth-client-metadata";

/**
 * The fallback (spec section 8): a fixed client id a partner can type under
 * "Use your own OAuth client" in Claude's Add custom connector dialog, should
 * Claude's published identity ever stop working. Same callback, no secret.
 */
export const FALLBACK_CLIENT_ID = "claude-connector";

export interface AllowedClient {
  /** What the approval screen calls it. Ours, never a name the client sent. */
  name: string;
  redirectUris: readonly string[];
}

/** The allowlist. There is no registration endpoint, so this is every client there will ever be. */
export const ALLOWED_CLIENTS: Readonly<Record<string, AllowedClient>> = {
  [CLAUDE_CLIENT_ID]: { name: "Claude", redirectUris: [CLAUDE_CALLBACK] },
  [FALLBACK_CLIENT_ID]: { name: "Claude", redirectUris: [CLAUDE_CALLBACK] },
};

export function allowedClient(clientId: unknown): AllowedClient | null {
  if (typeof clientId !== "string" || !Object.hasOwn(ALLOWED_CLIENTS, clientId)) return null;
  return ALLOWED_CLIENTS[clientId];
}

/** The one thing a connection may do: read the directory and save drafts. Every grant is exactly this. */
export const SCOPE = "drafts";

// ---------------------------------------------------------------------------
// How long things last
// ---------------------------------------------------------------------------

/** How long a parked sign-in request waits for Allow. */
export const PENDING_TTL_MS = 10 * 60_000;
export const CODE_TTL_MS = 60_000;
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60_000;
/**
 * A refresh token that comes back this soon after it was swapped gets the same
 * new pair again instead of ending the connection: Claude's answer was lost on
 * the way, or two of its workers refreshed at once. Later than this, a spent
 * token means two holders, and the connection ends. 0 turns the allowance off.
 */
export const REFRESH_GRACE_MS = 60_000;
/** ClaudeConnection.lastUsedAt moves at most this often. */
export const LAST_USED_EVERY_MS = 60_000;

// ---------------------------------------------------------------------------
// Why a request was turned away
// ---------------------------------------------------------------------------

/**
 * For the logs only: one word from this list for every sign-in request that is
 * turned away, and for a refresh that is answered twice, so the first live
 * connection can be worked out from Vercel's logs. The caller still gets the
 * same bare answer whichever it was. Nothing a caller could use is ever
 * written beside it: no code, token, verifier, state, cookie, key or address.
 */
export const REFUSALS = [
  "rate-limited",
  // /api/oauth/authorize
  "repeated-parameter",
  "unknown-client",
  "wrong-redirect",
  "bad-state",
  "bad-response-type",
  "bad-pkce",
  "no-resource",
  "wrong-resource",
  "bad-scope",
  "unknown-address",
  "not-owner",
  "too-large",
  // The approval screen
  "expired",
  "stale-request",
  "rid-mismatch",
  "login-off",
  "password-changed",
  "already-approved",
  // /api/oauth/token and /api/oauth/revoke
  "bad-form",
  "missing-field",
  "unsupported-grant",
  "malformed",
  "unknown-code",
  "unknown-token",
  "ended",
  "owner-off",
  "wrong-client",
  "not-connected",
  "code-reuse",
  "refresh-reuse",
  "spent",
  // Not a refusal: a refresh that was answered a second time inside REFRESH_GRACE_MS. It is written down the same
  // way, with its connection, because two of these from different places are the only sign of a second holder.
  "refresh-repeat",
  // /api/mcp/<key>
  "wrong-address",
] as const;

export type Refusal = (typeof REFUSALS)[number];

/** What may be written beside a refusal: ids of ours, and two things a caller named that are no secret of anyone's. */
export interface RefusalDetail {
  /** The client id a caller gave, cut to 200 printable characters. If Anthropic ever changes Claude's published identity, this is where it shows. */
  clientId?: string;
  /** The return address a caller gave, without its query, cut the same way. */
  redirectUri?: string;
  /** Where a wrong `resource` pointed, with anything that could be a key left out (resourceShape). */
  resource?: string;
  connectionId?: string;
  userId?: string;
}

export type RefusalLog = (reason: Refusal, detail?: RefusalDetail) => void;

/** What a caller sent, made safe to write down: printable ASCII only, 200 characters at most. */
export function printable(value: string, max = 200): string {
  return value.replace(/[^\x20-\x7e]/g, "?").slice(0, max);
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const MCP_PATH = "/api/mcp";
export const AUTHORIZE_PATH = "/api/oauth/authorize";
export const TOKEN_PATH = "/api/oauth/token";
export const REVOKE_PATH = "/api/oauth/revoke";
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
export const AUTHORIZATION_SERVER_PATH = "/.well-known/oauth-authorization-server";
/** The approval screen (spec 7.2). A staff page under Settings, so the login's ?next= accepts it, `?r=` included. */
export const APPROVE_PATH = "/settings/claude/approve";

export interface ConnectorConfig {
  /** The authorization server's name: the app's origin, no trailing slash. */
  issuer: string;
  /** SESSION_SECRET. Never used as it is: every job here has a key of its own made from it (purposeKey). */
  secret: string;
}

/**
 * The connector's origin and secret, from the app's own address
 * (getEnv().appUrl): Claude refuses an address that doesn't match exactly, so
 * the near-identical second domain must never appear in one.
 */
export function connectorConfigFor(appUrl: string, secret: string): ConnectorConfig {
  return { issuer: new URL(appUrl).origin, secret };
}

/**
 * The connector stays off over a short secret. The authorize endpoint hands
 * anyone a value signed under a key made from it, which is something to test
 * guesses of the secret against, and the same secret signs the partners'
 * sessions. 32 characters is what .env.example asks for.
 */
export const MIN_SECRET_LENGTH = 32;

export function secretStrongEnough(secret: string): boolean {
  return secret.length >= MIN_SECRET_LENGTH;
}

/**
 * A key for one job, made from the secret. Nothing signed or derived under one
 * of these is an HMAC under SESSION_SECRET itself, so it can never pass as a
 * session cookie, a QuickBooks state, or anything else that secret signs,
 * whatever verifiers exist or get added later.
 */
function purposeKey(secret: string, purpose: "pending-key" | "epoch-key" | "code-key" | "rotation-key"): Buffer {
  return crypto.createHmac("sha256", secret).update(`hg-claude:${purpose}`, "utf8").digest();
}

function keyed(key: Buffer, text: string): string {
  return crypto.createHmac("sha256", key).update(text, "utf8").digest("base64url");
}

/**
 * The key in a partner's connector address, made again from its id whenever
 * the address is shown, the way the shared sign-up link is
 * (src/lib/portal/tokens.ts signupLinkToken). The database keeps the id
 * (User.claudeKeyId) and the key's SHA-256 (User.claudeKeyHash), never the key:
 * a token row names its address by that same hash (storedAddress). 32 bytes as
 * base64url, so it passes isWellFormedToken.
 */
export function claudeAddressKey(keyId: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`hg-claude:address:${keyId}`, "utf8").digest("base64url");
}

/** One partner's connector address, the one they paste into Claude: `<issuer>/api/mcp/<key>`, in canonical form. */
export function connectorAddress(cfg: Pick<ConnectorConfig, "issuer">, key: string): string {
  return `${cfg.issuer}${MCP_PATH}/${key}`;
}

/**
 * What a code or token row keeps in place of its connector address
 * (OAuthToken.resource): the address with the key replaced by the key's
 * SHA-256, `<issuer>/api/mcp/sha256:<hash>`. The key is what keeps a stranger's
 * Claude away from a partner's approval screen, so a copy of the table must
 * not give it away. An address a request names is turned into this form before
 * it is compared with a row.
 */
export function storedAddress(cfg: Pick<ConnectorConfig, "issuer">, key: string): string {
  return storedAddressOfHash(cfg, hashToken(key));
}

/** The same, from the hash the User row already keeps (User.claudeKeyHash). */
function storedAddressOfHash(cfg: Pick<ConnectorConfig, "issuer">, keyHash: string): string {
  return `${cfg.issuer}${MCP_PATH}/sha256:${keyHash}`;
}

/**
 * A resource address in canonical form (RFC 8707, MCP "Canonical Server URI"):
 * lowercase scheme and host, no default port, no trailing slash, and no query,
 * fragment or credentials at all. Null for anything else.
 */
export function canonicalResource(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.search || url.hash || raw.includes("#") || raw.includes("?")) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * The key in `raw`, when `raw` is a partner's connector address at this app:
 * exactly `<issuer>/api/mcp/<key>` once in canonical form, as Claude sends it.
 * The key's own letters are compared as they are, case included. Null for any
 * other address, the bare `<issuer>/api/mcp` among them.
 */
export function keyOfResource(raw: unknown, cfg: Pick<ConnectorConfig, "issuer">): string | null {
  const canonical = canonicalResource(raw);
  const prefix = `${cfg.issuer}${MCP_PATH}/`;
  if (canonical === null || !canonical.startsWith(prefix)) return null;
  const key = canonical.slice(prefix.length);
  return isWellFormedToken(key) ? key : null;
}

/**
 * Is this stored address (storedAddress) the one this partner's current key
 * makes? What a code, a token and a Settings row are each held to: an address
 * that was retired, or belongs to the other partner or another origin, is
 * nobody's. Hash against hash: the key is never needed, and a row that holds
 * an address in the clear matches nobody.
 */
export function isOwnersAddress(resource: string | null | undefined, owner: { claudeKeyHash: string | null }, cfg: Pick<ConnectorConfig, "issuer">): boolean {
  if (!resource || !owner.claudeKeyHash) return false;
  return safeEqual(resource, storedAddressOfHash(cfg, owner.claudeKeyHash));
}

/**
 * Where a wrong `resource` pointed, for the logs: its origin and whether its
 * path was the connector's. Whatever followed /api/mcp/ is never written
 * down, since a mistyped key is still most of a key.
 */
export function resourceShape(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "none";
  let url: URL;
  try {
    url = new URL(raw.slice(0, 512));
  } catch {
    return "unreadable";
  }
  const path = url.pathname.replace(/\/+$/, "");
  const shape = path === "" || path === MCP_PATH ? path : path.startsWith(`${MCP_PATH}/`) ? `${MCP_PATH}/[key]` : "/[other]";
  return `${printable(url.origin, 100)}${shape}`;
}

// ---------------------------------------------------------------------------
// The authorization request
// ---------------------------------------------------------------------------

/** A request that passed every check: what gets parked until the partner taps Allow. */
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  /** PKCE S256 challenge: base64url of a SHA-256, always 43 characters. */
  codeChallenge: string;
  /** Claude's own value, handed back untouched. */
  state: string | null;
  /** The key in the address Claude named: whose approval screen this request may reach. */
  key: string;
  /** That address, `connectorAddress(cfg, key)`. */
  resource: string;
}

export type AuthorizeOutcome =
  | { kind: "ok"; request: AuthorizationRequest }
  /** The caller isn't Claude, or the request can't be trusted enough to answer at its return address: a plain 400, no redirect. */
  | { kind: "refuse"; reason: Refusal; detail?: RefusalDetail }
  /** Claude asked for something this server doesn't do: tell it, at its own callback. */
  | { kind: "error"; redirectTo: string; reason: Refusal; detail?: RefusalDetail };

/** Claude's state rides in the parked cookie, and a browser drops a cookie over about 4 KB. */
const STATE_MAX = 2048;
const SCOPE_MAX = 256;
/** RFC 6749 appendix A.5: printable ASCII. */
const VSCHARS = /^[\x20-\x7e]+$/;
/** RFC 6749 section 3.3: space-separated tokens of printable ASCII without `"` or `\`. */
const SCOPE_LIST = /^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*$/;
const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** Everything read from the query. One that appears twice is refused (RFC 6749 section 3.1). */
const AUTHORIZE_PARAMS = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "resource", "scope"] as const;

/**
 * Checks Claude's authorization request. The client and the return address are
 * settled first, against the allowlist and by exact match: until both hold,
 * nothing is sent anywhere. After that a problem goes back to Claude's callback
 * as an OAuth error with its `state`. `resource` is required and has to be a
 * partner's connector address here: the key in it is who the request is for.
 * Whether that key is anyone's is the caller's to look up.
 */
export function parseAuthorizeRequest(query: URLSearchParams, cfg: Pick<ConnectorConfig, "issuer">): AuthorizeOutcome {
  for (const name of AUTHORIZE_PARAMS) if (query.getAll(name).length > 1) return { kind: "refuse", reason: "repeated-parameter" };

  const clientId = query.get("client_id");
  const client = allowedClient(clientId);
  if (!client || !clientId) return { kind: "refuse", reason: "unknown-client", detail: { clientId: printable(clientId ?? "") } };
  const redirectUri = query.get("redirect_uri");
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { kind: "refuse", reason: "wrong-redirect", detail: { redirectUri: printable((redirectUri ?? "").split(/[?#]/, 1)[0]) } };
  }

  const state = query.get("state");
  if (state !== null && (state.length === 0 || state.length > STATE_MAX || !VSCHARS.test(state))) return { kind: "refuse", reason: "bad-state" };

  const fail = (error: AuthorizeError, reason: Refusal, detail?: RefusalDetail): AuthorizeOutcome => ({
    kind: "error",
    redirectTo: errorRedirect(redirectUri, error, state),
    reason,
    ...(detail ? { detail } : {}),
  });

  if (query.get("response_type") !== "code") return fail("unsupported_response_type", "bad-response-type");
  const codeChallenge = query.get("code_challenge");
  if (!codeChallenge || !S256_CHALLENGE.test(codeChallenge) || query.get("code_challenge_method") !== "S256") return fail("invalid_request", "bad-pkce");
  const asked = query.get("resource");
  const key = keyOfResource(asked, cfg);
  if (!key) return asked ? fail("invalid_target", "wrong-resource", { resource: resourceShape(asked) }) : fail("invalid_target", "no-resource");
  const scope = query.get("scope");
  if (scope && (scope.length > SCOPE_MAX || !SCOPE_LIST.test(scope))) return fail("invalid_scope", "bad-scope");

  // Whatever scope Claude names, the grant is SCOPE and nothing wider (RFC 6749 section 3.3 lets a server narrow it).
  return { kind: "ok", request: { clientId, redirectUri, codeChallenge, state, key, resource: connectorAddress(cfg, key) } };
}

export type AuthorizeError = "access_denied" | "invalid_request" | "invalid_scope" | "invalid_target" | "unsupported_response_type";

function redirectWith(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) if (value !== null) url.searchParams.set(name, value);
  return url.toString();
}

/** Back to Claude with the one-time code. `redirectUri` is always one from the allowlist. */
export function codeRedirect(redirectUri: string, code: string, state: string | null): string {
  return redirectWith(redirectUri, { code, state });
}

/** Back to Claude with an OAuth error (RFC 6749 section 4.1.2.1). */
export function errorRedirect(redirectUri: string, error: AuthorizeError, state: string | null): string {
  return redirectWith(redirectUri, { error, state });
}

// ---------------------------------------------------------------------------
// The parked request: a signed cookie
// ---------------------------------------------------------------------------

/**
 * Holds the request while the partner signs in and reads the approval screen.
 * The login's ?next= takes only a short staff path (src/lib/next-path.ts), so
 * the request's long query waits here instead, as qbo_oauth_state does for
 * QuickBooks.
 *
 * On HTTPS the name carries the `__Host-` prefix, which a browser accepts only
 * with Secure, Path=/ and no Domain, so another host under the domain can't
 * plant one (the contractor cookie does the same, src/lib/portal/cookie.ts).
 * Local http can't set a Secure cookie and gets the plain name. Reading goes
 * by the same rule, so only the name for the current mode is ever read.
 */
export const PENDING_COOKIE_HTTPS = "__Host-claude_oauth_pending";
export const PENDING_COOKIE_HTTP = "claude_oauth_pending";

export function pendingCookieName(secure: boolean): string {
  return secure ? PENDING_COOKIE_HTTPS : PENDING_COOKIE_HTTP;
}

export interface PendingAuthorization extends AuthorizationRequest {
  /** The partner whose address the request named. Nobody else may approve or cancel it. */
  userId: string;
  /** That partner's password as it stood when the request was parked (passwordEpoch). A reset in between ends the request. */
  epoch: string;
  /** This request's own id. It rides in the approval screen's address and in its two buttons, so Allow acts on the request the screen was drawn for and no other. */
  rid: string;
  /** When the request was parked, ms. */
  iat: number;
  exp: number;
}

/**
 * Stands for "this partner, with the password they had at this moment",
 * without saying when that was. Allow compares it under the partner's row
 * lock: a request parked before a password reset can't be approved after it,
 * so a browser session the reset was meant to end can't finish a connection
 * while the reset is being saved.
 */
export function passwordEpoch(secret: string, userId: string, passwordChangedAt: Date | null): string {
  return keyed(purposeKey(secret, "epoch-key"), `${userId}:${passwordChangedAt ? passwordChangedAt.getTime() : "never"}`);
}

function pendingMac(secret: string, enc: string): string {
  return keyed(purposeKey(secret, "pending-key"), enc);
}

/**
 * `base64url(payload).hmac`, the shape of a session token, signed under a key
 * no session is signed with. Signed, not sealed: whoever holds the cookie can
 * read it, and a signed-out caller who names a real address gets one. What it
 * tells them is the owner's user id, a value that changes when that partner's
 * password is reset, and that the address is live. None of it grants
 * anything: Allow still needs that partner's own session.
 */
export function signPending(request: AuthorizationRequest, opts: { secret: string; now: number; userId: string; passwordChangedAt: Date | null; rid: string }): string {
  const payload: PendingAuthorization = {
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    state: request.state,
    key: request.key,
    resource: request.resource,
    userId: opts.userId,
    epoch: passwordEpoch(opts.secret, opts.userId, opts.passwordChangedAt),
    rid: opts.rid,
    iat: opts.now,
    exp: opts.now + PENDING_TTL_MS,
  };
  const enc = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${enc}.${pendingMac(opts.secret, enc)}`;
}

/** The parked request, or null when the cookie is missing, malformed, tampered with or older than 10 minutes. */
export function readPending(value: string | undefined | null, opts: { secret: string; now: number }): PendingAuthorization | null {
  if (!value || value.length > PENDING_VALUE_MAX) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const enc = value.slice(0, dot);
  if (!safeEqual(value.slice(dot + 1), pendingMac(opts.secret, enc))) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<PendingAuthorization>;
  if (typeof p.clientId !== "string" || typeof p.redirectUri !== "string" || typeof p.codeChallenge !== "string" || typeof p.resource !== "string") return null;
  if (p.state !== null && typeof p.state !== "string") return null;
  if (!isWellFormedToken(p.key) || !isWellFormedToken(p.rid) || !isWellFormedToken(p.epoch)) return null;
  if (typeof p.userId !== "string" || p.userId.length === 0 || p.userId.length > 100) return null;
  if (typeof p.iat !== "number" || typeof p.exp !== "number" || !Number.isFinite(p.iat) || !Number.isFinite(p.exp)) return null;
  if (p.exp <= opts.now || p.iat > opts.now) return null;
  return {
    clientId: p.clientId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    state: p.state,
    key: p.key,
    resource: p.resource,
    userId: p.userId,
    epoch: p.epoch,
    rid: p.rid,
    iat: p.iat,
    exp: p.exp,
  };
}

/**
 * Does a parked request still describe something this server would accept?
 * The signature already says we wrote it; this catches a request parked under
 * an allowlist or an app address that has changed since, and holds its address
 * to the one its own key makes.
 */
export function pendingStillValid(pending: PendingAuthorization, cfg: Pick<ConnectorConfig, "issuer">): boolean {
  const client = allowedClient(pending.clientId);
  return (
    !!client &&
    client.redirectUris.includes(pending.redirectUri) &&
    S256_CHALLENGE.test(pending.codeChallenge) &&
    isWellFormedToken(pending.key) &&
    pending.resource === connectorAddress(cfg, pending.key)
  );
}

export type ParkedCheck = { ok: true; pending: PendingAuthorization } | { ok: false; why: Refusal };

/**
 * The request parked in this browser, when it is the one a screen or a button
 * names (`rid`) and is this partner's own. The approval screen and both of its
 * buttons start here, so a second request parked over the first makes the
 * first screen's Allow and Cancel do nothing instead of acting on the newcomer.
 */
export function readParkedFor(value: string | undefined | null, opts: { cfg: ConnectorConfig; rid: unknown; userId: string; now: number }): ParkedCheck {
  const pending = readPending(value, { secret: opts.cfg.secret, now: opts.now });
  if (!pending) return { ok: false, why: "expired" };
  if (!pendingStillValid(pending, opts.cfg)) return { ok: false, why: "stale-request" };
  if (typeof opts.rid !== "string" || !safeEqual(opts.rid, pending.rid)) return { ok: false, why: "rid-mismatch" };
  if (!safeEqual(opts.userId, pending.userId)) return { ok: false, why: "not-owner" };
  return { ok: true, pending };
}

/** The longest signed value pendingCookieHeader may carry: with its name and attributes it stays under a browser's 4096 bytes. */
export const PENDING_VALUE_MAX = 3900;

/** `Set-Cookie` for the parked request: httpOnly, 10 minutes, sent on the top-level navigations back from sign-in. */
export function pendingCookieHeader(value: string, secure: boolean): string {
  return `${pendingCookieName(secure)}=${value}; Path=/; Max-Age=${Math.floor(PENDING_TTL_MS / 1000)}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** `Set-Cookie` that drops a parked request. */
export function clearPendingCookieHeader(secure: boolean): string {
  return `${pendingCookieName(secure)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// ---------------------------------------------------------------------------
// Values made from a request or a token, so a repeat gets the same one
// ---------------------------------------------------------------------------

/**
 * The one-time code for a parked request, made from its id. The same request
 * approved twice (two tabs, a double tap) therefore asks for the same code,
 * and only the first Allow makes a connection: a request id that was approved
 * before is refused for good (connections-core.ts approve), so the code is
 * never armed twice. Nobody can work it out from the id without the secret.
 */
export function approvalCode(secret: string, rid: string): string {
  return keyed(purposeKey(secret, "code-key"), rid);
}

export interface TokenPair {
  access: string;
  refresh: string;
}

/**
 * The access and refresh token a refresh token is swapped for, made from the
 * token presented. A swap that is sent twice inside REFRESH_GRACE_MS can then
 * be answered with the same pair again, with nothing kept in the clear: the
 * table still holds only hashes. The first pair of a connection, from the
 * code, is random (newToken).
 */
export function rotatedTokens(secret: string, presented: string): TokenPair {
  const key = purposeKey(secret, "rotation-key");
  return { access: keyed(key, `access:${presented}`), refresh: keyed(key, `refresh:${presented}`) };
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/** RFC 7636 section 4.1: 43 to 128 unreserved characters. */
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

/** The S256 challenge for a verifier (RFC 7636 section 4.2). */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Does this verifier open this challenge? False for a missing or misshapen one. Constant time. */
export function verifyPkce(verifier: unknown, challenge: string | null | undefined): boolean {
  if (typeof verifier !== "string" || !CODE_VERIFIER.test(verifier) || !challenge) return false;
  return safeEqual(pkceChallenge(verifier), challenge);
}

// ---------------------------------------------------------------------------
// The token and revoke requests
// ---------------------------------------------------------------------------

/** The four errors the token endpoint gives (RFC 6749 section 5.2). None says which check failed. */
export type TokenError = "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type";

export type TokenRequest =
  | { grant: "authorization_code"; code: string; codeVerifier: string; clientId: string; redirectUri: string | null; resource: string | null }
  | { grant: "refresh_token"; refreshToken: string; clientId: string | null; resource: string | null };

const FORM_MAX_BYTES = 8 * 1024;

/** The body of a form-encoded POST, or null: wrong content type, too big, or a field sent twice. */
export function parseForm(contentType: string | null, body: string): URLSearchParams | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") return null;
  if (Buffer.byteLength(body, "utf8") > FORM_MAX_BYTES) return null;
  const form = new URLSearchParams(body);
  const seen = new Set<string>();
  for (const name of form.keys()) {
    if (seen.has(name)) return null;
    seen.add(name);
  }
  return form;
}

export const FORM_BODY_LIMIT = FORM_MAX_BYTES;

export type ParsedTokenRequest = { ok: true; request: TokenRequest } | { ok: false; error: TokenError; reason: Refusal; detail?: RefusalDetail };

/**
 * Reads a token request. Claude is a public client (token endpoint auth method
 * "none"), so there is no secret to check: the code with its PKCE verifier, or
 * the refresh token, is the credential. A client id that isn't on the
 * allowlist is `invalid_client`.
 */
export function parseTokenRequest(form: URLSearchParams): ParsedTokenRequest {
  const no = (error: TokenError, reason: Refusal, detail?: RefusalDetail): ParsedTokenRequest => ({ ok: false, error, reason, ...(detail ? { detail } : {}) });
  const grant = form.get("grant_type");
  if (!grant) return no("invalid_request", "missing-field");
  if (grant !== "authorization_code" && grant !== "refresh_token") return no("unsupported_grant_type", "unsupported-grant");

  const clientId = form.get("client_id");
  if (clientId !== null && !allowedClient(clientId)) return no("invalid_client", "unknown-client", { clientId: printable(clientId) });
  const resource = form.get("resource");

  if (grant === "authorization_code") {
    const code = form.get("code");
    const codeVerifier = form.get("code_verifier");
    if (!clientId) return no("invalid_client", "unknown-client", { clientId: "" });
    if (!code || !codeVerifier) return no("invalid_request", "missing-field");
    // Shape checks answer as a wrong value would, so a caller learns nothing about what a real one looks like.
    if (!isWellFormedToken(code) || !CODE_VERIFIER.test(codeVerifier)) return no("invalid_grant", "malformed");
    return { ok: true, request: { grant, code, codeVerifier, clientId, redirectUri: form.get("redirect_uri"), resource } };
  }

  const refreshToken = form.get("refresh_token");
  if (!refreshToken) return no("invalid_request", "missing-field");
  if (!isWellFormedToken(refreshToken)) return no("invalid_grant", "malformed");
  return { ok: true, request: { grant, refreshToken, clientId, resource } };
}

/** What a successful token call answers (RFC 6749 section 5.1). */
export interface TokenResponseBody {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

// ---------------------------------------------------------------------------
// Bearer tokens and the 401
// ---------------------------------------------------------------------------

/** The token from `Authorization: Bearer <token>`, or null. Never from the query string. */
export function bearerToken(headers: { get(name: string): string | null }): string | null {
  const m = /^Bearer +([A-Za-z0-9._~+/-]+=*) *$/i.exec(headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/** Where the 401 points Claude: the RFC 9728 document at the address's own path under the well-known one. */
export function protectedResourceMetadataUrl(cfg: Pick<ConnectorConfig, "issuer">, key: string): string {
  return `${cfg.issuer}${PROTECTED_RESOURCE_PATH}${MCP_PATH}/${key}`;
}

/**
 * The `WWW-Authenticate` value /api/mcp/<key> sends with its 401, the same for
 * every well-formed key, so it never says whether a key is anyone's. Claude
 * starts sign-in only on a 401 that carries `resource_metadata`; it ignores
 * the header on a 200. `invalid` adds `error="invalid_token"` for a token that
 * was sent and turned away (RFC 6750 section 3.1); a call with no token gets
 * none.
 */
export function wwwAuthenticateValue(cfg: Pick<ConnectorConfig, "issuer">, key: string, opts: { invalid?: boolean } = {}): string {
  const parts = [...(opts.invalid ? ['error="invalid_token"'] : []), `resource_metadata="${protectedResourceMetadataUrl(cfg, key)}"`, `scope="${SCOPE}"`];
  return `Bearer ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Discovery documents
// ---------------------------------------------------------------------------

/** RFC 9728: which authorization server guards an address. `resource` must equal the address pasted into Claude, key included. */
export function protectedResourceMetadata(cfg: Pick<ConnectorConfig, "issuer">, key: string) {
  return {
    resource: connectorAddress(cfg, key),
    authorization_servers: [cfg.issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
  };
}

/**
 * RFC 8414: where Claude signs in. `client_id_metadata_document_supported` and
 * "none" together are what make Claude use its published identity. There is no
 * `registration_endpoint`, so nobody can register a client.
 */
export function authorizationServerMetadata(cfg: Pick<ConnectorConfig, "issuer">) {
  return {
    issuer: cfg.issuer,
    authorization_endpoint: `${cfg.issuer}${AUTHORIZE_PATH}`,
    token_endpoint: `${cfg.issuer}${TOKEN_PATH}`,
    revocation_endpoint: `${cfg.issuer}${REVOKE_PATH}`,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  };
}
