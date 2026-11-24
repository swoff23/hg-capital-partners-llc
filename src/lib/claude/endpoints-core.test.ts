import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { Event } from "@sentry/browser";
import { NextRequest } from "next/server";
import { scrubBreadcrumb, scrubEvent, scrubText } from "@/lib/error-report";
import { MAX_NEXT_LENGTH, STAFF_PATH_HEADER, staffReturnPath } from "@/lib/next-path";
import { isWellFormedToken, newToken } from "@/lib/portal/tokens";
import { config as proxyConfig, proxy } from "@/proxy";
import { anyLiveConnection, type Db, type KeyOwner } from "./connections-core";
import {
  AUTHORIZE_REFUSED,
  AUTHORIZE_TOO_MANY,
  AUTHORIZE_WRONG_ADDRESS,
  BEARER_LOG_EVERY_MS,
  authorizationServerEndpoint,
  authorizeEndpoint,
  methodNotAllowedEndpoint,
  notFound,
  oncePerMinute,
  protectedResourceEndpoint,
  revokeEndpoint,
  tokenEndpoint,
  unauthorizedEndpoint,
  type AuthorizeInput,
  type RateResult,
} from "./endpoints-core";
import {
  APPROVE_PATH,
  AUTHORIZATION_SERVER_PATH,
  AUTHORIZE_PATH,
  CLAUDE_CALLBACK,
  CLAUDE_CLIENT_ID,
  MCP_PATH,
  PENDING_COOKIE_HTTP,
  PENDING_COOKIE_HTTPS,
  PROTECTED_RESOURCE_PATH,
  REFUSALS,
  REVOKE_PATH,
  TOKEN_PATH,
  authorizationServerMetadata,
  claudeAddressKey,
  connectorAddress,
  connectorConfigFor,
  passwordEpoch,
  pkceChallenge,
  protectedResourceMetadata,
  protectedResourceMetadataUrl,
  readPending,
  type Refusal,
  type RefusalDetail,
} from "./oauth-core";

// What each sign-in endpoint answers before any row is read (docs/specs/tasks-from-claude.md, section 8), and what
// the route files and oauth.ts hand them, read as source because loading them would load Next. The flow that needs
// rows is in oauth.pg.test.ts.

const SECRET = "test-secret-test-secret-test-secret-test";
const cfg = connectorConfigFor("https://app.example.test", SECRET);
const NOW = new Date("2026-11-20T15:00:00Z");
const allow = (): RateResult => ({ ok: true });
/** A database that fails the test if anything touches it. */
const noDb = new Proxy({}, { get: (_t, prop) => assert.fail(`the database was touched (${String(prop)})`) }) as Db;
/** A rate limit that fails the test if anything counts against it. */
const noLimit = (): RateResult => assert.fail("the rate limit was counted");
/** A key lookup that fails the test if anything asks it. */
const noLookup = (): Promise<KeyOwner | null> => assert.fail("the key was looked up");

/** Two partners, each with an address of their own, and a key that is nobody's. */
const OWNER: KeyOwner = { id: "user-owner", passwordChangedAt: new Date("2026-10-01T00:00:00Z") };
const OTHER: KeyOwner = { id: "user-other", passwordChangedAt: null };
const KEY = claudeAddressKey("key-id-owner", SECRET);
const OTHER_KEY = claudeAddressKey("key-id-other", SECRET);
const NOBODYS_KEY = newToken();
const ADDRESS = connectorAddress(cfg, KEY);
const owners = async (key: string): Promise<KeyOwner | null> => (key === KEY ? OWNER : key === OTHER_KEY ? OTHER : null);

function authorizeUrl(over: Record<string, string | null> = {}): URL {
  const params: Record<string, string | null> = {
    response_type: "code",
    client_id: CLAUDE_CLIENT_ID,
    redirect_uri: CLAUDE_CALLBACK,
    state: "st-123",
    code_challenge: pkceChallenge("v".repeat(43)),
    code_challenge_method: "S256",
    resource: ADDRESS,
    scope: "drafts",
    ...over,
  };
  const url = new URL(`${cfg.issuer}${AUTHORIZE_PATH}`);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  return url;
}

/** Every refusal an endpoint reported, as the logs would get it. */
function refusals() {
  const seen: { reason: Refusal; detail?: RefusalDetail }[] = [];
  return { seen, log: (reason: Refusal, detail?: RefusalDetail) => void seen.push(detail ? { reason, detail } : { reason }) };
}

function authorize(over: Partial<AuthorizeInput> = {}): Promise<Response> {
  return authorizeEndpoint({ cfg, url: authorizeUrl(), now: NOW, viewer: null, ownerOfKey: owners, secure: true, limit: allow, ...over });
}

function post(pathname: string, body: Record<string, string>, headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" }): Request {
  return new Request(`${cfg.issuer}${pathname}`, { method: "POST", headers, body: new URLSearchParams(body).toString() });
}

const noStore = (res: Response) => assert.equal(res.headers.get("cache-control"), "no-store");

/** The parked request an authorize answer set, read back as the approval screen would. */
function parkedBy(res: Response, name = PENDING_COOKIE_HTTPS) {
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.ok(cookie.startsWith(`${name}=`), cookie.slice(0, 40));
  return readPending(cookie.slice(name.length + 1).split(";")[0], { secret: SECRET, now: NOW.getTime() });
}

function repoRoot(): string {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, "prisma", "schema.prisma"))) {
    const up = path.dirname(root);
    assert.notEqual(up, root, "could not find the repo root");
    root = up;
  }
  return root;
}
const repoFile = (file: string) => fs.readFileSync(path.join(repoRoot(), file), "utf8");
const repoHas = (file: string) => fs.existsSync(path.join(repoRoot(), file));

// ---------------------------------------------------------------------------
// The flag
// ---------------------------------------------------------------------------

test("with the connector off every endpoint is a 404 that reads nothing and counts nothing, whatever the method", async () => {
  const off = { cfg: null, db: noDb, now: NOW, limit: noLimit };
  const answers = [
    protectedResourceEndpoint(null, KEY),
    authorizationServerEndpoint(null),
    await authorizeEndpoint({ cfg: null, url: authorizeUrl(), now: NOW, viewer: { id: OWNER.id }, ownerOfKey: noLookup, secure: true, limit: noLimit }),
    await tokenEndpoint(post(TOKEN_PATH, { grant_type: "refresh_token", refresh_token: newToken() }), off),
    await revokeEndpoint(post(REVOKE_PATH, { token: newToken() }), off),
    unauthorizedEndpoint(null, KEY, new Headers({ authorization: `Bearer ${newToken()}` })),
    // OPTIONS, HEAD, PUT and the rest: the same plain 404 as a method the route serves.
    methodNotAllowedEndpoint(null, ["POST"]),
    methodNotAllowedEndpoint(null, ["GET", "HEAD"]),
  ];
  for (const res of answers) {
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "Not found");
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(res.headers.get("www-authenticate"), null);
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("allow"), null);
  }
});

test("with the connector on, a method a route doesn't serve is a 405 that names the ones it does", async () => {
  const res = methodNotAllowedEndpoint(cfg, ["GET", "HEAD"]);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET, HEAD");
  noStore(res);
  assert.equal(methodNotAllowedEndpoint(cfg, ["POST"]).headers.get("allow"), "POST");
});

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

test("the discovery document for an address is served for any well-formed key, and never says whether the key is anyone's", async () => {
  const bodies: string[] = [];
  for (const key of [KEY, OTHER_KEY, NOBODYS_KEY]) {
    const res = protectedResourceEndpoint(cfg, key);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
    noStore(res);
    const body = await res.json();
    assert.deepEqual(body, protectedResourceMetadata(cfg, key));
    assert.equal(body.resource, `https://app.example.test/api/mcp/${key}`);
    bodies.push(JSON.stringify(body).replaceAll(key, "<key>"));
  }
  assert.equal(new Set(bodies).size, 1, "the same document for a real key and for one nobody has");

  for (const malformed of ["", "short", "mcp", KEY.slice(1), `${KEY}x`, `${KEY.slice(0, -1)}.`, "[key]"]) {
    assert.equal(isWellFormedToken(malformed), false, malformed);
    assert.equal(protectedResourceEndpoint(cfg, malformed).status, 404, malformed);
  }
});

test("the authorization server document is served as JSON", async () => {
  const server = authorizationServerEndpoint(cfg);
  assert.equal(server.status, 200);
  assert.match(server.headers.get("content-type") ?? "", /^application\/json/);
  assert.deepEqual(await server.json(), authorizationServerMetadata(cfg));
});

test("every address the discovery documents and the 401 name is a route file in this app, and no address works without a key", () => {
  const routeFor = (address: string) => `src/app/${new URL(address).pathname.split("/").filter(Boolean).join("/")}/route.ts`;
  const doc = authorizationServerMetadata(cfg);
  for (const address of [doc.authorization_endpoint, doc.token_endpoint, doc.revocation_endpoint, `${cfg.issuer}${AUTHORIZATION_SERVER_PATH}`]) {
    assert.ok(repoHas(routeFor(address)), `no route file for ${address}`);
  }
  // A partner's address and its discovery document: one dynamic segment, the key.
  assert.equal(routeFor(connectorAddress(cfg, "[key]")), "src/app/api/mcp/[key]/route.ts");
  assert.ok(repoHas("src/app/api/mcp/[key]/route.ts"));
  assert.equal(routeFor(protectedResourceMetadataUrl(cfg, "[key]")), "src/app/.well-known/oauth-protected-resource/api/mcp/[key]/route.ts");
  assert.ok(repoHas("src/app/.well-known/oauth-protected-resource/api/mcp/[key]/route.ts"));
  // The shorter addresses have no route at all, so each is a 404: there is no connector and no document without a key.
  for (const gone of ["src/app/api/mcp/route.ts", "src/app/.well-known/oauth-protected-resource/route.ts", "src/app/.well-known/oauth-protected-resource/api/mcp/route.ts"]) {
    assert.equal(repoHas(gone), false, gone);
  }
  // Nobody can register a client: there is no such endpoint to find.
  for (const name of ["register", "registration", "clients"]) assert.equal(repoHas(`src/app/api/oauth/${name}`), false, name);
  assert.equal(doc.issuer, new URL(protectedResourceMetadata(cfg, KEY).authorization_servers[0]).origin, "the issuer has no path, so its metadata is at the root well-known address");
});

test("the proxy leaves the sign-in and discovery paths alone, and hands the approval screen its path with the request id", () => {
  const matcher: string[] = proxyConfig.matcher;
  // A matcher entry is a literal path, or a prefix ending in /:path*.
  const covers = (pathname: string) => matcher.some((m) => (m.endsWith("/:path*") ? pathname === m.slice(0, -8) || pathname.startsWith(m.slice(0, -7)) : pathname === m));
  for (const p of [AUTHORIZE_PATH, TOKEN_PATH, REVOKE_PATH, MCP_PATH, `${MCP_PATH}/${KEY}`, PROTECTED_RESOURCE_PATH, `${PROTECTED_RESOURCE_PATH}${MCP_PATH}/${KEY}`, AUTHORIZATION_SERVER_PATH]) {
    assert.equal(covers(p), false, p);
  }
  // requireUser() on the approval screen reads this header to send a signed-out partner to /login?next=<the screen>.
  assert.ok(covers(APPROVE_PATH));
  const rid = newToken();
  const res = proxy(new NextRequest(`${cfg.issuer}${APPROVE_PATH}?r=${rid}`));
  assert.equal(res.headers.get(`x-middleware-request-${STAFF_PATH_HEADER}`), `${APPROVE_PATH}?r=${rid}`);
});

// ---------------------------------------------------------------------------
// /api/oauth/authorize
// ---------------------------------------------------------------------------

test("signed out with a real key, the request is parked for the key's owner and the browser goes through sign-in to the approval screen", async () => {
  const res = await authorize({ viewer: null });
  assert.equal(res.status, 303);
  noStore(res);
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");

  const cookie = res.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^__Host-claude_oauth_pending=[A-Za-z0-9_.-]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/);
  const pending = parkedBy(res);
  assert.ok(pending);
  assert.deepEqual(
    { clientId: pending.clientId, redirectUri: pending.redirectUri, state: pending.state, key: pending.key, resource: pending.resource, userId: pending.userId, epoch: pending.epoch, iat: pending.iat, exp: pending.exp },
    {
      clientId: CLAUDE_CLIENT_ID,
      redirectUri: CLAUDE_CALLBACK,
      state: "st-123",
      key: KEY,
      resource: ADDRESS,
      userId: OWNER.id,
      epoch: passwordEpoch(SECRET, OWNER.id, OWNER.passwordChangedAt),
      iat: NOW.getTime(),
      exp: NOW.getTime() + 600_000,
    },
  );
  assert.ok(isWellFormedToken(pending.rid));

  // The login's ?next= is the approval screen for this one request, a page the staff app accepts.
  const location = res.headers.get("location") ?? "";
  const screen = `${APPROVE_PATH}?r=${pending.rid}`;
  assert.equal(location, `/login?next=${encodeURIComponent(screen)}`);
  assert.equal(staffReturnPath(screen), screen);
});

test("the request's own long address could never ride in the login's next, which is why it waits in the cookie", () => {
  const asked = authorizeUrl({ state: "s".repeat(600) });
  assert.equal(staffReturnPath(asked.pathname + asked.search), null);
  assert.ok((asked.pathname + asked.search).length > MAX_NEXT_LENGTH);
});

test("signed in as the key's owner, the request is parked and the approval screen for it is next", async () => {
  const res = await authorize({ viewer: { id: OWNER.id }, secure: false });
  assert.equal(res.status, 303);
  // Local http can't set a Secure cookie, so it gets the plain name and no Secure.
  assert.match(res.headers.get("set-cookie") ?? "", /^claude_oauth_pending=[A-Za-z0-9_.-]+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax$/);
  const pending = parkedBy(res, PENDING_COOKIE_HTTP);
  assert.ok(pending);
  assert.equal(pending.userId, OWNER.id);
  assert.equal(res.headers.get("location"), `${APPROVE_PATH}?r=${pending.rid}`);
});

test("each request gets an id of its own, so one parked over another is a different request", async () => {
  const first = parkedBy(await authorize({ viewer: { id: OWNER.id } }));
  const second = parkedBy(await authorize({ viewer: { id: OWNER.id } }));
  assert.ok(first && second);
  assert.notEqual(first.rid, second.rid);
});

test("a key that is nobody's gets the wrong-address page: no cookie, no redirect, nothing sent to Claude", async () => {
  for (const viewer of [null, { id: OWNER.id }]) {
    const said = refusals();
    const res = await authorize({ url: authorizeUrl({ resource: connectorAddress(cfg, NOBODYS_KEY) }), viewer, refused: said.log });
    assert.equal(res.status, 400);
    assert.equal(await res.text(), AUTHORIZE_WRONG_ADDRESS);
    assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null, "a waiting request is left as it was");
    noStore(res);
    assert.deepEqual(said.seen, [{ reason: "unknown-address" }]);
  }
});

test("a signed-in partner who opens a request for the other partner's address gets the same page, and nothing is parked", async () => {
  const said = refusals();
  const res = await authorize({ url: authorizeUrl({ resource: connectorAddress(cfg, OTHER_KEY) }), viewer: { id: OWNER.id }, refused: said.log });
  assert.equal(res.status, 400);
  assert.equal(await res.text(), AUTHORIZE_WRONG_ADDRESS);
  assert.equal(res.headers.get("location"), null);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.deepEqual(said.seen, [{ reason: "not-owner", detail: { userId: OWNER.id } }]);

  // The same request in the other partner's own browser is theirs to approve.
  const theirs = await authorize({ url: authorizeUrl({ resource: connectorAddress(cfg, OTHER_KEY) }), viewer: { id: OTHER.id } });
  assert.equal(parkedBy(theirs)?.userId, OTHER.id);
});

test("a request that isn't Claude's is refused on the spot: no redirect, no cookie, and the key is never looked up", async () => {
  const notClaude: [Record<string, string | null>, Refusal][] = [
    [{ client_id: "https://evil.example/c.json" }, "unknown-client"],
    [{ redirect_uri: "https://evil.example/cb" }, "wrong-redirect"],
    [{ redirect_uri: "http://localhost:3118/callback" }, "wrong-redirect"],
    [{ client_id: null }, "unknown-client"],
  ];
  for (const [over, reason] of notClaude) {
    const said = refusals();
    const res = await authorize({ url: authorizeUrl(over), viewer: { id: OWNER.id }, ownerOfKey: noLookup, refused: said.log });
    assert.equal(res.status, 400);
    assert.equal(await res.text(), AUTHORIZE_REFUSED);
    assert.equal(res.headers.get("location"), null);
    assert.equal(res.headers.get("set-cookie"), null);
    noStore(res);
    assert.equal(said.seen.length, 1);
    assert.equal(said.seen[0].reason, reason);
  }
});

test("an unknown client's id reaches the logs cut to 200 printable characters, and no log line ever holds the key", async () => {
  const said = refusals();
  await authorize({ url: authorizeUrl({ client_id: `https://new.claude.example/\u0007${"x".repeat(400)}` }), refused: said.log });
  const logged = said.seen[0].detail?.clientId ?? "";
  assert.equal(logged.length, 200);
  assert.match(logged, /^https:\/\/new\.claude\.example\/\?x+$/);

  // Every way a request that names a real key can be turned away or sent on: none writes the key down.
  await authorize({ url: authorizeUrl({ resource: `${ADDRESS}/extra` }), refused: said.log });
  await authorize({ url: authorizeUrl({ resource: `https://elsewhere.example/api/mcp/${KEY}` }), refused: said.log });
  await authorize({ url: authorizeUrl({ code_challenge_method: "plain" }), refused: said.log });
  await authorize({ viewer: { id: OTHER.id }, refused: said.log });
  await authorize({ url: authorizeUrl({ state: '"'.repeat(2048) }), refused: said.log });
  assert.deepEqual(
    said.seen.map((s) => s.reason),
    ["unknown-client", "wrong-resource", "wrong-resource", "bad-pkce", "not-owner", "too-large"],
  );
  assert.ok(!JSON.stringify(said.seen).includes(KEY));
  for (const { reason } of said.seen) assert.ok(REFUSALS.includes(reason));
});

test("a request too big to park in a cookie is refused out loud, not dropped by the browser", async () => {
  // 2,048 quotes pass the state check, and each one doubles when the request is written down.
  const res = await authorize({ url: authorizeUrl({ state: '"'.repeat(2048) }) });
  assert.equal(res.status, 400);
  assert.equal(await res.text(), AUTHORIZE_REFUSED);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal((await authorize({ url: authorizeUrl({ state: "s".repeat(2048) }) })).status, 303);
});

test("a request Claude got wrong goes back to Claude's callback as an error, with nothing parked and no key looked up", async () => {
  const res = await authorize({ url: authorizeUrl({ code_challenge_method: "plain" }), viewer: { id: OWNER.id }, ownerOfKey: noLookup });
  assert.equal(res.status, 303);
  const to = new URL(res.headers.get("location") ?? "");
  assert.equal(`${to.origin}${to.pathname}`, CLAUDE_CALLBACK);
  assert.deepEqual([...to.searchParams], [["error", "invalid_request"], ["state", "st-123"]]);
  assert.equal(res.headers.get("set-cookie"), null);

  // No address, the address without a key, another site's, and a key that isn't one: each is invalid_target.
  const wrong: (string | null)[] = [null, `${cfg.issuer}${MCP_PATH}`, `https://app-example.test/api/mcp/${KEY}`, `${cfg.issuer}${MCP_PATH}/short`, `${ADDRESS}?x=1`];
  for (const resource of wrong) {
    const answer = await authorize({ url: authorizeUrl({ resource }), ownerOfKey: noLookup });
    assert.equal(answer.status, 303, String(resource));
    assert.equal(new URL(answer.headers.get("location") ?? "").searchParams.get("error"), "invalid_target", String(resource));
    assert.equal(answer.headers.get("set-cookie"), null);
  }
});

test("too many tries from one address get a 429 before anything is read", async () => {
  const said = refusals();
  const res = await authorize({ limit: () => ({ ok: false, retryAfterMs: 12_400 }), ownerOfKey: noLookup, refused: said.log });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "13");
  assert.equal(await res.text(), AUTHORIZE_TOO_MANY);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.deepEqual(said.seen, [{ reason: "rate-limited" }]);
});

// ---------------------------------------------------------------------------
// /api/oauth/token and /api/oauth/revoke, before any row is read
// ---------------------------------------------------------------------------

test("a malformed token call is an OAuth error, never cached, never reaches the database, and says why only in the logs", async () => {
  const deps = { cfg, db: noDb, now: NOW, limit: allow };
  const said = refusals();
  const cases: [Request, string][] = [
    [post(TOKEN_PATH, { grant_type: "refresh_token", refresh_token: newToken() }, { "content-type": "application/json" }), "invalid_request"],
    [post(TOKEN_PATH, {}), "invalid_request"],
    [post(TOKEN_PATH, { grant_type: "client_credentials" }), "unsupported_grant_type"],
    [post(TOKEN_PATH, { grant_type: "authorization_code", code: newToken(), code_verifier: "v".repeat(43), client_id: "https://evil.example/c.json" }), "invalid_client"],
    [post(TOKEN_PATH, { grant_type: "authorization_code", code: "nope", code_verifier: "v".repeat(43), client_id: CLAUDE_CLIENT_ID }), "invalid_grant"],
    [post(TOKEN_PATH, { grant_type: "refresh_token", refresh_token: "nope" }), "invalid_grant"],
    [new Request(`${cfg.issuer}${TOKEN_PATH}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${newToken()}&pad=${"x".repeat(9000)}` }), "invalid_request"],
  ];
  for (const [request, error] of cases) {
    const res = await tokenEndpoint(request, { ...deps, refused: said.log });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error }, "the code alone, no description");
    noStore(res);
    assert.equal(res.headers.get("pragma"), "no-cache");
  }
  assert.deepEqual(
    said.seen.map((s) => s.reason),
    ["bad-form", "missing-field", "unsupported-grant", "unknown-client", "malformed", "malformed", "bad-form"],
  );
  assert.deepEqual(said.seen[3].detail, { clientId: "https://evil.example/c.json" });
});

test("a rate-limited token or revoke call is a 429, not invalid_grant, so Claude doesn't drop the connection", async () => {
  const deps = { cfg, db: noDb, now: NOW, limit: (): RateResult => ({ ok: false, retryAfterMs: 500 }) };
  for (const res of [await tokenEndpoint(post(TOKEN_PATH, { grant_type: "refresh_token", refresh_token: newToken() }), deps), await revokeEndpoint(post(REVOKE_PATH, { token: newToken() }), deps)]) {
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "1");
    assert.deepEqual(await res.json(), { error: "temporarily_unavailable" });
  }
});

test("a malformed revoke call is refused before the database", async () => {
  const deps = { cfg, db: noDb, now: NOW, limit: allow };
  assert.deepEqual(await (await revokeEndpoint(post(REVOKE_PATH, {}), deps)).json(), { error: "invalid_request" });
  assert.deepEqual(await (await revokeEndpoint(post(REVOKE_PATH, { token: newToken() }, { "content-type": "text/plain" }), deps)).json(), { error: "invalid_request" });
  assert.deepEqual(await (await revokeEndpoint(post(REVOKE_PATH, { token: newToken(), client_id: "someone-else" }), deps)).json(), { error: "invalid_client" });
});

// ---------------------------------------------------------------------------
// The connector's 401
// ---------------------------------------------------------------------------

test("a call with no token gets the 401 that starts Claude's sign-in at that address; one with a bad token is told it's invalid", async () => {
  const none = unauthorizedEndpoint(cfg, KEY, new Headers());
  assert.equal(none.status, 401);
  assert.equal(none.headers.get("www-authenticate"), `Bearer resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/api/mcp/${KEY}", scope="drafts"`);
  assert.deepEqual(await none.json(), { error: "unauthorized" });
  noStore(none);

  const bad = unauthorizedEndpoint(cfg, KEY, new Headers({ authorization: `Bearer ${newToken()}` }));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("www-authenticate"), `Bearer error="invalid_token", resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/api/mcp/${KEY}", scope="drafts"`);
  assert.deepEqual(await bad.json(), { error: "invalid_token" });
});

test("the 401 is the same for a key that is someone's and one that is nobody's, and a malformed key is a 404", async () => {
  const shape = async (key: string) => {
    const res = unauthorizedEndpoint(cfg, key, new Headers());
    return JSON.stringify([res.status, res.headers.get("www-authenticate"), await res.text()]).replaceAll(key, "<key>");
  };
  assert.equal(await shape(KEY), await shape(NOBODYS_KEY));
  for (const malformed of ["", "short", `${KEY}x`, "[key]"]) {
    const res = unauthorizedEndpoint(cfg, malformed, new Headers({ authorization: `Bearer ${newToken()}` }));
    assert.equal(res.status, 404, malformed);
    assert.equal(res.headers.get("www-authenticate"), null);
  }
  assert.equal(notFound().status, 404);
});

test("a turned-away bearer token is written down at most once a minute per reason, and the rest are dropped", () => {
  let now = NOW.getTime();
  const said = refusals();
  const log = oncePerMinute(said.log, () => now);
  // An hour's worth of junk tokens, and one expired token among them.
  for (let i = 0; i < 500; i++) log("unknown-token");
  log("expired", { connectionId: "c1", userId: "u1" });
  log("expired", { connectionId: "c2", userId: "u2" });
  assert.deepEqual(said.seen, [{ reason: "unknown-token" }, { reason: "expired", detail: { connectionId: "c1", userId: "u1" } }]);

  now += BEARER_LOG_EVERY_MS - 1;
  log("unknown-token");
  log("expired");
  assert.equal(said.seen.length, 2, "still inside the minute");
  now += 1;
  log("unknown-token");
  log("unknown-token");
  assert.deepEqual(said.seen.map((s) => s.reason), ["unknown-token", "expired", "unknown-token"]);
  assert.equal(BEARER_LOG_EVERY_MS, 60_000);

  // Each log keeps its own count: the limit is per reason, per server instance.
  const other = refusals();
  oncePerMinute(other.log, () => now)("unknown-token");
  assert.equal(other.seen.length, 1);
});

// ---------------------------------------------------------------------------
// Settings: is anyone connected
// ---------------------------------------------------------------------------

test("asking whether anyone is connected is one small query that reads no user when nobody is", async () => {
  const asked: unknown[] = [];
  const db = {
    claudeConnection: {
      findFirst: async (args: unknown) => {
        asked.push(args);
        return null;
      },
    },
    user: new Proxy({}, { get: (_t, prop) => assert.fail(`the users were read (${String(prop)})`) }),
  } as unknown as Parameters<typeof anyLiveConnection>[0];
  // The app's address is not needed either: nothing is there to judge.
  const noOrigin = { get issuer(): string { return assert.fail("the app's address was read"); } };
  assert.equal(await anyLiveConnection(db, noOrigin, NOW), false);
  assert.deepEqual(asked, [
    {
      where: { revokedAt: null, connectedAt: { not: null }, tokens: { some: { kind: "REFRESH", usedAt: null, expiresAt: { gt: NOW } } } },
      select: { id: true },
    },
  ]);
});

// ---------------------------------------------------------------------------
// The routes and oauth.ts, which load Next and so are read as source
// ---------------------------------------------------------------------------

const ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/** The methods a route file exports. Next answers any other method itself (a 405, or 204 for OPTIONS), flag or no flag. */
function exportedMethods(source: string): string[] {
  const names = [...source.matchAll(/^export (?:async )?(?:function|const) ([A-Z]+)\b/gm)].map((m) => m[1]);
  return ALL_METHODS.filter((m) => names.includes(m));
}

test("each route file is the thin call it should be, and answers every method itself so off means 404 for all of them", () => {
  const routes: [string, string[]][] = [
    [
      "src/app/api/oauth/authorize/route.ts",
      ["export function GET(request: Request): Promise<Response> {\n  return authorizeRoute(request, getCurrentUser);\n}", "export const HEAD = GET;", 'const notServed = (): Response => otherMethodRoute(["GET", "HEAD"]);'],
    ],
    ["src/app/api/oauth/token/route.ts", ["export function POST(request: Request): Promise<Response> {\n  return tokenRoute(request);\n}", 'const notServed = (): Response => otherMethodRoute(["POST"]);']],
    ["src/app/api/oauth/revoke/route.ts", ["export function POST(request: Request): Promise<Response> {\n  return revokeRoute(request);\n}", 'const notServed = (): Response => otherMethodRoute(["POST"]);']],
    [
      "src/app/.well-known/oauth-authorization-server/route.ts",
      ["export function GET(): Response {\n  return authorizationServerRoute();\n}", "export const HEAD = GET;", 'const notServed = (): Response => otherMethodRoute(["GET", "HEAD"]);'],
    ],
    [
      "src/app/.well-known/oauth-protected-resource/api/mcp/[key]/route.ts",
      [
        "export async function GET(_request: Request, { params }: Context): Promise<Response> {\n  return protectedResourceRoute((await params).key);\n}",
        "export const HEAD = GET;",
        'return otherMethodRoute(["GET", "HEAD"], (await params).key);',
      ],
    ],
    [
      "src/app/api/mcp/[key]/route.ts",
      [
        "verify: (request, now) => verifyAccessToken(request, key, now),",
        "unauthorized: (request) => unauthorizedResponse(request, key),",
        "return handleMcp(request, depsFor((await params).key));",
        'return otherMethodRoute(["POST"], (await params).key);',
      ],
    ],
  ];
  for (const [file, lines] of routes) {
    const source = repoFile(file);
    for (const line of lines) assert.ok(source.includes(line), `${file}: ${line}`);
    assert.deepEqual(exportedMethods(source), [...ALL_METHODS], file);
    assert.ok(source.includes('export const dynamic = "force-dynamic";'), file);
    // The environment is read through env.ts alone, and only the authorize route asks who is signed in.
    assert.ok(!/process\.env|cookies\(|requireUser\(/.test(source), file);
    assert.equal(/import \{ getCurrentUser \}/.test(source), file.endsWith("authorize/route.ts"), file);
  }
});

test("oauth.ts hands the endpoints the flag, the limits, the Secure cookie and the real lookups", () => {
  const source = repoFile("src/lib/claude/oauth.ts");
  const has = (line: string) => assert.ok(source.includes(line), line);
  // Off unless the flag is on, and off over a short secret whatever the flag says.
  has("if (!env.claudeConnectorEnabled) return null;");
  has("if (!secretStrongEnough(secret)) {");
  has("return connectorConfigFor(env.appUrl, secret);");
  // Per IP: 20 sign-in requests, 60 token calls and 30 revokes a minute.
  has("const authorizeLimiter = new RateLimiter(20, 60_000);");
  has("const tokenLimiter = new RateLimiter(60, 60_000);");
  has("const revokeLimiter = new RateLimiter(30, 60_000);");
  has("limit: limitBy(authorizeLimiter, clientIp(request.headers), now),");
  has('return tokenLike("claude:token", request, tokenLimiter, endpoints.tokenEndpoint);');
  has('return tokenLike("claude:revoke", request, revokeLimiter, endpoints.revokeEndpoint);');
  // The parked cookie is Secure with the __Host- name in production, written and read by the same rule.
  has("secure: getEnv().isProduction,");
  has("return (await cookies()).get(pendingCookieName(getEnv().isProduction))?.value;");
  // The key's owner comes from the database, and the signed-in viewer from the route's own getCurrentUser.
  has("ownerOfKey: (key) => core.ownerOfKey(prisma, key),");
  has("viewer: user ? { id: user.id } : null,");
  // While the connector is off the authorize route doesn't even read the session cookie.
  assert.ok(source.indexOf("if (!cfg) return endpoints.notFound();") < source.indexOf("const user = await signedIn();"));
  // Allow and Cancel act on the request the form names, as the signed-in partner, and drop the cookie whatever the answer.
  has("await core.approveParked(prisma, cfg, { cookie: await parkedCookie(), rid, userId: user.id, now, ipHash: ipHashOf(await headers()) })");
  has("core.denyParked(cfg, { cookie: await parkedCookie(), rid, userId: user.id, now })");
  assert.equal(source.split("await dropParkedCookie();").length - 1, 2, "once in Allow, once in Cancel");
  has("const check = await core.readApproval(prisma, cfg, { cookie: await parkedCookie(), rid, userId: user.id, now });");
  // The bearer check is held to the key in the address the call came to.
  has("const check = await core.checkAccessToken(prisma, cfg, bearerToken(request.headers), key, now);");
  has("return endpoints.unauthorizedEndpoint(connectorConfig(), key, request.headers);");
  // Disconnect and the Settings list work with the connector off: neither asks connectorConfig.
  has("return core.listConnections(prisma, appOrigin, now);");
  has("return core.disconnect(prisma, target, byUser, { now, ipHash: ipHashOf(await headers()) });");
  // A refusal is a warning line with its one-word reason, never an error line and never an email.
  has("return (reason, detail = {}) => logWarning(scope, new Error(reason), { reason, ...detail });");
  // A turned-away bearer token is quieter: once a minute per reason, and nothing to the reporter.
  has('const bearerRefusalLog: RefusalLog = endpoints.oncePerMinute((reason, detail = {}) => logWarning("claude:mcp-token", new Error(reason), { reason, ...detail }, { report: false }));');
  has('if (check.reason !== "no-token") bearerRefusalLog(check.reason, check.detail);');
  assert.ok(!source.includes('refusalLog("claude:mcp-token")'), "the bearer check never logs a line per call");
  // Whether anyone is connected: the cheap check, and a failed read hides the tab instead of breaking Settings.
  has("export async function anyLiveConnection(now: Date = new Date()): Promise<boolean> {\n  try {\n    return await core.anyLiveConnection(prisma, appOrigin, now);\n  } catch (err) {\n    logError(\"claude:settings\", err);\n    return false;\n  }\n}");
});

test("the approval screen is never cached and never sends its address to another site, and its forms and its opener still work", () => {
  const config = repoFile("next.config.ts");
  const at = config.indexOf('source: "/settings/claude/approve",');
  assert.ok(at > 0);
  const entry = config.slice(at, config.indexOf("],", at));
  for (const header of ['{ key: "Referrer-Policy", value: "same-origin" }', '{ key: "Cache-Control", value: "no-store" }']) {
    assert.ok(entry.includes(header), header);
  }
  // no-referrer would make a form posted before the page's script loads arrive with "Origin: null", which Next
  // refuses, and a Cross-Origin-Opener-Policy would cut the window off from the Claude page that opened it.
  assert.equal(entry.match(/key: "/g)?.length, 2, "these two headers and no other");
  assert.ok(!entry.includes("no-referrer"));
  assert.ok(!entry.includes("Cross-Origin-Opener-Policy"));
});

// ---------------------------------------------------------------------------
// Error reports
// ---------------------------------------------------------------------------

test("an error report from the sign-in paths carries no code, state, token, key or connector address", () => {
  const code = newToken();
  const state = "claude-state-value";
  const callback = `${CLAUDE_CALLBACK}?code=${code}&state=${state}`;
  assert.equal(scrubText(callback), `${CLAUDE_CALLBACK}?code=[redacted]&state=[redacted]`, "Claude's own callback address stays readable");

  const asked = authorizeUrl({ state }).toString();
  const scrubbedAsk = scrubText(asked);
  assert.ok(!scrubbedAsk.includes(state));
  assert.ok(!scrubbedAsk.includes(KEY), "the resource parameter is the partner's address");
  assert.match(scrubbedAsk, /[?&]state=\[redacted\]/);
  assert.match(scrubbedAsk, /[?&]resource=\[redacted\]/);
  assert.match(scrubbedAsk, /^https:\/\/app\.example\.test\/api\/oauth\/authorize\?/, "the path stays, so the report says where");

  // A token is never put in an address, but one that got there by mistake would not leave either.
  for (const name of ["token", "access_token", "refresh_token", "code"]) {
    for (const p of [TOKEN_PATH, REVOKE_PATH, `${MCP_PATH}/${KEY}`, AUTHORIZE_PATH]) {
      const scrubbed = scrubText(`https://app.example.test${p}?x=1&${name}=${code}`);
      assert.ok(!scrubbed.includes(code), `${p} ${name}`);
      assert.ok(!scrubbed.includes(KEY), `${p} ${name}`);
    }
  }

  const event = scrubEvent({
    message: `call to ${ADDRESS} failed after redirect to ${callback}`,
    transaction: `POST ${MCP_PATH}/${KEY}`,
    request: {
      url: asked,
      method: "POST",
      data: { grant_type: "authorization_code", code, code_verifier: "v".repeat(43), refresh_token: code, resource: ADDRESS },
      query_string: `code=${code}&state=${state}&resource=${encodeURIComponent(ADDRESS)}`,
      cookies: { [PENDING_COOKIE_HTTPS]: "parked.signature" },
      headers: { authorization: `Bearer ${code}`, cookie: `${PENDING_COOKIE_HTTPS}=parked.signature`, "user-agent": "Claude-User" },
    },
    extra: { access_token: code, refresh_token: code, code, key: KEY, resource: ADDRESS, connectionId: "c1" },
    exception: { values: [{ type: "Error", value: `fetch ${protectedResourceMetadataUrl(cfg, KEY)} failed`, stacktrace: { frames: [{ filename: "a.js", vars: { code, refreshToken: code, key: KEY } }] } }] },
    breadcrumbs: [{ category: "navigation", data: { from: asked, to: callback } }],
  } as Event);
  const sent = JSON.stringify(event);
  assert.ok(!sent.includes(code), "no code, access token or refresh token");
  assert.ok(!sent.includes(state), "no state");
  assert.ok(!sent.includes(KEY), "no key");
  assert.ok(!sent.includes("parked.signature"), "no cookie");
  assert.ok(!sent.includes("v".repeat(43)), "no PKCE verifier");
  assert.deepEqual(event.request, { url: scrubbedAsk, method: "POST", headers: { "User-Agent": "Claude-User" } });
  assert.deepEqual(event.extra, { connectionId: "c1" });
  assert.equal(event.transaction, "POST /api/mcp/[key]");

  const crumb = scrubBreadcrumb({ category: "fetch", data: { url: `${ADDRESS}?code=${code}`, method: "POST", body: `refresh_token=${code}` } });
  assert.ok(!JSON.stringify(crumb).includes(code));
  assert.ok(!JSON.stringify(crumb).includes(KEY));
});
