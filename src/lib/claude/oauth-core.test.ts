import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { EnvError, parseEnv } from "@/lib/env";
import { hashToken, isWellFormedToken, newToken, signupLinkToken } from "@/lib/portal/tokens";
import { readSessionToken, signSessionToken } from "@/lib/session-token";
import {
  ACCESS_TTL_MS,
  ALLOWED_CLIENTS,
  CLAUDE_CALLBACK,
  CLAUDE_CLIENT_ID,
  CODE_TTL_MS,
  FALLBACK_CLIENT_ID,
  MIN_SECRET_LENGTH,
  PENDING_COOKIE_HTTP,
  PENDING_COOKIE_HTTPS,
  PENDING_TTL_MS,
  PENDING_VALUE_MAX,
  REFRESH_GRACE_MS,
  REFRESH_TTL_MS,
  REFUSALS,
  SCOPE,
  allowedClient,
  approvalCode,
  authorizationServerMetadata,
  bearerToken,
  canonicalResource,
  claudeAddressKey,
  clearPendingCookieHeader,
  codeRedirect,
  connectorAddress,
  connectorConfigFor,
  errorRedirect,
  isOwnersAddress,
  keyOfResource,
  parseAuthorizeRequest,
  parseForm,
  parseTokenRequest,
  passwordEpoch,
  pendingCookieHeader,
  pendingCookieName,
  pendingStillValid,
  pkceChallenge,
  printable,
  protectedResourceMetadata,
  protectedResourceMetadataUrl,
  readParkedFor,
  readPending,
  resourceShape,
  rotatedTokens,
  secretStrongEnough,
  signPending,
  storedAddress,
  verifyPkce,
  wwwAuthenticateValue,
  type AuthorizationRequest,
} from "./oauth-core";

// Sign-in for Claude (docs/specs/tasks-from-claude.md, section 8): every rule that needs no database.

const SECRET = "test-secret-test-secret-test-secret-test";
const cfg = connectorConfigFor("https://app.example.test", SECRET);
/** RFC 7636 appendix B. */
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

/** One partner's key and address, and the other partner's. */
const KEY = claudeAddressKey("key-id-pieter", SECRET);
const ADDRESS = connectorAddress(cfg, KEY);
const OTHER_KEY = claudeAddressKey("key-id-connor", SECRET);
const RID = "r".repeat(43);
const NOW = 1_800_000_000_000;

/** The query Claude sends, with anything in `over` changed; null drops a parameter. */
function query(over: Record<string, string | null> = {}): URLSearchParams {
  const base: Record<string, string | null> = {
    response_type: "code",
    client_id: CLAUDE_CLIENT_ID,
    redirect_uri: CLAUDE_CALLBACK,
    state: "st-123",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    resource: ADDRESS,
    scope: SCOPE,
    ...over,
  };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== null) q.set(k, v);
  return q;
}

const request: AuthorizationRequest = { clientId: CLAUDE_CLIENT_ID, redirectUri: CLAUDE_CALLBACK, codeChallenge: CHALLENGE, state: "st-123", key: KEY, resource: ADDRESS };
const parkedFor = { secret: SECRET, now: NOW, userId: "user-pieter", passwordChangedAt: null, rid: RID };
const hmac = (key: crypto.BinaryLike, text: string) => crypto.createHmac("sha256", key).update(text, "utf8").digest("base64url");

// ---------------------------------------------------------------------------
// The flag and the secret
// ---------------------------------------------------------------------------

test("the connector is off unless CLAUDE_CONNECTOR_ENABLED is 1 or true", () => {
  const base = { NODE_ENV: "test" };
  assert.equal(parseEnv(base).claudeConnectorEnabled, false);
  assert.equal(parseEnv({ ...base, CLAUDE_CONNECTOR_ENABLED: "" }).claudeConnectorEnabled, false);
  assert.equal(parseEnv({ ...base, CLAUDE_CONNECTOR_ENABLED: "0" }).claudeConnectorEnabled, false);
  assert.equal(parseEnv({ ...base, CLAUDE_CONNECTOR_ENABLED: "false" }).claudeConnectorEnabled, false);
  assert.equal(parseEnv({ ...base, CLAUDE_CONNECTOR_ENABLED: "1" }).claudeConnectorEnabled, true);
  assert.equal(parseEnv({ ...base, CLAUDE_CONNECTOR_ENABLED: "TRUE" }).claudeConnectorEnabled, true);
  assert.throws(() => parseEnv({ ...base, CLAUDE_CONNECTOR_ENABLED: "yes" }), EnvError);
});

test("a secret under 32 characters is too short to switch the connector on", () => {
  assert.equal(MIN_SECRET_LENGTH, 32);
  assert.equal(secretStrongEnough("x".repeat(31)), false);
  assert.equal(secretStrongEnough(""), false);
  assert.equal(secretStrongEnough("x".repeat(32)), true);
  // The secret local development falls back to is long enough, so the connector runs locally.
  assert.equal(secretStrongEnough(parseEnv({ NODE_ENV: "test" }).sessionSecret), true);
});

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

test("the connector's origin comes from the app's address, in canonical form", () => {
  assert.deepEqual(connectorConfigFor("https://app.example.test", "s"), { issuer: "https://app.example.test", secret: "s" });
  assert.equal(connectorConfigFor("https://App.Example.test/", "s").issuer, "https://app.example.test");
  assert.equal(connectorConfigFor("https://app.example.test:443", "s").issuer, "https://app.example.test", "no default port");
  assert.equal(connectorConfigFor("http://localhost:3000", "s").issuer, "http://localhost:3000");
});

test("a partner's key is rebuilt from its id and the secret, and is never the id", () => {
  assert.ok(isWellFormedToken(KEY), "43 base64url characters, so every token check takes it");
  assert.equal(claudeAddressKey("key-id-pieter", SECRET), KEY, "the same every time it is asked for");
  assert.notEqual(claudeAddressKey("key-id-pieter", `${SECRET}x`), KEY, "another secret, another key");
  assert.notEqual(OTHER_KEY, KEY, "another id, another key");
  assert.equal(KEY, hmac(SECRET, "hg-claude:address:key-id-pieter"));
  // Its own label: not the sign-up link's token for the same id, and not a bare HMAC of the id.
  assert.notEqual(KEY, signupLinkToken("key-id-pieter", SECRET));
  assert.notEqual(KEY, hmac(SECRET, "key-id-pieter"));
  assert.equal(connectorAddress(cfg, KEY), `https://app.example.test/api/mcp/${KEY}`);
});

test("a resource address is read in canonical form", () => {
  assert.equal(canonicalResource("https://app.example.test/api/mcp"), "https://app.example.test/api/mcp");
  assert.equal(canonicalResource("HTTPS://APP.Example.test/api/mcp/"), "https://app.example.test/api/mcp");
  assert.equal(canonicalResource("https://app.example.test:443/api/mcp"), "https://app.example.test/api/mcp");
  assert.equal(canonicalResource("https://app.example.test/"), "https://app.example.test");
  for (const bad of ["", "app.example.test/api/mcp", "https://app.example.test/api/mcp#frag", "https://app.example.test/api/mcp?x=1", "https://app.example.test/api/mcp?", "https://user:pw@app.example.test/api/mcp", "javascript:alert(1)", null, undefined, 7, `https://app.example.test/${"a".repeat(600)}`]) {
    assert.equal(canonicalResource(bad), null, String(bad));
  }
});

test("only a partner's own address at this app gives a key, and the key is compared exactly", () => {
  assert.equal(keyOfResource(ADDRESS, cfg), KEY);
  assert.equal(keyOfResource(`HTTPS://APP.example.test:443/api/mcp/${KEY}/`, cfg), KEY, "Claude lowercases the host and drops the port and the slash");
  const none = [
    "https://app.example.test/api/mcp", // the address before partners had their own
    "https://app.example.test/api/mcp/",
    "https://app.example.test",
    `https://app.example.test/api/mcp/${KEY}/more`,
    `https://app.example.test/api/mcp/x/${KEY}`,
    `https://app.example.test/api/${KEY}`,
    `https://app.example.test/API/MCP/${KEY}`,
    `https://app.example.test/api/mcp/${KEY.slice(0, 42)}`,
    `https://app.example.test/api/mcp/${KEY}x`,
    `https://app.example.test/api/mcp/${KEY.slice(0, 42)}!`,
    `https://app.example.test/api/mcp/${KEY.slice(0, 40)}%41bc`,
    `https://app-example.test/api/mcp/${KEY}`,
    `https://www.app.example.test/api/mcp/${KEY}`,
    `http://app.example.test/api/mcp/${KEY}`,
    `https://app.example.test:8443/api/mcp/${KEY}`,
    `https://app.example.test/api/mcp/${KEY}?x=1`,
    `https://app.example.test/api/mcp/${KEY}#x`,
    `https://user@app.example.test/api/mcp/${KEY}`,
    null,
    undefined,
    42,
  ];
  for (const other of none) assert.equal(keyOfResource(other, cfg), null, String(other));
  // Case is part of the key: the same letters in another case are another key, never this partner's.
  const swapped = KEY.replace(/[a-zA-Z]/, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
  assert.notEqual(swapped, KEY);
  assert.equal(keyOfResource(connectorAddress(cfg, swapped), cfg), swapped);
});

test("a token row keeps its address by the key's hash, never by the key", () => {
  const stored = storedAddress(cfg, KEY);
  assert.equal(stored, `https://app.example.test/api/mcp/sha256:${hashToken(KEY)}`);
  assert.ok(!stored.includes(KEY));
  assert.equal(storedAddress(cfg, KEY), stored, "the same address is stored the same way every time");
  assert.notEqual(storedAddress(cfg, OTHER_KEY), stored);
  assert.notEqual(storedAddress(connectorConfigFor("https://moved.example.test", SECRET), KEY), stored, "the origin is part of it");
  // The stored form is not an address anyone can call or name: it gives no key back.
  assert.equal(keyOfResource(stored, cfg), null);
});

test("a stored address counts only while it is its partner's current one", () => {
  const owner = { claudeKeyHash: hashToken(KEY) };
  const stored = storedAddress(cfg, KEY);
  assert.ok(isOwnersAddress(stored, owner, cfg));
  assert.equal(isOwnersAddress(storedAddress(cfg, OTHER_KEY), owner, cfg), false, "the other partner's address");
  assert.equal(isOwnersAddress(stored, { claudeKeyHash: null }, cfg), false, "Disconnect retired it");
  assert.equal(isOwnersAddress(stored, { claudeKeyHash: hashToken(OTHER_KEY) }, cfg), false, "a new address took its place");
  assert.equal(isOwnersAddress(stored, owner, connectorConfigFor("https://moved.example.test", SECRET)), false, "the app's address changed");
  assert.equal(isOwnersAddress(`${stored}/`, owner, cfg), false, "stored values are exact or they are nothing");
  assert.equal(isOwnersAddress("https://app.example.test/api/mcp", owner, cfg), false);
  assert.equal(isOwnersAddress(null, owner, cfg), false);
  // A row that held the address itself, key and all, is nobody's: only the hashed form is ever compared.
  assert.equal(isOwnersAddress(ADDRESS, owner, cfg), false);
});

test("what the logs say about a wrong resource never includes a key", () => {
  assert.equal(resourceShape(null), "none");
  assert.equal(resourceShape(""), "none");
  assert.equal(resourceShape("not an address"), "unreadable");
  assert.equal(resourceShape("https://app.example.test/api/mcp"), "https://app.example.test/api/mcp");
  assert.equal(resourceShape("https://app.example.test"), "https://app.example.test");
  assert.equal(resourceShape("https://other.example.test/mcp"), "https://other.example.test/[other]");
  const nearMisses = [`https://app.example.test/api/mcp/${KEY.slice(0, 42)}`, `https://other.example.test/api/mcp/${KEY}/x`, `https://app.example.test/API/MCP/${KEY}`, `https://app.example.test/${KEY}`];
  for (const raw of nearMisses) {
    const shape = resourceShape(raw);
    assert.ok(!shape.includes(KEY.slice(0, 12)), raw);
    assert.match(shape, /^https:\/\/(app|other)\.example\.test\/(api\/mcp\/\[key\]|\[other\])$/);
  }
  assert.equal(printable("ab\u0000cé\n"), "ab?c??");
  assert.equal(printable("x".repeat(500)).length, 200);
});

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

test("only Claude's published identity and the fixed fallback are clients, each with Claude's one callback", () => {
  assert.deepEqual(Object.keys(ALLOWED_CLIENTS).sort(), [FALLBACK_CLIENT_ID, CLAUDE_CLIENT_ID].sort());
  assert.equal(CLAUDE_CLIENT_ID, "https://claude.ai/oauth/mcp-oauth-client-metadata");
  assert.equal(CLAUDE_CALLBACK, "https://claude.ai/api/mcp/auth_callback");
  for (const client of Object.values(ALLOWED_CLIENTS)) assert.deepEqual(client.redirectUris, [CLAUDE_CALLBACK]);
  assert.equal(allowedClient(CLAUDE_CLIENT_ID)?.name, "Claude");
  // Claude Code's identity redirects to a loopback address any local program can claim: not a client here.
  for (const no of ["https://claude.ai/oauth/claude-code-client-metadata", "https://claude.ai/oauth/mcp-oauth-client-metadata/", "https://evil.example/client.json", "", "constructor", "__proto__", "toString", null, undefined, 1]) {
    assert.equal(allowedClient(no), null, String(no));
  }
});

// ---------------------------------------------------------------------------
// The authorization request
// ---------------------------------------------------------------------------

test("Claude's own request passes and is reduced to what gets parked, with the key its address named", () => {
  assert.deepEqual(parseAuthorizeRequest(query(), cfg), { kind: "ok", request });
  assert.equal(parseAuthorizeRequest(query({ client_id: FALLBACK_CLIENT_ID }), cfg).kind, "ok");
  assert.deepEqual(parseAuthorizeRequest(query({ state: null }), cfg), { kind: "ok", request: { ...request, state: null } });
  // Claude sends the address in canonical form; the parked one is always the one the key makes here.
  const variant = parseAuthorizeRequest(query({ resource: `https://APP.example.test/api/mcp/${KEY}/` }), cfg);
  assert.deepEqual(variant.kind === "ok" && [variant.request.key, variant.request.resource], [KEY, ADDRESS]);
  // The other partner's address is as good a request. Whose screen it reaches is decided by the key, later.
  const other = parseAuthorizeRequest(query({ resource: connectorAddress(cfg, OTHER_KEY) }), cfg);
  assert.equal(other.kind === "ok" && other.request.key, OTHER_KEY);
  // The scope is Claude's to name and ours to grant: no scope, or others beside ours, still parks the same request.
  assert.deepEqual(parseAuthorizeRequest(query({ scope: null }), cfg), { kind: "ok", request });
  assert.deepEqual(parseAuthorizeRequest(query({ scope: "" }), cfg), { kind: "ok", request });
  assert.deepEqual(parseAuthorizeRequest(query({ scope: "drafts offline_access" }), cfg), { kind: "ok", request });
});

test("a client that isn't Claude, or a return address that isn't exactly Claude's, is refused with no redirect", () => {
  const refused = (over: Record<string, string | null>, reason: string) => {
    const outcome = parseAuthorizeRequest(query(over), cfg);
    assert.equal(outcome.kind, "refuse", JSON.stringify(over));
    assert.equal(outcome.kind === "refuse" && outcome.reason, reason, JSON.stringify(over));
    assert.equal("redirectTo" in outcome, false);
  };
  refused({ client_id: null }, "unknown-client");
  refused({ client_id: "https://evil.example/client.json" }, "unknown-client");
  refused({ client_id: "https://claude.ai/oauth/claude-code-client-metadata", redirect_uri: "http://localhost:3118/callback" }, "unknown-client");
  refused({ client_id: "__proto__" }, "unknown-client");
  refused({ redirect_uri: null }, "wrong-redirect");
  refused({ redirect_uri: `${CLAUDE_CALLBACK}/` }, "wrong-redirect");
  refused({ redirect_uri: `${CLAUDE_CALLBACK}?next=https://evil.example` }, "wrong-redirect");
  refused({ redirect_uri: "https://claude.ai.evil.example/api/mcp/auth_callback" }, "wrong-redirect");
  refused({ redirect_uri: "https://CLAUDE.ai/api/mcp/auth_callback" }, "wrong-redirect");
  refused({ redirect_uri: "http://claude.ai/api/mcp/auth_callback" }, "wrong-redirect");
  refused({ redirect_uri: "http://127.0.0.1:3118/callback" }, "wrong-redirect");
  refused({ redirect_uri: "https://evil.example/cb" }, "wrong-redirect");
  // A state that can't be handed back safely.
  refused({ state: "" }, "bad-state");
  refused({ state: "a\nb" }, "bad-state");
  refused({ state: "x".repeat(2049) }, "bad-state");
});

test("an unknown client's id is kept for the logs, cut to 200 printable characters", () => {
  const strange = parseAuthorizeRequest(query({ client_id: `https://claude.ai/oauth/a-new-identity\u0007é${"z".repeat(400)}` }), cfg);
  assert.equal(strange.kind, "refuse");
  const clientId = strange.kind === "refuse" ? (strange.detail?.clientId ?? "") : "";
  assert.equal(clientId.length, 200);
  assert.ok(clientId.startsWith("https://claude.ai/oauth/a-new-identity??zzz"));
  assert.match(clientId, /^[\x20-\x7e]+$/);
  const none = parseAuthorizeRequest(query({ client_id: null }), cfg);
  assert.deepEqual(none.kind === "refuse" && none.detail, { clientId: "" });
  // A wrong return address is kept the same way, without its query.
  const elsewhere = parseAuthorizeRequest(query({ redirect_uri: "http://localhost:3118/callback?code=abc" }), cfg);
  assert.deepEqual(elsewhere.kind === "refuse" && elsewhere.detail, { redirectUri: "http://localhost:3118/callback" });
});

test("a parameter sent twice is refused", () => {
  for (const name of ["client_id", "redirect_uri", "state", "response_type", "code_challenge", "code_challenge_method", "resource", "scope"]) {
    const q = query();
    q.append(name, q.get(name) ?? "x");
    assert.deepEqual(parseAuthorizeRequest(q, cfg), { kind: "refuse", reason: "repeated-parameter" }, name);
  }
});

test("once the client and return address hold, a bad request goes back to Claude as an OAuth error with its state", () => {
  const error = (over: Record<string, string | null>, code: string, reason: string, state: string | null = "st-123") => {
    const outcome = parseAuthorizeRequest(query(over), cfg);
    assert.equal(outcome.kind, "error", JSON.stringify(over));
    if (outcome.kind !== "error") return outcome;
    const to = new URL(outcome.redirectTo);
    assert.equal(`${to.origin}${to.pathname}`, CLAUDE_CALLBACK);
    assert.equal(to.searchParams.get("error"), code, JSON.stringify(over));
    assert.equal(to.searchParams.get("state"), state);
    assert.equal(to.searchParams.get("code"), null);
    assert.equal(outcome.reason, reason, JSON.stringify(over));
    return outcome;
  };
  error({ response_type: "token" }, "unsupported_response_type", "bad-response-type");
  error({ response_type: null }, "unsupported_response_type", "bad-response-type");
  // PKCE with S256 or nothing.
  error({ code_challenge: null }, "invalid_request", "bad-pkce");
  error({ code_challenge_method: null }, "invalid_request", "bad-pkce");
  error({ code_challenge_method: "plain" }, "invalid_request", "bad-pkce");
  error({ code_challenge: "tooshort" }, "invalid_request", "bad-pkce");
  error({ code_challenge: `${CHALLENGE}=` }, "invalid_request", "bad-pkce");
  // The token has to be for one partner's address here and nothing else. The resource is required.
  error({ resource: null }, "invalid_target", "no-resource");
  error({ resource: "" }, "invalid_target", "no-resource");
  const bare = error({ resource: "https://app.example.test/api/mcp" }, "invalid_target", "wrong-resource");
  assert.deepEqual(bare.kind === "error" && bare.detail, { resource: "https://app.example.test/api/mcp" });
  const elsewhere = error({ resource: `https://app-example.test/api/mcp/${KEY}` }, "invalid_target", "wrong-resource");
  assert.deepEqual(elsewhere.kind === "error" && elsewhere.detail, { resource: "https://app-example.test/api/mcp/[key]" }, "the logs get the origin, never the key");
  error({ resource: "https://app.example.test" }, "invalid_target", "wrong-resource");
  error({ resource: `https://app.example.test/api/mcp/${KEY.slice(0, 42)}` }, "invalid_target", "wrong-resource");
  error({ scope: 'dr"afts' }, "invalid_scope", "bad-scope");
  error({ scope: "drafts  double-space" }, "invalid_scope", "bad-scope");
  error({ scope: "x".repeat(300) }, "invalid_scope", "bad-scope");
  error({ response_type: "token", state: null }, "unsupported_response_type", "bad-response-type", null);
});

test("the way back to Claude carries the code or the error, and the state untouched", () => {
  const ok = new URL(codeRedirect(CLAUDE_CALLBACK, "the-code", "a b&c=d"));
  assert.equal(`${ok.origin}${ok.pathname}`, CLAUDE_CALLBACK);
  assert.deepEqual([...ok.searchParams], [["code", "the-code"], ["state", "a b&c=d"]]);
  assert.deepEqual([...new URL(codeRedirect(CLAUDE_CALLBACK, "the-code", null)).searchParams], [["code", "the-code"]]);
  assert.deepEqual([...new URL(errorRedirect(CLAUDE_CALLBACK, "access_denied", "s")).searchParams], [["error", "access_denied"], ["state", "s"]]);
});

test("every reason a request can be turned away for is one plain word from the list", () => {
  assert.equal(new Set(REFUSALS).size, REFUSALS.length);
  for (const reason of REFUSALS) assert.match(reason, /^[a-z]+(?:-[a-z]+)*$/);
  for (const named of ["unknown-client", "wrong-redirect", "no-resource", "unknown-address", "not-owner", "rid-mismatch", "expired", "bad-pkce", "code-reuse", "refresh-reuse", "refresh-repeat"] as const) {
    assert.ok(REFUSALS.includes(named), named);
  }
});

// ---------------------------------------------------------------------------
// The parked request
// ---------------------------------------------------------------------------

test("a parked request survives the round trip, carries who it is for, and nothing else reads as one", () => {
  const value = signPending(request, parkedFor);
  assert.match(value, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "safe as a cookie value");
  assert.deepEqual(readPending(value, { secret: SECRET, now: NOW + 1000 }), {
    ...request,
    userId: "user-pieter",
    epoch: passwordEpoch(SECRET, "user-pieter", null),
    rid: RID,
    iat: NOW,
    exp: NOW + PENDING_TTL_MS,
  });
  assert.deepEqual(readPending(signPending({ ...request, state: null }, parkedFor), { secret: SECRET, now: NOW })?.state, null);

  assert.equal(readPending(value, { secret: SECRET, now: NOW + PENDING_TTL_MS }), null, "gone after 10 minutes");
  assert.equal(readPending(value, { secret: SECRET, now: NOW - 1 }), null, "not from the future");
  assert.equal(readPending(value, { secret: `${SECRET}x`, now: NOW }), null, "another secret");
  const [enc, mac] = value.split(".");
  const payload = JSON.parse(Buffer.from(enc, "base64url").toString("utf8")) as Record<string, unknown>;
  const reencode = (changed: Record<string, unknown>) => Buffer.from(JSON.stringify({ ...payload, ...changed })).toString("base64url");
  for (const changed of [{ redirectUri: "https://evil.example/cb" }, { userId: "user-connor" }, { rid: "s".repeat(43) }, { key: OTHER_KEY }, { exp: NOW + 10 * PENDING_TTL_MS }]) {
    assert.equal(readPending(`${reencode(changed)}.${mac}`, { secret: SECRET, now: NOW }), null, `a changed payload: ${Object.keys(changed)[0]}`);
  }
  assert.equal(readPending(`${enc}.${mac.slice(0, -2)}AA`, { secret: SECRET, now: NOW }), null, "a changed signature");
  for (const junk of [undefined, null, "", ".", "abc", `${enc}.`, `.${mac}`, "x".repeat(5000)]) assert.equal(readPending(junk, { secret: SECRET, now: NOW }), null);

  // Signed by us but missing or misshaping a field: still not a request.
  const pendingKey = crypto.createHmac("sha256", SECRET).update("hg-claude:pending-key", "utf8").digest();
  const signedAnyway = (changed: Record<string, unknown>) => {
    const body = reencode(changed);
    return `${body}.${hmac(pendingKey, body)}`;
  };
  assert.ok(readPending(signedAnyway({}), { secret: SECRET, now: NOW }), "the control: this helper signs the way signPending does");
  for (const changed of [{ userId: "" }, { userId: 7 }, { rid: "short" }, { rid: undefined }, { key: "short" }, { epoch: "" }, { state: 7 }, { iat: "x" }, { exp: null }]) {
    assert.equal(readPending(signedAnyway(changed), { secret: SECRET, now: NOW }), null, JSON.stringify(changed));
  }

  // The longest state Claude may send still fits a cookie, under the longer of the two names.
  const longest = signPending({ ...request, state: "s".repeat(2048) }, parkedFor);
  assert.ok(longest.length <= PENDING_VALUE_MAX);
  assert.ok(pendingCookieHeader("x".repeat(PENDING_VALUE_MAX), true).length < 4096);
  assert.equal(readPending(longest, { secret: SECRET, now: NOW })?.state?.length, 2048);
});

test("the parked request is signed under a key of its own, never under the session secret itself", () => {
  const [enc, mac] = signPending(request, parkedFor).split(".");
  const pendingKey = crypto.createHmac("sha256", SECRET).update("hg-claude:pending-key", "utf8").digest();
  assert.equal(mac, hmac(pendingKey, enc));
  // What sessions, QuickBooks' state and the earlier build of this cookie would compute over the same text.
  const underTheSecret = [hmac(SECRET, enc), hmac(SECRET, `hg-claude:pending:${enc}`), crypto.createHmac("sha256", SECRET).update(enc).digest("hex")];
  for (const other of underTheSecret) {
    assert.notEqual(mac, other);
    assert.equal(readPending(`${enc}.${other}`, { secret: SECRET, now: NOW }), null);
  }
  // And nothing a caller gets back verifies as a session, whichever half is offered as the signed text.
  assert.equal(readSessionToken(`${enc}.${mac}`, { secret: SECRET, now: NOW }), null);
  assert.equal(readSessionToken(`${Buffer.from(`hg-claude:pending:${enc}`).toString("base64url")}.${mac}`, { secret: SECRET, now: NOW }), null);
  const session = signSessionToken("connor@example.test", { secret: SECRET, now: NOW, ttlMs: 60_000 });
  assert.equal(readPending(session, { secret: SECRET, now: NOW }), null, "a session cookie is not a parked request");
});

test("a parked request is checked against today's allowlist and its own key's address before it's used", () => {
  const pending = readPending(signPending(request, parkedFor), { secret: SECRET, now: NOW });
  assert.ok(pending);
  assert.ok(pendingStillValid(pending, cfg));
  assert.equal(pendingStillValid({ ...pending, clientId: "https://evil.example/c.json" }, cfg), false);
  assert.equal(pendingStillValid({ ...pending, redirectUri: "https://evil.example/cb" }, cfg), false);
  assert.equal(pendingStillValid({ ...pending, codeChallenge: "short" }, cfg), false);
  assert.equal(pendingStillValid({ ...pending, resource: "https://app.example.test/api/mcp" }, cfg), false, "the address without a key");
  assert.equal(pendingStillValid({ ...pending, resource: connectorAddress(cfg, OTHER_KEY) }, cfg), false, "an address that isn't its own key's");
  assert.equal(pendingStillValid({ ...pending, key: OTHER_KEY }, cfg), false, "a key that isn't its own address's");
  assert.equal(pendingStillValid({ ...pending, key: "short", resource: connectorAddress(cfg, "short") }, cfg), false);
  assert.equal(pendingStillValid(pending, connectorConfigFor("https://moved.example.test", SECRET)), false, "the app's address changed");
});

test("a screen or a button gets the parked request only when it is the one it names and its own partner's", () => {
  const value = signPending(request, parkedFor);
  const read = (over: { value?: string | null; rid?: unknown; userId?: string; now?: number } = {}) =>
    readParkedFor(over.value === undefined ? value : over.value, { cfg, rid: "rid" in over ? over.rid : RID, userId: over.userId ?? "user-pieter", now: over.now ?? NOW + 1 });
  const ok = read();
  assert.equal(ok.ok && ok.pending.rid, RID);

  assert.deepEqual(read({ rid: "s".repeat(43) }), { ok: false, why: "rid-mismatch" }, "another request's id");
  for (const rid of [undefined, null, "", ["x"], 7, RID.slice(1)]) assert.deepEqual(read({ rid }), { ok: false, why: "rid-mismatch" }, String(rid));
  assert.deepEqual(read({ userId: "user-connor" }), { ok: false, why: "not-owner" });
  assert.deepEqual(read({ value: null }), { ok: false, why: "expired" });
  assert.deepEqual(read({ value: `${value}x` }), { ok: false, why: "expired" });
  assert.deepEqual(read({ now: NOW + PENDING_TTL_MS }), { ok: false, why: "expired" });
  // A second request parked over the first: the first screen's id no longer matches what the browser holds.
  const second = signPending({ ...request, state: "another-claude" }, { ...parkedFor, rid: "t".repeat(43) });
  assert.deepEqual(read({ value: second }), { ok: false, why: "rid-mismatch" });
  // Parked under an address this app no longer has.
  const moved = connectorConfigFor("https://moved.example.test", SECRET);
  assert.deepEqual(readParkedFor(value, { cfg: moved, rid: RID, userId: "user-pieter", now: NOW + 1 }), { ok: false, why: "stale-request" });
});

test("the cookie takes the __Host- name over HTTPS and the plain one over local http, and is httpOnly for 10 minutes", () => {
  assert.equal(PENDING_COOKIE_HTTPS, "__Host-claude_oauth_pending");
  assert.equal(PENDING_COOKIE_HTTP, "claude_oauth_pending");
  assert.equal(pendingCookieName(true), PENDING_COOKIE_HTTPS);
  assert.equal(pendingCookieName(false), PENDING_COOKIE_HTTP);
  // The prefix only works with Secure, Path=/ and no Domain: all three hold.
  assert.equal(pendingCookieHeader("v.s", true), "__Host-claude_oauth_pending=v.s; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure");
  assert.equal(pendingCookieHeader("v.s", false), "claude_oauth_pending=v.s; Path=/; Max-Age=600; HttpOnly; SameSite=Lax");
  assert.equal(clearPendingCookieHeader(true), "__Host-claude_oauth_pending=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
  assert.equal(clearPendingCookieHeader(false), "claude_oauth_pending=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  for (const header of [pendingCookieHeader("v.s", true), pendingCookieHeader("v.s", false), clearPendingCookieHeader(true)]) assert.doesNotMatch(header, /Domain=/i);
});

test("a password reset changes what a parked request is checked against, without the cookie saying when", () => {
  const never = passwordEpoch(SECRET, "user-pieter", null);
  const reset = new Date("2026-11-20T15:00:00Z");
  assert.ok(isWellFormedToken(never));
  assert.equal(passwordEpoch(SECRET, "user-pieter", null), never);
  assert.notEqual(passwordEpoch(SECRET, "user-pieter", reset), never);
  assert.notEqual(passwordEpoch(SECRET, "user-pieter", new Date(reset.getTime() + 1)), passwordEpoch(SECRET, "user-pieter", reset));
  assert.notEqual(passwordEpoch(SECRET, "user-connor", null), never, "one partner's is not the other's");
  assert.notEqual(passwordEpoch(`${SECRET}x`, "user-pieter", null), never);
  const payload = Buffer.from(signPending(request, { ...parkedFor, passwordChangedAt: reset }).split(".")[0], "base64url").toString("utf8");
  assert.ok(!payload.includes(String(reset.getTime())) && !payload.includes(reset.toISOString()), "the time itself is not in the cookie");
});

// ---------------------------------------------------------------------------
// Values made from a request or a token
// ---------------------------------------------------------------------------

test("a request's code and a refresh's new pair are made from what was presented, under keys of their own", () => {
  const code = approvalCode(SECRET, RID);
  assert.ok(isWellFormedToken(code));
  assert.equal(approvalCode(SECRET, RID), code, "the same request asks for the same code");
  assert.notEqual(approvalCode(SECRET, "s".repeat(43)), code);
  assert.notEqual(approvalCode(`${SECRET}x`, RID), code, "not something the request id gives away");
  assert.notEqual(code, RID);
  // Under a key made for codes, never under the secret itself: a code can't pass as anything else that secret signs.
  const codeKey = crypto.createHmac("sha256", SECRET).update("hg-claude:code-key", "utf8").digest();
  assert.equal(code, hmac(codeKey, RID));
  assert.notEqual(code, hmac(SECRET, RID));

  const presented = newToken();
  const pair = rotatedTokens(SECRET, presented);
  assert.ok(isWellFormedToken(pair.access) && isWellFormedToken(pair.refresh));
  assert.deepEqual(rotatedTokens(SECRET, presented), pair, "a repeat can be answered with the same pair");
  assert.notEqual(pair.access, pair.refresh);
  assert.ok(![pair.access, pair.refresh].includes(presented));
  const other = rotatedTokens(SECRET, newToken());
  assert.ok(other.access !== pair.access && other.refresh !== pair.refresh);
  assert.notDeepEqual(rotatedTokens(`${SECRET}x`, presented), pair);
  // As the contract writes them: HMAC under a key made for rotation, never under the secret itself.
  const rotationKey = crypto.createHmac("sha256", SECRET).update("hg-claude:rotation-key", "utf8").digest();
  assert.deepEqual(pair, { access: hmac(rotationKey, `access:${presented}`), refresh: hmac(rotationKey, `refresh:${presented}`) });
  assert.notEqual(pair.access, hmac(SECRET, `access:${presented}`));
  // No two jobs share a key: a code is never a token, whatever text went in.
  assert.notEqual(approvalCode(SECRET, `access:${presented}`), pair.access);
});

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

test("PKCE is S256 and the verifier has to open the challenge", () => {
  assert.equal(pkceChallenge(VERIFIER), CHALLENGE, "RFC 7636 appendix B");
  assert.ok(verifyPkce(VERIFIER, CHALLENGE));
  assert.equal(verifyPkce(`${VERIFIER.slice(0, -1)}x`, CHALLENGE), false);
  assert.equal(verifyPkce(CHALLENGE, CHALLENGE), false, "the challenge itself is not the verifier (no plain method)");
  assert.equal(verifyPkce("short", pkceChallenge("short")), false, "under 43 characters");
  assert.equal(verifyPkce("a".repeat(129), pkceChallenge("a".repeat(129))), false, "over 128 characters");
  assert.equal(verifyPkce(`${"a".repeat(43)} `, pkceChallenge(`${"a".repeat(43)} `)), false, "characters outside the unreserved set");
  assert.equal(verifyPkce(VERIFIER, null), false);
  assert.equal(verifyPkce(VERIFIER, ""), false);
  assert.equal(verifyPkce(undefined, CHALLENGE), false);
  assert.equal(verifyPkce(["x"], CHALLENGE), false);
});

// ---------------------------------------------------------------------------
// The token request
// ---------------------------------------------------------------------------

test("a token call's body has to be form-encoded, small, and say each thing once", () => {
  assert.equal(parseForm("application/x-www-form-urlencoded", "a=1&b=2")?.get("b"), "2");
  assert.equal(parseForm("application/x-www-form-urlencoded; charset=UTF-8", "a=1")?.get("a"), "1");
  assert.equal(parseForm("Application/X-WWW-Form-Urlencoded", "a=1")?.get("a"), "1");
  assert.equal(parseForm("application/json", '{"a":1}'), null);
  assert.equal(parseForm(null, "a=1"), null);
  assert.equal(parseForm("application/x-www-form-urlencoded", "code=1&code=2"), null, "sent twice");
  assert.equal(parseForm("application/x-www-form-urlencoded", `a=${"x".repeat(9000)}`), null, "too big");
});

test("a token request is read into one of two grants, or one of four OAuth errors with its reason for the logs", () => {
  const form = (fields: Record<string, string>) => parseTokenRequest(new URLSearchParams(fields));
  const code = newToken();
  const refresh = newToken();

  assert.deepEqual(form({ grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: CLAUDE_CLIENT_ID, redirect_uri: CLAUDE_CALLBACK, resource: ADDRESS }), {
    ok: true,
    request: { grant: "authorization_code", code, codeVerifier: VERIFIER, clientId: CLAUDE_CLIENT_ID, redirectUri: CLAUDE_CALLBACK, resource: ADDRESS },
  });
  assert.deepEqual(form({ grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: CLAUDE_CLIENT_ID }), {
    ok: true,
    request: { grant: "authorization_code", code, codeVerifier: VERIFIER, clientId: CLAUDE_CLIENT_ID, redirectUri: null, resource: null },
  });
  assert.deepEqual(form({ grant_type: "refresh_token", refresh_token: refresh }), { ok: true, request: { grant: "refresh_token", refreshToken: refresh, clientId: null, resource: null } });
  assert.deepEqual(form({ grant_type: "refresh_token", refresh_token: refresh, client_id: FALLBACK_CLIENT_ID, resource: ADDRESS }), {
    ok: true,
    request: { grant: "refresh_token", refreshToken: refresh, clientId: FALLBACK_CLIENT_ID, resource: ADDRESS },
  });

  const error = (fields: Record<string, string>, code_: string, reason: string, detail?: Record<string, string>) =>
    assert.deepEqual(form(fields), { ok: false, error: code_, reason, ...(detail ? { detail } : {}) }, JSON.stringify(fields));
  error({}, "invalid_request", "missing-field");
  error({ grant_type: "client_credentials" }, "unsupported_grant_type", "unsupported-grant");
  error({ grant_type: "password", username: "a", password: "b" }, "unsupported_grant_type", "unsupported-grant");
  error({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: "x" }, "unsupported_grant_type", "unsupported-grant");
  error({ grant_type: "authorization_code", code, code_verifier: VERIFIER }, "invalid_client", "unknown-client", { clientId: "" });
  error({ grant_type: "authorization_code", code, code_verifier: VERIFIER, client_id: "https://evil.example/c.json" }, "invalid_client", "unknown-client", { clientId: "https://evil.example/c.json" });
  error({ grant_type: "refresh_token", refresh_token: refresh, client_id: "someone-else" }, "invalid_client", "unknown-client", { clientId: "someone-else" });
  error({ grant_type: "authorization_code", client_id: CLAUDE_CLIENT_ID, code_verifier: VERIFIER }, "invalid_request", "missing-field");
  error({ grant_type: "authorization_code", client_id: CLAUDE_CLIENT_ID, code }, "invalid_request", "missing-field");
  error({ grant_type: "refresh_token" }, "invalid_request", "missing-field");
  // A value we could never have issued answers like a wrong one.
  error({ grant_type: "authorization_code", client_id: CLAUDE_CLIENT_ID, code: "nope", code_verifier: VERIFIER }, "invalid_grant", "malformed");
  error({ grant_type: "authorization_code", client_id: CLAUDE_CLIENT_ID, code, code_verifier: "short" }, "invalid_grant", "malformed");
  error({ grant_type: "refresh_token", refresh_token: "nope" }, "invalid_grant", "malformed");
});

// ---------------------------------------------------------------------------
// Lifetimes
// ---------------------------------------------------------------------------

test("codes last a minute, access tokens an hour, refresh tokens 60 days, and a refresh may be repeated for a minute", () => {
  assert.equal(CODE_TTL_MS, 60_000);
  assert.equal(ACCESS_TTL_MS, 3_600_000);
  assert.equal(REFRESH_TTL_MS, 60 * 86_400_000);
  assert.equal(PENDING_TTL_MS, 600_000);
  assert.equal(REFRESH_GRACE_MS, 60_000);
});

// ---------------------------------------------------------------------------
// The bearer token and the 401
// ---------------------------------------------------------------------------

test("a bearer token comes from the Authorization header and nowhere else", () => {
  const h = (value: string | null) => ({ get: (name: string) => (name === "authorization" ? value : null) });
  const token = newToken();
  assert.equal(bearerToken(h(`Bearer ${token}`)), token);
  assert.equal(bearerToken(h(`bearer   ${token}`)), token);
  assert.equal(bearerToken(h(null)), null);
  assert.equal(bearerToken(h("")), null);
  assert.equal(bearerToken(h(token)), null);
  assert.equal(bearerToken(h(`Basic ${token}`)), null);
  assert.equal(bearerToken(h(`Bearer ${token} extra`)), null);
  assert.equal(bearerToken(h("Bearer ")), null);
});

test("the 401 points Claude at the discovery document for the address the call came to", () => {
  assert.equal(protectedResourceMetadataUrl(cfg, KEY), `https://app.example.test/.well-known/oauth-protected-resource/api/mcp/${KEY}`);
  assert.equal(wwwAuthenticateValue(cfg, KEY), `Bearer resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/api/mcp/${KEY}", scope="drafts"`);
  assert.equal(
    wwwAuthenticateValue(cfg, KEY, { invalid: true }),
    `Bearer error="invalid_token", resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/api/mcp/${KEY}", scope="drafts"`,
  );
  // The same shape for a key nobody has: nothing in it comes from a lookup.
  assert.equal(wwwAuthenticateValue(cfg, OTHER_KEY).replace(OTHER_KEY, KEY), wwwAuthenticateValue(cfg, KEY));
});

// ---------------------------------------------------------------------------
// Discovery documents
// ---------------------------------------------------------------------------

test("the protected resource document names one address exactly, key included, and one authorization server", () => {
  assert.deepEqual(protectedResourceMetadata(cfg, KEY), {
    resource: `https://app.example.test/api/mcp/${KEY}`,
    authorization_servers: ["https://app.example.test"],
    scopes_supported: ["drafts"],
    bearer_methods_supported: ["header"],
  });
  assert.equal(protectedResourceMetadata(cfg, OTHER_KEY).resource, connectorAddress(cfg, OTHER_KEY));
});

test("the authorization server document offers Claude its published identity, S256 only, and no way to register", () => {
  const doc: Record<string, unknown> = authorizationServerMetadata(cfg);
  assert.deepEqual(doc, {
    issuer: "https://app.example.test",
    authorization_endpoint: "https://app.example.test/api/oauth/authorize",
    token_endpoint: "https://app.example.test/api/oauth/token",
    revocation_endpoint: "https://app.example.test/api/oauth/revoke",
    scopes_supported: ["drafts"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
  });
  // The two values Claude needs before it uses its published identity instead of looking for a registration endpoint.
  assert.equal(doc.client_id_metadata_document_supported, true);
  assert.ok((doc.token_endpoint_auth_methods_supported as string[]).includes("none"));
  assert.equal("registration_endpoint" in doc, false);
  // One document for every partner: nothing in it names an address or a key.
  assert.ok(!JSON.stringify(doc).includes("/api/mcp"));
});
