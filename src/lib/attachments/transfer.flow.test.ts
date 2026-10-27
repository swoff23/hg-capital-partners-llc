import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ServerBusyError, classifyFailure, type MultipartState } from "./outbox";
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
/** Makes the stand-in's token route answer with this status (after `delayMs`), for the next asks; null answers normally. */
let tokenFault: { status: number; delayMs?: number; times?: number } | null = null;
/**
 * Makes a part's upload answer with an error instead of its etag. Given the part number and the token it came with;
 * returns the Blob API's error (status, code) or undefined for a normal answer. `waitUntil` holds the error back
 * until it returns true (by events, not by the clock, so a busy machine can't reorder the run).
 */
let partFault: ((part: number, auth: string) => { status: number; code: string; waitUntil?: () => boolean } | undefined) | null = null;
/** Normal part answers wait for this, so a test decides when (or whether) the other parts land. */
let partHold: Promise<void> | null = null;
/** The parts the stand-in has answered with an etag. */
const answeredParts = new Set<number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Lets requests an earlier test cut off finish arriving at the stand-in, so they are not counted in the next. */
const settle = () => sleep(150);
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
      if (tokenFault) {
        const fault = tokenFault;
        if (fault.times !== undefined && --fault.times <= 0) tokenFault = null;
        if (fault.delayMs) await sleep(fault.delayMs);
        return json({ error: "no" }, fault.status);
      }
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
        const fault = partFault?.(part, String(h.authorization));
        if (fault) {
          if (fault.waitUntil) {
            for (let i = 0; i < 500 && !fault.waitUntil(); i++) await sleep(10);
            // The others' answers have been sent; give the client a moment to take them in before this one lands.
            await sleep(60);
          }
          return json({ error: { code: fault.code, message: fault.code } }, fault.status);
        }
        if (partHold) await partHold;
        answeredParts.add(part);
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
  await settle();
  seen.length = 0;
  const i = input(blobOf(1 * MB), { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image" });
  const sent = await sendBlob(i);
  assert.equal(sent.pathname, "tasks/t1/orig/Kitchen.jpg");
  assert.deepEqual(seen.map((s) => s.action), ["put"]);
  assert.equal(seen[0].bytes, 1 * MB);
  assert.deepEqual(i.states, [], "nothing to resume");
});

test("a big file goes in 8 MB parts, reports each part, and completes them in order", async () => {
  await settle();
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
  await settle();
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
  await settle();
  seen.length = 0;
  const resume: MultipartState = { pathname: "tasks/t1/orig/Other.mov", key: "k", uploadId: "old", parts: [{ etag: "e", partNumber: 1 }] };
  await sendBlob(input(blobOf(9 * MB), { resume }));
  assert.equal(seen.filter((s) => s.action === "create").length, 1);
  assert.equal(seen.filter((s) => s.action === "upload").length, 2);
});

test("an abort stops it before the parts land", async () => {
  await settle();
  seen.length = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(sendBlob(input(blobOf(20 * MB), { signal: controller.signal })));
  assert.equal(seen.filter((s) => s.action === "complete").length, 0);
});

test("cut off after a part lands, the parts that landed are handed over for the outbox and nothing completes", async () => {
  await settle();
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

/* ---------------- The token route, a token that runs out, and a part that fails ---------------- */

test("a small file asks the token route for a single-request token, and sends with that token", async () => {
  await settle();
  seen.length = 0;
  tokenAsks.length = 0;
  await sendBlob(input(blobOf(1 * MB), { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image" }));
  assert.equal(tokenAsks.length, 1);
  const ask = tokenAsks[0] as { payload: { multipart: boolean; pathname: string } };
  assert.equal(ask.payload.multipart, false);
  assert.equal(ask.payload.pathname, "tasks/t1/orig/Kitchen.jpg");
  assert.equal(seen.find((s) => s.action === "put")!.auth, "Bearer vercel_blob_client_store_1");
});

test("a 5xx from the token route on a small file is the road, so it waits and tries again", async () => {
  await settle();
  seen.length = 0;
  try {
    for (const status of [500, 503, 429]) {
      tokenFault = { status };
      const err = await sendBlob(input(blobOf(1 * MB), { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image" })).then(
        () => null,
        (e: unknown) => e,
      );
      assert.ok(err instanceof ServerBusyError, `${status} reads as busy`);
      assert.equal(classifyFailure(err, true), "network", `${status} waits, not red`);
    }
  } finally {
    tokenFault = null;
  }
  assert.equal(seen.length, 0, "no bytes went anywhere");
});

test("a 4xx from the token route is the server saying no, so it turns red", async () => {
  tokenFault = { status: 400 };
  try {
    const err = await sendBlob(input(blobOf(1 * MB), { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image" })).then(
      () => null,
      (e: unknown) => e,
    );
    assert.ok(err instanceof Error && !(err instanceof ServerBusyError));
    assert.match(err.message, /client token/);
    assert.equal(classifyFailure(err, true), "refused");
  } finally {
    tokenFault = null;
  }
});

test("the stall watchdog's abort reaches a token request that is still waiting for the route", async () => {
  tokenFault = { status: 503, delayMs: 2000 };
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 30);
  try {
    await assert.rejects(
      sendBlob(input(blobOf(1 * MB), { name: "Kitchen.jpg", contentType: "image/jpeg", fileKind: "image", signal: controller.signal })),
    );
  } finally {
    tokenFault = null;
  }
  assert.ok(Date.now() - started < 1500, "cut off, not waited out");
});

test("a token that runs out mid-run is asked for again, and the parts already up are kept", async () => {
  await settle();
  seen.length = 0;
  tokenAsks.length = 0;
  // 25 MB is four parts. Part 2 is told the token expired once the other three have landed; the retry carries a new token.
  answeredParts.clear();
  partFault = (part, auth) =>
    part === 2 && auth.endsWith("_1") ? { status: 401, code: "client_token_expired", waitUntil: () => [1, 3, 4].every((n) => answeredParts.has(n)) } : undefined;
  const i = input(blobOf(25 * MB));
  try {
    const sent = await sendBlob(i);
    assert.equal(sent.pathname, "tasks/t1/orig/Roof-leak-Rnd123.mov");
  } finally {
    partFault = null;
  }
  assert.equal(tokenAsks.length, 2, "a fresh token once the first ran out");
  const uploads = seen.filter((s) => s.action === "upload");
  const count = (n: number) => uploads.filter((s) => s.part === n).length;
  assert.deepEqual([count(1), count(2), count(3), count(4)], [1, 2, 1, 1], "only the part that failed went again");
  assert.equal(uploads.filter((s) => s.part === 2).at(-1)!.auth, "Bearer vercel_blob_client_store_2");
  assert.equal(seen.filter((s) => s.action === "create").length, 1, "the multipart upload is the same one");
  const done = seen.find((s) => s.action === "complete")!;
  assert.equal(done.bytes, 4, "all four parts complete");
  assert.equal(i.states.at(-1), null);
});

test("a token that keeps running out is the clock, not a refusal: it waits and resumes with the parts it has", async () => {
  await settle();
  seen.length = 0;
  tokenAsks.length = 0;
  answeredParts.clear();
  partFault = (part) =>
    part === 2 ? { status: 401, code: "client_token_expired", waitUntil: () => [1, 3, 4].every((n) => answeredParts.has(n)) } : undefined;
  const i = input(blobOf(25 * MB));
  let err: unknown = null;
  try {
    err = await sendBlob(i).then(
      () => null,
      (e: unknown) => e,
    );
  } finally {
    partFault = null;
  }
  assert.ok(err instanceof Error);
  assert.equal(classifyFailure(err, true), "network");
  // The first token and three more, and then it gives up; what landed stays in the outbox's state.
  assert.equal(tokenAsks.length, 4);
  const kept = i.states.filter((s): s is MultipartState => s !== null);
  assert.ok(kept.at(-1)!.parts.length >= 1);
  assert.equal(seen.filter((s) => s.action === "complete").length, 0);
});

test("the first part to fail stops the other two, and nothing sends behind the retry", async () => {
  await settle();
  seen.length = 0;
  // Part 2 is refused outright; parts 1 and 3 are held, so they can only end by being cut off.
  partFault = (part) => (part === 2 ? { status: 400, code: "bad_request" } : undefined);
  let release: () => void = () => {};
  partHold = new Promise<void>((resolve) => (release = resolve));
  const i = input(blobOf(40 * MB));
  let err: unknown = null;
  let progressAtFailure = -1;
  let statesAtFailure = -1;
  try {
    err = await sendBlob(i).then(
      () => null,
      (e: unknown) => e,
    );
    progressAtFailure = i.progress.length;
    statesAtFailure = i.states.length;
    await sleep(300);
  } finally {
    partFault = null;
    partHold = null;
    release();
  }
  assert.ok(err instanceof Error, "the failure comes back");
  assert.deepEqual(
    seen.filter((s) => s.action === "upload").map((s) => s.part).sort(),
    [1, 2, 3],
    "parts 4 and 5 were never started by the siblings",
  );
  assert.equal(i.progress.length, progressAtFailure, "no progress reported after the failure");
  assert.equal(i.states.length, statesAtFailure, "no part state saved after the failure");
  assert.equal(seen.filter((s) => s.action === "complete").length, 0);
});
