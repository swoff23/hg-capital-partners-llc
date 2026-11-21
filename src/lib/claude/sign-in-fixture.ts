import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { approveParked, connectAddress, ownerOfKey, type ApproveResult } from "./connections-core";
import { authorizeEndpoint, tokenEndpoint, type RateResult } from "./endpoints-core";
import {
  AUTHORIZE_PATH,
  CLAUDE_CALLBACK,
  CLAUDE_CLIENT_ID,
  SCOPE,
  TOKEN_PATH,
  keyOfResource,
  pendingCookieName,
  pkceChallenge,
  type ConnectorConfig,
  type RefusalLog,
  type TokenResponseBody,
} from "./oauth-core";

/**
 * Test support, in the way of src/lib/scratch-rows.ts: Claude's sign-in as a
 * partner's browser and Claude run it, one step at a time, through the same
 * functions the routes call (endpoints-core.ts, connections-core.ts). The
 * database tests get their parked requests, codes and connected partners here
 * (oauth.pg.test.ts, tools.pg.test.ts), so there is one place that says what
 * the steps are. Nothing in the app imports this file.
 */

const allow = (): RateResult => ({ ok: true });
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);

/** What Claude holds for one sign-in attempt: its PKCE verifier and its state. */
export interface ClaudeAttempt {
  verifier: string;
  challenge: string;
  state: string;
}

export function claudeAttempt(): ClaudeAttempt {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier), state: `st-${randomUUID()}` };
}

/** The address Claude opens in the partner's browser for an attempt at one connector address. `over` changes a parameter; null drops it. */
export function authorizeUrl(cfg: ConnectorConfig, address: string, attempt: ClaudeAttempt, over: Record<string, string | null> = {}): URL {
  const params: Record<string, string | null> = {
    response_type: "code",
    client_id: CLAUDE_CLIENT_ID,
    redirect_uri: CLAUDE_CALLBACK,
    state: attempt.state,
    code_challenge: attempt.challenge,
    code_challenge_method: "S256",
    resource: address,
    scope: SCOPE,
    ...over,
  };
  const url = new URL(`${cfg.issuer}${AUTHORIZE_PATH}`);
  for (const [name, value] of Object.entries(params)) if (value !== null) url.searchParams.set(name, value);
  return url;
}

export interface Opened {
  response: Response;
  /** The parked-request cookie's value, when the answer set one. */
  cookie: string | null;
  /** The request id in the approval screen's address, when the answer sent the browser there. */
  rid: string | null;
}

/**
 * A browser opens Claude's authorize address. `viewer` is who is signed in
 * there, or null. Returns the answer, the cookie it parked and the request id
 * it sent the browser on with.
 */
export async function openAuthorize(
  db: PrismaClient,
  cfg: ConnectorConfig,
  input: { url: URL; at: Date; viewer: { id: string } | null; secure?: boolean; refused?: RefusalLog },
): Promise<Opened> {
  const secure = input.secure ?? true;
  const response = await authorizeEndpoint({
    cfg,
    url: input.url,
    now: input.at,
    viewer: input.viewer,
    ownerOfKey: (key) => ownerOfKey(db, key),
    secure,
    limit: allow,
    ...(input.refused ? { refused: input.refused } : {}),
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const name = `${pendingCookieName(secure)}=`;
  const cookie = setCookie.startsWith(name) ? setCookie.slice(name.length).split(";")[0] : "";
  const location = response.headers.get("location") ?? "";
  // The approval screen's address, on its own or as the login's ?next=.
  const screen = location.startsWith("/login?") ? (new URLSearchParams(location.slice("/login?".length)).get("next") ?? "") : location;
  const rid = screen.startsWith("/settings/claude/approve?") ? new URLSearchParams(screen.split("?")[1]).get("r") : null;
  return { response, cookie: cookie || null, rid };
}

/** Claude's code exchange. `over` changes a field; null drops it. */
export function exchangeCode(
  db: PrismaClient,
  cfg: ConnectorConfig,
  input: { code: string; verifier: string; address: string; at: Date; over?: Record<string, string | null>; ipHash?: string; refused?: RefusalLog },
): Promise<Response> {
  const fields: Record<string, string | null> = {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    client_id: CLAUDE_CLIENT_ID,
    redirect_uri: CLAUDE_CALLBACK,
    resource: input.address,
    ...input.over,
  };
  const body = new URLSearchParams(Object.entries(fields).filter((e): e is [string, string] => e[1] !== null)).toString();
  const request = new Request(`${cfg.issuer}${TOKEN_PATH}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  return tokenEndpoint(request, { cfg, db, now: input.at, ipHash: input.ipHash ?? null, limit: allow, ...(input.refused ? { refused: input.refused } : {}) });
}

export interface Approved {
  /** The partner's connector address, and the key in it. */
  address: string;
  key: string;
  attempt: ClaudeAttempt;
  cookie: string;
  rid: string;
  /** The one-time code as Claude's callback received it. */
  code: string;
  connectionId: string;
  allowedAt: Date;
}

/**
 * Up to Allow: the partner copies their address at `at`, Claude's request
 * arrives in their signed-in browser 30 seconds later, and they tap Allow 30
 * seconds after that. Stops with the code in Claude's hands.
 */
export async function approveClaude(db: PrismaClient, cfg: ConnectorConfig, user: { id: string }, at: Date, opts: { clientId?: string; ipHash?: string } = {}): Promise<Approved> {
  const address = await connectAddress(db, cfg, user.id, at);
  const key = address ? keyOfResource(address, cfg) : null;
  if (!address || !key) throw new Error("sign-in fixture: no connector address for this user");
  const attempt = claudeAttempt();
  const opened = await openAuthorize(db, cfg, { url: authorizeUrl(cfg, address, attempt, opts.clientId ? { client_id: opts.clientId } : {}), at: plus(at, 30_000), viewer: user });
  if (!opened.cookie || !opened.rid) throw new Error(`sign-in fixture: the request was not parked (${opened.response.status})`);
  const allowedAt = plus(at, 60_000);
  const result: ApproveResult = await approveParked(db, cfg, { cookie: opened.cookie, rid: opened.rid, userId: user.id, now: allowedAt, ipHash: opts.ipHash ?? null });
  if (!result.ok) throw new Error(`sign-in fixture: Allow was refused (${result.why})`);
  const code = new URL(result.redirectTo).searchParams.get("code");
  if (!code) throw new Error("sign-in fixture: Allow sent no code");
  return { address, key, attempt, cookie: opened.cookie, rid: opened.rid, code, connectionId: result.connectionId, allowedAt };
}

export interface SignedIn extends Approved {
  tokens: TokenResponseBody;
  connectedAt: Date;
  /** The token endpoint's answer to the code exchange. Its body has been read into `tokens`. */
  response: Response;
}

/**
 * The whole sign-in, as a partner's browser and Claude run it: approveClaude,
 * then Claude's code exchange 5 seconds after Allow. The access token is good
 * for an hour from then, at `address` and nowhere else.
 */
export async function signInClaude(db: PrismaClient, cfg: ConnectorConfig, user: { id: string }, at: Date, opts: { clientId?: string; ipHash?: string } = {}): Promise<SignedIn> {
  const approved = await approveClaude(db, cfg, user, at, opts);
  const connectedAt = plus(approved.allowedAt, 5_000);
  const response = await exchangeCode(db, cfg, {
    code: approved.code,
    verifier: approved.attempt.verifier,
    address: approved.address,
    at: connectedAt,
    ...(opts.clientId ? { over: { client_id: opts.clientId } } : {}),
    ...(opts.ipHash ? { ipHash: opts.ipHash } : {}),
  });
  if (response.status !== 200) throw new Error(`sign-in fixture: the code exchange answered ${response.status}`);
  const tokens = (await response.json()) as TokenResponseBody;
  return { ...approved, tokens, connectedAt, response };
}
