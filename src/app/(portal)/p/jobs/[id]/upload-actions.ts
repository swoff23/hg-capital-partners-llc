"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { assertQueueOwner, portalScope } from "@/lib/attachments/queue-owner";
import * as jobs from "@/lib/portal/jobs";
import * as uploads from "@/lib/portal/job-uploads";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { withResult } from "@/lib/server-action";

/**
 * The job page's upload actions (docs/specs/uploads-photos.md 2.7): the
 * record step for each file, posting a batch as one update, and taking that
 * post back. Check who's calling, parse, call the portal service
 * (src/lib/portal/jobs.ts, job-uploads.ts), and hand back a one-line result.
 * Every rule (access, the job's state, the hour after Mark done, the Undo
 * window) is enforced in the service and core, not here.
 *
 * Each also takes the queue's owner (`portal:<contact id>`, queue-owner.ts) and
 * refuses when the signed-in contractor is someone else. A tab that still shows
 * Zack's job keeps Zack's queue after Mike signs in from another tab; without
 * this its files would record and post under Mike's cookie. Refused, they wait
 * in the outbox for Zack. A call that names no owner is let through, for a tab
 * that predates this.
 */

const id = z.string().min(1).max(64);
const owner = z.string().max(80).nullish();

// Where the browser put the file and what to call it, never its URL, size or
// type: the service reads those from Blob itself. `queuedAt` is when the file
// joined the upload queue, so a photo taken before Mark done still records
// after it, inside the hour (question 4); the record step reads it. Width,
// height and length are display hints the service keeps only when sane, so an
// odd one never refuses a whole upload.
const uploadSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(255),
    width: z.number().nullish(),
    height: z.number().nullish(),
    durationSec: z.number().nullish(),
    thumbPathname: z.string().min(1).max(300).nullish(),
    posterPathname: z.string().min(1).max(300).nullish(),
    queuedAt: z.iso.datetime().nullish(),
  })
  .strict();

/** After the browser finished uploading straight to Blob. A result, not a throw, for the uploader's Retry. */
export async function recordJobUploadAction(
  taskId: string,
  file: z.input<typeof uploadSchema>,
  queueOwner?: string | null,
): Promise<ActionResult<{ id: string }>> {
  return withResult("portal:recordJobUpload", async () => {
    const p = await requirePortalPrincipal();
    assertQueueOwner(owner.parse(queueOwner), portalScope(p.contactId));
    return jobs.recordJobUpload(id.parse(taskId), uploadSchema.parse(file));
  });
}

/**
 * A batch of recorded files posted as one update. Returns its id, for the Undo; null when the job was approved while
 * the photos were going up, so they stay on the job with no update to post or take back.
 */
export async function postJobBatchAction(
  taskId: string,
  attachmentIds: string[],
  queueOwner?: string | null,
): Promise<ActionResult<{ eventId: string | null }>> {
  return withResult("portal:postJobBatch", async () => {
    const p = await requirePortalPrincipal();
    assertQueueOwner(owner.parse(queueOwner), portalScope(p.contactId));
    return uploads.postJobBatch(id.parse(taskId), z.array(id).min(1).max(50).parse(attachmentIds));
  });
}

/** "3 photos posted · Undo": the update and its files go, within the window. */
export async function undoJobPostAction(taskId: string, eventId: string, queueOwner?: string | null): Promise<ActionResult> {
  return withResult("portal:undoJobPost", async () => {
    const p = await requirePortalPrincipal();
    assertQueueOwner(owner.parse(queueOwner), portalScope(p.contactId));
    await uploads.undoJobPost(id.parse(taskId), id.parse(eventId));
  });
}
