import { completeMultipartUpload, createMultipartUpload, upload, uploadPart } from "@vercel/blob/client";
import { MULTIPART_THRESHOLD, usesMultipart, type FileKind } from "./content-types";
import { ServerBusyError, classifyFailure, type MultipartState } from "./outbox";
import { uploadRequest, type UploadKind } from "./upload-kinds";
import type { UploadRole } from "./paths";

/**
 * Sends one blob to Vercel Blob straight from the browser: a token from
 * /api/blob/[kind], then the bytes. Small files go in one request through the
 * client's upload(). A file over 8 MB goes in parts through
 * createMultipartUpload, uploadPart and completeMultipartUpload (the
 * @vercel/blob 2.8 client), three parts at a time, and reports each finished
 * part so the outbox can resume at the last one (uploads 2.1, phase 3). A
 * resumed upload asks the token route for a fresh token. If the multipart
 * create is refused for a reason other than the connection, the whole file
 * goes the way it always did, through upload({ multipart: true }).
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

async function clientToken(kind: UploadKind, pathname: string, clientPayload: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(`/api/blob/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload, multipart: true } }),
    signal,
  });
  // A server error is the road, not the file (the next push to main, a restart): it waits and tries again.
  if (res.status >= 500) throw new ServerBusyError();
  // The words match upload()'s own, which media.ts shownReason turns into "the upload was refused. Reload and try again".
  if (!res.ok) throw new Error("Failed to retrieve the client token");
  const body = (await res.json().catch(() => null)) as { clientToken?: string } | null;
  if (!body?.clientToken) throw new Error("Failed to retrieve the client token");
  return body.clientToken;
}

/** The whole file the way uploads have always gone: one call, multipart above 8 MB, retried part by part inside the client. */
async function sendWhole(input: SendInput, pathname: string, clientPayload: string): Promise<{ pathname: string }> {
  const blob = await upload(pathname, input.blob, {
    access: input.access,
    handleUploadUrl: `/api/blob/${input.uploadKind}`,
    clientPayload,
    contentType: input.contentType,
    multipart: usesMultipart(input.blob.size),
    abortSignal: input.signal,
    onUploadProgress: ({ percentage }) => input.onProgress(Math.min(1, percentage / 100)),
  });
  return { pathname: blob.pathname };
}

async function sendInParts(input: SendInput, pathname: string, clientPayload: string): Promise<{ pathname: string }> {
  const { access, contentType, signal } = input;
  const token = await clientToken(input.uploadKind, pathname, clientPayload, signal);
  let state = input.resume && input.resume.pathname === pathname ? input.resume : null;
  if (!state) {
    try {
      const created = await createMultipartUpload(pathname, { access, token, contentType, abortSignal: signal });
      state = { pathname, key: created.key, uploadId: created.uploadId, parts: [] };
    } catch (err) {
      // The connection is the caller's to retry; anything else, and the old path is the safe one.
      if (signal.aborted || classifyFailure(err, true) !== "refused") throw err;
      return sendWhole(input, pathname, clientPayload);
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

  const todo = missingParts(size, parts);
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const range = todo[next++];
      const part = await uploadPart(pathname, input.blob.slice(range.start, range.end), {
        access,
        token,
        uploadId,
        key,
        partNumber: range.partNumber,
        contentType,
        abortSignal: signal,
        onUploadProgress: ({ loaded }) => {
          loadedBy.set(range.partNumber, loaded);
          report();
        },
      });
      loadedBy.delete(range.partNumber);
      parts.push({ etag: part.etag, partNumber: part.partNumber });
      input.onMultipart({ pathname, key, uploadId, parts: [...parts] });
      report();
    }
  }
  await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, todo.length) }, worker));

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
