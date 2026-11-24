import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { makeClient } from "@/lib/db-client";
import { hashToken, isWellFormedToken } from "@/lib/portal/tokens";
import { scratchRows } from "@/lib/scratch-rows";
import {
  anyLiveConnection,
  approve,
  approveParked,
  checkAccessToken,
  connectAddress,
  denyParked,
  disconnect,
  endConnectionsForPasswordReset,
  listConnections,
  ownerOfKey,
  readApproval,
  verifyAccessTokenValue,
  type ParkedInput,
} from "./connections-core";
import { AUTHORIZE_REFUSED, AUTHORIZE_WRONG_ADDRESS, revokeEndpoint, tokenEndpoint, unauthorizedEndpoint, type RateResult } from "./endpoints-core";
import {
  ACCESS_TTL_MS,
  CLAUDE_CALLBACK,
  CLAUDE_CLIENT_ID,
  CODE_TTL_MS,
  FALLBACK_CLIENT_ID,
  LAST_USED_EVERY_MS,
  PENDING_TTL_MS,
  REFRESH_GRACE_MS,
  REFRESH_TTL_MS,
  REVOKE_PATH,
  SCOPE,
  TOKEN_PATH,
  claudeAddressKey,
  connectorAddress,
  connectorConfigFor,
  keyOfResource,
  readPending,
  storedAddress,
  type ConnectorConfig,
  type Refusal,
  type RefusalDetail,
  type TokenResponseBody,
} from "./oauth-core";
import { approveClaude, authorizeUrl, claudeAttempt, exchangeCode, openAuthorize, signInClaude } from "./sign-in-fixture";

/**
 * Sign-in for Claude (docs/specs/tasks-from-claude.md, sections 7.3 and 8) on
 * a real Postgres through the app's driver: the whole flow from a partner's
 * own connector address to a working access token, and every way it is meant
 * to fail. Driven through the same Request-in, Response-out functions the
 * routes call (sign-in-fixture.ts runs the steps).
 *
 * Opt-in like reset.pg.test.ts, by the same guard: `npm test` skips it unless
 * HG_SCRATCH_DATABASE_URL names a local scratch database (its name must
 * contain "scratch"). It writes rows there and deletes them when it finishes
 * (scratch-rows.ts).
 *
 *   HG_SCRATCH_DATABASE_URL=postgresql://<you>@localhost:5432/<name>_scratch npx tsx --test src/lib/claude/oauth.pg.test.ts
 */

const URL_ENV = process.env.HG_SCRATCH_DATABASE_URL ?? "";

/** A database on this machine whose name says scratch, parsed whole (job-batch.pg.test.ts's rule). */
function isLocalScratch(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "postgresql:" &&
    url.username !== "" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    (url.port === "" || url.port === "5432") &&
    /^\/[a-z0-9_]*scratch[a-z0-9_]*$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}
const skip = isLocalScratch(URL_ENV) ? false : "set HG_SCRATCH_DATABASE_URL to a local scratch database to run this";
const timeout = 30_000;

const SECRET = "scratch-secret-scratch-secret-scratch!!";
const cfg: ConnectorConfig = connectorConfigFor("https://app.example.test", SECRET);
const allow = (): RateResult => ({ ok: true });
/** The partner's browser, and Anthropic's server: the two places a sign-in's calls come from. */
const BROWSER_IP = "ip-hash-of-the-browser";
const CLAUDE_IP = "ip-hash-of-claude";

let prisma: PrismaClient;
/** What this run makes, deleted when it finishes so the scratch database stays as it was (scratch-rows.ts). A partner's
 * connections and tokens go with the partner. */
const made = scratchRows(() => prisma);
let run: string;

before(async () => {
  if (skip) return;
  prisma = makeClient({ DATABASE_URL: URL_ENV });
  await made.takeTurn(URL_ENV);
  run = randomUUID().slice(0, 8);
});

after(async () => {
  if (skip) return;
  await made.remove();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Helpers: a partner, and Claude's side of the flow
// ---------------------------------------------------------------------------

/** Every test gets its own partners and its own day on the clock, so none depends on another's rows or on today's date. */
let clock = Date.parse("2026-11-20T15:00:00Z");
function nextDay(): Date {
  clock += 100 * 24 * 3_600_000;
  return new Date(clock);
}
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const DAY = 24 * 3_600_000;

async function partner(name: string, opts: { passwordHash?: string | null; passwordChangedAt?: Date | null } = {}) {
  return made.user({
    email: `${name}-${run}-${randomUUID().slice(0, 6)}@example.test`,
    name,
    passwordHash: opts.passwordHash === undefined ? "salt.hash" : opts.passwordHash,
    passwordChangedAt: opts.passwordChangedAt ?? null,
  });
}

/** Every reason a call was turned away for, as the logs would get it. */
function refusals() {
  const seen: { reason: Refusal; detail?: RefusalDetail }[] = [];
  return { seen, reasons: () => seen.map((s) => s.reason), log: (reason: Refusal, detail?: RefusalDetail) => void seen.push(detail ? { reason, detail } : { reason }) };
}
type Said = ReturnType<typeof refusals>;

function tokenCall(fields: Record<string, string>, at: Date, over: { cfg?: ConnectorConfig | null; said?: Said; refreshGraceMs?: number } = {}): Promise<Response> {
  const request = new Request(`${cfg.issuer}${TOKEN_PATH}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
  return tokenEndpoint(request, {
    cfg: over.cfg === undefined ? cfg : over.cfg,
    db: prisma,
    now: at,
    ipHash: CLAUDE_IP,
    limit: allow,
    ...(over.said ? { refused: over.said.log } : {}),
    ...(over.refreshGraceMs === undefined ? {} : { refreshGraceMs: over.refreshGraceMs }),
  });
}

/** Claude's code exchange for one sign-in. `over` changes a field; null drops it. */
function exchange(a: { code: string; attempt: { verifier: string }; address: string }, at: Date, over: Record<string, string | null> = {}, said?: Said): Promise<Response> {
  return exchangeCode(prisma, cfg, { code: a.code, verifier: a.attempt.verifier, address: a.address, at, over, ipHash: CLAUDE_IP, ...(said ? { refused: said.log } : {}) });
}

function refresh(refreshToken: string, address: string, at: Date, over: Record<string, string> = {}, opts: { said?: Said; refreshGraceMs?: number } = {}): Promise<Response> {
  return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CLAUDE_CLIENT_ID, resource: address, ...over }, at, opts);
}

async function invalidGrant(res: Response): Promise<void> {
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid_grant" });
  assert.equal(res.headers.get("cache-control"), "no-store");
}

const tokensOf = async (res: Response): Promise<TokenResponseBody> => {
  assert.equal(res.status, 200);
  return (await res.json()) as TokenResponseBody;
};

/** Up to Allow, from the partner's browser. */
const approved = (user: { id: string }, at: Date, clientId?: string) => approveClaude(prisma, cfg, user, at, { ipHash: BROWSER_IP, ...(clientId ? { clientId } : {}) });
/** The whole sign-in. */
const connected = (user: { id: string }, at: Date) => signInClaude(prisma, cfg, user, at);

/** A partner's own address and the key in it, made if they have none. */
async function addressOf(user: { id: string }, at: Date): Promise<{ address: string; key: string }> {
  const address = await connectAddress(prisma, cfg, user.id, at);
  const key = address ? keyOfResource(address, cfg) : null;
  assert.ok(address && key);
  return { address, key };
}

/** Claude's request for an address arrives in a browser where `viewer` is signed in (or nobody is). */
const open = (address: string, at: Date, viewer: { id: string } | null, said?: Said) =>
  openAuthorize(prisma, cfg, { url: authorizeUrl(cfg, address, claudeAttempt()), at, viewer, ...(said ? { refused: said.log } : {}) });

/**
 * Runs `racers` while this test holds a lock on one row, and lets go only once
 * `waiting` of them are stopped at their own write to it. Each has by then
 * read the row as it was, so what happens next is decided by the write alone:
 * the single-use claim, and nothing about who happened to arrive first.
 */
async function whileRowLocked<T>(lock: Prisma.Sql, waiting: number, racers: () => Promise<T>): Promise<T> {
  let letGo = () => {};
  const held = new Promise<void>((resolve) => (letGo = resolve));
  let lockTaken = () => {};
  const taken = new Promise<void>((resolve) => (lockTaken = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(lock);
      lockTaken();
      await held;
    },
    { timeout: 20_000 },
  );
  await taken;
  const racing = racers();
  try {
    await untilWaiting(waiting);
  } finally {
    letGo();
    await holder;
  }
  return racing;
}

/** Waits until `n` calls are stopped behind a row lock, or two seconds have passed. The first one in line waits on the holder's transaction, the rest on the row behind it. */
async function untilWaiting(n: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted AND locktype IN ('transactionid', 'tuple')`;
    if (waiting >= n) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Runs `during` while another transaction is open that has inserted a row
 * naming this partner (a reset link here; a task they made does the same).
 * The insert's foreign-key check holds a key-share lock on the partner's row
 * until that transaction ends, which is how a long save_drafts or bulk edit
 * holds one. `during` gets the open transaction, to act inside it. The row is
 * rolled back.
 */
async function whileRowReferenced<T>(userId: string, during: (holder: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const rolledBack = new Error("rolled back on purpose");
  let result: { value: T } | null = null;
  await prisma
    .$transaction(
      async (tx) => {
        await tx.passwordResetToken.create({ data: { userId, tokenHash: `lock-test-${randomUUID()}`, expiresAt: new Date(Date.now() + 60_000) } });
        result = { value: await during(tx) };
        throw rolledBack;
      },
      { timeout: 20_000 },
    )
    .catch((err: unknown) => {
      if (err !== rolledBack) throw err;
    });
  return (result as { value: T } | null)!.value;
}

/** A call's answer when it comes within two seconds, or "waited". */
async function soon<T>(call: Promise<T>): Promise<T | "waited"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"waited">((resolve) => (timer = setTimeout(() => resolve("waited"), 2_000)));
  try {
    return await Promise.race([call, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The bearer check /api/mcp/<key> runs for a call to that key's address. */
const verify = (token: string | null, key: string, at: Date) => verifyAccessTokenValue(prisma, cfg, token, key, at);
/** The same check with its reason, and the answer the route gives when it says no. */
async function turnedAway(token: string, key: string, at: Date): Promise<Refusal | "no-token" | null> {
  const check = await checkAccessToken(prisma, cfg, token, key, at);
  if (check.ok) return null;
  const res = unauthorizedEndpoint(cfg, key, new Headers({ authorization: `Bearer ${token}` }));
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate") ?? "", /^Bearer error="invalid_token", resource_metadata="/);
  return check.reason;
}
const connection = (id: string) => prisma.claudeConnection.findUniqueOrThrow({ where: { id } });
const liveConnections = (userId: string) => prisma.claudeConnection.count({ where: { userId, revokedAt: null } });
const events = (userId: string) => prisma.securityEvent.findMany({ where: { userId, kind: { in: ["CLAUDE_CONNECTED", "CLAUDE_DISCONNECTED"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
/** Each event as [kind, its step or its reason]. */
const trail = async (userId: string) => (await events(userId)).map((e) => [e.kind, (e.data as { step?: string; reason?: string }).step ?? (e.data as { reason?: string }).reason ?? null]);
const userRow = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
/** Everything sign-in could have written for a partner. */
const written = async (userId: string) => ({
  connections: await prisma.claudeConnection.count({ where: { userId } }),
  tokens: await prisma.oAuthToken.count({ where: { connection: { userId } } }),
  events: (await events(userId)).length,
});
const NOTHING = { connections: 0, tokens: 0, events: 0 };

// ---------------------------------------------------------------------------
// A partner's own address
// ---------------------------------------------------------------------------

test("a partner's address is made once, kept as a hash, and is theirs alone", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const off = await partner("Off", { passwordHash: null });
  const t0 = nextDay();
  assert.deepEqual([pieter.claudeKeyId, pieter.claudeKeyHash], [null, null], "nobody has one until they ask");

  const address = await connectAddress(prisma, cfg, pieter.id, t0);
  assert.ok(address);
  const key = keyOfResource(address, cfg);
  assert.ok(key && isWellFormedToken(key));
  assert.equal(address, `https://app.example.test/api/mcp/${key}`);
  // Asking again gives the same one.
  assert.equal(await connectAddress(prisma, cfg, pieter.id, plus(t0, 60_000)), address);
  assert.equal(await connectAddress(prisma, cfg, pieter.id, plus(t0, DAY)), address);

  // The key itself is never stored: an id it is rebuilt from, and its SHA-256.
  const row = await userRow(pieter.id);
  assert.ok(row.claudeKeyId);
  assert.equal(row.claudeKeyHash, hashToken(key));
  assert.equal(claudeAddressKey(row.claudeKeyId, SECRET), key);
  assert.ok(!JSON.stringify(row).includes(key));

  assert.deepEqual(await ownerOfKey(prisma, key), { id: pieter.id, passwordChangedAt: null });
  const theirs = await addressOf(connor, t0);
  assert.notEqual(theirs.key, key);
  assert.equal((await ownerOfKey(prisma, theirs.key))?.id, connor.id);
  assert.equal(await ownerOfKey(prisma, randomBytes(32).toString("base64url")), null);
  assert.equal(await ownerOfKey(prisma, "short"), null);

  // Nobody who can't sign in gets one.
  assert.equal(await connectAddress(prisma, cfg, off.id, t0), null);
  assert.equal(await connectAddress(prisma, cfg, "no-such-user", t0), null);
  assert.equal((await userRow(off.id)).claudeKeyHash, null);
});

test("after the secret changes an address that can't be shown again is replaced, unless a connection still runs on it", { skip, timeout }, async () => {
  const rotated = connectorConfigFor("https://app.example.test", "another-secret-another-secret-another!!");
  const idle = await partner("Pieter");
  const t0 = nextDay();
  const before = await addressOf(idle, t0);
  const after = await connectAddress(prisma, rotated, idle.id, plus(t0, 1_000));
  assert.ok(after);
  assert.notEqual(after, before.address);
  assert.equal((await userRow(idle.id)).claudeKeyHash, hashToken(keyOfResource(after, rotated) ?? ""));
  assert.equal(await connectAddress(prisma, rotated, idle.id, plus(t0, 2_000)), after);

  const busy = await partner("Connor");
  const c = await connected(busy, nextDay());
  const hash = (await userRow(busy.id)).claudeKeyHash;
  assert.equal(await connectAddress(prisma, rotated, busy.id, plus(c.connectedAt, 1_000)), null, "Disconnect comes first");
  assert.equal((await userRow(busy.id)).claudeKeyHash, hash, "the running connection's address is left alone");
});

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

test("the partner's address, Allow and Claude's code exchange end in a working access token", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const t0 = nextDay();
  const a = await approved(pieter, t0);
  const connectedAt = plus(a.allowedAt, 5_000);
  const response = await exchange(a, connectedAt);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  const tokens = await tokensOf(response);
  assert.deepEqual(Object.keys(tokens).sort(), ["access_token", "expires_in", "refresh_token", "scope", "token_type"]);
  assert.equal(tokens.token_type, "Bearer");
  assert.equal(tokens.expires_in, 3600);
  assert.equal(tokens.scope, SCOPE);
  assert.notEqual(tokens.access_token, tokens.refresh_token);

  // The connection: made at Allow, connected when the code was swapped.
  const row = await connection(a.connectionId);
  assert.equal(row.userId, pieter.id);
  assert.equal(row.clientId, CLAUDE_CLIENT_ID);
  assert.equal(row.createdAt.getTime(), a.allowedAt.getTime());
  assert.equal(row.connectedAt?.getTime(), connectedAt.getTime());
  assert.equal(row.revokedAt, null);

  // Nothing is stored in the clear: three rows, each the SHA-256 of what Claude holds, each naming this partner's
  // address by its key's hash.
  const rows = await prisma.oAuthToken.findMany({ where: { connectionId: a.connectionId }, orderBy: { kind: "asc" } });
  assert.deepEqual(rows.map((r) => r.kind), ["CODE", "ACCESS", "REFRESH"]);
  assert.deepEqual(rows.map((r) => r.tokenHash).sort(), [hashToken(a.code), hashToken(tokens.access_token), hashToken(tokens.refresh_token)].sort());
  const address = `https://app.example.test/api/mcp/sha256:${hashToken(a.key)}`;
  assert.equal(storedAddress(cfg, a.key), address);
  assert.deepEqual(rows.map((r) => r.resource), [address, address, address]);
  const stored = JSON.stringify(rows);
  for (const secret of [a.code, tokens.access_token, tokens.refresh_token, a.attempt.verifier, a.key]) assert.ok(!stored.includes(secret));
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
  assert.equal(byKind.CODE.expiresAt.getTime(), a.allowedAt.getTime() + CODE_TTL_MS);
  assert.equal(byKind.CODE.usedAt?.getTime(), connectedAt.getTime());
  assert.equal(byKind.ACCESS.expiresAt.getTime(), connectedAt.getTime() + ACCESS_TTL_MS);
  assert.equal(byKind.REFRESH.expiresAt.getTime(), connectedAt.getTime() + REFRESH_TTL_MS);

  // Two audit rows: the Allow, from the partner's own browser, with the hash of the request it approved, and the
  // swap, from Anthropic's server.
  assert.deepEqual(
    (await events(pieter.id)).map((e) => [e.kind, e.data, e.ipHash]),
    [
      ["CLAUDE_CONNECTED", { connectionId: a.connectionId, clientId: CLAUDE_CLIENT_ID, step: "allowed", request: hashToken(a.rid) }, BROWSER_IP],
      ["CLAUDE_CONNECTED", { connectionId: a.connectionId, clientId: CLAUDE_CLIENT_ID, step: "exchanged" }, CLAUDE_IP],
    ],
  );

  // The bearer check /api/mcp/<key> runs.
  const first = plus(connectedAt, 1_000);
  const who = await verify(tokens.access_token, a.key, first);
  assert.deepEqual(who?.user, { id: pieter.id, email: pieter.email, name: "Pieter" });
  assert.equal(who?.connection.id, a.connectionId);
  assert.equal(who?.connection.lastUsedAt?.getTime(), first.getTime());
  assert.equal("passwordHash" in (who?.user ?? {}), false);

  // Used: written at most once a minute.
  await verify(tokens.access_token, a.key, plus(first, LAST_USED_EVERY_MS - 1));
  assert.equal((await connection(a.connectionId)).lastUsedAt?.getTime(), first.getTime());
  await verify(tokens.access_token, a.key, plus(first, LAST_USED_EVERY_MS));
  assert.equal((await connection(a.connectionId)).lastUsedAt?.getTime(), first.getTime() + LAST_USED_EVERY_MS);

  // Only an access token is a bearer token, and only until its hour is up.
  assert.equal(await verify(tokens.refresh_token, a.key, first), null);
  assert.equal(await verify(a.code, a.key, first), null);
  assert.equal(await verify(null, a.key, first), null);
  assert.equal(await verify("not-a-token", a.key, first), null);
  assert.ok(await verify(tokens.access_token, a.key, plus(connectedAt, ACCESS_TTL_MS - 1)));
  assert.equal(await verify(tokens.access_token, a.key, plus(connectedAt, ACCESS_TTL_MS)), null);
  // A token for this app's address is no token for the app at another one.
  assert.equal(await verifyAccessTokenValue(prisma, connectorConfigFor("https://moved.example.test", SECRET), tokens.access_token, a.key, first), null);
});

test("the fixed fallback client id connects the same way, and tokens stay with the client that got them", { skip, timeout }, async () => {
  const connor = await partner("Connor");
  const a = await approved(connor, nextDay(), FALLBACK_CLIENT_ID);

  // The code was given to the fallback client; Claude's published identity can't redeem it.
  await invalidGrant(await exchange(a, plus(a.allowedAt, 5_000)));
  const tokens = await tokensOf(await exchange(a, plus(a.allowedAt, 6_000), { client_id: FALLBACK_CLIENT_ID }));
  await invalidGrant(await refresh(tokens.refresh_token, a.address, plus(a.allowedAt, 60_000), { client_id: CLAUDE_CLIENT_ID }));
  assert.equal((await refresh(tokens.refresh_token, a.address, plus(a.allowedAt, 61_000), { client_id: FALLBACK_CLIENT_ID })).status, 200);
});

test("no row a sign-in writes holds the partner's address key, or anything else Claude or the browser held", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  // Everything a connection goes through: Allow, the swap, a refresh, a repeat of it, a second sign-in over the first,
  // a refresh token handed back, and a Disconnect.
  const first = await connected(pieter, nextDay());
  const at = plus(first.connectedAt, 60_000);
  const next = await tokensOf(await refresh(first.tokens.refresh_token, first.address, at));
  await tokensOf(await refresh(first.tokens.refresh_token, first.address, plus(at, 1_000)));
  const everyRow = async () =>
    JSON.stringify({
      user: await userRow(pieter.id),
      connections: await prisma.claudeConnection.findMany({ where: { userId: pieter.id } }),
      tokens: await prisma.oAuthToken.findMany({ where: { connection: { userId: pieter.id } } }),
      events: await prisma.securityEvent.findMany({ where: { userId: pieter.id } }),
    });
  const held = (c: Awaited<ReturnType<typeof connected>>) => ({ key: c.key, address: c.address, code: c.code, verifier: c.attempt.verifier, state: c.attempt.state, cookie: c.cookie, request: c.rid, access: c.tokens.access_token, refresh: c.tokens.refresh_token });
  const absent = async (label: string, secrets: Record<string, string>) => {
    const rows = await everyRow();
    for (const [name, secret] of Object.entries(secrets)) assert.ok(!rows.includes(secret), `${label}: the ${name} is in a row`);
  };
  await absent("after a refresh", { ...held(first), newAccess: next.access_token, newRefresh: next.refresh_token });
  // While it lives, every token row names the address the same way: by the key's hash.
  const resources = (await prisma.oAuthToken.findMany({ where: { connection: { userId: pieter.id } }, select: { resource: true } })).map((r) => r.resource);
  assert.ok(resources.length >= 4);
  assert.deepEqual([...new Set(resources)], [storedAddress(cfg, first.key)]);

  const second = await connected(pieter, plus(at, 3_600_000));
  await absent("after connecting again", { ...held(first), ...held(second) });
  assert.equal((await revoke({ token: second.tokens.refresh_token }, plus(second.connectedAt, 1_000))).status, 200);
  const third = await connected(pieter, plus(second.connectedAt, 3_600_000));
  await disconnect(prisma, { userId: pieter.id }, pieter, { now: plus(third.connectedAt, 1_000), ipHash: BROWSER_IP });
  await absent("after Disconnect", { ...held(first), ...held(second), ...held(third) });
});

// ---------------------------------------------------------------------------
// /api/oauth/authorize: whose approval screen a request may reach
// ---------------------------------------------------------------------------

test("a request for a real address, opened signed out, is parked for the address's owner and sent through sign-in", { skip, timeout }, async () => {
  const pieter = await partner("Pieter", { passwordChangedAt: new Date("2026-01-05T00:00:00Z") });
  const t0 = nextDay();
  const { address, key } = await addressOf(pieter, t0);

  const opened = await open(address, plus(t0, 1_000), null);
  assert.equal(opened.response.status, 303);
  assert.ok(opened.cookie && opened.rid);
  assert.equal(opened.response.headers.get("location"), `/login?next=${encodeURIComponent(`/settings/claude/approve?r=${opened.rid}`)}`);
  const pending = readPending(opened.cookie, { secret: SECRET, now: t0.getTime() + 2_000 });
  assert.ok(pending);
  assert.deepEqual([pending.userId, pending.key, pending.resource, pending.rid], [pieter.id, key, address, opened.rid]);
  // Parking writes nothing: the request waits in the browser alone.
  assert.deepEqual(await written(pieter.id), NOTHING);

  // Signed in as the owner it goes straight to the screen.
  const direct = await open(address, plus(t0, 3_000), pieter);
  assert.equal(direct.response.headers.get("location"), `/settings/claude/approve?r=${direct.rid}`);
  assert.notEqual(direct.rid, opened.rid);
});

test("an unknown address, a retired one, the other partner's, and one whose login is off get the wrong-address page and nothing else", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const mine = await addressOf(pieter, t0);
  const theirs = await addressOf(connor, t0);

  const refusedPage = async (address: string, viewer: { id: string } | null, reason: Refusal) => {
    const said = refusals();
    const opened = await open(address, plus(t0, 1_000), viewer, said);
    assert.equal(opened.response.status, 400);
    assert.equal(await opened.response.text(), AUTHORIZE_WRONG_ADDRESS);
    assert.equal(opened.response.headers.get("set-cookie"), null, "no cookie is set, and none is cleared");
    assert.equal(opened.response.headers.get("location"), null, "Claude is told nothing");
    assert.deepEqual(said.reasons(), [reason]);
    assert.ok(!JSON.stringify(said.seen).includes(keyOfResource(address, cfg) ?? "-"));
  };

  // A key nobody has, signed out and signed in.
  const nobodys = connectorAddress(cfg, randomBytes(32).toString("base64url"));
  await refusedPage(nobodys, null, "unknown-address");
  await refusedPage(nobodys, pieter, "unknown-address");
  // The other partner's address, opened in this partner's browser.
  await refusedPage(theirs.address, pieter, "not-owner");
  await refusedPage(mine.address, connor, "not-owner");
  // Disconnect retired this one.
  assert.equal((await disconnect(prisma, { userId: pieter.id }, pieter, { now: plus(t0, 500) })).ok, true);
  await refusedPage(mine.address, pieter, "unknown-address");
  await refusedPage(mine.address, null, "unknown-address");
  // Its owner's login was switched off.
  await prisma.user.update({ where: { id: connor.id }, data: { passwordHash: null } });
  await refusedPage(theirs.address, null, "unknown-address");

  assert.deepEqual(await written(pieter.id), NOTHING);
  assert.deepEqual(await written(connor.id), NOTHING);
});

test("a request that isn't Claude's keeps its own plain page, real address or not", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const t0 = nextDay();
  const { address } = await addressOf(pieter, t0);
  const res = (await openAuthorize(prisma, cfg, { url: authorizeUrl(cfg, address, claudeAttempt(), { redirect_uri: "https://evil.example/cb" }), at: t0, viewer: pieter })).response;
  assert.equal(res.status, 400);
  assert.equal(await res.text(), AUTHORIZE_REFUSED);
  assert.equal(res.headers.get("set-cookie"), null);
});

// ---------------------------------------------------------------------------
// The approval screen: Allow and Cancel
// ---------------------------------------------------------------------------

test("the screen and Allow act only on the request the screen was drawn for, for its own partner", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const { address } = await addressOf(pieter, t0);
  const opened = await open(address, plus(t0, 1_000), pieter);
  assert.ok(opened.cookie && opened.rid);
  const at = plus(t0, 2_000);
  const input: ParkedInput = { cookie: opened.cookie, rid: opened.rid, userId: pieter.id, now: at };

  const screen = await readApproval(prisma, cfg, input);
  assert.equal(screen.ok, true);
  if (screen.ok) assert.deepEqual(screen.owner, { name: "Pieter", email: pieter.email });

  const refusedFor = async (over: Partial<ParkedInput>, why: Refusal) => {
    assert.deepEqual(await readApproval(prisma, cfg, { ...input, ...over }), { ok: false, why });
    assert.deepEqual(await approveParked(prisma, cfg, { ...input, ...over, ipHash: BROWSER_IP }), { ok: false, reason: "expired", why });
    assert.deepEqual(denyParked(cfg, { ...input, ...over }), { why });
  };
  // Another request's id, no id, or an id that isn't a string.
  await refusedFor({ rid: randomBytes(32).toString("base64url") }, "rid-mismatch");
  await refusedFor({ rid: undefined }, "rid-mismatch");
  await refusedFor({ rid: [opened.rid] }, "rid-mismatch");
  // The other partner, signed in in the same browser.
  await refusedFor({ userId: connor.id }, "not-owner");
  // No cookie, a tampered one, and one past its 10 minutes.
  await refusedFor({ cookie: undefined }, "expired");
  await refusedFor({ cookie: `${opened.cookie.slice(0, -2)}xx` }, "expired");
  await refusedFor({ now: plus(t0, 1_000 + PENDING_TTL_MS) }, "expired");
  assert.deepEqual(await written(pieter.id), NOTHING);
  assert.deepEqual(await written(connor.id), NOTHING);

  // Cancel tells Claude nothing was granted, at Claude's own callback with its state, and writes nothing.
  const denied = denyParked(cfg, input);
  assert.ok("redirectTo" in denied);
  if ("redirectTo" in denied) {
    const to = new URL(denied.redirectTo);
    assert.equal(`${to.origin}${to.pathname}`, CLAUDE_CALLBACK);
    assert.equal(to.searchParams.get("error"), "access_denied");
    assert.ok(to.searchParams.get("state")?.startsWith("st-"));
    assert.equal(to.searchParams.get("code"), null);
  }
  assert.deepEqual(await written(pieter.id), NOTHING);

  // And the real Allow, once.
  const result = await approveParked(prisma, cfg, { ...input, ipHash: BROWSER_IP });
  assert.equal(result.ok, true);
  assert.deepEqual(await approveParked(prisma, cfg, { ...input, now: plus(at, 1), ipHash: BROWSER_IP }), { ok: false, reason: "expired", why: "already-approved" });
  assert.equal(await prisma.claudeConnection.count({ where: { userId: pieter.id } }), 1);
});

test("a second request parked over the first makes the first screen's Allow and Cancel do nothing", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const t0 = nextDay();
  const { address } = await addressOf(pieter, t0);
  // His own request, and its approval screen open in a tab.
  const first = await open(address, plus(t0, 1_000), pieter);
  // Another request reaches the same browser and replaces the cookie while he reads.
  const second = await open(address, plus(t0, 5_000), pieter);
  assert.ok(first.cookie && first.rid && second.cookie && second.rid);
  const at = plus(t0, 10_000);

  // The first screen's buttons carry the first request's id; the browser now sends the second request's cookie.
  const swapped = { cookie: second.cookie, rid: first.rid, userId: pieter.id, now: at };
  assert.deepEqual(await approveParked(prisma, cfg, { ...swapped, ipHash: BROWSER_IP }), { ok: false, reason: "expired", why: "rid-mismatch" });
  assert.deepEqual(denyParked(cfg, swapped), { why: "rid-mismatch" });
  assert.deepEqual(await readApproval(prisma, cfg, swapped), { ok: false, why: "rid-mismatch" });
  assert.deepEqual(await written(pieter.id), NOTHING);

  // The second request's own screen, drawn for its own id, still works.
  assert.equal((await approveParked(prisma, cfg, { cookie: second.cookie, rid: second.rid, userId: pieter.id, now: at, ipHash: BROWSER_IP })).ok, true);
});

test("an address retired, a password reset or a login switched off between parking and Allow refuses the request", { skip, timeout }, async () => {
  const t0 = nextDay();
  const parked = async (name: string) => {
    const user = await partner(name);
    const { address } = await addressOf(user, t0);
    const opened = await open(address, plus(t0, 1_000), user);
    assert.ok(opened.cookie && opened.rid);
    return { user, address, input: { cookie: opened.cookie, rid: opened.rid, userId: user.id, now: plus(t0, 60_000) } };
  };
  const refused = async (p: Awaited<ReturnType<typeof parked>>, why: Refusal) => {
    assert.deepEqual(await readApproval(prisma, cfg, p.input), { ok: false, why });
    assert.deepEqual(await approveParked(prisma, cfg, { ...p.input, ipHash: BROWSER_IP }), { ok: false, reason: "expired", why });
    assert.deepEqual(await written(p.user.id), NOTHING);
  };

  // Disconnect retires the address the request named.
  const retired = await parked("Pieter");
  await disconnect(prisma, { userId: retired.user.id }, retired.user, { now: plus(t0, 30_000) });
  await refused(retired, "unknown-address");
  // A new address doesn't bring the old request back.
  assert.notEqual(await connectAddress(prisma, cfg, retired.user.id, plus(t0, 40_000)), retired.address);
  await refused(retired, "unknown-address");

  // A password reset signs the partner out everywhere, a request waiting for Allow included.
  const reset = await parked("Connor");
  await prisma.user.update({ where: { id: reset.user.id }, data: { passwordChangedAt: plus(t0, 30_000) } });
  await refused(reset, "password-changed");

  const off = await parked("Off");
  await prisma.user.update({ where: { id: off.user.id }, data: { passwordHash: null } });
  await refused(off, "login-off");
});

test("two Allows racing on one request make one connection and one code", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const t0 = nextDay();
  const { address } = await addressOf(pieter, t0);
  const opened = await open(address, plus(t0, 1_000), pieter);
  assert.ok(opened.cookie && opened.rid);
  const input = { cookie: opened.cookie, rid: opened.rid, userId: pieter.id, now: plus(t0, 2_000), ipHash: BROWSER_IP };
  const results = await whileRowLocked(Prisma.sql`SELECT id FROM "User" WHERE id = ${pieter.id} FOR UPDATE`, 2, () => Promise.all([approveParked(prisma, cfg, input), approveParked(prisma, cfg, input)]));
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, true]);
  assert.equal(await prisma.claudeConnection.count({ where: { userId: pieter.id } }), 1);
  assert.equal(await prisma.oAuthToken.count({ where: { connection: { userId: pieter.id }, kind: "CODE" } }), 1);
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"]]);
});

test("a parked request is approved once: after its connection ended, or its code row was swept, the same cookie is refused and no code is armed again", { skip, timeout }, async () => {
  const again = (a: { cookie: string; rid: string }, user: { id: string }, at: Date) => approveParked(prisma, cfg, { cookie: a.cookie, rid: a.rid, userId: user.id, now: at, ipHash: BROWSER_IP });
  const refused = { ok: false, reason: "expired", why: "already-approved" } as const;

  // Allow, Claude swaps the code, then Claude hands its refresh token back: the connection ends, the address stays,
  // and every token row of the connection is deleted, the code row included.
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  assert.equal((await revoke({ token: c.tokens.refresh_token }, plus(c.connectedAt, 5_000))).status, 200);
  assert.equal(await prisma.oAuthToken.count({ where: { connection: { userId: pieter.id } } }), 0);
  // The request's cookie has minutes left, and the partner's address and password are as they were.
  const before = await written(pieter.id);
  assert.deepEqual(await again(c, pieter, plus(c.connectedAt, 10_000)), refused);
  assert.deepEqual(await written(pieter.id), before, "nothing was written");
  assert.equal(await liveConnections(pieter.id), 0);
  await invalidGrant(await exchange(c, plus(c.connectedAt, 11_000)));
  // The same after a code reuse ended it.
  const reused = await partner("Pieter");
  const r = await connected(reused, nextDay());
  await invalidGrant(await exchange(r, plus(r.connectedAt, 1_000)));
  assert.deepEqual(await again(r, reused, plus(r.connectedAt, 2_000)), refused);
  assert.equal(await prisma.oAuthToken.count({ where: { connection: { userId: reused.id } } }), 0);

  // A live connection whose first refresh swept the expired code row: a second Allow must not replace it, or the
  // code Claude already used would work a second time.
  const connor = await partner("Connor");
  const d = await connected(connor, nextDay());
  const swept = plus(d.allowedAt, CODE_TTL_MS + 30_000);
  const next = await tokensOf(await refresh(d.tokens.refresh_token, d.address, swept));
  assert.equal(await prisma.oAuthToken.count({ where: { tokenHash: hashToken(d.code) } }), 0, "the code row is gone");
  assert.deepEqual(await again(d, connor, plus(swept, 30_000)), refused);
  assert.equal((await connection(d.connectionId)).revokedAt, null, "the connection Claude is using is untouched");
  assert.equal(await prisma.claudeConnection.count({ where: { userId: connor.id } }), 1);
  assert.ok(await verify(next.access_token, d.key, plus(swept, 31_000)));
  await invalidGrant(await exchange(d, plus(swept, 32_000)));
  assert.deepEqual(await trail(connor.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"]]);

  // A new request from Claude, with an id of its own, is approved as ever.
  const fresh = await approved(pieter, plus(c.connectedAt, 60_000));
  assert.notEqual(fresh.code, c.code);
  assert.equal((await exchange(fresh, plus(fresh.allowedAt, 1_000))).status, 200);
});

test("a parked request for a client or address this server no longer accepts is not approved", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const { address } = await addressOf(pieter, t0);
  const theirs = await addressOf(connor, t0);
  const opened = await open(address, plus(t0, 1_000), pieter);
  const pending = readPending(opened.cookie, { secret: SECRET, now: t0.getTime() + 2_000 });
  assert.ok(pending);
  const ctx = { now: plus(t0, 2_000) };
  const stale = { ok: false, reason: "expired", why: "stale-request" } as const;
  assert.deepEqual(await approve(prisma, cfg, pieter, { ...pending, redirectUri: "https://evil.example/cb" }, ctx), stale);
  assert.deepEqual(await approve(prisma, cfg, pieter, { ...pending, clientId: "https://evil.example/c.json" }, ctx), stale);
  assert.deepEqual(await approve(prisma, connectorConfigFor("https://moved.example.test", SECRET), pieter, pending, ctx), stale);
  // Its address has to be the one its own key makes, and the key has to be the approver's.
  assert.deepEqual(await approve(prisma, cfg, pieter, { ...pending, resource: theirs.address }, ctx), stale);
  assert.deepEqual(await approve(prisma, cfg, pieter, { ...pending, key: theirs.key, resource: theirs.address }, ctx), { ok: false, reason: "expired", why: "unknown-address" });
  assert.deepEqual(await approve(prisma, cfg, connor, pending, ctx), { ok: false, reason: "expired", why: "not-owner" });
  assert.deepEqual(await approve(prisma, cfg, pieter, pending, { now: new Date(pending.exp) }), { ok: false, reason: "expired", why: "expired" });
  assert.deepEqual(await written(pieter.id), NOTHING);
  assert.deepEqual(await written(connor.id), NOTHING);
});

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

test("a code is refused once its minute is up", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const a = await approved(pieter, nextDay());
  const said = refusals();
  await invalidGrant(await exchange(a, plus(a.allowedAt, CODE_TTL_MS), {}, said));
  assert.deepEqual(said.reasons(), ["expired"]);
  assert.equal((await connection(a.connectionId)).connectedAt, null);
  assert.deepEqual(await prisma.oAuthToken.findMany({ where: { connectionId: a.connectionId, kind: { not: "CODE" } } }), []);
  // Still inside the minute it would have worked.
  const b = await approved(await partner("Pieter"), nextDay());
  assert.equal((await exchange(b, plus(b.allowedAt, CODE_TTL_MS - 1))).status, 200);
});

test("a spent code with the wrong verifier, the other client id, another return address, or after its minute ends nothing", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const said = refusals();
  const soon = plus(c.connectedAt, 2_000);
  // The code alone crosses the partner's browser on its way to Claude. Whoever saw it there holds none of the rest.
  await invalidGrant(await exchange({ ...c, attempt: claudeAttempt() }, soon, {}, said));
  await invalidGrant(await exchange(c, soon, { client_id: FALLBACK_CLIENT_ID }, said));
  await invalidGrant(await exchange(c, soon, { redirect_uri: "https://evil.example/cb" }, said));
  await invalidGrant(await exchange(c, soon, { resource: connectorAddress(cfg, randomBytes(32).toString("base64url")) }, said));
  // Everything right, but the code's minute is over.
  await invalidGrant(await exchange(c, plus(c.allowedAt, CODE_TTL_MS), {}, said));
  await invalidGrant(await exchange(c, plus(c.allowedAt, 45 * 60_000), {}, said));
  assert.deepEqual(said.reasons(), ["bad-pkce", "wrong-client", "wrong-redirect", "wrong-resource", "expired", "expired"]);

  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt, null, "the connection is still live");
  assert.ok(await verify(c.tokens.access_token, c.key, plus(c.connectedAt, 3_000)));
  assert.equal((await refresh(c.tokens.refresh_token, c.address, plus(c.connectedAt, 4_000))).status, 200);
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"]]);
});

test("a spent code presented again with everything right, inside its minute, ends the connection it made", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  assert.ok(await verify(c.tokens.access_token, c.key, plus(c.connectedAt, 1_000)));

  const said = refusals();
  await invalidGrant(await exchange(c, plus(c.connectedAt, 2_000), {}, said));
  assert.deepEqual(said.seen, [{ reason: "code-reuse", detail: { connectionId: c.connectionId, userId: pieter.id } }]);

  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt?.getTime(), c.connectedAt.getTime() + 2_000);
  assert.equal(row.revokedByUserId, null);
  assert.equal(await verify(c.tokens.access_token, c.key, plus(c.connectedAt, 3_000)), null);
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(c.connectedAt, 4_000)));
  assert.equal(await prisma.oAuthToken.count({ where: { connectionId: c.connectionId } }), 0, "its tokens are gone");
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"], ["CLAUDE_DISCONNECTED", "code-reuse"]]);
  // The address is kept: the partner's Claude only has to sign in again.
  assert.equal(await connectAddress(prisma, cfg, pieter.id, plus(c.connectedAt, 5_000)), c.address);
});

test("two calls racing for one code: one gets tokens, and the connection still ends", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const a = await approved(pieter, nextDay());
  const at = plus(a.allowedAt, 5_000);
  // Both calls find the code while it is unused, then wait in line for the partner's row.
  const [x, y] = await whileRowLocked(Prisma.sql`SELECT id FROM "User" WHERE id = ${pieter.id} FOR UPDATE`, 2, () => Promise.all([exchange(a, at), exchange(a, at)]));
  assert.deepEqual([x.status, y.status].sort(), [200, 400]);
  assert.ok((await connection(a.connectionId)).revokedAt, "a second presentation ends it, whichever call lost");
  const winner = (await (x.status === 200 ? x : y).json()) as TokenResponseBody;
  assert.equal(await verify(winner.access_token, a.key, plus(at, 1_000)), null);
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"], ["CLAUDE_DISCONNECTED", "code-reuse"]]);
});

test("the wrong PKCE verifier is refused, and the code is still good for the one who holds the right one", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const a = await approved(pieter, nextDay());
  await invalidGrant(await exchange({ ...a, attempt: claudeAttempt() }, plus(a.allowedAt, 2_000)));
  await invalidGrant(await exchange({ ...a, attempt: { verifier: a.attempt.challenge } }, plus(a.allowedAt, 3_000)));
  assert.equal((await connection(a.connectionId)).connectedAt, null);
  assert.equal((await exchange(a, plus(a.allowedAt, 4_000))).status, 200);
});

test("a code is refused with another return address, another address, or an unknown code", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const theirs = await addressOf(connor, t0);
  const a = await approved(pieter, t0);
  const at = plus(a.allowedAt, 2_000);
  await invalidGrant(await exchange(a, at, { redirect_uri: "https://evil.example/cb" }));
  await invalidGrant(await exchange(a, at, { redirect_uri: `${CLAUDE_CALLBACK}/` }));
  await invalidGrant(await exchange(a, at, { resource: theirs.address }));
  await invalidGrant(await exchange(a, at, { resource: `${cfg.issuer}/api/mcp` }));
  await invalidGrant(await exchange(a, at, { resource: cfg.issuer }));
  await invalidGrant(await exchange({ ...a, code: randomBytes(32).toString("base64url") }, at));
  assert.equal((await connection(a.connectionId)).connectedAt, null);

  // The row says what the code is for. A request that names neither is held to the row's values, not excused from them.
  const tokens = await tokensOf(await exchange(a, plus(at, 1_000), { redirect_uri: null, resource: null }));
  assert.ok(await verify(tokens.access_token, a.key, plus(at, 2_000)));
  assert.equal(await verify(tokens.access_token, theirs.key, plus(at, 2_000)), null);
});

test("a code is good only for its partner's current address, whatever the request says", { skip, timeout }, async () => {
  const connor = await partner("Connor");
  const t0 = nextDay();
  const theirs = await addressOf(connor, t0);

  // A row that names another origin, the other partner's address, or its own address in the clear, key and all:
  // only the hashed form of the partner's current address counts.
  const rewritten: ((a: { address: string; key: string }) => { stored: string; asked: string })[] = [
    (a) => ({ stored: storedAddress({ issuer: "https://old.example.test" }, a.key), asked: `https://old.example.test/api/mcp/${a.key}` }),
    () => ({ stored: storedAddress(cfg, theirs.key), asked: theirs.address }),
    (a) => ({ stored: a.address, asked: a.address }),
  ];
  for (const rewrite of rewritten) {
    const a = await approved(await partner("Pieter"), t0);
    const { stored, asked } = rewrite(a);
    await prisma.oAuthToken.updateMany({ where: { connectionId: a.connectionId, kind: "CODE" }, data: { resource: stored } });
    const said = refusals();
    await invalidGrant(await exchange(a, plus(a.allowedAt, 2_000), {}, said));
    await invalidGrant(await exchange(a, plus(a.allowedAt, 3_000), { resource: asked }, said));
    await invalidGrant(await exchange(a, plus(a.allowedAt, 3_500), { resource: null }, said));
    assert.deepEqual(said.reasons(), ["wrong-resource", "wrong-resource", "wrong-resource"]);
  }

  // The address was retired after Allow, with the connection row left as it was.
  const pieter = await partner("Pieter");
  const b = await approved(pieter, t0);
  await prisma.user.update({ where: { id: pieter.id }, data: { claudeKeyId: null, claudeKeyHash: null } });
  const said = refusals();
  await invalidGrant(await exchange(b, plus(b.allowedAt, 2_000), {}, said));
  assert.deepEqual(said.reasons(), ["wrong-resource"]);
  assert.equal((await connection(b.connectionId)).connectedAt, null);
});

// ---------------------------------------------------------------------------
// One connection per partner
// ---------------------------------------------------------------------------

test("connecting again replaces the old connection", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const first = await connected(pieter, nextDay());
  const t1 = plus(first.connectedAt, 3_600_000);
  assert.ok(await verify(first.tokens.access_token, first.key, plus(first.connectedAt, 1_000)));

  const second = await approved(pieter, t1);
  assert.equal(second.address, first.address, "the same address: connecting again needs no new one");
  // From Allow on, before Claude has even swapped the new code.
  const old = await connection(first.connectionId);
  assert.equal(old.revokedAt?.getTime(), second.allowedAt.getTime());
  assert.equal(old.revokedByUserId, pieter.id);
  assert.equal(await verify(first.tokens.access_token, first.key, plus(second.allowedAt, 1)), null);
  await invalidGrant(await refresh(first.tokens.refresh_token, first.address, plus(second.allowedAt, 2)));
  assert.equal((await listConnections(prisma, cfg, plus(second.allowedAt, 3))).find((r) => r.userId === pieter.id)?.connection, null, "not connected until Claude swaps the new code");

  const tokens = await tokensOf(await exchange(second, plus(second.allowedAt, 5_000)));
  assert.equal((await verify(tokens.access_token, second.key, plus(second.allowedAt, 6_000)))?.connection.id, second.connectionId);
  assert.equal(await liveConnections(pieter.id), 1);
  assert.deepEqual(await trail(pieter.id), [
    ["CLAUDE_CONNECTED", "allowed"],
    ["CLAUDE_CONNECTED", "exchanged"],
    ["CLAUDE_DISCONNECTED", "replaced"],
    ["CLAUDE_CONNECTED", "allowed"],
    ["CLAUDE_CONNECTED", "exchanged"],
  ]);
});

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

test("a refresh swaps both tokens, and the new pair works", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, ACCESS_TTL_MS - 5 * 60_000);

  const res = await refresh(c.tokens.refresh_token, c.address, at);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const next = await tokensOf(res);
  assert.equal(next.token_type, "Bearer");
  assert.equal(next.expires_in, 3600);
  assert.equal(next.scope, SCOPE);
  assert.ok(isWellFormedToken(next.access_token) && isWellFormedToken(next.refresh_token));
  assert.equal(new Set([c.tokens.access_token, c.tokens.refresh_token, next.access_token, next.refresh_token]).size, 4);

  assert.equal((await verify(next.access_token, c.key, plus(at, 1_000)))?.user.id, pieter.id);
  // The old access token runs out on its own time: a call already on its way still lands.
  assert.ok(await verify(c.tokens.access_token, c.key, plus(at, 1_000)));
  assert.equal(await verify(c.tokens.access_token, c.key, plus(c.connectedAt, ACCESS_TTL_MS)), null);

  const spent = await prisma.oAuthToken.findUniqueOrThrow({ where: { tokenHash: hashToken(c.tokens.refresh_token) } });
  assert.equal(spent.usedAt?.getTime(), at.getTime());
  const fresh = await prisma.oAuthToken.findUniqueOrThrow({ where: { tokenHash: hashToken(next.refresh_token) } });
  assert.equal(fresh.expiresAt.getTime(), at.getTime() + REFRESH_TTL_MS, "60 days from each use");
  assert.equal(fresh.usedAt, null);
  assert.equal(fresh.resource, storedAddress(cfg, c.key));
  // Still only hashes in the table.
  const stored = JSON.stringify(await prisma.oAuthToken.findMany({ where: { connectionId: c.connectionId } }));
  assert.ok(!stored.includes(next.access_token) && !stored.includes(next.refresh_token));

  // A chain of refreshes keeps working, a request that names no client or address included.
  const later = plus(at, ACCESS_TTL_MS);
  const third = await tokensOf(await tokenCall({ grant_type: "refresh_token", refresh_token: next.refresh_token }, later));
  assert.ok(await verify(third.access_token, c.key, plus(later, 1_000)));
  assert.equal((await connection(c.connectionId)).revokedAt, null);
});

test("a refresh sent twice within a minute gets the same pair both times, and the connection lives", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 30 * 60_000);

  // One after the other: the first answer never reached Claude, so it asks again.
  const first = await tokensOf(await refresh(c.tokens.refresh_token, c.address, at));
  const rowsAfterFirst = await prisma.oAuthToken.findMany({ where: { connectionId: c.connectionId }, orderBy: { id: "asc" } });
  const again = await tokensOf(await refresh(c.tokens.refresh_token, c.address, plus(at, 20_000)));
  assert.equal(again.access_token, first.access_token);
  assert.equal(again.refresh_token, first.refresh_token);
  assert.equal(again.expires_in, 3600 - 20, "counted from the access token's own hour");
  const last = await tokensOf(await refresh(c.tokens.refresh_token, c.address, plus(at, REFRESH_GRACE_MS - 1)));
  assert.deepEqual([last.access_token, last.refresh_token], [first.access_token, first.refresh_token]);
  // A repeat writes nothing.
  assert.deepEqual(await prisma.oAuthToken.findMany({ where: { connectionId: c.connectionId }, orderBy: { id: "asc" } }), rowsAfterFirst);
  assert.equal((await connection(c.connectionId)).revokedAt, null);
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"]]);

  // Both tokens of the pair work.
  assert.equal((await verify(first.access_token, c.key, plus(at, 61_000)))?.user.id, pieter.id);
  const next = await tokensOf(await refresh(first.refresh_token, c.address, plus(at, 62_000)));

  // At the same moment: two of Claude's workers refresh at once.
  const t2 = plus(at, 30 * 60_000);
  const [x, y] = await whileRowLocked(Prisma.sql`SELECT id FROM "User" WHERE id = ${pieter.id} FOR UPDATE`, 2, () =>
    Promise.all([refresh(next.refresh_token, c.address, t2), refresh(next.refresh_token, c.address, t2)]),
  );
  const [px, py] = [await tokensOf(x), await tokensOf(y)];
  assert.deepEqual([px.access_token, px.refresh_token], [py.access_token, py.refresh_token]);
  assert.equal((await connection(c.connectionId)).revokedAt, null);
  assert.ok(await verify(px.access_token, c.key, plus(t2, 1_000)));
  assert.equal((await refresh(px.refresh_token, c.address, plus(t2, 2_000))).status, 200);
});

test("a spent refresh token that comes back after the minute, or after its pair was used, ends the whole connection", { skip, timeout }, async () => {
  // After the minute: two holders.
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  const next = await tokensOf(await refresh(c.tokens.refresh_token, c.address, at));
  assert.ok(await verify(next.access_token, c.key, plus(at, 1_000)));
  const said = refusals();
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, REFRESH_GRACE_MS), {}, { said }));
  assert.deepEqual(said.seen, [{ reason: "refresh-reuse", detail: { connectionId: c.connectionId, userId: pieter.id } }]);
  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt?.getTime(), at.getTime() + REFRESH_GRACE_MS);
  assert.equal(await verify(next.access_token, c.key, plus(at, REFRESH_GRACE_MS + 1_000)), null, "the new access token dies with it");
  assert.equal(await verify(c.tokens.access_token, c.key, plus(at, REFRESH_GRACE_MS + 1_000)), null);
  await invalidGrant(await refresh(next.refresh_token, c.address, plus(at, REFRESH_GRACE_MS + 2_000)));
  assert.equal((await listConnections(prisma, cfg, plus(at, DAY))).find((r) => r.userId === pieter.id)?.connection, null);
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"], ["CLAUDE_DISCONNECTED", "refresh-reuse"]]);

  // Inside the minute, but the pair it produced has already been used: the first answer did arrive.
  const connor = await partner("Connor");
  const d = await connected(connor, nextDay());
  const t = plus(d.connectedAt, 60_000);
  const one = await tokensOf(await refresh(d.tokens.refresh_token, d.address, t));
  const two = await tokensOf(await refresh(one.refresh_token, d.address, plus(t, 10_000)));
  await invalidGrant(await refresh(d.tokens.refresh_token, d.address, plus(t, 20_000)));
  assert.ok((await connection(d.connectionId)).revokedAt);
  assert.equal(await verify(two.access_token, d.key, plus(t, 21_000)), null);
  assert.deepEqual((await trail(connor.id)).at(-1), ["CLAUDE_DISCONNECTED", "refresh-reuse"]);
});

test("the repeat allowance is for the same client only, and 0 turns it off", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  await tokensOf(await refresh(c.tokens.refresh_token, c.address, at));
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, 1_000), { client_id: FALLBACK_CLIENT_ID }));
  assert.ok((await connection(c.connectionId)).revokedAt, "a spent token from another client is two holders");

  const connor = await partner("Connor");
  const d = await connected(connor, nextDay());
  const t = plus(d.connectedAt, 60_000);
  await tokensOf(await refresh(d.tokens.refresh_token, d.address, t, {}, { refreshGraceMs: 0 }));
  await invalidGrant(await refresh(d.tokens.refresh_token, d.address, plus(t, 1), {}, { refreshGraceMs: 0 }));
  assert.ok((await connection(d.connectionId)).revokedAt);
});

test("the repeat allowance is for the same address, and for a connection newer than the partner's last password change", { skip, timeout }, async () => {
  // A repeat that names the other partner's address is not Claude asking again.
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const theirs = await addressOf(connor, t0);
  const c = await connected(pieter, t0);
  const at = plus(c.connectedAt, 60_000);
  await tokensOf(await refresh(c.tokens.refresh_token, c.address, at));
  const said = refusals();
  await invalidGrant(await refresh(c.tokens.refresh_token, theirs.address, plus(at, 1_000), {}, { said }));
  assert.deepEqual(said.reasons(), ["refresh-reuse"]);
  assert.equal((await connection(c.connectionId)).revokedAt?.getTime(), at.getTime() + 1_000);

  // The partner's password changed after the connection was made, with the rows left as they were: no repeat either.
  const other = await partner("Pieter");
  const d = await connected(other, nextDay());
  const t = plus(d.connectedAt, 60_000);
  const pair = await tokensOf(await refresh(d.tokens.refresh_token, d.address, t));
  await prisma.user.update({ where: { id: other.id }, data: { passwordChangedAt: plus(d.allowedAt, 1) } });
  await invalidGrant(await refresh(d.tokens.refresh_token, d.address, plus(t, 1_000), {}, { said }));
  assert.deepEqual(said.reasons(), ["refresh-reuse", "refresh-reuse"]);
  assert.ok((await connection(d.connectionId)).revokedAt);
  assert.equal(await prisma.oAuthToken.count({ where: { tokenHash: hashToken(pair.refresh_token) } }), 0);
});

test("a spent refresh token's row outlives the sweep, so its replay on day 61 still ends the connection", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const first = await tokensOf(await refresh(c.tokens.refresh_token, c.address, plus(c.connectedAt, DAY)));
  // 61 days in: the first refresh token's row ran out a day ago, and this refresh sweeps what has run out.
  const day61 = plus(c.connectedAt, 61 * DAY - 3_600_000);
  const second = await tokensOf(await refresh(first.refresh_token, c.address, day61));

  const rows = await prisma.oAuthToken.findMany({ where: { connectionId: c.connectionId } });
  const has = (token: string) => rows.some((r) => r.tokenHash === hashToken(token));
  assert.ok(has(c.tokens.refresh_token), "the spent refresh token is kept though its time has passed");
  assert.ok(has(first.refresh_token));
  assert.equal(has(c.tokens.access_token), false, "expired access tokens are swept");
  assert.equal(has(first.access_token), false);
  assert.equal(has(c.code), false, "and the code");
  assert.equal(rows.filter((r) => r.expiresAt.getTime() < day61.getTime() && !(r.kind === "REFRESH" && r.usedAt)).length, 0);

  // Whoever kept the first token tries it now.
  const said = refusals();
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(day61, 60_000), {}, { said }));
  assert.deepEqual(said.reasons(), ["refresh-reuse"]);
  assert.ok((await connection(c.connectionId)).revokedAt);
  assert.equal(await verify(second.access_token, c.key, plus(day61, 61_000)), null);
});

test("a refresh token is refused after 60 days, for another address, and when it never existed", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const theirs = await addressOf(connor, t0);
  const c = await connected(pieter, t0);
  const soon = plus(c.connectedAt, 1_000);
  await invalidGrant(await refresh(c.tokens.refresh_token, theirs.address, soon));
  await invalidGrant(await refresh(c.tokens.refresh_token, `${cfg.issuer}/api/mcp`, soon));
  await invalidGrant(await refresh(randomBytes(32).toString("base64url"), c.address, soon));
  // An access token or a code is not a refresh token.
  await invalidGrant(await refresh(c.tokens.access_token, c.address, soon));
  await invalidGrant(await refresh(c.code, c.address, soon));
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(c.connectedAt, REFRESH_TTL_MS)));
  // None of those was the token being replayed, so the connection is untouched.
  assert.equal((await connection(c.connectionId)).revokedAt, null);
  assert.equal((await refresh(c.tokens.refresh_token, c.address, plus(c.connectedAt, REFRESH_TTL_MS - 1))).status, 200);
});

// ---------------------------------------------------------------------------
// The bearer check: one address, one partner
// ---------------------------------------------------------------------------

test("a token works only at its own partner's current address", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const connor = await partner("Connor");
  const t0 = nextDay();
  const p = await connected(pieter, t0);
  const c = await connected(connor, t0);
  const at = plus(p.connectedAt, 60_000);
  assert.equal((await verify(p.tokens.access_token, p.key, at))?.user.id, pieter.id);
  assert.equal((await verify(c.tokens.access_token, c.key, at))?.user.id, connor.id);

  // At the other partner's address, at a key that is nobody's, and at a malformed one.
  assert.equal(await turnedAway(p.tokens.access_token, c.key, at), "wrong-address");
  assert.equal(await turnedAway(c.tokens.access_token, p.key, at), "wrong-address");
  assert.equal(await turnedAway(p.tokens.access_token, randomBytes(32).toString("base64url"), at), "wrong-address");
  assert.equal(await verify(p.tokens.access_token, "short", at), null);
  assert.equal(unauthorizedEndpoint(cfg, "short", new Headers()).status, 404);

  // A row rewritten to name the other partner's address is still not that partner's token.
  await prisma.oAuthToken.updateMany({ where: { tokenHash: hashToken(p.tokens.access_token) }, data: { resource: storedAddress(cfg, c.key) } });
  assert.equal(await turnedAway(p.tokens.access_token, c.key, at), "wrong-address");
  assert.equal(await turnedAway(p.tokens.access_token, p.key, at), "wrong-address");

  // An address retired with the connection row left as it was: the token stops at its own old address.
  await prisma.user.update({ where: { id: connor.id }, data: { claudeKeyId: null, claudeKeyHash: null } });
  assert.equal(await turnedAway(c.tokens.access_token, c.key, at), "wrong-address");
  assert.equal((await listConnections(prisma, cfg, at)).find((r) => r.userId === connor.id)?.connection, null);
});

test("after Disconnect a token gets the 401 at its own old address, and the address is gone for good", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  assert.ok(await verify(c.tokens.access_token, c.key, at));

  assert.deepEqual(await disconnect(prisma, { userId: pieter.id }, pieter, { now: at, ipHash: BROWSER_IP }), { ok: true, userId: pieter.id, name: "Pieter", revoked: 1 });
  assert.equal(await turnedAway(c.tokens.access_token, c.key, plus(at, 1)), "unknown-token");
  const row = await userRow(pieter.id);
  assert.deepEqual([row.claudeKeyId, row.claudeKeyHash], [null, null], "the address is retired");
  assert.equal(await ownerOfKey(prisma, c.key), null);

  // The old address can't start a sign-in, and Connect makes a different one.
  const opened = await open(c.address, plus(at, 2_000), pieter);
  assert.equal(opened.response.status, 400);
  assert.equal(await opened.response.text(), AUTHORIZE_WRONG_ADDRESS);
  const fresh = await addressOf(pieter, plus(at, 3_000));
  assert.notEqual(fresh.address, c.address);
  // A sign-in at the new address works, and the old token still doesn't, there or anywhere.
  const again = await connected(pieter, plus(at, 4_000));
  assert.equal(again.address, fresh.address);
  assert.ok(await verify(again.tokens.access_token, fresh.key, plus(again.connectedAt, 1_000)));
  assert.equal(await verify(c.tokens.access_token, fresh.key, plus(again.connectedAt, 1_000)), null);
  assert.equal(await verify(again.tokens.access_token, c.key, plus(again.connectedAt, 1_000)), null);
});

// ---------------------------------------------------------------------------
// What ends a connection from the app's side
// ---------------------------------------------------------------------------

test("a password reset ends the connection in the reset's own transaction, logs it, and keeps the address", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  // Allowed but not yet swapped: a second partner's connection that Claude hasn't finished.
  const connor = await partner("Connor");
  const waiting = await approved(connor, nextDay());

  const ended = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: pieter.id }, data: { passwordHash: "new.hash", passwordChangedAt: at } });
    return endConnectionsForPasswordReset(tx, pieter.id, at);
  });
  assert.equal(ended, 1);
  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt?.getTime(), at.getTime());
  assert.equal(row.revokedByUserId, null);
  assert.equal(await prisma.oAuthToken.count({ where: { connectionId: c.connectionId } }), 0, "its tokens are deleted");
  assert.equal(await verify(c.tokens.access_token, c.key, plus(at, 1_000)), null);
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, 1_000)));
  assert.deepEqual((await events(pieter.id)).at(-1)?.data, { connectionId: c.connectionId, reason: "password-reset" });
  // The address is kept, so Claude only has to sign in again.
  assert.equal(await connectAddress(prisma, cfg, pieter.id, plus(at, 2_000)), c.address);
  const again = await connected(pieter, plus(at, 3_000));
  assert.ok(await verify(again.tokens.access_token, c.key, plus(again.connectedAt, 1_000)));

  // A connection still waiting for Claude ends too, with nothing to log: the code is dead.
  assert.equal(await prisma.$transaction((tx) => endConnectionsForPasswordReset(tx, connor.id, plus(waiting.allowedAt, 1_000))), 0);
  await invalidGrant(await exchange(waiting, plus(waiting.allowedAt, 2_000)));
  assert.deepEqual(await trail(connor.id), [["CLAUDE_CONNECTED", "allowed"]]);
});

test("a connection older than the partner's last password change is dead on that date alone", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  assert.ok(await verify(c.tokens.access_token, c.key, at));

  // The second guard behind the reset's own ending: the date, with the rows left as they were.
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordChangedAt: plus(c.allowedAt, 1) } });
  assert.equal(await turnedAway(c.tokens.access_token, c.key, at), "owner-off");
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, at));
  assert.equal((await listConnections(prisma, cfg, at)).find((r) => r.userId === pieter.id)?.connection, null);

  // A connection made at the same instant as the change counts as after it (src/lib/auth.ts).
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordChangedAt: c.allowedAt } });
  assert.ok(await verify(c.tokens.access_token, c.key, at));

  // A code approved before the change can't be swapped after it.
  const other = await partner("Connor");
  const a = await approved(other, nextDay());
  await prisma.user.update({ where: { id: other.id }, data: { passwordChangedAt: plus(a.allowedAt, 1_000) } });
  await invalidGrant(await exchange(a, plus(a.allowedAt, 2_000)));
});

test("a login that is switched off loses its Claude for good the first time Claude calls", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordHash: null } });
  assert.equal(await turnedAway(c.tokens.access_token, c.key, at), "owner-off");
  assert.ok((await connection(c.connectionId)).revokedAt, "ended, not paused");
  assert.deepEqual((await trail(pieter.id)).at(-1), ["CLAUDE_DISCONNECTED", "login-off"]);
  assert.equal((await listConnections(prisma, cfg, at)).some((r) => r.userId === pieter.id), false, "and leaves Settings");

  // Switching the login back on doesn't bring it back.
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordHash: "salt.hash" } });
  assert.equal(await verify(c.tokens.access_token, c.key, plus(at, 1_000)), null);
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, 1_000)));

  // The same when the first call after is a refresh.
  const connor = await partner("Connor");
  const d = await connected(connor, nextDay());
  await prisma.user.update({ where: { id: connor.id }, data: { passwordHash: null } });
  await invalidGrant(await refresh(d.tokens.refresh_token, d.address, plus(d.connectedAt, 60_000)));
  await prisma.user.update({ where: { id: connor.id }, data: { passwordHash: "salt.hash" } });
  assert.equal(await verify(d.tokens.access_token, d.key, plus(d.connectedAt, 61_000)), null);
  assert.deepEqual((await trail(connor.id)).at(-1), ["CLAUDE_DISCONNECTED", "login-off"]);
});

test("a connection marked ended is dead even where its token rows are still there", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  // Ending a connection deletes its tokens too. This is the check that doesn't lean on that.
  await prisma.claudeConnection.update({ where: { id: c.connectionId }, data: { revokedAt: at } });
  assert.equal(await prisma.oAuthToken.count({ where: { connectionId: c.connectionId, kind: { in: ["ACCESS", "REFRESH"] } } }), 2);
  assert.equal(await turnedAway(c.tokens.access_token, c.key, plus(at, 1_000)), "ended");
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, 1_000)));

  // The same for a code on a connection that was ended before Claude came back.
  const a = await approved(await partner("Connor"), nextDay());
  await prisma.claudeConnection.update({ where: { id: a.connectionId }, data: { revokedAt: a.allowedAt } });
  await invalidGrant(await exchange(a, plus(a.allowedAt, 1_000)));
});

test("Disconnect, by either partner, ends the connection, retires the address and says who did it", { skip, timeout }, async () => {
  const connor = await partner("Connor");
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);

  // Connor disconnects Pieter's lost phone.
  assert.deepEqual(await disconnect(prisma, { userId: pieter.id }, connor, { now: at, ipHash: BROWSER_IP }), { ok: true, userId: pieter.id, name: "Pieter", revoked: 1 });
  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt?.getTime(), at.getTime());
  assert.equal(row.revokedByUserId, connor.id);
  assert.equal(await verify(c.tokens.access_token, c.key, plus(at, 1)), null);
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, 2)));
  assert.equal(await prisma.oAuthToken.count({ where: { connectionId: c.connectionId } }), 0);
  assert.equal((await userRow(pieter.id)).claudeKeyHash, null);
  const log = await events(pieter.id);
  assert.deepEqual(log.map((e) => [e.kind, e.data, e.ipHash]).at(-1), ["CLAUDE_DISCONNECTED", { connectionId: c.connectionId, reason: "partner", by: connor.id }, BROWSER_IP]);

  // Again: nothing left to end, nothing more logged.
  assert.deepEqual(await disconnect(prisma, { userId: pieter.id }, connor, { now: plus(at, 5_000) }), { ok: true, userId: pieter.id, name: "Pieter", revoked: 0 });
  assert.equal((await events(pieter.id)).length, log.length);
  assert.deepEqual(await disconnect(prisma, { userId: "no-such-user" }, connor, { now: at }), { ok: false });
  assert.deepEqual(await disconnect(prisma, { connectionId: "no-such-connection" }, connor, { now: at }), { ok: false });

  // By connection id, on his own row.
  const again = await connected(pieter, nextDay());
  assert.deepEqual(await disconnect(prisma, { connectionId: again.connectionId }, pieter, { now: plus(again.connectedAt, 2_000) }), { ok: true, userId: pieter.id, name: "Pieter", revoked: 1 });
  assert.equal((await connection(again.connectionId)).revokedByUserId, pieter.id);
  assert.equal((await userRow(pieter.id)).claudeKeyHash, null);

  // A partner who never connected but copied an address: Disconnect retires that too.
  const idle = await addressOf(connor, at);
  assert.deepEqual(await disconnect(prisma, { userId: connor.id }, connor, { now: plus(at, 1_000) }), { ok: true, userId: connor.id, name: "Connor", revoked: 0 });
  assert.equal(await ownerOfKey(prisma, idle.key), null);
});

test("Disconnect also ends an Allow that Claude hasn't finished", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const a = await approved(pieter, nextDay());
  assert.deepEqual(await disconnect(prisma, { userId: pieter.id }, pieter, { now: plus(a.allowedAt, 1_000) }), { ok: true, userId: pieter.id, name: "Pieter", revoked: 0 });
  await invalidGrant(await exchange(a, plus(a.allowedAt, 2_000)));
  assert.ok((await connection(a.connectionId)).revokedAt);
  assert.equal(await liveConnections(pieter.id), 0);
});

// ---------------------------------------------------------------------------
// One lock order: the partner's row, then their connections, then their tokens
// ---------------------------------------------------------------------------

/** Runs `calls` at the same moment and fails on any error: a deadlock (40P01) reaches here as a rejected call. */
async function together<T extends unknown[]>(label: string, calls: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  const settled = await Promise.allSettled(calls.map((call) => call()));
  for (const s of settled) if (s.status === "rejected") assert.fail(`${label}: ${s.reason instanceof Error ? s.reason.message : String(s.reason)}`);
  return settled.map((s) => (s as PromiseFulfilledResult<unknown>).value) as T;
}

const ROUNDS = 20;
const racing = 120_000;

test("Disconnect against Allow, many rounds: never a deadlock, and once Disconnect says done no connection is live", { skip, timeout: racing }, async () => {
  const pieter = await partner("Pieter");
  let t = nextDay();
  for (let round = 0; round < ROUNDS; round++) {
    // A live connection, and a new request waiting for Allow on the same address.
    const live = await connected(pieter, t);
    const opened = await open(live.address, plus(live.connectedAt, 1_000), pieter);
    assert.ok(opened.cookie && opened.rid);
    const at = plus(live.connectedAt, 2_000);
    const [done, allowed] = await together<[Awaited<ReturnType<typeof disconnect>>, Awaited<ReturnType<typeof approveParked>>]>(`round ${round}`, [
      () => disconnect(prisma, { userId: pieter.id }, pieter, { now: at }),
      () => approveParked(prisma, cfg, { cookie: opened.cookie, rid: opened.rid, userId: pieter.id, now: at, ipHash: BROWSER_IP }),
    ]);
    assert.equal(done.ok, true, `round ${round}`);
    assert.equal(await liveConnections(pieter.id), 0, `round ${round}: Disconnect reported done while a connection stayed live (Allow ${allowed.ok ? "went through" : allowed.why})`);
    assert.equal(await prisma.oAuthToken.count({ where: { connection: { userId: pieter.id } } }), 0, `round ${round}`);
    assert.equal((await userRow(pieter.id)).claudeKeyHash, null, `round ${round}`);
    assert.equal(await verify(live.tokens.access_token, live.key, plus(at, 1_000)), null, `round ${round}`);
    t = plus(t, 3_600_000);
  }
});

test("Disconnect against a code exchange, many rounds: never a deadlock, and no token outlives Disconnect", { skip, timeout: racing }, async () => {
  const pieter = await partner("Pieter");
  let t = nextDay();
  for (let round = 0; round < ROUNDS; round++) {
    const a = await approved(pieter, t);
    const at = plus(a.allowedAt, 5_000);
    const [done, swapped] = await together<[Awaited<ReturnType<typeof disconnect>>, Response]>(`round ${round}`, [() => disconnect(prisma, { userId: pieter.id }, pieter, { now: at }), () => exchange(a, at)]);
    assert.equal(done.ok, true, `round ${round}`);
    assert.ok([200, 400].includes(swapped.status), `round ${round}: ${swapped.status}`);
    assert.equal(await liveConnections(pieter.id), 0, `round ${round}: Disconnect reported done while a connection stayed live (the swap answered ${swapped.status})`);
    if (swapped.status === 200) {
      const tokens = (await swapped.json()) as TokenResponseBody;
      assert.equal(await verify(tokens.access_token, a.key, plus(at, 1_000)), null, `round ${round}`);
      await invalidGrant(await refresh(tokens.refresh_token, a.address, plus(at, 1_000)));
    }
    t = plus(t, 3_600_000);
  }
});

test("two refreshes of one token at once, many rounds: never a deadlock, the same pair, and the connection lives", { skip, timeout: racing }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  let token = c.tokens.refresh_token;
  let at = plus(c.connectedAt, 60_000);
  for (let round = 0; round < ROUNDS; round++) {
    const [x, y] = await together<[Response, Response]>(`round ${round}`, [() => refresh(token, c.address, at), () => refresh(token, c.address, at)]);
    const [px, py] = [await tokensOf(x), await tokensOf(y)];
    assert.deepEqual([px.access_token, px.refresh_token], [py.access_token, py.refresh_token], `round ${round}`);
    assert.ok(await verify(px.access_token, c.key, plus(at, 1_000)), `round ${round}`);
    token = px.refresh_token;
    at = plus(at, 10 * 60_000);
  }
  assert.equal((await connection(c.connectionId)).revokedAt, null);
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"]]);
});

test("a refresh, a revoke, a bearer check and Disconnect on one connection at once, many rounds: never a deadlock", { skip, timeout: racing }, async () => {
  const pieter = await partner("Pieter");
  let t = nextDay();
  for (let round = 0; round < ROUNDS; round++) {
    const c = await connected(pieter, t);
    const at = plus(c.connectedAt, 2 * 60_000);
    const [done] = await together<[Awaited<ReturnType<typeof disconnect>>, Response, Response, unknown, number]>(`round ${round}`, [
      () => disconnect(prisma, { userId: pieter.id }, pieter, { now: at }),
      () => refresh(c.tokens.refresh_token, c.address, at),
      () => revoke({ token: c.tokens.refresh_token }, at),
      () => verify(c.tokens.access_token, c.key, at),
      () => prisma.$transaction((tx) => endConnectionsForPasswordReset(tx, pieter.id, at)),
    ]);
    assert.equal(done.ok, true, `round ${round}`);
    assert.equal(await liveConnections(pieter.id), 0, `round ${round}`);
    assert.equal(await prisma.oAuthToken.count({ where: { connection: { userId: pieter.id } } }), 0, `round ${round}`);
    t = plus(t, 3_600_000);
  }
});

test("two Connect taps at once, many rounds: one address, and both taps get it", { skip, timeout: racing }, async () => {
  const pieter = await partner("Pieter");
  let t = nextDay();
  for (let round = 0; round < ROUNDS; round++) {
    const [x, y] = await together<[string | null, string | null]>(`round ${round}`, [() => connectAddress(prisma, cfg, pieter.id, t), () => connectAddress(prisma, cfg, pieter.id, t)]);
    assert.ok(x && y, `round ${round}`);
    assert.equal(x, y, `round ${round}: two taps were shown two addresses`);
    // The one both were shown is the one that works.
    assert.equal((await userRow(pieter.id)).claudeKeyHash, hashToken(keyOfResource(x, cfg) ?? ""), `round ${round}`);
    // Disconnect retires it, so the next round starts with none.
    assert.equal((await disconnect(prisma, { userId: pieter.id }, pieter, { now: plus(t, 1_000) })).ok, true);
    t = plus(t, 3_600_000);
  }
});

test("ending a partner's Claude for a reset takes their row first, even when the caller hasn't written to it yet", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const t0 = nextDay();
  const { address } = await addressOf(pieter, t0);
  const opened = await open(address, plus(t0, 1_000), pieter);
  assert.ok(opened.cookie && opened.rid);
  const at = plus(t0, 2_000);

  // A caller that ends the connections before it writes the new password. The helper's own lock has to make the
  // Allow wait: with nothing held, the Allow would finish in the gap and its connection would outlive the reset.
  let allowing: Promise<Awaited<ReturnType<typeof approveParked>> | "waited"> | undefined;
  await prisma.$transaction(
    async (tx) => {
      assert.equal(await endConnectionsForPasswordReset(tx, pieter.id, at), 0);
      const allow = approveParked(prisma, cfg, { cookie: opened.cookie, rid: opened.rid, userId: pieter.id, now: at, ipHash: BROWSER_IP });
      allowing = allow.then((result) => result);
      // Either it is stopped at the partner's row, or (with no lock) it has already gone through.
      await Promise.race([allow, untilWaiting(1)]);
      await tx.user.update({ where: { id: pieter.id }, data: { passwordHash: "new.hash", passwordChangedAt: at } });
    },
    { timeout: 20_000 },
  );
  const allowed = await allowing;
  assert.deepEqual(allowed, { ok: false, reason: "expired", why: "password-changed" });
  assert.equal(await liveConnections(pieter.id), 0, "no connection made under the old password outlived the reset");
  assert.deepEqual(await written(pieter.id), NOTHING);
});

test("Claude's calls don't wait behind an open transaction that wrote a row naming the partner", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 30 * 60_000);
  const opened = await open(c.address, at, pieter);
  assert.ok(opened.cookie && opened.rid);

  // A refresh, its repeat, a bearer check, a revoke and an Allow, each while that transaction is still open.
  const started: Promise<unknown>[] = [];
  const now = <T>(call: Promise<T>): Promise<T | "waited"> => {
    started.push(call.catch(() => {}));
    return soon(call);
  };
  const answers = await whileRowReferenced(pieter.id, async () => {
    const swapped = await now(refresh(c.tokens.refresh_token, c.address, at));
    const repeated = await now(refresh(c.tokens.refresh_token, c.address, plus(at, 1_000)));
    const checked = await now(verify(c.tokens.access_token, c.key, plus(at, 2_000)));
    const handedBack = await now(revoke({ token: c.tokens.access_token }, plus(at, 3_000)));
    const allowed = await now(approveParked(prisma, cfg, { cookie: opened.cookie, rid: opened.rid, userId: pieter.id, now: plus(at, 4_000), ipHash: BROWSER_IP }));
    return { swapped, repeated, checked, handedBack, allowed };
  });
  // Whatever was still waiting finishes now that the other transaction is gone, before anything is judged.
  await Promise.all(started);
  for (const [name, answer] of Object.entries(answers)) assert.notEqual(answer, "waited", `${name} waited for the other transaction`);
  assert.equal((answers.swapped as Response).status, 200);
  assert.equal((answers.repeated as Response).status, 200);
  assert.ok(answers.checked);
  assert.equal((answers.handedBack as Response).status, 200);
  assert.equal((answers.allowed as { ok: boolean }).ok, true);
});

test("Connect and Disconnect take the partner's row whole at the start, so a transaction that names the partner and then waits for the row can't deadlock them", { skip, timeout }, async () => {
  // The other transaction has inserted a row naming the partner, then asks for the partner's row the way every Claude
  // call and a password reset do. Had Connect or Disconnect taken the weaker lock first and asked for more when it
  // wrote the address, the two would each be waiting on the other.
  async function thenLocksRow<T>(userId: string, call: () => Promise<T>): Promise<T> {
    // The call can only finish once the other transaction has ended, so its answer is awaited out here, after it.
    const { running } = await whileRowReferenced(userId, async (holder) => {
      const running = call();
      running.catch(() => {});
      // Stopped at the row, either at its first statement or at its write to the address.
      await untilWaiting(1);
      await holder.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR NO KEY UPDATE`;
      return { running };
    });
    return running;
  }

  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  const done = await thenLocksRow(pieter.id, () => disconnect(prisma, { userId: pieter.id }, pieter, { now: at }));
  assert.deepEqual(done, { ok: true, userId: pieter.id, name: "Pieter", revoked: 1 });
  assert.equal((await userRow(pieter.id)).claudeKeyHash, null);

  // Connect, for a partner with no address yet: the call that writes one.
  const address = await thenLocksRow(pieter.id, () => connectAddress(prisma, cfg, pieter.id, plus(at, 1_000)));
  assert.ok(address);
  assert.equal((await userRow(pieter.id)).claudeKeyHash, hashToken(keyOfResource(address, cfg) ?? ""));
});

// ---------------------------------------------------------------------------
// /api/oauth/revoke
// ---------------------------------------------------------------------------

function revoke(fields: Record<string, string>, when: Date, withCfg: ConnectorConfig | null = cfg, said?: Said, refreshGraceMs?: number): Promise<Response> {
  return revokeEndpoint(new Request(`${cfg.issuer}${REVOKE_PATH}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() }), {
    cfg: withCfg,
    db: prisma,
    now: when,
    ipHash: CLAUDE_IP,
    limit: allow,
    ...(said ? { refused: said.log } : {}),
    ...(refreshGraceMs === undefined ? {} : { refreshGraceMs }),
  });
}

test("Claude handing back its refresh token ends the connection; an access token ends only itself", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);

  // Unknown, or from a client that isn't the connection's: 200, and nothing changes.
  const said = refusals();
  const nothing: Record<string, string>[] = [{ token: randomBytes(32).toString("base64url") }, { token: "junk" }, { token: c.tokens.refresh_token, client_id: FALLBACK_CLIENT_ID }];
  for (const fields of nothing) {
    const res = await revoke(fields, at, cfg, said);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "");
  }
  assert.deepEqual(said.reasons(), ["unknown-token", "malformed", "wrong-client"]);
  assert.ok(await verify(c.tokens.access_token, c.key, at));
  assert.equal((await connection(c.connectionId)).revokedAt, null);

  assert.equal((await revoke({ token: c.tokens.access_token, token_type_hint: "access_token", client_id: CLAUDE_CLIENT_ID }, at)).status, 200);
  assert.equal(await verify(c.tokens.access_token, c.key, at), null);
  assert.equal((await connection(c.connectionId)).revokedAt, null, "the connection is still there");

  // A code, or a refresh token that was replaced more than a minute ago, is not a way to end anything.
  const spent = refusals();
  assert.equal((await revoke({ token: c.code }, at, cfg, spent)).status, 200);
  const swappedAt = plus(at, 1_000);
  const next = await tokensOf(await refresh(c.tokens.refresh_token, c.address, swappedAt));
  assert.ok(await verify(next.access_token, c.key, plus(at, 2_000)));
  const later = plus(swappedAt, REFRESH_GRACE_MS);
  assert.equal((await revoke({ token: c.tokens.refresh_token }, later, cfg, spent)).status, 200);
  assert.deepEqual(spent.seen, [
    { reason: "spent", detail: { connectionId: c.connectionId, userId: pieter.id } },
    { reason: "spent", detail: { connectionId: c.connectionId, userId: pieter.id } },
  ]);
  assert.equal((await connection(c.connectionId)).revokedAt, null);

  assert.equal((await revoke({ token: next.refresh_token }, plus(later, 1_000))).status, 200);
  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt?.getTime(), later.getTime() + 1_000);
  assert.equal(row.revokedByUserId, null);
  assert.equal(await verify(next.access_token, c.key, plus(later, 2_000)), null);
  assert.deepEqual((await trail(pieter.id)).at(-1), ["CLAUDE_DISCONNECTED", "claude"]);
  // Claude removing the connector leaves the address: adding it again needs no new one.
  assert.equal(await connectAddress(prisma, cfg, pieter.id, plus(later, 3_000)), c.address);
});

test("a refresh answered a second time is written down with its connection, and nothing else about it", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 30 * 60_000);
  const said = refusals();
  const first = await tokensOf(await refresh(c.tokens.refresh_token, c.address, at, {}, { said }));
  assert.deepEqual(said.seen, [], "a first answer is no event");

  // As anyone holding the spent token could send it: no client id, no address.
  const again = await tokensOf(await tokenCall({ grant_type: "refresh_token", refresh_token: c.tokens.refresh_token }, plus(at, 10_000), { said }));
  assert.deepEqual([again.access_token, again.refresh_token], [first.access_token, first.refresh_token]);
  await tokensOf(await refresh(c.tokens.refresh_token, c.address, plus(at, 20_000), {}, { said }));
  const repeat = { reason: "refresh-repeat", detail: { connectionId: c.connectionId, userId: pieter.id } };
  assert.deepEqual(said.seen, [repeat, repeat]);
  const logged = JSON.stringify(said.seen);
  for (const secret of [c.key, c.tokens.refresh_token, first.access_token, first.refresh_token]) assert.ok(!logged.includes(secret));
  // The tables say nothing about a repeat; the log line is its only trace.
  assert.deepEqual(await trail(pieter.id), [["CLAUDE_CONNECTED", "allowed"], ["CLAUDE_CONNECTED", "exchanged"]]);
});

test("Claude handing back a refresh token it already swapped ends nothing, inside the minute or after it", { skip, timeout }, async () => {
  // A client that tidies up the token it just rotated out must not disconnect a partner whose Claude is working.
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 30 * 60_000);
  const next = await tokensOf(await refresh(c.tokens.refresh_token, c.address, at));
  const said = refusals();
  assert.equal((await revoke({ token: c.tokens.refresh_token, client_id: CLAUDE_CLIENT_ID }, plus(at, 10_000), cfg, said)).status, 200);
  assert.equal((await revoke({ token: c.tokens.refresh_token }, plus(at, REFRESH_GRACE_MS + 1_000), cfg, said)).status, 200);
  assert.deepEqual(said.reasons(), ["spent", "spent"]);
  assert.equal((await connection(c.connectionId)).revokedAt, null);
  assert.ok(await verify(next.access_token, c.key, plus(at, 11_000)), "the new access token still works");
  assert.equal((await listConnections(prisma, cfg, plus(at, 12_000))).find((r) => r.userId === pieter.id)?.connection?.id, c.connectionId);

  // The live refresh token still ends it: that is Claude saying the partner removed the connector.
  const endedAt = plus(at, 90_000);
  assert.equal((await revoke({ token: next.refresh_token, client_id: CLAUDE_CLIENT_ID }, endedAt, cfg, said)).status, 200);
  const row = await connection(c.connectionId);
  assert.equal(row.revokedAt?.getTime(), endedAt.getTime());
  assert.equal(row.revokedByUserId, null);
  assert.equal(await prisma.oAuthToken.count({ where: { connectionId: c.connectionId } }), 0);
  assert.equal(await verify(next.access_token, c.key, plus(endedAt, 1)), null);
  assert.deepEqual((await trail(pieter.id)).at(-1), ["CLAUDE_DISCONNECTED", "claude"]);
});

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

test("with the connector off, live tokens get a 404 and nothing is written, and Disconnect and Settings still work", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const at = plus(c.connectedAt, 60_000);
  const before = await prisma.oAuthToken.findMany({ where: { connectionId: c.connectionId }, orderBy: { id: "asc" } });

  const res = await tokenCall({ grant_type: "refresh_token", refresh_token: c.tokens.refresh_token, client_id: CLAUDE_CLIENT_ID }, at, { cfg: null });
  assert.equal(res.status, 404);
  assert.equal(await res.text(), "Not found");
  assert.equal((await revoke({ token: c.tokens.refresh_token }, at, null)).status, 404);
  assert.equal(unauthorizedEndpoint(null, c.key, new Headers({ authorization: `Bearer ${c.tokens.access_token}` })).status, 404);

  assert.deepEqual(await prisma.oAuthToken.findMany({ where: { connectionId: c.connectionId }, orderBy: { id: "asc" } }), before);
  assert.equal((await connection(c.connectionId)).revokedAt, null);
  // Back on, the same refresh token still works: off loses nothing by itself.
  assert.equal((await refresh(c.tokens.refresh_token, c.address, plus(at, 1_000))).status, 200);

  // Settings lists the connection with nothing but the app's origin, and Disconnect needs no config at all: both are
  // what a partner uses to end a connection while the connector is switched off.
  const listed = (await listConnections(prisma, { issuer: cfg.issuer }, plus(at, 2_000))).find((r) => r.userId === pieter.id);
  assert.equal(listed?.connection?.id, c.connectionId);
  assert.equal(disconnect.length, 4, "the database, whose, by whom, and when: no connector config");
  assert.equal((await disconnect(prisma, { userId: pieter.id }, pieter, { now: plus(at, 3_000) })).ok, true);
  // Switched back on, nothing comes back.
  assert.equal(await verify(c.tokens.access_token, c.key, plus(at, 4_000)), null);
  await invalidGrant(await refresh(c.tokens.refresh_token, c.address, plus(at, 4_000)));
});

// ---------------------------------------------------------------------------
// Settings › Claude
// ---------------------------------------------------------------------------

test("Settings lists every partner who can sign in, each with their live connection or none", { skip, timeout }, async () => {
  const connor = await partner("Connor");
  const pieter = await partner("Pieter");
  const off = await partner("Off", { passwordHash: null });
  const waiting = await partner("Waiting");
  const t0 = nextDay();
  const c = await connected(connor, t0);
  await verify(c.tokens.access_token, c.key, plus(c.connectedAt, 90_000));
  // Allowed, but Claude never swapped the code: not connected.
  await approved(waiting, t0);

  const rows = await listConnections(prisma, cfg, plus(c.connectedAt, 120_000));
  const mine = (id: string) => rows.find((r) => r.userId === id);
  assert.deepEqual(mine(connor.id), {
    userId: connor.id,
    name: "Connor",
    email: connor.email,
    connection: { id: c.connectionId, connectedAt: c.connectedAt, lastUsedAt: plus(c.connectedAt, 90_000) },
  });
  assert.deepEqual(mine(pieter.id), { userId: pieter.id, name: "Pieter", email: pieter.email, connection: null });
  assert.deepEqual(mine(waiting.id)?.connection, null);
  assert.equal(mine(off.id), undefined);
  const order = [connor.id, pieter.id, waiting.id].map((id) => rows.findIndex((r) => r.userId === id));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "by name");
});

test("a connection reads as connected only while it holds a refresh token Claude can still use", { skip, timeout }, async () => {
  const pieter = await partner("Pieter");
  const c = await connected(pieter, nextDay());
  const listed = async (at: Date, withCfg: Pick<ConnectorConfig, "issuer"> = cfg) => (await listConnections(prisma, withCfg, at)).find((r) => r.userId === pieter.id)?.connection ?? null;

  assert.equal((await listed(plus(c.connectedAt, REFRESH_TTL_MS - 1)))?.id, c.connectionId);
  // 60 idle days: the refresh token has run out, so nothing can use the connection again.
  assert.equal(await listed(plus(c.connectedAt, REFRESH_TTL_MS)), null);
  // The app moved to another address: every stored token names the old one.
  assert.equal(await listed(plus(c.connectedAt, DAY), { issuer: "https://moved.example.test" }), null);

  // A refresh keeps it alive from then on, and the spent token alone would not.
  const at = plus(c.connectedAt, 59 * DAY);
  const next = await tokensOf(await refresh(c.tokens.refresh_token, c.address, at));
  assert.equal((await listed(plus(c.connectedAt, REFRESH_TTL_MS + DAY)))?.id, c.connectionId);
  await prisma.oAuthToken.deleteMany({ where: { tokenHash: hashToken(next.refresh_token) } });
  assert.equal(await listed(plus(at, 1_000)), null, "only a spent refresh token is left");
});

test("whether anyone is connected agrees with the Settings list in every state a connection can be in", { skip, timeout }, async () => {
  // A clock no other row in this database is near: every refresh token anyone else holds ran out decades before, so
  // the answer here is about this test's own partner.
  const far = new Date("2095-03-01T15:00:00Z");
  const pieter = await partner("Pieter");
  const any = (at: Date, withCfg: Pick<ConnectorConfig, "issuer"> = cfg) => anyLiveConnection(prisma, withCfg, at);
  const listed = async (at: Date, withCfg: Pick<ConnectorConfig, "issuer"> = cfg) => (await listConnections(prisma, withCfg, at)).some((r) => r.connection !== null);
  const is = async (expected: boolean, at: Date, label: string, withCfg: Pick<ConnectorConfig, "issuer"> = cfg) => {
    assert.equal(await any(at, withCfg), expected, label);
    assert.equal(await listed(at, withCfg), expected, `${label} (the list)`);
  };

  await is(false, far, "nobody has connected");
  const a = await approved(pieter, far);
  await is(false, plus(a.allowedAt, 1_000), "allowed, but Claude never swapped the code");
  const tokens = await tokensOf(await exchange(a, plus(a.allowedAt, 5_000)));
  const at = plus(a.allowedAt, 60_000);
  await is(true, at, "connected");
  // With the connector off Settings has only the app's origin to judge by.
  await is(true, at, "connected, judged by the origin alone", { issuer: cfg.issuer });

  // States the one small query can't see by itself: it finds a connection, and the whole rule says no.
  await is(false, at, "the app moved to another address", { issuer: "https://moved.example.test" });
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordChangedAt: plus(a.allowedAt, 1) } });
  await is(false, at, "the password changed after it was made");
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordChangedAt: null, passwordHash: null } });
  await is(false, at, "the login is off");
  const kept = await userRow(pieter.id);
  await prisma.user.update({ where: { id: pieter.id }, data: { passwordHash: "salt.hash", claudeKeyHash: null } });
  await is(false, at, "the address was retired");
  await prisma.user.update({ where: { id: pieter.id }, data: { claudeKeyHash: kept.claudeKeyHash } });
  await is(true, at, "back as it was");

  // States the query sees for itself.
  await is(true, plus(a.allowedAt, 5_000 + REFRESH_TTL_MS - 1), "the last moment of its refresh token");
  await is(false, plus(a.allowedAt, 5_000 + REFRESH_TTL_MS), "its refresh token ran out");
  await tokensOf(await refresh(tokens.refresh_token, a.address, at));
  await is(true, plus(at, 1_000), "after a refresh: the spent token doesn't count, the new one does");
  await disconnect(prisma, { userId: pieter.id }, pieter, { now: plus(at, 2_000) });
  await is(false, plus(at, 3_000), "disconnected");
});
