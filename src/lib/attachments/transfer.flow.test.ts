import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { MultipartState } from "./outbox";
import { sendBlob, type SendInput } from "./transfer";

/**
 * transfer.ts against a stand-in for Vercel Blob's API, on the library's own
 * VERCEL_BLOB_API_URL override: the real @vercel/blob client makes the real
 * calls (create, part, complete, single put) and this answers them. It checks
 * that our multipart flow speaks the client's protocol, what a resume sends
 * (only the missing parts, a fresh token), and that an abort cuts it off. It
 * can't check Blob's own server, which needs a real store.
 */

const MB = 1024 * 1024;

type Seen = { action: string; part?: number; bytes?: number; key?: string; uploadId?: string; auth?: string };

const seen: Seen[] = [];
const tokenAsks: unknown[] = [];
let server: Server;
let base = "";
const realFetch = globalThis.fetch;
const realApiUrl = process.env.VERCEL_BLOB_API_URL;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    for await (const c of req) chunks.push(c as Buffer);
  } catch {
    // The client cut the request off (an abort): what arrived is all there is.
  }
  return Buffer.concat(chunks);
}

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const body = await readBody(req);
    const h = req.headers;
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    const pathname = url.searchParams.get("pathname") ?? "";
    if (url.pathname.startsWith("/api/blob/")) {
      tokenAsks.push(JSON.parse(body.toString()));
      return json({ type: "blob.generate-client-token", clientToken: `vercel_blob_client_store_${tokenAsks.length}` });
    }
    if (url.pathname === "/mpu") {
      const action = String(h["x-mpu-action"]);
      if (action === "create") {
        seen.push({ action, auth: String(h.authorization) });
        return json({ uploadId: "upload-1", key: `${pathname.replace(/\.[^.]+$/, "")}-Rnd123.mov` });
      }
      if (action === "upload") {
        const part = Number(h["x-mpu-part-number"]);
        seen.push({ action, part, bytes: body.length, key: decodeURIComponent(String(h["x-mpu-key"])), uploadId: String(h["x-mpu-upload-id"]), auth: String(h.authorization) });
        return json({ etag: `etag-${part}` });
      }
      if (action === "complete") {
        const parts = JSON.parse(body.toString()) as { partNumber: number; etag: string }[];
        seen.push({ action, bytes: parts.length, key: decodeURIComponent(String(h["x-mpu-key"])), uploadId: String(h["x-mpu-upload-id"]) });
        assert.deepEqual(
          parts.map((p) => p.partNumber),
          [...parts.map((p) => p.partNumber)].sort((a, b) => a - b),
          "parts complete in order",
        );
        const key = decodeURIComponent(String(h["x-mpu-key"]));
        return json({ url: `https://store.private.blob.vercel-storage.com/${key}`, downloadUrl: "x", pathname: key, contentType: "video/quicktime", contentDisposition: "inline" });
      }
    }
    if (req.method === "PUT") {
      seen.push({ action: "put", bytes: body.length, auth: String(h.authorization) });
      return json({ url: `https://store.private.blob.vercel-storage.com/${pathname}`, downloadUrl: "x", pathname: `${pathname}`, contentType: "image/jpeg", contentDisposition: "inline" });
    }
    json({ error: { code: "not_found", message: "no" } }, 404);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.VERCEL_BLOB_API_URL = base;
  // The browser resolves the token route's relative URL against the page; here the page is the stand-in server.
  (globalThis as { location?: unknown }).location = new URL(`${base}/tasks/t1`);
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return realFetch(url.startsWith("/") ? `${base}${url}` : input, init);
  }) as typeof fetch;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (realApiUrl === undefined) delete process.env.VERCEL_BLOB_API_URL;
  else process.env.VERCEL_BLOB_API_URL = realApiUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function input(blob: Blob, over: Partial<SendInput> = {}): SendInput & { states: (MultipartState | null)[]; progress: number[] } {
  const states: (MultipartState | null)[] = [];
  const progress: number[] = [];
  return {
    uploadKind: "task-upload",
    parentId: "t1",
    access: "private",
    name: "Roof leak.mov",
    contentType: "video/quicktime",
    fileKind: "video",
    role: "orig",
    blob,
    resume: null,
    onMultipart: (s) => states.push(s),
    onProgress: (f) => progress.push(f),
    signal: new AbortController().signal,
    states,
    progress,
    ...over,
  };
}

const blobOf = (bytes: number) => new Blob([new Uint8Array(bytes)]);

test("a small file goes in one request, with progress ending at 1", async () => {
  seen.length = 0;
  const i = input(blobOf(1 * MB), { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image" });
  const sent = await sendBlob(i);
  assert.equal(sent.pathname, "tasks/t1/orig/Kitchen.jpg");
  assert.deepEqual(seen.map((s) => s.action), ["put"]);
  assert.equal(seen[0].bytes, 1 * MB);
  assert.deepEqual(i.states, [], "nothing to resume");
});

test("a big file goes in 8 MB parts, reports each part, and completes them in order", async () => {
  seen.length = 0;
  tokenAsks.length = 0;
  const i = input(blobOf(20 * MB));
  const sent = await sendBlob(i);
  const uploads = seen.filter((s) => s.action === "upload");
  assert.deepEqual(uploads.map((s) => s.part).sort(), [1, 2, 3]);
  assert.deepEqual(uploads.map((s) => s.bytes).sort((a, b) => a! - b!), [4 * MB, 8 * MB, 8 * MB]);
  assert.equal(seen.filter((s) => s.action === "create").length, 1);
  const done = seen.find((s) => s.action === "complete")!;
  assert.equal(done.bytes, 3, "all three parts completed");
  assert.equal(sent.pathname, "tasks/t1/orig/Roof-leak-Rnd123.mov");
  // The outbox hears the created upload, each finished part, then null.
  assert.equal(i.states.at(-1), null);
  const kept = i.states.filter((s): s is MultipartState => s !== null);
  assert.equal(kept[0].uploadId, "upload-1");
  assert.deepEqual(kept.at(-1)!.parts.map((p) => p.partNumber).sort(), [1, 2, 3]);
  assert.ok(i.progress.length > 0 && i.progress.at(-1) === 1);
  // One token, asked for as multipart, for the path and payload the token route checks.
  assert.equal(tokenAsks.length, 1);
  const ask = tokenAsks[0] as { type: string; payload: { pathname: string; multipart: boolean; clientPayload: string } };
  assert.equal(ask.type, "blob.generate-client-token");
  assert.equal(ask.payload.multipart, true);
  assert.equal(ask.payload.pathname, "tasks/t1/orig/Roof-leak.mov");
  assert.deepEqual(JSON.parse(ask.payload.clientPayload), { taskId: "t1", fileKind: "video" });
});

test("a resume sends only the missing parts, with a fresh token, and creates nothing", async () => {
  seen.length = 0;
  tokenAsks.length = 0;
  const resume: MultipartState = {
    pathname: "tasks/t1/orig/Roof-leak.mov",
    key: "tasks/t1/orig/Roof-leak-Rnd123.mov",
    uploadId: "upload-1",
    parts: [
      { etag: "etag-1", partNumber: 1 },
      { etag: "etag-2", partNumber: 2 },
    ],
  };
  const i = input(blobOf(20 * MB), { resume });
  const sent = await sendBlob(i);
  assert.deepEqual(seen.map((s) => s.action), ["upload", "complete"], "no create, one part, then complete");
  assert.equal(seen[0].part, 3);
  assert.equal(seen[0].uploadId, "upload-1");
  assert.equal(seen[0].key, "tasks/t1/orig/Roof-leak-Rnd123.mov");
  assert.equal(seen[1].bytes, 3, "completes with the two held parts and the new one");
  assert.equal(tokenAsks.length, 1, "a fresh token for the resumed upload");
  assert.equal(sent.pathname, "tasks/t1/orig/Roof-leak-Rnd123.mov");
});

test("a state for another path is not resumed", async () => {
  seen.length = 0;
  const resume: MultipartState = { pathname: "tasks/t1/orig/Other.mov", key: "k", uploadId: "old", parts: [{ etag: "e", partNumber: 1 }] };
  await sendBlob(input(blobOf(9 * MB), { resume }));
  assert.equal(seen.filter((s) => s.action === "create").length, 1);
  assert.equal(seen.filter((s) => s.action === "upload").length, 2);
});

test("an abort stops it before the parts land", async () => {
  seen.length = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(sendBlob(input(blobOf(20 * MB), { signal: controller.signal })));
  assert.equal(seen.filter((s) => s.action === "complete").length, 0);
});

test("cut off after a part lands, the parts that landed are handed over for the outbox and nothing completes", async () => {
  seen.length = 0;
  const controller = new AbortController();
  const i = input(blobOf(40 * MB), { signal: controller.signal });
  const states = i.states;
  const original = i.onMultipart;
  // The signal goes (the stall watchdog, or the tab closing) as soon as the first part is on record.
  i.onMultipart = (state) => {
    original(state);
    if (state && state.parts.length >= 1) controller.abort();
  };
  await assert.rejects(sendBlob(i));
  const kept = states.filter((s): s is MultipartState => s !== null);
  assert.ok(kept.length >= 2, "the created upload, then a part");
  assert.equal(kept[0].parts.length, 0);
  assert.ok(kept.at(-1)!.parts.length >= 1);
  assert.equal(kept.at(-1)!.uploadId, "upload-1");
  assert.equal(states.at(-1) === null, false, "never reported complete");
  assert.equal(seen.filter((s) => s.action === "complete").length, 0);
});
