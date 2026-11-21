import type { Prisma, PrismaClient } from "@prisma/client";
import { hashToken, isWellFormedToken, newToken } from "@/lib/portal/tokens";
import { safeEqual } from "@/lib/secrets";
import { issuedAfterPasswordChange } from "@/lib/session-token";
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  LAST_USED_EVERY_MS,
  REFRESH_GRACE_MS,
  REFRESH_TTL_MS,
  SCOPE,
  approvalCode,
  claudeAddressKey,
  codeRedirect,
  connectorAddress,
  errorRedirect,
  isOwnersAddress,
  keyOfResource,
  passwordEpoch,
  pendingStillValid,
  readParkedFor,
  rotatedTokens,
  storedAddress,
  verifyPkce,
  type ConnectorConfig,
  type PendingAuthorization,
  type Refusal,
  type RefusalDetail,
  type TokenError,
  type TokenPair,
  type TokenRequest,
  type TokenResponseBody,
} from "./oauth-core";

/**
 * The rows behind Claude's sign-in (docs/specs/tasks-from-claude.md, sections
 * 7.3 and 8): ClaudeConnection, OAuthToken, and a partner's connector address
 * on User (claudeKeyId, claudeKeyHash). Every function takes the database and
 * the clock, and touches no request, so oauth.pg.test.ts runs them on a
 * scratch database; oauth.ts (server-only) binds them to the app's client.
 *
 * The rules that hold everywhere here:
 *  - A code, access token or refresh token exists in the clear only in the
 *    answer that hands it to Claude. The table keeps its SHA-256. The same goes
 *    for a partner's address key: the User row keeps its hash, and a token row
 *    names its address by that hash (oauth-core.ts storedAddress), never by the
 *    key. No row a sign-in writes holds the key.
 *  - Each state change is one transaction that takes its locks in one order:
 *    the partner's User row first, then their connections, then their tokens.
 *    A call that starts from a token reads the token to learn whose it is,
 *    locks that User row, then reads the token again and decides from that
 *    second read alone. Two calls about one partner therefore run one after
 *    the other, and none can deadlock another. The second read sees what the
 *    first call committed because these transactions run at Postgres's default
 *    level, read committed.
 *  - What a code is bound to (client, return address, connector address,
 *    challenge) comes from its row. The request only has to match it.
 */

export type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

/** Who the request came from, for the audit log. */
export interface AuditContext {
  ipHash?: string | null;
}

type Cfg = ConnectorConfig;

/**
 * Takes a partner's row lock for the rest of the transaction. False when there
 * is no such user.
 *
 * NO KEY UPDATE, the way the task rows are locked (src/lib/tasks/core.ts): it
 * still makes every Claude transaction for one partner, and a password reset's
 * own write to the row, wait for each other. FOR UPDATE would also wait behind
 * any open transaction that inserted a row naming this partner (a task they
 * made, a reset link), because the foreign-key check on that insert holds a
 * key-share lock on the row. A long save would then fail Claude's refresh.
 *
 * `changesAddress` is for the two calls that write claudeKeyHash (Connect and
 * Disconnect). That column is unique, so their write needs the full FOR UPDATE
 * lock whatever is asked for here, and taking the weaker one first would mean
 * asking for more in the middle of the transaction, which is how two
 * transactions end up waiting on each other. They take the full lock up front.
 */
async function lockUser(tx: Tx, userId: string, opts: { changesAddress?: boolean } = {}): Promise<boolean> {
  const rows = opts.changesAddress
    ? await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    : await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
  return rows.length === 1;
}

// ---------------------------------------------------------------------------
// A partner's connector address
// ---------------------------------------------------------------------------

/** Who a connector address belongs to, as the authorize endpoint needs them. */
export interface KeyOwner {
  id: string;
  passwordChangedAt: Date | null;
}

/**
 * The partner whose current address carries this key, when they can sign in.
 * Null for a key nobody has, one Disconnect retired, and a login that is off.
 */
export async function ownerOfKey(db: Pick<Db, "user">, key: string): Promise<KeyOwner | null> {
  if (!isWellFormedToken(key)) return null;
  return db.user.findUnique({ where: { claudeKeyHash: hashToken(key), passwordHash: { not: null } }, select: { id: true, passwordChangedAt: true } });
}

/**
 * What makes a connection live, one Claude can still use: finished, not ended,
 * newer than the partner's last password change, and holding a refresh token
 * that is unspent, unexpired and issued for the partner's current address.
 * This is the query half; liveConnection judges the rest.
 */
const FINISHED = { revokedAt: null, connectedAt: { not: null } } as const satisfies Prisma.ClaudeConnectionWhereInput;
const usableRefreshToken = (now: Date) => ({ kind: "REFRESH", usedAt: null, expiresAt: { gt: now } }) as const satisfies Prisma.OAuthTokenWhereInput;

const finishedConnections = (now: Date) =>
  ({
    where: FINISHED,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      connectedAt: true,
      lastUsedAt: true,
      tokens: { where: usableRefreshToken(now), select: { resource: true } },
    },
  }) as const satisfies Prisma.User$claudeConnectionsArgs;

type ListedConnection = Prisma.ClaudeConnectionGetPayload<ReturnType<typeof finishedConnections>>;

function liveConnection(
  user: { passwordChangedAt: Date | null; claudeKeyHash: string | null; claudeConnections: ListedConnection[] },
  cfg: Pick<Cfg, "issuer">,
): ListedConnection | undefined {
  return user.claudeConnections.find(
    (c) => c.connectedAt && issuedAfterPasswordChange(c.createdAt.getTime(), user.passwordChangedAt) && c.tokens.some((t) => isOwnersAddress(t.resource, user, cfg)),
  );
}

/**
 * The partner's own connector address, made the first time they ask for it.
 * Asking again gives the same one: only Disconnect retires it. Null for
 * someone who can't sign in.
 *
 * The key is rebuilt from claudeKeyId and the secret. If SESSION_SECRET has
 * changed since, the rebuilt key no longer matches the stored hash and the old
 * address can't be shown again, so a new one is made, unless a live connection
 * still runs on the old one: then the answer is null, and Disconnect comes
 * first.
 */
export async function connectAddress(db: Db, cfg: Cfg, userId: string, now: Date): Promise<string | null> {
  return db.$transaction(async (tx) => {
    if (!(await lockUser(tx, userId, { changesAddress: true }))) return null;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, passwordChangedAt: true, claudeKeyId: true, claudeKeyHash: true, claudeConnections: finishedConnections(now) },
    });
    if (!user || user.passwordHash === null) return null;

    if (user.claudeKeyId && user.claudeKeyHash) {
      const key = claudeAddressKey(user.claudeKeyId, cfg.secret);
      if (safeEqual(hashToken(key), user.claudeKeyHash)) return connectorAddress(cfg, key);
    }
    if (liveConnection(user, cfg)) return null;

    const keyId = newToken();
    const key = claudeAddressKey(keyId, cfg.secret);
    await tx.user.update({ where: { id: userId }, data: { claudeKeyId: keyId, claudeKeyHash: hashToken(key) } });
    return connectorAddress(cfg, key);
  });
}

// ---------------------------------------------------------------------------
// Ending a connection
// ---------------------------------------------------------------------------

/** Why a connection ended, as SecurityEvent.data.reason records it. */
export type RevokeReason =
  /** A partner tapped Disconnect. */
  | "partner"
  /** The partner connected again: one connection each. */
  | "replaced"
  /** Claude gave its refresh token back (the revoke endpoint). */
  | "claude"
  /** A one-time code was presented a second time by a caller who passed every other check. */
  | "code-reuse"
  /** A refresh token was presented after it had been replaced, outside the short repeat allowance. */
  | "refresh-reuse"
  /** The partner reset their password, which signs them out everywhere. */
  | "password-reset"
  /** The partner's login was switched off, and Claude called while it was. */
  | "login-off";

interface EndedConnection {
  id: string;
  userId: string;
  connectedAt: Date | null;
}

/**
 * Ends these connections, deletes their tokens, and logs each one Claude had
 * finished connecting. Returns the ones that were live. The caller holds the
 * partner's row lock, so nothing else can make or change one of their
 * connections in between. `byUserId` is the partner who did it, when a partner
 * did.
 */
async function endConnections(tx: Tx, where: Prisma.ClaudeConnectionWhereInput, reason: RevokeReason, ctx: AuditContext & { now: Date }, byUserId: string | null = null): Promise<EndedConnection[]> {
  const live = await tx.claudeConnection.findMany({ where: { ...where, revokedAt: null }, orderBy: { id: "asc" }, select: { id: true, userId: true, connectedAt: true } });
  if (live.length === 0) return [];
  const ids = live.map((c) => c.id);
  await tx.claudeConnection.updateMany({ where: { id: { in: ids }, revokedAt: null }, data: { revokedAt: ctx.now, revokedByUserId: byUserId } });
  await tx.oAuthToken.deleteMany({ where: { connectionId: { in: ids } } });
  for (const c of live) {
    if (!c.connectedAt) continue;
    await tx.securityEvent.create({
      data: { kind: "CLAUDE_DISCONNECTED", userId: c.userId, ipHash: ctx.ipHash ?? null, data: { connectionId: c.id, reason, ...(byUserId ? { by: byUserId } : {}) } },
    });
  }
  return live;
}

/**
 * A partner's password was reset: their Claude ends with their sessions, in
 * the reset's own transaction (src/lib/portal/reset-core.ts saveStaffReset).
 * The address is kept, so their Claude only has to sign in again. Call it
 * after the User row is written, which is the lock every Allow, code swap and
 * refresh for that partner waits on: whichever of them commits first, no
 * connection made under the old password outlives the reset. Returns how many
 * finished connections ended.
 */
export async function endConnectionsForPasswordReset(tx: Tx, userId: string, now: Date, ctx: AuditContext = {}): Promise<number> {
  await lockUser(tx, userId);
  const ended = await endConnections(tx, { userId }, "password-reset", { ...ctx, now });
  return ended.filter((c) => c.connectedAt).length;
}

// ---------------------------------------------------------------------------
// Allow and Cancel
// ---------------------------------------------------------------------------

export type ApproveResult =
  | { ok: true; redirectTo: string; connectionId: string }
  /** The screen shows one line for every refusal ("expired"). `why` is for the logs and the tests. */
  | { ok: false; reason: "expired"; why: Refusal };

const OWNER_ROW = { name: true, email: true, passwordHash: true, passwordChangedAt: true, claudeKeyHash: true } as const satisfies Prisma.UserSelect;
type OwnerRow = Prisma.UserGetPayload<{ select: typeof OWNER_ROW }>;

/**
 * Why this partner can't approve this parked request right now, or null. Read
 * once for the screen, and read again under the partner's row lock for the
 * write: they can still sign in, the request's key is still their address
 * (Disconnect retires it), and their password hasn't been reset since the
 * request was parked.
 */
function ownerRefusal(owner: OwnerRow | null, pending: PendingAuthorization, cfg: Cfg): Refusal | null {
  if (!owner || owner.passwordHash === null) return "login-off";
  if (!owner.claudeKeyHash || !safeEqual(hashToken(pending.key), owner.claudeKeyHash)) return "unknown-address";
  if (!safeEqual(passwordEpoch(cfg.secret, pending.userId, owner.passwordChangedAt), pending.epoch)) return "password-changed";
  return null;
}

/** What the approval screen draws from, when a request is waiting that this partner may approve. */
export type ApprovalCheck = { ok: true; pending: PendingAuthorization; owner: { name: string | null; email: string } } | { ok: false; why: Refusal };

export interface ParkedInput {
  /** The parked-request cookie's value as this browser sent it. */
  cookie: string | undefined | null;
  /** The request id the screen's address or the button's form carried. */
  rid: unknown;
  userId: string;
  now: Date;
}

/** For the approval screen: is the request parked in this browser the one its address names, and this partner's to approve? Reads only. */
export async function readApproval(db: Pick<Db, "user">, cfg: Cfg, input: ParkedInput): Promise<ApprovalCheck> {
  const parked = readParkedFor(input.cookie, { cfg, rid: input.rid, userId: input.userId, now: input.now.getTime() });
  if (!parked.ok) return parked;
  const owner = await db.user.findUnique({ where: { id: input.userId }, select: OWNER_ROW });
  const why = ownerRefusal(owner, parked.pending, cfg);
  if (why || !owner) return { ok: false, why: why ?? "login-off" };
  return { ok: true, pending: parked.pending, owner: { name: owner.name, email: owner.email } };
}

/**
 * The partner tapped Allow. In one transaction, under their row lock: check
 * again that the request is theirs to approve, end their earlier connections,
 * make the new connection with its one-time code, and log it with the
 * approving browser's ipHash. The code goes back to Claude on the return
 * address; only its hash is kept.
 *
 * A parked request is approved once. The Allow's audit row keeps the SHA-256
 * of the request's id, and a second Allow for that id is refused whatever has
 * happened since. The code row alone can't say: it is deleted when the
 * connection ends and swept by the first refresh, and the code is made from
 * the request's id (approvalCode), so the same request approved again would
 * arm the same one-time code a second time. The app deletes no audit row.
 */
export async function approve(db: Db, cfg: Cfg, user: { id: string }, pending: PendingAuthorization, ctx: AuditContext & { now: Date }): Promise<ApproveResult> {
  const { now } = ctx;
  const no = (why: Refusal): ApproveResult => ({ ok: false, reason: "expired", why });
  if (pending.exp <= now.getTime() || pending.iat > now.getTime()) return no("expired");
  if (!pendingStillValid(pending, cfg)) return no("stale-request");
  if (!safeEqual(user.id, pending.userId)) return no("not-owner");
  const code = approvalCode(cfg.secret, pending.rid);
  const request = hashToken(pending.rid);

  return db.$transaction(async (tx): Promise<ApproveResult> => {
    if (!(await lockUser(tx, user.id))) return no("login-off");
    const why = ownerRefusal(await tx.user.findUnique({ where: { id: user.id }, select: OWNER_ROW }), pending, cfg);
    if (why) return no(why);
    // Under the lock, so two Allows for one request can't both find nothing. The code row is asked too: its hash is
    // unique, and a second row for it could never be written.
    const approvedBefore = await tx.securityEvent.findFirst({ where: { kind: "CLAUDE_CONNECTED", userId: user.id, data: { path: ["request"], equals: request } }, select: { id: true } });
    if (approvedBefore || (await tx.oAuthToken.findUnique({ where: { tokenHash: hashToken(code) }, select: { id: true } }))) return no("already-approved");

    await endConnections(tx, { userId: user.id }, "replaced", ctx, user.id);
    const connection = await tx.claudeConnection.create({ data: { userId: user.id, clientId: pending.clientId, createdAt: now }, select: { id: true } });
    await tx.oAuthToken.create({
      data: {
        connectionId: connection.id,
        kind: "CODE",
        tokenHash: hashToken(code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        codeChallenge: pending.codeChallenge,
        redirectUri: pending.redirectUri,
        resource: storedAddress(cfg, pending.key),
        createdAt: now,
      },
    });
    // Who approved, and from which browser. The code exchange logs its own row, but that call comes from Anthropic's server.
    await tx.securityEvent.create({
      data: { kind: "CLAUDE_CONNECTED", userId: user.id, ipHash: ctx.ipHash ?? null, data: { connectionId: connection.id, clientId: pending.clientId, step: "allowed", request } },
    });
    return { ok: true, redirectTo: codeRedirect(pending.redirectUri, code, pending.state), connectionId: connection.id };
  });
}

/** The Allow button, whole: the request parked in this browser, when it is the one the button names and this partner's, approved. */
export async function approveParked(db: Db, cfg: Cfg, input: ParkedInput & AuditContext): Promise<ApproveResult> {
  const parked = readParkedFor(input.cookie, { cfg, rid: input.rid, userId: input.userId, now: input.now.getTime() });
  if (!parked.ok) return { ok: false, reason: "expired", why: parked.why };
  return approve(db, cfg, { id: input.userId }, parked.pending, { now: input.now, ipHash: input.ipHash ?? null });
}

/**
 * The Cancel button: the address that tells Claude nothing was granted, only
 * for the request the button names and only for its own partner. Anything else
 * tells Claude nothing. Writes nothing either way.
 */
export function denyParked(cfg: Cfg, input: ParkedInput): { redirectTo: string } | { why: Refusal } {
  const parked = readParkedFor(input.cookie, { cfg, rid: input.rid, userId: input.userId, now: input.now.getTime() });
  if (!parked.ok) return { why: parked.why };
  return { redirectTo: errorRedirect(parked.pending.redirectUri, "access_denied", parked.pending.state) };
}

// ---------------------------------------------------------------------------
// The token endpoint
// ---------------------------------------------------------------------------

export type TokenResult =
  /** `repeat` is set when this is a refresh's first answer given a second time (refreshTokens), for the logs. */
  | { ok: true; body: TokenResponseBody; repeat?: RefusalDetail }
  /** `error` is all the caller is told. `reason` and `detail` go to the logs. */
  | { ok: false; error: TokenError; reason: Refusal; detail?: RefusalDetail };

const TOKEN_ROW = {
  id: true,
  kind: true,
  expiresAt: true,
  usedAt: true,
  codeChallenge: true,
  redirectUri: true,
  resource: true,
  connection: {
    select: {
      id: true,
      userId: true,
      clientId: true,
      createdAt: true,
      connectedAt: true,
      lastUsedAt: true,
      revokedAt: true,
      user: { select: { id: true, email: true, name: true, passwordHash: true, passwordChangedAt: true, claudeKeyHash: true } },
    },
  },
} as const satisfies Prisma.OAuthTokenSelect;

type TokenRow = Prisma.OAuthTokenGetPayload<{ select: typeof TOKEN_ROW }>;

function invalidGrant(reason: Refusal, c?: { id: string; userId: string }): TokenResult {
  return { ok: false, error: "invalid_grant", reason, ...(c ? { detail: { connectionId: c.id, userId: c.userId } } : {}) };
}

/**
 * Runs `decide` on a token's row with its partner's row lock held (the lock
 * order at the top of this file). The first read only finds out whose token it
 * is; `decide` gets the second, taken under the lock.
 */
async function underOwnersLock<T>(db: Db, tokenHash: string, missing: T, decide: (tx: Tx, row: TokenRow) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    const first = await tx.oAuthToken.findUnique({ where: { tokenHash }, select: { connection: { select: { userId: true } } } });
    if (!first) return missing;
    await lockUser(tx, first.connection.userId);
    const row = await tx.oAuthToken.findUnique({ where: { tokenHash }, select: TOKEN_ROW });
    return row ? decide(tx, row) : missing;
  });
}

/**
 * Was this connection made after its partner's last password change? The rule
 * that ends their browser sessions (src/lib/auth.ts). A reset also ends the
 * connection outright (endConnectionsForPasswordReset); this is the second
 * guard behind that.
 */
function madeAfterPasswordChange(c: TokenRow["connection"]): boolean {
  return issuedAfterPasswordChange(c.createdAt.getTime(), c.user.passwordChangedAt);
}

/**
 * A login that is switched off (its password cleared) loses its Claude for
 * good the first time Claude calls: without this the connection would only
 * pause, and come back by itself if the login were ever switched on again.
 * True when the login is off. The caller holds the partner's row lock.
 */
async function endedForLoginOff(tx: Tx, c: TokenRow["connection"], ctx: AuditContext & { now: Date }): Promise<boolean> {
  if (c.user.passwordHash !== null) return false;
  await endConnections(tx, { userId: c.userId }, "login-off", ctx);
  return true;
}

/** Writes a connection's access and refresh token rows, as hashes, and builds the answer that carries them. `resource` is the stored form (storedAddress), carried over from the row being swapped. */
async function issueTokens(tx: Tx, connectionId: string, resource: string, now: Date, pair: TokenPair): Promise<TokenResponseBody> {
  await tx.oAuthToken.createMany({
    data: [
      { connectionId, kind: "ACCESS", tokenHash: hashToken(pair.access), expiresAt: new Date(now.getTime() + ACCESS_TTL_MS), resource, createdAt: now },
      { connectionId, kind: "REFRESH", tokenHash: hashToken(pair.refresh), expiresAt: new Date(now.getTime() + REFRESH_TTL_MS), resource, createdAt: now },
    ],
  });
  return { access_token: pair.access, token_type: "Bearer", expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: pair.refresh, scope: SCOPE };
}

/**
 * A row's own address has to be its partner's current one, and a request's
 * `resource`, when it sent one, has to name that same address. The row keeps
 * the address by its key's hash, so the request's key is hashed to compare.
 */
function resourceMatches(requested: string | null, row: TokenRow, cfg: Cfg): row is TokenRow & { resource: string } {
  if (!isOwnersAddress(row.resource, row.connection.user, cfg)) return false;
  if (requested === null) return true;
  const key = keyOfResource(requested, cfg);
  return key !== null && safeEqual(storedAddress(cfg, key), row.resource);
}

/**
 * Swaps the one-time code for tokens. The code must be under a minute old and
 * on a live connection; the caller must be the client it was given to, name
 * the same return address and connector address when it names them, and hold
 * the PKCE verifier. Every refusal is `invalid_grant`.
 *
 * Single use comes last, on purpose. A caller who passes every check with a
 * code that was already swapped holds the verifier too, so two parties have
 * both, and the connection ends (OAuth 2.1 section 4.1.3). A spent code with
 * the wrong verifier, the wrong client or past its minute proves nothing of the
 * kind: the code alone crosses the partner's browser on its way to Claude, and
 * anyone who saw it there could otherwise disconnect them.
 */
export async function exchangeCode(db: Db, cfg: Cfg, request: Extract<TokenRequest, { grant: "authorization_code" }>, ctx: AuditContext & { now: Date }): Promise<TokenResult> {
  const { now } = ctx;
  if (!isWellFormedToken(request.code)) return invalidGrant("malformed");

  return underOwnersLock(db, hashToken(request.code), invalidGrant("unknown-code"), async (tx, row): Promise<TokenResult> => {
    if (row.kind !== "CODE") return invalidGrant("unknown-code");
    const c = row.connection;
    if (c.revokedAt) return invalidGrant("ended", c);
    if (row.expiresAt.getTime() <= now.getTime()) return invalidGrant("expired", c);
    if (await endedForLoginOff(tx, c, ctx)) return invalidGrant("owner-off", c);
    if (!madeAfterPasswordChange(c)) return invalidGrant("owner-off", c);
    if (request.clientId !== c.clientId) return invalidGrant("wrong-client", c);
    if (request.redirectUri !== null && request.redirectUri !== row.redirectUri) return invalidGrant("wrong-redirect", c);
    if (!resourceMatches(request.resource, row, cfg)) return invalidGrant("wrong-resource", c);
    if (!verifyPkce(request.codeVerifier, row.codeChallenge)) return invalidGrant("bad-pkce", c);

    const claimed = row.usedAt ? { count: 0 } : await tx.oAuthToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) {
      await endConnections(tx, { id: c.id }, "code-reuse", ctx);
      return invalidGrant("code-reuse", c);
    }
    await tx.claudeConnection.update({ where: { id: c.id }, data: { connectedAt: now } });
    const body = await issueTokens(tx, c.id, row.resource, now, { access: newToken(), refresh: newToken() });
    await tx.securityEvent.create({
      data: { kind: "CLAUDE_CONNECTED", userId: c.userId, ipHash: ctx.ipHash ?? null, data: { connectionId: c.id, clientId: c.clientId, step: "exchanged" } },
    });
    return { ok: true, body };
  });
}

/** Was a refresh token swapped so recently that it may still be repeated? Never when the allowance is 0. */
function justSwapped(usedAt: Date, now: Date, graceMs: number): boolean {
  return graceMs > 0 && now.getTime() - usedAt.getTime() < graceMs;
}

/**
 * The answer a refresh already gave, built again for a repeat: the same pair,
 * with the access token's time counted from its own row. Null when either half
 * is gone, has run out, or (the refresh token) has itself been swapped since,
 * which means the first answer did arrive and was used.
 */
async function sameAnswer(tx: Tx, connectionId: string, pair: TokenPair, now: Date): Promise<TokenResponseBody | null> {
  const select = { connectionId: true, kind: true, expiresAt: true, usedAt: true } as const;
  const access = await tx.oAuthToken.findUnique({ where: { tokenHash: hashToken(pair.access) }, select });
  const refresh = await tx.oAuthToken.findUnique({ where: { tokenHash: hashToken(pair.refresh) }, select });
  if (!access || access.connectionId !== connectionId || access.kind !== "ACCESS" || access.expiresAt.getTime() <= now.getTime()) return null;
  if (!refresh || refresh.connectionId !== connectionId || refresh.kind !== "REFRESH" || refresh.usedAt || refresh.expiresAt.getTime() <= now.getTime()) return null;
  const seconds = Math.max(1, Math.floor((access.expiresAt.getTime() - now.getTime()) / 1000));
  return { access_token: pair.access, token_type: "Bearer", expires_in: seconds, refresh_token: pair.refresh, scope: SCOPE };
}

/**
 * Swaps a refresh token for a new access token and a new refresh token; the
 * old one is spent. Every refusal is `invalid_grant`, which is what tells
 * Claude to stop retrying and ask the partner to reconnect.
 *
 * The new pair is made from the token presented (rotatedTokens), so a swap
 * that arrives twice can be answered twice. A spent token that comes back
 * within `refreshGraceMs` of its swap, from the same client, on a live
 * connection, while the pair it produced is still whole and unused, gets that
 * same pair again and nothing is written to the tables. The answer is marked
 * `repeat` so the endpoint writes a log line for it: inside the allowance a
 * second holder of the token gets the live pair too, and that line is the only
 * trace. Any other return of a spent token means two parties hold it: the
 * whole connection ends and the partner connects again (OAuth 2.1 section
 * 4.3.1).
 */
export async function refreshTokens(
  db: Db,
  cfg: Cfg,
  request: Extract<TokenRequest, { grant: "refresh_token" }>,
  ctx: AuditContext & { now: Date; refreshGraceMs?: number },
): Promise<TokenResult> {
  const { now } = ctx;
  const graceMs = ctx.refreshGraceMs ?? REFRESH_GRACE_MS;
  if (!isWellFormedToken(request.refreshToken)) return invalidGrant("malformed");
  const next = rotatedTokens(cfg.secret, request.refreshToken);

  return underOwnersLock(db, hashToken(request.refreshToken), invalidGrant("unknown-token"), async (tx, row): Promise<TokenResult> => {
    if (row.kind !== "REFRESH") return invalidGrant("unknown-token");
    const c = row.connection;
    if (c.revokedAt) return invalidGrant("ended", c);
    if (await endedForLoginOff(tx, c, ctx)) return invalidGrant("owner-off", c);
    const sameClient = request.clientId === null || request.clientId === c.clientId;
    const sameAddress = resourceMatches(request.resource, row, cfg);

    if (row.usedAt) {
      if (justSwapped(row.usedAt, now, graceMs) && sameClient && sameAddress && madeAfterPasswordChange(c)) {
        const again = await sameAnswer(tx, c.id, next, now);
        if (again) return { ok: true, body: again, repeat: { connectionId: c.id, userId: c.userId } };
      }
      await endConnections(tx, { id: c.id }, "refresh-reuse", ctx);
      return invalidGrant("refresh-reuse", c);
    }

    if (!c.connectedAt) return invalidGrant("not-connected", c);
    if (row.expiresAt.getTime() <= now.getTime()) return invalidGrant("expired", c);
    if (!madeAfterPasswordChange(c)) return invalidGrant("owner-off", c);
    if (!sameClient) return invalidGrant("wrong-client", c);
    if (!sameAddress) return invalidGrant("wrong-resource", c);

    const claimed = await tx.oAuthToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) {
      await endConnections(tx, { id: c.id }, "refresh-reuse", ctx);
      return invalidGrant("refresh-reuse", c);
    }
    // Rows past their time are of no use to anyone, except spent refresh tokens: a replay of one is how a second
    // holder is noticed, however long ago it was swapped, so those stay until the connection itself ends.
    await tx.oAuthToken.deleteMany({ where: { connectionId: c.id, expiresAt: { lt: now }, NOT: { kind: "REFRESH", usedAt: { not: null } } } });
    return { ok: true, body: await issueTokens(tx, c.id, row.resource, now, next) };
  });
}

/** What a revoke call did. The caller is never told; the logs are. */
export type RevokeOutcome = { did: "ended-connection" | "ended-access-token" } | { did: "nothing"; reason: Refusal; detail?: RefusalDetail };

/**
 * The revoke endpoint (RFC 7009). A live refresh token ends its connection:
 * that is Claude saying the partner removed the connector. An access token
 * only ends itself. Anything else does nothing, and the caller can't tell
 * which happened.
 *
 * A refresh token that was already swapped ends nothing, even inside the 60
 * seconds in which the token endpoint would still repeat its answer
 * (refreshTokens). A client that tidies up the token it just rotated out must
 * not disconnect a partner whose Claude is working, and nothing here can tell
 * that case from a swap whose answer was lost.
 */
export async function revokeToken(db: Db, token: string, clientId: string | null, ctx: AuditContext & { now: Date }): Promise<RevokeOutcome> {
  const { now } = ctx;
  const nothing = (reason: Refusal, c?: { id: string; userId: string }): RevokeOutcome => ({ did: "nothing", reason, ...(c ? { detail: { connectionId: c.id, userId: c.userId } } : {}) });
  if (!isWellFormedToken(token)) return nothing("malformed");

  return underOwnersLock(db, hashToken(token), nothing("unknown-token"), async (tx, row): Promise<RevokeOutcome> => {
    const c = row.connection;
    if (c.revokedAt) return nothing("ended", c);
    if (clientId !== null && clientId !== c.clientId) return nothing("wrong-client", c);
    if (row.kind === "ACCESS") {
      await tx.oAuthToken.deleteMany({ where: { id: row.id } });
      return { did: "ended-access-token" };
    }
    if (row.kind === "REFRESH" && !row.usedAt && row.expiresAt.getTime() > now.getTime()) {
      await endConnections(tx, { id: c.id }, "claude", ctx);
      return { did: "ended-connection" };
    }
    // A code, or a refresh token that has run out or was already swapped, is not a way to end anything.
    return nothing("spent", c);
  });
}

// ---------------------------------------------------------------------------
// The bearer check
// ---------------------------------------------------------------------------

/** Who a valid access token stands for. Never the password hash. */
export interface VerifiedAccess {
  user: { id: string; email: string; name: string | null };
  connection: { id: string; userId: string; clientId: string; createdAt: Date; connectedAt: Date; lastUsedAt: Date | null };
}

export type AccessCheck = { ok: true; access: VerifiedAccess } | { ok: false; reason: Refusal | "no-token"; detail?: RefusalDetail };

/**
 * The bearer check behind /api/mcp/<key>, with the reason when it says no.
 * `pathKey` is the key in the address the call came to: the token has to have
 * been issued for exactly that address, and the address has to be its
 * partner's current one, so a token never works at the other partner's
 * address or at one Disconnect retired. The rest is as it reads: unexpired,
 * an access token, on a finished connection nobody ended, whose partner can
 * still sign in and hasn't changed their password since. Marks the connection
 * used, at most once a minute.
 */
export async function checkAccessToken(db: Db, cfg: Cfg, token: string | null | undefined, pathKey: string, now: Date): Promise<AccessCheck> {
  if (!isWellFormedToken(token) || !isWellFormedToken(pathKey)) return { ok: false, reason: "no-token" };
  const row = await db.oAuthToken.findUnique({ where: { tokenHash: hashToken(token) }, select: TOKEN_ROW });
  if (!row || row.kind !== "ACCESS") return { ok: false, reason: "unknown-token" };
  const c = row.connection;
  const no = (reason: Refusal): AccessCheck => ({ ok: false, reason, detail: { connectionId: c.id, userId: c.userId } });
  if (row.expiresAt.getTime() <= now.getTime()) return no("expired");
  if (row.resource !== storedAddress(cfg, pathKey) || !isOwnersAddress(row.resource, c.user, cfg)) return no("wrong-address");
  if (c.revokedAt || !c.connectedAt) return no("ended");
  if (c.user.passwordHash === null) {
    await db.$transaction(async (tx) => {
      await lockUser(tx, c.userId);
      const owner = await tx.user.findUnique({ where: { id: c.userId }, select: { passwordHash: true } });
      if (owner && owner.passwordHash === null) await endConnections(tx, { userId: c.userId }, "login-off", { now });
    });
    return no("owner-off");
  }
  if (!madeAfterPasswordChange(c)) return no("owner-off");

  let lastUsedAt = c.lastUsedAt;
  const stale = new Date(now.getTime() - LAST_USED_EVERY_MS);
  if (!lastUsedAt || lastUsedAt.getTime() <= stale.getTime()) {
    // One statement on its own, holding nothing else while it waits: it can't be part of a deadlock, so it takes no User lock.
    await db.claudeConnection.updateMany({ where: { id: c.id, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: stale } }] }, data: { lastUsedAt: now } });
    lastUsedAt = now;
  }
  return {
    ok: true,
    access: {
      user: { id: c.user.id, email: c.user.email, name: c.user.name },
      connection: { id: c.id, userId: c.userId, clientId: c.clientId, createdAt: c.createdAt, connectedAt: c.connectedAt, lastUsedAt },
    },
  };
}

/** The partner and connection behind an access token presented at /api/mcp/<pathKey>, or null (checkAccessToken). */
export async function verifyAccessTokenValue(db: Db, cfg: Cfg, token: string | null | undefined, pathKey: string, now: Date): Promise<VerifiedAccess | null> {
  const check = await checkAccessToken(db, cfg, token, pathKey, now);
  return check.ok ? check.access : null;
}

// ---------------------------------------------------------------------------
// Settings › Claude
// ---------------------------------------------------------------------------

/** One row of Settings › Claude: a partner, and their Claude when it's connected. */
export interface ConnectionRow {
  userId: string;
  name: string | null;
  email: string;
  /** Null: not connected. */
  connection: { id: string; connectedAt: Date; lastUsedAt: Date | null } | null;
}

/**
 * Every partner who can sign in, by name, with their live connection
 * (liveConnection). A connection no token can use any more, because its
 * refresh token ran out or the app's address changed, reads as not connected,
 * so the row offers Connect again. Needs only the app's origin, not the flag:
 * Settings lists the rows while the connector is switched off too.
 */
export async function listConnections(db: Pick<Db, "user">, cfg: Pick<Cfg, "issuer">, now: Date): Promise<ConnectionRow[]> {
  const users = await db.user.findMany({
    where: { passwordHash: { not: null } },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, passwordChangedAt: true, claudeKeyHash: true, claudeConnections: finishedConnections(now) },
  });
  return users.map((u) => {
    const live = liveConnection(u, cfg);
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      connection: live?.connectedAt ? { id: live.id, connectedAt: live.connectedAt, lastUsedAt: live.lastUsedAt } : null,
    };
  });
}

/**
 * Does any partner have a live connection (liveConnection)? Settings asks this
 * for every tab while the connector is switched off, to decide whether the
 * Claude tab still shows, so the usual answer, nobody, costs one small query
 * that reads no user: is there a finished connection nobody ended that still
 * holds a refresh token Claude could use? Only when there is one does the
 * whole rule run (listConnections), which also holds it to its partner's
 * login, password date and current address.
 */
export async function anyLiveConnection(db: Pick<Db, "user" | "claudeConnection">, cfg: Pick<Cfg, "issuer">, now: Date): Promise<boolean> {
  const candidate = await db.claudeConnection.findFirst({ where: { ...FINISHED, tokens: { some: usableRefreshToken(now) } }, select: { id: true } });
  if (!candidate) return false;
  return (await listConnections(db, cfg, now)).some((row) => row.connection !== null);
}

export type DisconnectResult =
  /** `revoked` is how many finished connections ended: 0 when there was nothing to end. */
  | { ok: true; userId: string; name: string | null; revoked: number }
  /** No such partner or connection. */
  | { ok: false };

/**
 * A partner tapped Disconnect, on their own row or the other partner's. Under
 * that partner's row lock: ends every connection they have, the one still
 * waiting for Claude included, retires their address, and logs it with who did
 * it. The old address then answers 401 for good and its sign-in gets the
 * wrong-address page; Connect makes a new one.
 */
export async function disconnect(db: Db, target: { userId: string } | { connectionId: string }, byUser: { id: string }, ctx: AuditContext & { now: Date }): Promise<DisconnectResult> {
  return db.$transaction(async (tx): Promise<DisconnectResult> => {
    const userId = "userId" in target ? target.userId : (await tx.claudeConnection.findUnique({ where: { id: target.connectionId }, select: { userId: true } }))?.userId;
    if (!userId || !(await lockUser(tx, userId, { changesAddress: true }))) return { ok: false };
    const ended = await endConnections(tx, { userId }, "partner", ctx, byUser.id);
    const owner = await tx.user.update({ where: { id: userId }, data: { claudeKeyId: null, claudeKeyHash: null }, select: { id: true, name: true } });
    return { ok: true, userId: owner.id, name: owner.name, revoked: ended.filter((c) => c.connectedAt).length };
  });
}
