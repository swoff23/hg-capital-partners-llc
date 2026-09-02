"use client";
import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { cn, formatBytes } from "@/lib/utils";

export type AttachmentItem = { id: string; filename: string; size: number };

/** Which table the rows live in — decides the download route and the upload endpoint. */
export type AttachmentKind = "task" | "property";

type RecordData = {
  url: string;
  pathname: string;
  filename: string;
  size: number;
  contentType: string | null;
};

/**
 * Drag-or-click file uploader backed by Vercel Blob. The browser uploads
 * straight to Blob (no serverless body limit) as a PRIVATE blob; `onRecord`
 * writes the DB row and `onDelete` removes it. Links open through the
 * session-gated /api/files route, never the raw blob URL. Shared by task
 * attachments and property documents.
 */
export function Attachments({
  kind,
  items,
  uploadPathPrefix,
  clientPayload,
  onRecord,
  onDelete,
}: {
  kind: AttachmentKind;
  items: AttachmentItem[];
  uploadPathPrefix: string;
  clientPayload: string;
  onRecord: (data: RecordData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const names = Array.from(files).map((f) => f.name);
    setBusy((b) => [...b, ...names]);

    for (const file of Array.from(files)) {
      try {
        const blob = await upload(`${uploadPathPrefix}/${file.name}`, file, {
          access: "private",
          handleUploadUrl: `/api/blob/${kind}-upload`,
          clientPayload,
        });
        await onRecord({
          url: blob.url,
          pathname: blob.pathname,
          filename: file.name,
          size: file.size,
          contentType: file.type || null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setError(
          /client token|not configured|Blob store/i.test(msg)
            ? "File uploads aren't set up yet — connect a Blob store in Vercel (Storage tab)."
            : `Couldn't upload ${file.name}${msg ? `: ${msg}` : ""}`,
        );
      }
    }

    setBusy((b) => b.filter((n) => !names.includes(n)));
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

      {busy.map((name) => (
        <div
          key={name}
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
