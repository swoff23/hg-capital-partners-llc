import type { RecordMediaInput, RecordMediaResult } from "@/components/media-uploader";
import type { ToastInput } from "@/components/toast";
import { callAction } from "@/lib/action-result";
import { contentTypeForName, fileKindForType } from "@/lib/attachments/content-types";
import { addedToJobText, postedText } from "@/lib/portal/job-view";
import {
  drainEveryKept,
  drainKept,
  failedPostToast,
  postInBatches,
  postOrKeep,
  recordedUploadsOf,
  toldOf,
  type RecordedUpload,
} from "@/lib/portal/recorded-uploads";
import { postJobBatchAction, recordJobUploadAction, undoJobPostAction } from "../upload-actions";

/**
 * The two steps a contractor's photos take after their bytes are up, shared
 * by the job page's composer (job-actions.tsx) and the record-only queue
 * target a finished job mounts (late-uploads.tsx): the record step, which
 * keeps what each file is for the tab (recordedUploadsOf), and posting a batch
 * with its toast. Each step names the queue's owner (queue-owner.ts), so a tab
 * left open under another sign-in is refused instead of acting as whoever
 * signed in since.
 */

/**
 * The record step for one file: it joins the job unposted, and its kind and previews are kept for the Mark done
 * sheet's slots and the payoff's strip. Kept for the tab and the queue's owner (recordedUploadsOf), not for a page:
 * a batch that started under an earlier visit to the job lands under whichever page is open by then, with that
 * visit's files in it.
 */
export async function recordJobFile(taskId: string, file: RecordMediaInput, owner?: string): Promise<RecordMediaResult> {
  const res = await recordJobUploadAction(taskId, file, owner);
  if (res.ok) {
    const kind = fileKindForType(contentTypeForName(file.filename)) ?? (file.posterPathname ? "video" : null);
    recordedUploadsOf(owner).note(taskId, {
      id: res.data.id,
      name: file.filename,
      kind,
      hasThumb: !!file.thumbPathname,
      hasPoster: !!file.posterPathname,
    });
  }
  return res;
}

/** One batch's "added to the job" toast: its own key, and the kinds its pieces added so far. */
type LateToast = { key: string; kinds: RecordedUpload["kind"][] };
let lateToasts = 0;

/**
 * Posts a batch as updates of at most MAX_FILES_PER_POST files each (a tab that kept an earlier batch carries it
 * with the next one, so a long wait can hold more than one post takes): "3 photos posted", and five seconds to take
 * it back. Answers the files that didn't post, none when all did, so the caller keeps just those. A piece that
 * fails stops the rest, which wait with it.
 * A job approved or canceled while the photos were going up keeps its status: the server tells HG once (one line,
 * one email line) and answers with no id, and the toast says "3 photos added to the job" with nothing to undo. Its
 * pieces share that one toast, which counts them all ("60 photos added to the job", not the last piece's 10); a
 * batch moments later gets its own. A piece with nothing new to tell (all posted already) says nothing.
 * A piece that fails toasts why; `retry` gives that toast its Retry, for a caller whose files wait in the tab's
 * kept files (postOrKeepBatch, postKept) rather than on a tray with a Send.
 */
export async function postRecordedBatch(
  taskId: string,
  items: RecordedUpload[],
  toast: (t: ToastInput) => unknown,
  owner?: string,
  retry?: () => void,
): Promise<RecordedUpload[]> {
  const late: LateToast = { key: `job-added:${taskId}:${++lateToasts}`, kinds: [] };
  return postInBatches(items, (piece) => postPiece(taskId, piece, toast, late, owner, retry));
}

/**
 * Posts the files this tab kept for the job (recordedUploadsOf(owner).keep): ones past what the tray could hold, or
 * from a post that didn't go through. A job page calls it as it opens, once its own Send or Mark done went, and as it
 * goes, and so does a finished job's page (late-uploads.tsx) as it opens and goes, so none of them waits for another
 * batch that may never come. One drain at a time for each job (drainKept); files that don't post stay kept for the
 * next, and the failure's toast has a Retry that drains them again.
 */
export function postKept(taskId: string, toast: (t: ToastInput) => unknown, owner?: string): Promise<void> {
  return drainKept(owner, taskId, (kept) => postRecordedBatch(taskId, kept, toast, owner, retryKept(taskId, toast, owner)));
}

/**
 * A batch with no tray to go back to (it landed on a finished job's page, or after its page went): posted, and
 * whatever doesn't post stays kept for the tab, even when the call throws (a redirect), so the next batch or drain of
 * the job carries it. The failure's toast has a Retry that posts what's kept.
 */
export function postOrKeepBatch(taskId: string, items: RecordedUpload[], toast: (t: ToastInput) => unknown, owner?: string): Promise<void> {
  return postOrKeep(owner, taskId, items, (batch) => postRecordedBatch(taskId, batch, toast, owner, retryKept(taskId, toast, owner)));
}

/**
 * Every job this tab kept files for posts its kept files, one job after another (drainEveryKept): the portal's queue
 * calls it when the signal or the tab comes back, on whatever page is open, so a post that failed offline goes then.
 */
export function postEveryKept(toast: (t: ToastInput) => unknown, owner?: string): Promise<void> {
  return drainEveryKept(owner, (taskId, kept) => postRecordedBatch(taskId, kept, toast, owner, retryKept(taskId, toast, owner)));
}

/** The Retry on a failed post of kept files: drains them again. */
function retryKept(taskId: string, toast: (t: ToastInput) => unknown, owner?: string): () => void {
  return () => void postKept(taskId, toast, owner);
}

/** One post of at most MAX_FILES_PER_POST files, with its toast. False when it didn't post. `late` sums the pieces with no id. */
async function postPiece(
  taskId: string,
  piece: RecordedUpload[],
  toast: (t: ToastInput) => unknown,
  late: LateToast,
  owner?: string,
  retry?: () => void,
): Promise<boolean> {
  const res = await callAction(() => postJobBatchAction(taskId, piece.map((i) => i.id), owner));
  if (!res.ok) {
    toast(failedPostToast(res.error, retry));
    return false;
  }
  const { eventId, linked } = res.data;
  // The toast counts what the post told HG of, as the timeline line does. A quiet answer told of nothing: the same
  // photos went from another tab a moment ago (or this send's first answer was lost), so they're posted, the tray
  // lets them go and there is nothing to say.
  const kinds = toldOf(piece, linked).map((i) => i.kind);
  if (kinds.length === 0) return true;
  if (eventId === null) {
    late.kinds.push(...kinds);
    toast({ message: addedToJobText(late.kinds), key: late.key });
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
