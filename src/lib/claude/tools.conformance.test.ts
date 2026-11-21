import test, { before } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { RateLimiter } from "@/lib/rate-limit";
import { handleMcp, type McpDeps } from "./tools";

/**
 * The connector's protocol is written by hand (tools.ts), so this holds it to
 * the reference: the official MCP TypeScript server, asked the same requests.
 * Where both answer, the HTTP status and the JSON-RPC result or error code
 * must agree. The places we differ on purpose are named at the bottom.
 *
 * The reference package is a pinned dev dependency (package.json), there for
 * this test alone: nothing in the app imports it. It is loaded by name at run
 * time, and a load that fails is a failure, never a skip, so the comparison
 * can't quietly stop running.
 */

interface Reference {
  McpServer: new (info: object, options: object) => { registerTool(name: string, config: object, handler: () => Promise<object>): unknown };
  createMcpHandler(factory: () => object, options?: object): { fetch(request: Request): Promise<Response> };
}

const REFERENCE = "@modelcontextprotocol/server";
let reference: { fetch(request: Request): Promise<Response> } | null = null;
/** Why the reference couldn't be loaded, when it couldn't. */
let missing: string | null = null;

/** The reference server, or a failed test that says how to get it back. */
function theReference(): { fetch(request: Request): Promise<Response> } {
  assert.ok(reference, `${REFERENCE} could not be loaded, so nothing was compared: ${missing ?? "no reason given"}. It is a dev dependency; run npm install.`);
  return reference;
}

before(async () => {
  let sdk: Reference;
  try {
    sdk = (await import(REFERENCE)) as Reference;
  } catch (err) {
    missing = err instanceof Error ? err.message : String(err);
    return;
  }
  reference = sdk.createMcpHandler(() => {
    const server = new sdk.McpServer({ name: "HG Capital", title: "HG Capital", version: "1.0.0" }, { instructions: "x" });
    server.registerTool("get_directory", { title: "Read the directory", description: "d", inputSchema: z.object({}), annotations: { readOnlyHint: true } }, async () => ({ content: [{ type: "text", text: "{}" }] }));
    return server;
  });
});

const none = { findMany: async () => [] };
const deps: McpDeps = {
  verify: async () => ({ user: { id: "u1", name: "Pieter", email: "p@example.test" }, connection: { id: "c1", userId: "u1", clientId: "claude", createdAt: new Date(), connectedAt: new Date(), lastUsedAt: null } }),
  unauthorized: () => new Response(null, { status: 401 }),
  db: { property: none, lease: none, user: none, contact: none } as unknown as PrismaClient,
  save: async () => ({ kind: "saved", tasks: [] }),
  appUrl: () => "https://app.example.test",
  limits: { calls: new RateLimiter(10_000, 60_000), saves: new RateLimiter(10_000, 60_000) },
  now: () => new Date(),
  logError: () => {},
};

const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
const BASE = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const rpc = (method: string, params?: unknown, id: unknown = 1) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
/** The headers 2026-07-28 mirrors the body into. */
const mirrored = (method: string, name?: string, version = "2026-07-28") => ({ ...BASE, "mcp-protocol-version": version, "mcp-method": method, ...(name ? { "mcp-name": name } : {}) });
const hello = { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "claude-ai", version: "1.0.0" } };

type Case = { name: string; method?: string; headers?: Record<string, string>; body?: unknown };

const AGREE: Case[] = [
  { name: "initialize, 2025-11-25", body: rpc("initialize", hello) },
  { name: "initialize, 2025-06-18", body: rpc("initialize", { ...hello, protocolVersion: "2025-06-18" }) },
  { name: "initialize, 2025-03-26", body: rpc("initialize", { ...hello, protocolVersion: "2025-03-26" }) },
  { name: "initialize, 2024-11-05", body: rpc("initialize", { ...hello, protocolVersion: "2024-11-05" }) },
  { name: "initialize, a version nobody speaks", body: rpc("initialize", { ...hello, protocolVersion: "2031-01-01" }) },
  { name: "notifications/initialized", body: { jsonrpc: "2.0", method: "notifications/initialized" } },
  { name: "a posted response", body: { jsonrpc: "2.0", id: 5, result: {} } },
  { name: "tools/list with the header", headers: { ...BASE, "mcp-protocol-version": "2025-11-25" }, body: rpc("tools/list") },
  { name: "tools/list with no header", body: rpc("tools/list") },
  { name: "ping", body: rpc("ping") },
  { name: "a method we don't have", body: rpc("resources/list") },
  { name: "server/discover with no envelope", body: rpc("server/discover") },
  { name: "tools/call", body: rpc("tools/call", { name: "get_directory", arguments: {} }) },
  { name: "tools/call, a tool we don't have", body: rpc("tools/call", { name: "close_task", arguments: {} }) },
  { name: "GET", method: "GET", headers: { accept: "text/event-stream" } },
  { name: "DELETE", method: "DELETE", headers: {} },
  { name: "a body that isn't JSON", body: "{nope" },
  { name: "a null id", body: rpc("tools/list", undefined, null) },
  { name: "2026-07-28 server/discover", headers: mirrored("server/discover"), body: rpc("server/discover", { _meta: META }) },
  { name: "2026-07-28 tools/list", headers: mirrored("tools/list"), body: rpc("tools/list", { _meta: META }) },
  { name: "2026-07-28 tools/call", headers: mirrored("tools/call", "get_directory"), body: rpc("tools/call", { name: "get_directory", arguments: {}, _meta: META }) },
  { name: "2026-07-28 tools/call, a tool we don't have", headers: mirrored("tools/call", "close_task"), body: rpc("tools/call", { name: "close_task", arguments: {}, _meta: META }) },
  { name: "2026-07-28 with no version header", headers: { ...BASE, "mcp-method": "tools/list" }, body: rpc("tools/list", { _meta: META }) },
  { name: "2026-07-28 with no Mcp-Method", headers: { ...BASE, "mcp-protocol-version": "2026-07-28" }, body: rpc("tools/list", { _meta: META }) },
  { name: "2026-07-28, Mcp-Method names another method", headers: mirrored("tools/call"), body: rpc("tools/list", { _meta: META }) },
  { name: "2026-07-28, Mcp-Name names another tool", headers: mirrored("tools/call", "save_drafts"), body: rpc("tools/call", { name: "get_directory", arguments: {}, _meta: META }) },
  { name: "2026-07-28 with no Mcp-Name", headers: mirrored("tools/call"), body: rpc("tools/call", { name: "get_directory", arguments: {}, _meta: META }) },
  { name: "a per-request version nobody speaks", headers: mirrored("tools/list", undefined, "2031-01-01"), body: rpc("tools/list", { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "2031-01-01" } }) },
  { name: "the header and the envelope name different versions", headers: mirrored("tools/list"), body: rpc("tools/list", { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "2025-11-25" } }) },
  { name: "a 2026-07-28 header and no envelope", headers: mirrored("tools/list"), body: rpc("tools/list") },
  { name: "an envelope with no client capabilities", headers: mirrored("tools/list"), body: rpc("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }) },
  { name: "2026-07-28, a method we don't have", headers: mirrored("resources/list"), body: rpc("resources/list", { _meta: META }) },
  { name: "2026-07-28 ping, which left the protocol", headers: mirrored("ping"), body: rpc("ping", { _meta: META }) },
  { name: "initialize inside a 2026-07-28 envelope", headers: mirrored("initialize"), body: rpc("initialize", { ...hello, _meta: META }) },
  { name: "a notification inside a 2026-07-28 envelope", headers: mirrored("notifications/cancelled"), body: { jsonrpc: "2.0", method: "notifications/cancelled", params: { _meta: META } } },
];

const request = (c: Case) => {
  const method = c.method ?? "POST";
  return new Request(`https://app.example.test/api/mcp/${"k".repeat(43)}`, { method, headers: c.headers ?? BASE, ...(method === "POST" ? { body: typeof c.body === "string" ? c.body : JSON.stringify(c.body) } : {}) });
};

type Rpc = { result?: Record<string, unknown>; error?: { code: number } };

/** The one JSON-RPC message in an answer: a JSON body, or the single `data:` line of a stream (how the reference answers the handshake versions). */
async function read(res: Response): Promise<{ status: number; rpc: Rpc | null }> {
  const text = await res.text();
  const json = (res.headers.get("content-type") ?? "").startsWith("text/event-stream") ? (/^data: (.*)$/m.exec(text)?.[1] ?? "") : text;
  try {
    return { status: res.status, rpc: JSON.parse(json) as Rpc };
  } catch {
    return { status: res.status, rpc: null };
  }
}

/** What has to agree: the status, whether it's a result or an error, the error's code, and the fields a client reads off a result. */
function essence({ status, rpc }: { status: number; rpc: Rpc | null }) {
  const result = rpc?.result;
  const tools = result?.tools as { name: string }[] | undefined;
  return {
    status,
    kind: rpc?.error ? "error" : result ? "result" : "none",
    code: rpc?.error?.code ?? null,
    protocolVersion: result?.protocolVersion ?? null,
    serverInfo: result?.serverInfo ?? null,
    supportedVersions: result?.supportedVersions ?? null,
    resultType: result?.resultType ?? null,
    cacheScope: result?.cacheScope ?? null,
    serverInMeta: (result?._meta as Record<string, unknown> | undefined)?.["io.modelcontextprotocol/serverInfo"] ?? null,
    hasTools: tools ? tools.some((t) => t.name === "get_directory") : null,
    hasContent: result ? Array.isArray(result.content) : null,
  };
}

test("on every request the reference answers, we answer with the same status and the same result or error code", async () => {
  const theirServer = theReference();
  for (const c of AGREE) {
    const theirs = await read(await theirServer.fetch(request(c)));
    const ours = await read(await handleMcp(request(c), deps));
    assert.deepEqual(essence(ours), essence(theirs), c.name);
  }
});

test("where we differ from the reference, it is on purpose", async () => {
  const theirServer = theReference();
  const both = async (c: Case): Promise<{ theirs: Response; ours: Response }> => ({ theirs: await theirServer.fetch(request(c)), ours: await handleMcp(request(c), deps) });

  // The handshake versions: the reference frames each answer as a one-message stream; we always answer plain JSON (spec section 5).
  const list = await both({ name: "tools/list", body: rpc("tools/list") });
  assert.match(list.theirs.headers.get("content-type") ?? "", /^text\/event-stream/);
  assert.match(list.ours.headers.get("content-type") ?? "", /^application\/json/);

  // A batch: allowed only in 2025-03-26, and Claude sends one message per request. We refuse it.
  const batch = await both({ name: "batch", body: [rpc("ping"), rpc("tools/list", undefined, 2)] });
  assert.deepEqual([batch.theirs.status, batch.ours.status], [200, 400]);

  // We don't turn a call away for its Content-Type or Accept header: the token is the check, and a JSON body is a JSON body.
  const plain = await both({ name: "text/plain", headers: { ...BASE, "content-type": "text/plain" }, body: rpc("tools/list") });
  assert.deepEqual([plain.theirs.status, plain.ours.status], [415, 200]);
  const jsonOnly = await both({ name: "accept", headers: { ...BASE, accept: "application/json" }, body: rpc("tools/list") });
  assert.deepEqual([jsonOnly.theirs.status, jsonOnly.ours.status], [406, 200]);

  // A handshake-shaped call under a header naming a version nobody speaks: both 400. We answer with the versions we do speak.
  const stale = await both({ name: "unknown header", headers: { ...BASE, "mcp-protocol-version": "2031-01-01" }, body: rpc("tools/list") });
  assert.deepEqual([stale.theirs.status, stale.ours.status], [400, 400]);
  assert.equal(((await stale.ours.json()) as Rpc).error?.code, -32022);
});
