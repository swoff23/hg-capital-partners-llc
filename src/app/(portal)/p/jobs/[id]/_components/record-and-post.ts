import type { RecordMediaInput, RecordMediaResult } from "@/components/media-uploader";
import type { ToastInput } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { contentTypeForName, fileKindForType } from "@/lib/attachments/content-types";
import { addedToJobText, postedText } from "@/lib/portal/job-view";
import { recordedUploads, type RecordedUpload } from "@/lib/portal/recorded-uploads";
import { postJobBatchAction, recordJobUploadAction, undoJobPostAction } from "../upload-actions";

/**
 * The two steps a contractor's photos take after their bytes are up, shared
 * by the job page's composer (job-actions.tsx) and the record-only queue
 * target a finished job mounts (late-uploads.tsx): the record step, which
 * keeps what each file is for the tab (recordedUploads), and posting a batch
 * with its toast. Each step names the queue's owner (queue-owner.ts), so a tab
 * left open under another sign-in is refused instead of acting as whoever
 * signed in since.
 */

/**
 * The record step for one file: it joins the job unposted, and its kind and previews are kept for the Mark done
 * sheet's slots and the payoff's strip. Kept for the tab (recordedUploads), not for a page: a batch that started
 * under an earlier visit to the job lands under whichever page is open by then, with that visit's files in it.
 */
export async function recordJobFile(taskId: string, file: RecordMediaInput, owner?: string): Promise<RecordMediaResult> {
  const res = await recordJobUploadAction(taskId, file, owner);
  if (res.ok) {
    const kind = fileKindForType(contentTypeForName(file.filename)) ?? (file.posterPathname ? "video" : null);
    recordedUploads.note(taskId, {
      id: res.data.id,
      name: file.filename,
      kind,
      hasThumb: !!file.thumbPathname,
      hasPoster: !!file.posterPathname,
    });
  }
  return res;
}

/**
 * Posts a batch as one update: "3 photos posted", and five seconds to take it back. False when it didn't post.
 * A job approved while the photos were going up takes no update: the server answers with no id, the photos stay
 * on the job, and the toast says "3 photos added to the job" with nothing to undo (no update, no email).
 */
export async function postRecordedBatch(
  taskId: string,
  items: RecordedUpload[],
  toast: (t: ToastInput) => unknown,
  owner?: string,
): Promise<boolean> {
  const res = await callAction(() => postJobBatchAction(taskId, items.map((i) => i.id), owner));
  if (!res.ok) {
    toast({ message: res.error });
    return false;
  }
  const { eventId } = res.data;
  const kinds = items.map((i) => i.kind);
  if (eventId === null) {
    toast({ message: addedToJobText(kinds), key: `job-added:${taskId}` });
    return true;
  }
  toast({
    message: postedText(kinds),
    key: `job-post:${eventId}`,
    action: {
      label: "Undo",
      onAction: () => {
        void callAction(() => undoJobPostAction(taskId, eventId, owner)).then((undone) => {
          if (!undone.ok) toast({ message: undone.error });
        });
      },
    },
  });
  return true;
}
