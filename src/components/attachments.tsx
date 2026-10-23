"use client";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import type { ActionResult } from "@/lib/action-result";
import { UPLOAD_RULES, fileKindForType, filenameForType, uploadContentType, usesMultipart } from "@/lib/attachments/content-types";
import { safeUploadName } from "@/lib/attachments/paths";
import { cn, formatBytes } from "@/lib/utils";

export type AttachmentItem = { id: string; filename: string; size: number };

/** Which table the rows live in — decides the download route and the upload endpoint. */
export type AttachmentKind = "task" | "property";

/** Property documents: the browser reports the blob it made, as before. */
type PropertyRecordData = {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
};

/** Task files: only where the file went and its name. The server asks Blob for the rest. */
export type TaskRecordData = { pathname: string; filename: string };

/** A record action either throws or reports failure as an ActionResult. */
type RecordOutcome = Promise<void | ActionResult<unknown>>;

type AttachmentsProps = {
  items: AttachmentItem[];
  /** "tasks/<taskId>" or "properties/<propertyId>". */
  uploadPathPrefix: string;
  /** JSON naming the parent row, e.g. {"taskId": "..."}. */
  clientPayload: string;
  onDelete: (id: string) => Promise<void>;
} & (
  | { kind: "task"; onRecord: (data: TaskRecordData) => RecordOutcome }
  | { kind: "property"; onRecord: (data: PropertyRecordData) => RecordOutcome }
);

/** Task uploads at once: a batch finishes in a third of the time without a burst of token requests. */
const CONCURRENCY = 3;
const MB = 1024 * 1024;

/** The record step's message when no Blob store is connected (tasks/service.ts, blobAuth). */
const NO_BLOB_STORE = /not configured|Blob store/i;

/**
 * @vercel/blob's upload() throws "Failed to retrieve the client token" for
 * any refusal from /api/blob (session expired, path or type refused, job
 * closed), so the route's own reason never reaches the browser.
 */
const TOKEN_REFUSED = /client token/i;

type Failure = { name: string; reason: string };

const shownReason = (reason: string) => (TOKEN_REFUSED.test(reason) ? "the upload was refused. Reload the page and try again" : reason);

/** One line for a batch, however many files failed. */
function failureNotice(failures: Failure[]): string {
  if (failures.some((f) => NO_BLOB_STORE.test(f.reason))) return "Connect a Blob store in Vercel (Storage tab) to turn on file uploads.";
  const [first, ...rest] = failures;
  const reason = shownReason(first.reason);
  const why = reason ? `: ${reason}` : "";
  if (rest.length === 0) return `Couldn't upload ${first.name}${why}`;
  if (rest.every((f) => shownReason(f.reason) === reason)) return `Couldn't upload ${first.name} and ${rest.length} more${why}`;
  return `Couldn't upload ${failures.length} files. ${first.name}${why}`;
}

/**
 * Drag-or-click file uploader backed by Vercel Blob. The browser uploads
 * straight to Blob (no serverless body limit) as a PRIVATE blob; `onRecord`
 * writes the DB row and `onDelete` removes it. Links open through the
 * session-gated /api/files route, never the raw blob URL. Shared by task
 * attachments and property documents.
 *
 * Task files go to tasks/<taskId>/orig/<safe name> with a `fileKind`, so the
 * token route can hold them to that kind's types and size (and the record
 * step checks again with head()); too-big or refused types are caught here
 * first, before any bytes move. Property documents upload as they always have.
 */
export function Attachments(props: AttachmentsProps) {
  const { kind, items, uploadPathPrefix, clientPayload, onDelete } = props;
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ key: string; name: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Upload and record one file; throws with a message to show. */
  async function uploadOne(file: File): Promise<void> {
    if (props.kind === "property") {
      const blob = await upload(`${uploadPathPrefix}/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/blob/property-upload",
        clientPayload,
      });
      const res = await props.onRecord({
        url: blob.url,
        pathname: blob.pathname,
        filename: file.name,
        size: file.size,
        contentType: file.type || null,
      });
      if (res && !res.ok) throw new Error(res.error);
      return;
    }

    const contentType = uploadContentType(file.name, file.type);
    const fileKind = fileKindForType(contentType);
    if (!contentType || !fileKind) throw new Error("that type of file can't be attached");
    const cap = UPLOAD_RULES[fileKind].maxBytes;
    if (file.size > cap) throw new Error(`it's over the ${Math.round(cap / MB)} MB limit`);
    // The path's extension agrees with the type, or the token route refuses it.
    const blob = await upload(`${uploadPathPrefix}/orig/${safeUploadName(filenameForType(file.name, contentType))}`, file, {
      access: "private",
      handleUploadUrl: "/api/blob/task-upload",
      clientPayload: JSON.stringify({ ...(JSON.parse(clientPayload) as object), fileKind }),
      contentType,
      multipart: usesMultipart(file.size),
    });
    const res = await props.onRecord({ pathname: blob.pathname, filename: file.name });
    if (res && !res.ok) throw new Error(res.error);
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const batch = Array.from(files).map((file, i) => ({ file, key: `${Date.now()}-${i}-${file.name}` }));
    setBusy((b) => [...b, ...batch.map(({ key, file }) => ({ key, name: file.name }))]);

    const failures: Failure[] = [];
    let next = 0;
    async function worker() {
      while (next < batch.length) {
        const { file, key } = batch[next++];
        try {
          await uploadOne(file);
        } catch (e) {
          // Keep going: one bad file shouldn't stop the rest of the batch.
          failures.push({ name: file.name, reason: e instanceof Error ? e.message : "" });
        } finally {
          setBusy((b) => b.filter((x) => x.key !== key));
        }
      }
    }
    // Property documents still go one at a time, as they always have.
    const workers = props.kind === "property" ? 1 : Math.min(CONCURRENCY, batch.length);
    await Promise.all(Array.from({ length: workers }, worker));
    if (failures.length > 0) setError(failureNotice(failures));
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileIcon />
              <a
                href={`/api/files/${kind}/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate hover:underline"
                title={a.filename}
              >
                {a.filename}
              </a>
              <span className="shrink-0 text-xs text-muted">{formatBytes(a.size)}</span>
              <button
                type="button"
                onClick={() => start(() => onDelete(a.id))}
                className="shrink-0 text-xs text-muted transition-colors hover:text-red-600"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy.map(({ key, name }) => (
        <div
          key={key}
          className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-muted"
        >
          <FileIcon />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="shrink-0 text-xs">Uploading…</span>
        </div>
      ))}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-background",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-5 w-5 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 16V4m0 0l-4 4m4-4l4 4M5 20h14" />
        </svg>
        <span className="text-muted">
          <span className="font-medium text-foreground">Click to upload</span> or drag files here
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FileIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M9 1.5H4.5A1.5 1.5 0 003 3v10a1.5 1.5 0 001.5 1.5h7A1.5 1.5 0 0013 13V5.5L9 1.5z" />
      <path d="M9 1.5V5.5H13" />
    </svg>
  );
}
