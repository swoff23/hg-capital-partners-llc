import test from "node:test";
import assert from "node:assert/strict";
import { MULTIPART_THRESHOLD, usesMultipart } from "./content-types";
import type { MultipartState } from "./outbox";
import {
  BLIND_BYTES_PER_SEC,
  PART_BYTES,
  blindBudgetMs,
  blobTransfer,
  isStreamBodyError,
  missingParts,
  planParts,
  streamFallback,
  type BlobClient,
  type SendInput,
} from "./transfer";

const MB = 1024 * 1024;

/* ---------------- A fetch wrapper that breaks streamed bodies (Jam, in Connor's Chrome) ---------------- */

/** What Chrome throws when a wrapped fetch has already locked or read the body's stream. */
const LOCKED = () => new TypeError("Failed to execute 'fetch' on 'Window': The provided ReadableStream is locked.");
const DISTURBED = () => new TypeError("Failed to execute 'fetch' on 'Window': The provided ReadableStream is disturbed");

test("isStreamBodyError: the stream refusals a fetch wrapper causes, and nothing else", () => {
  assert.equal(isStreamBodyError(LOCKED()), true);
  assert.equal(isStreamBodyError(DISTURBED()), true);
  assert.equal(isStreamBodyError(new TypeError("Failed to construct 'Request': The `duplex` member must be specified for a request with a streaming body")), true);
  assert.equal(isStreamBodyError(new TypeError("Failed to fetch")), false, "a dropped connection waits, it doesn't change the body");
  assert.equal(isStreamBodyError(new Error("The provided ReadableStream is locked.")), false, "only what fetch throws");
  assert.equal(isStreamBodyError("ReadableStream"), false);
});

test("streamFallback: the first stream refusal sends again with a plain body, and every send after it goes plain", async () => {
  const bodies = streamFallback();
  const calls: boolean[] = [];
  const first = await bodies.run(async (stream) => {
    calls.push(stream);
    if (stream) throw LOCKED();
    return "sent";
  });
  assert.equal(first, "sent");
  assert.deepEqual(calls, [true, false]);
  assert.equal(bodies.broken, true);
  calls.length = 0;
  await bodies.run(async (stream) => (calls.push(stream), "again"));
  assert.deepEqual(calls, [false], "no failed try per file once the page knows");
});

test("streamFallback: any other failure is the caller's, and keeps the stream for the next send", async () => {
  const bodies = streamFallback();
  const calls: boolean[] = [];
  await assert.rejects(
    bodies.run(async (stream) => {
      calls.push(stream);
      throw new TypeError("Failed to fetch");
    }),
    /Failed to fetch/,
  );
  assert.deepEqual(calls, [true], "not sent again here: the outbox decides");
  assert.equal(bodies.broken, false);
});

test("blindBudgetMs: how long a request with no progress may take, at a slow but working rate", () => {
  assert.equal(BLIND_BYTES_PER_SEC, 16 * 1024);
  assert.equal(blindBudgetMs(0), 0);
  assert.equal(blindBudgetMs(-5), 0);
  assert.equal(blindBudgetMs(16 * 1024), 1000);
  // A whole 8 MB part: over eight minutes, so a slow line isn't cut off at the watchdog's 30 seconds.
  assert.equal(blindBudgetMs(8 * MB), 512_000);
});

/** A Blob client whose fetch is wrapped: any call that asks for progress (a streamed body) is refused before it sends. */
function wrappedFetchClient() {
  const calls: { op: string; progress: boolean; part?: number; bytes?: number }[] = [];
  let parts = 0;
  const refuseStreams = (op: string, options: { onUploadProgress?: unknown }, extra: { part?: number; bytes?: number } = {}) => {
    const progress = typeof options.onUploadProgress === "function";
    calls.push({ op, progress, ...extra });
    if (progress) throw DISTURBED();
  };
  const client = {
    put: (async (pathname: string, body: Blob, options: { onUploadProgress?: unknown }) => {
      refuseStreams("put", options, { bytes: body.size });
      return { pathname, url: `https://store.private.blob.vercel-storage.com/${pathname}`, downloadUrl: "x", contentType: "image/jpeg", contentDisposition: "inline", etag: "e" };
    }) as unknown as BlobClient["put"],
    createMultipartUpload: (async () => {
      calls.push({ op: "create", progress: false });
      return { key: "tasks/t1/orig/Roof-leak-Rnd.mov", uploadId: "up-1" };
    }) as unknown as BlobClient["createMultipartUpload"],
    uploadPart: (async (_pathname: string, body: Blob, options: { partNumber: number; onUploadProgress?: unknown }) => {
      refuseStreams("part", options, { part: options.partNumber, bytes: body.size });
      parts++;
      return { etag: `etag-${options.partNumber}`, partNumber: options.partNumber };
    }) as unknown as BlobClient["uploadPart"],
    completeMultipartUpload: (async (pathname: string, done: { partNumber: number }[]) => {
      calls.push({ op: "complete", progress: false, bytes: done.length });
      return { pathname: `${pathname.replace(/\.mov$/, "")}-Rnd.mov`, url: "u", downloadUrl: "x", contentType: "video/quicktime", contentDisposition: "inline", etag: "e" };
    }) as unknown as BlobClient["completeMultipartUpload"],
  };
  return { client, calls, parts: () => parts };
}

function sendInput(blob: Blob, over: Partial<SendInput> = {}): SendInput & { states: (MultipartState | null)[]; progress: number[] } {
  const states: (MultipartState | null)[] = [];
  const progress: number[] = [];
  return {
    uploadKind: "task-upload",
    parentId: "t1",
    access: "private",
    name: "Kitchen.jpg",
    contentType: "image/jpeg",
    fileKind: "image",
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

/** The token route, answered here: the page's relative fetch has no server in a test. */
async function withTokenRoute<T>(run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ type: "blob.generate-client-token", clientToken: "vercel_blob_client_store_1" })) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test("with fetch wrapped, a small file still goes up: the streamed put is refused, the plain one lands, and the next file goes plain", async () => {
  const { client, calls } = wrappedFetchClient();
  const send = blobTransfer(client);
  const first = await withTokenRoute(() => send(sendInput(new Blob([new Uint8Array(3000)]))));
  assert.equal(first.pathname, "tasks/t1/orig/Kitchen.jpg");
  assert.deepEqual(
    calls.map((c) => [c.op, c.progress, c.bytes]),
    [
      ["put", true, 3000],
      ["put", false, 3000],
    ],
  );
  calls.length = 0;
  await withTokenRoute(() => send(sendInput(new Blob([new Uint8Array(10)]), { name: "Porch.jpg" })));
  assert.deepEqual(calls.map((c) => [c.op, c.progress]), [["put", false]], "one try per file from then on");
});

test("with fetch wrapped, a big file still goes in parts, each part plain, and the outbox still hears every part", async () => {
  const { client, calls } = wrappedFetchClient();
  const send = blobTransfer(client);
  const i = sendInput(new Blob([new Uint8Array(20 * MB)]), { name: "Roof leak.mov", contentType: "video/quicktime", fileKind: "video" });
  const sent = await withTokenRoute(() => send(i));
  assert.equal(sent.pathname, "tasks/t1/orig/Roof-leak-Rnd.mov");
  const landed = calls.filter((c) => c.op === "part" && !c.progress).map((c) => c.part).sort();
  assert.deepEqual(landed, [1, 2, 3], "every part landed with a plain body");
  assert.equal(calls.filter((c) => c.op === "create").length, 1);
  assert.equal(calls.find((c) => c.op === "complete")?.bytes, 3, "completes with all three");
  // The resume is untouched: the created upload, each finished part, then done.
  const kept = i.states.filter((s): s is MultipartState => s !== null);
  assert.deepEqual(kept.at(-1)!.parts.map((p) => p.partNumber).sort(), [1, 2, 3]);
  assert.equal(i.states.at(-1), null);
  assert.equal(i.progress.at(-1), 1, "the finished parts still move the ring");
});

test("a fetch that takes streams keeps byte progress: nothing falls back", async () => {
  const calls: boolean[] = [];
  const client = {
    put: (async (pathname: string, _body: Blob, options: { onUploadProgress?: (e: { percentage: number }) => void }) => {
      calls.push(typeof options.onUploadProgress === "function");
      options.onUploadProgress?.({ percentage: 50 });
      return { pathname };
    }) as unknown as BlobClient["put"],
  } as BlobClient;
  const send = blobTransfer(client);
  const i = sendInput(new Blob([new Uint8Array(3000)]));
  await withTokenRoute(() => send(i));
  await withTokenRoute(() => send(sendInput(new Blob([new Uint8Array(30)]))));
  assert.deepEqual(calls, [true, true]);
  assert.deepEqual(i.progress, [0.5]);
});

test("a part is 8 MB, the size above which a file goes in parts", () => {
  assert.equal(PART_BYTES, 8 * MB);
  assert.equal(PART_BYTES, MULTIPART_THRESHOLD);
  assert.equal(usesMultipart(8 * MB), false);
  assert.equal(usesMultipart(8 * MB + 1), true);
});

test("planParts: 1-based parts of 8 MB, the last the rest, covering the file exactly", () => {
  assert.deepEqual(planParts(0), []);
  assert.deepEqual(planParts(100), [{ partNumber: 1, start: 0, end: 100 }]);
  assert.deepEqual(planParts(8 * MB), [{ partNumber: 1, start: 0, end: 8 * MB }]);
  assert.deepEqual(planParts(8 * MB + 1), [
    { partNumber: 1, start: 0, end: 8 * MB },
    { partNumber: 2, start: 8 * MB, end: 8 * MB + 1 },
  ]);
  // A 300 MB video is 38 parts: 37 of 8 MB and one of 4 MB.
  const video = planParts(300 * MB);
  assert.equal(video.length, 38);
  assert.equal(video[37].end - video[37].start, 4 * MB);
  assert.equal(video[0].partNumber, 1);
  assert.equal(video.at(-1)!.end, 300 * MB);
  for (let i = 1; i < video.length; i++) assert.equal(video[i].start, video[i - 1].end, "no gap and no overlap");
});

test("missingParts: a resume sends only the parts Blob doesn't hold yet", () => {
  const size = 300 * MB;
  assert.equal(missingParts(size, []).length, 38);
  const held = Array.from({ length: 20 }, (_, i) => ({ partNumber: i + 1 }));
  const rest = missingParts(size, held);
  assert.equal(rest.length, 18);
  assert.equal(rest[0].partNumber, 21);
  // Out of order and with a gap: a part that finished while an earlier one was still going.
  assert.deepEqual(
    missingParts(25 * MB, [{ partNumber: 1 }, { partNumber: 3 }]).map((p) => p.partNumber),
    [2, 4],
  );
  assert.deepEqual(missingParts(25 * MB, [{ partNumber: 1 }, { partNumber: 2 }, { partNumber: 3 }, { partNumber: 4 }]), []);
});
