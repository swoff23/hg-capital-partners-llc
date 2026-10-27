"use client";
import { MediaUploadTray, useMediaUploader, type RecordMediaInput, type RecordMediaResult } from "@/components/media-uploader";
import { useToast } from "@/components/toast";
import type { UploadTarget } from "@/components/upload-queue";
import { recordedUploads } from "@/lib/portal/recorded-uploads";
import { postRecordedBatch, recordJobFile } from "./record-and-post";

/**
 * The queue's way onto a job that is no longer active (docs/specs/uploads-photos.md
 * question 4, late photos). A contractor's photos can still be going up when
 * HG approves the job, or sit in the phone's outbox until the signal comes
 * back; a job page for a Done job has no composer, so without this nothing is
 * there to record them and they wait for a page that never comes ("2 files are
 * waiting to finish", and View opens this same page).
 *
 * This is that page: it mounts the same queue target the composer does, so
 * the files record (the server takes them inside the hour after Mark done,
 * attachments/access.ts) and are handed to the batch step, which leaves them
 * on the job with no update and no email and says "3 photos added to the job".
 * Past the hour the server answers "This job is closed.", the tile turns red
 * with that reason, and Remove clears it. It draws nothing while no file is
 * waiting: the tray is the composer's, and shows only when there is a file.
 */
export function LateUploads({ taskId, label }: { taskId: string; label: string }) {
  const { toast } = useToast();

  const record = (file: RecordMediaInput): Promise<RecordMediaResult> => recordJobFile(taskId, file);
  /** The batch landed: with this page open or gone, it is handed to the same step. */
  const land = (ids: string[]) => void postRecordedBatch(taskId, recordedUploads.take(taskId, ids), toast);

  const target: UploadTarget = {
    key: `portal-task:${taskId}`,
    label,
    uploadKind: "portal-task-upload",
    parentId: taskId,
    access: "private",
    allowed: ["image", "video"],
    prepare: "display",
    record,
    onRecorded: land,
    whenAway: "post",
    onAway: land,
    sendQueuedAt: true,
  };
  const uploader = useMediaUploader({ target });

  if (uploader.uploads.length === 0) return null;
  return (
    <div className="mt-4">
      <MediaUploadTray uploader={uploader} layout="grid" />
    </div>
  );
}
