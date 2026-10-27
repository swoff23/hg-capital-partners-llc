import { completeMultipartUpload, createMultipartUpload, put, uploadPart } from "@vercel/blob/client";
import { MULTIPART_THRESHOLD, usesMultipart, type FileKind } from "./content-types";
import { isTokenExpired } from "./media";
import { ServerBusyError, classifyFailure, type MultipartState } from "./outbox";
import { uploadRequest, type UploadKind } from "./upload-kinds";
import type { UploadRole } from "./paths";

/**
 * Sends one blob to Vercel Blob straight from the browser: a token from
 * /api/blob/[kind] (clientToken, which tells the road from a refusal: a 5xx
 * from the route waits and tries again, a 4xx is the server saying no), then
 * the bytes. Small files go in one request through the client's put(). A file
 * over 8 MB goes in parts through createMultipartUpload, uploadPart and
 * completeMultipartUpload (the @vercel/blob 2.8 client), three parts at a
 * time, and reports each finished part so the outbox can resume at the last
 * one (uploads 2.1, phase 3). A resumed upload asks the token route for a
 * fresh token, and so does a run whose hour-long token runs out: the parts
 * already up are kept. The first part that fails stops the other two, so none
 * keeps sending behind the retry. If the multipart create is refused for a
 * reason other than the connection, the whole file goes the way it always
 * did, through put({ multipart: true }) on the same token.
 *
 * Needs a browser; the part arithmetic is pure and tested (transfer.test.ts).
 */

/** One part is 8 MB (Blob wants at least 5 MB, but the last). */
export const PART_BYTES = MULTIPART_THRESHOLD;

/** Parts in flight at once. */
const PART_CONCURRENCY = 3;

export type PartRange = { partNumber: number; start: number; end: number };

/** The parts of a file of `size` bytes: 1-based numbers, each `partBytes` long, the last the rest. */
export function planParts(size: number, partBytes: number = PART_BYTES): PartRange[] {
  const parts: PartRange[] = [];
  for (let start = 0, n = 1; start < size; start += partBytes, n++) {
    parts.push({ partNumber: n, start, end: Math.min(start + partBytes, size) });
  }
  return parts;
}

/** The parts still to send, given the ones Blob already holds. */
export function missingParts(size: number, done: readonly { partNumber: number }[], partBytes: number = PART_BYTES): PartRange[] {
  const have = new Set(done.map((p) => p.partNumber));
  return planParts(size, partBytes).filter((p) => !have.has(p.partNumber));
}

export type SendInput = {
  uploadKind: UploadKind;
  parentId: string;
  access: "private" | "public";
  /** The stored name; its slug is the path. */
  name: string;
  contentType: string;
  fileKind: FileKind;
  role: UploadRole;
  blob: Blob;
  /** A contractor's queuedAt, so a resumed upload's fresh token passes the late-upload rule. */
  queuedAt?: string;
  /** Where a multipart upload of this blob stood, from the outbox. */
  resume: MultipartState | null;
  /** The multipart state after each finished part, and null once it completes. */
  onMultipart: (state: MultipartState | null) => void;
  /** 0 to 1. */
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
};

/** Whatever sends bytes: the browser's, or a fake in tests. */
export type Transfer = (input: SendInput) => Promise<{ pathname: string }>;

/**
 * A client token from the token route. A server error (or a busy one: 408,
 * 429) is the road, not the file (the next push to main, a restart, a
 * database blip): it waits and tries again. Any other refusal is the server
 * saying no. `signal` cuts the request off with the rest of the upload.
 */
async function clientToken(kind: UploadKind, pathname: string, clientPayload: string, signal: AbortSignal, multipart: boolean): Promise<string> {
  const res = await fetch(`/api/blob/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload, multipart } }),
    signal,
  });
  if (res.status >= 500 || res.status === 408 || res.status === 429) throw new ServerBusyError();
  // The words match upload()'s own, which media.ts shownReason turns into "the upload was refused. Reload and try again".
  if (!res.ok) throw new Error("Failed to retrieve the client token");
  const body = (await res.json().catch(() => null)) as { clientToken?: string } | null;
  if (!body?.clientToken) throw new Error("Failed to retrieve the client token");
  return body.clientToken;
}

/**
 * The whole file in one call: put(), multipart above 8 MB (retried part by part inside the client). The token is the
 * route's, asked for here, so a 5xx from the route waits like any dropped request and the stall abort reaches it.
 */
async function sendWhole(input: SendInput, pathname: string, clientPayload: string, token?: string): Promise<{ pathname: string }> {
  const multipart = usesMultipart(input.blob.size);
  const blob = await put(pathname, input.blob, {
    access: input.access,
    token: token ?? (await clientToken(input.uploadKind, pathname, clientPayload, input.signal, multipart)),
    contentType: input.contentType,
    multipart,
    abortSignal: input.signal,
    onUploadProgress: ({ percentage }) => input.onProgress(Math.min(1, percentage / 100)),
  });
  return { pathname: blob.pathname };
}

/** A token that ran out is asked for again this many times in one run; a file that needs more has a problem of its own. */
const MAX_REMINTS = 3;

async function sendInParts(input: SendInput, pathname: string, clientPayload: string): Promise<{ pathname: string }> {
  const { access, contentType, signal } = input;
  const mint = () => clientToken(input.uploadKind, pathname, clientPayload, signal, true);
  let token = await mint();
  let state = input.resume && input.resume.pathname === pathname ? input.resume : null;
  if (!state) {
    try {
      const created = await createMultipartUpload(pathname, { access, token, contentType, abortSignal: signal });
      state = { pathname, key: created.key, uploadId: created.uploadId, parts: [] };
    } catch (err) {
      // The connection is the caller's to retry; anything else, and the old path is the safe one.
      if (signal.aborted || classifyFailure(err, true) !== "refused") throw err;
      return sendWhole(input, pathname, clientPayload, token);
    }
    input.onMultipart(state);
  }
  const { key, uploadId } = state;
  const size = input.blob.size;
  const parts = [...state.parts];
  const plan = planParts(size);
  const sizeOf = (partNumber: number) => {
    const range = plan[partNumber - 1];
    return range ? range.end - range.start : 0;
  };
  /** Bytes sent by parts still going, by part number; finished parts count in full. */
  const loadedBy = new Map<number, number>();
  const report = () => {
    let loaded = parts.reduce((sum, p) => sum + sizeOf(p.partNumber), 0);
    for (const v of loadedBy.values()) loaded += v;
    input.onProgress(Math.min(1, size > 0 ? loaded / size : 0));
  };
  report();

  /**
   * Sends the parts Blob doesn't hold yet, three at a time. The first part
   * that fails stops the other two (a local signal, which also follows the
   * upload's own), and this waits for them to stop before it throws: a
   * sibling left running would keep sending, and keep reporting progress,
   * behind the retry that follows. Parts that landed meanwhile stay in `parts`.
   */
  async function sendMissing(withToken: string): Promise<void> {
    const local = new AbortController();
    const follow = () => local.abort(signal.reason);
    if (signal.aborted) follow();
    else signal.addEventListener("abort", follow, { once: true });
    const todo = missingParts(size, parts);
    let next = 0;
    const failures: unknown[] = [];
    async function worker() {
      while (failures.length === 0 && next < todo.length) {
        const range = todo[next++];
        try {
          const part = await uploadPart(pathname, input.blob.slice(range.start, range.end), {
            access,
            token: withToken,
            uploadId,
            key,
            partNumber: range.partNumber,
            contentType,
            abortSignal: local.signal,
            onUploadProgress: ({ loaded }) => {
              if (local.signal.aborted) return;
              loadedBy.set(range.partNumber, loaded);
              report();
            },
          });
          loadedBy.delete(range.partNumber);
          parts.push({ etag: part.etag, partNumber: part.partNumber });
          input.onMultipart({ pathname, key, uploadId, parts: [...parts] });
          report();
        } catch (err) {
          if (failures.length === 0) {
            failures.push(err);
            local.abort();
          }
          return;
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, todo.length) }, worker));
    } finally {
      signal.removeEventListener("abort", follow);
    }
    if (failures.length > 0) throw failures[0];
  }

  for (let reminted = 0; ; reminted++) {
    try {
      await sendMissing(token);
      const done = await completeMultipartUpload(pathname, [...parts].sort((a, b) => a.partNumber - b.partNumber), {
        access,
        token,
        uploadId,
        key,
        contentType,
        abortSignal: signal,
      });
      input.onMultipart(null);
      input.onProgress(1);
      return { pathname: done.pathname };
    } catch (err) {
      // The token lasts an hour and a big video on a weak signal can outlive it: ask for another and carry on
      // with the parts already up, rather than turning the whole file red.
      if (!isTokenExpired(err) || signal.aborted || reminted >= MAX_REMINTS) throw err;
      loadedBy.clear();
      token = await mint();
    }
  }
}

/** The browser's Transfer. */
export const sendBlob: Transfer = async (input) => {
  const request = uploadRequest(
    input.uploadKind,
    input.parentId,
    { name: input.name, contentType: input.contentType, fileKind: input.fileKind },
    { role: input.role, queuedAt: input.queuedAt },
  );
  if (!usesMultipart(input.blob.size)) return sendWhole(input, request.pathname, request.clientPayload);
  return sendInParts(input, request.pathname, request.clientPayload);
};
