"use client";
import { useCallback, useId, useMemo } from "react";
import { MediaUploadTray, UploadTile, useMediaUploader, type MediaUpload, type MediaUploaderApi, type RecordMediaInput } from "@/components/media-uploader";
import type { UploadTarget } from "@/components/upload-queue";
import { contentTypeForName, fileKindForType, type FileKind } from "@/lib/attachments/content-types";
import { UPLOAD_KIND_ALLOWED, uploadTargetKey } from "@/lib/attachments/upload-kinds";
import { recordNewTaskFile } from "./actions";

/** The most files a new task takes (lib/tasks/new-task-files.ts NEW_TASK_FILES_MAX), and the refused tile's reason past it. */
const FILES_MAX = 50;
const FILES_FULL = "Add up to 50 here. Add more on the task.";

/** A file that's up and held for Create: drawn as the composer draws a ready file. Kept in the form's draft. */
export type HeldFileView = { id: string; filename: string; kind: FileKind; preview: "thumb" | "poster" | null };

/** A form's id, made here, one per new task: the folder its files go up to (paths.ts newTaskUploadPath). */
export const newFormId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;

function asReady(f: HeldFileView): MediaUpload {
  return {
    key: f.id,
    name: f.filename,
    kind: f.kind,
    previewUrl: f.preview ? `/api/files/new-task-upload/${encodeURIComponent(f.id)}?v=${f.preview}` : null,
    progress: 1,
    status: "saving",
  };
}

/**
 * New task's upload queue target (docs/specs/new-task-checklist-photos.md, section 3.1): the form's own folder,
 * what a staff task upload takes, up to 50 files with the ones held counted, and a record step that holds each file
 * for Create, or attaches it to the task Create already made. `onHeld` hears of each file that lands, while the form
 * is there to show it.
 */
export function useNewTaskUploader({ formId, held, onHeld }: { formId: string; held: number; onHeld: (file: HeldFileView) => void }): {
  uploader: MediaUploaderApi;
  target: UploadTarget;
} {
  const record = useCallback(
    async (file: RecordMediaInput, owner?: string) => {
      const res = await recordNewTaskFile(
        formId,
        {
          pathname: file.pathname,
          filename: file.filename,
          width: file.width,
          height: file.height,
          durationSec: file.durationSec,
          thumbPathname: file.thumbPathname,
          posterPathname: file.posterPathname,
        },
        owner,
      );
      if (res.ok && res.data) {
        const kind = fileKindForType(contentTypeForName(file.filename)) ?? (file.posterPathname ? "video" : "file");
        onHeld({ id: res.data.id, filename: file.filename, kind, preview: kind === "video" ? (file.posterPathname ? "poster" : null) : file.thumbPathname ? "thumb" : null });
      }
      return res;
    },
    [formId, onHeld],
  );

  const target = useMemo<UploadTarget>(
    () => ({
      key: uploadTargetKey("new-task-upload", formId),
      label: "New task",
      uploadKind: "new-task-upload",
      parentId: formId,
      access: "private",
      allowed: UPLOAD_KIND_ALLOWED["new-task-upload"],
      prepare: "original",
      maxFiles: Math.max(0, FILES_MAX - held),
      maxFilesReason: FILES_FULL,
      maxFilesNotice: FILES_FULL,
      record,
      // The sheet closing doesn't stop them: they land on the task Create made, or wait for the draft.
      whenAway: "hold",
    }),
    [formId, held, record],
  );
  return { uploader: useMediaUploader({ target }), target };
}

/**
 * New task's Photos and files (Q1 B): always shown, under the Checklist. The held files first as ready tiles, then the
 * ones going up, then the add tile, which opens the picker (on a phone the system's own offers the camera, the library
 * or a file). Remove on a ready tile deletes it for good (`onRemove`).
 */
export function NewTaskPhotos({ uploader, held, onRemove }: { uploader: MediaUploaderApi; held: readonly HeldFileView[]; onRemove: (id: string) => void }) {
  const heading = useId();
  return (
    <div role="group" aria-labelledby={heading} className="flex min-w-0 flex-col gap-1.5">
      <p id={heading} className="text-meta font-medium text-fg-2">
        Photos and files
      </p>
      {uploader.inputs}
      <MediaUploadTray
        uploader={uploader}
        layout="grid"
        slots={0}
        filled={held.length}
        onSlot={uploader.chooseFiles}
        label="Photos and files"
        addLabel="Add photos, videos or files"
        leading={held.map((f) => (
          <UploadTile key={f.id} upload={asReady(f)} grid ready onRemove={() => onRemove(f.id)} />
        ))}
      />
    </div>
  );
}
