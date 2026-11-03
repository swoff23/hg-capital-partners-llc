"use client";
import { useEffect } from "react";
import { MediaUploadTray, useMediaUploader, type RecordMediaInput, type RecordMediaResult } from "@/components/media-uploader";
import { useToast } from "@/components/toast";
import { useUploadScope, type UploadTarget } from "@/components/upload-queue";
import { recordedUploadsOf } from "@/lib/portal/recorded-uploads";
import { postKept, postOrKeepBatch, recordJobFile } from "./record-and-post";

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
 * attachments/access.ts) and are handed to the batch step, which tells HG once
 * for the batch (one line, one email line, no Undo) and says "3 photos added
 * to the job". Past the hour the server answers "This job is closed." for
 * good: the tile keeps its red ring with only Remove, and the line under the
 * tray says "Job closed before 2 photos uploaded". The tile gets one more go
 * each time this page opens again (engine.ts mount), in case HG sent the job
 * back. Files the tab kept for the job (a post that didn't go through before
 * HG closed it) post the same way as this page opens and as it goes. It draws
 * nothing while no file is waiting: the tray is the composer's, and shows only
 * when there is a file.
 */
export function LateUploads({ taskId, label }: { taskId: string; label: string }) {
  const { toast } = useToast();
  const owner = useUploadScope();
  const tab = recordedUploadsOf(owner);

  // What the tab kept for this job posts now, the late way, rather than waiting for a batch that may never land, and
  // again as the page goes, as the job page's own drain does.
  useEffect(() => {
    void postKept(taskId, toast, owner);
    return () => void postKept(taskId, toast, owner);
  }, [taskId, toast, owner]);

  const record = (file: RecordMediaInput, from?: string): Promise<RecordMediaResult> => recordJobFile(taskId, file, from);
  /**
   * The batch landed: with this page open or gone, it is handed to the same step. Files whose post didn't go
   * through stay kept for the tab (postOrKeepBatch keeps them even when the call throws), and the failure's Retry,
   * the next batch for this job, the signal coming back or the next time it opens carries them.
   */
  const land = (ids: string[]) => {
    void postOrKeepBatch(taskId, tab.take(taskId, ids), toast, owner);
  };

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
