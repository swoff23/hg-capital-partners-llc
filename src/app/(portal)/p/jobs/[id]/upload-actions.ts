"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
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
 */

const id = z.string().min(1).max(64);

// Where the browser put the file and what to call it, never its URL, size or
// type: the service reads those from Blob itself. `queuedAt` is when the file
// joined the upload queue, so a photo taken before Mark done still records
// after it, inside the hour (question 4); the record step reads it.
const uploadSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(255),
    width: z.number().int().positive().max(20000).nullish(),
    height: z.number().int().positive().max(20000).nullish(),
    durationSec: z.number().positive().max(24 * 3600).nullish(),
    thumbPathname: z.string().min(1).max(300).nullish(),
    posterPathname: z.string().min(1).max(300).nullish(),
    queuedAt: z.iso.datetime().nullish(),
  })
  .strict();

/** After the browser finished uploading straight to Blob. A result, not a throw, for the uploader's Retry. */
export async function recordJobUploadAction(taskId: string, file: z.input<typeof uploadSchema>): Promise<ActionResult<{ id: string }>> {
  return withResult("portal:recordJobUpload", async () => {
    await requirePortalPrincipal();
    return jobs.recordJobUpload(id.parse(taskId), uploadSchema.parse(file));
  });
}

/** A batch of recorded files posted as one update. Returns its id, for the Undo. */
export async function postJobBatchAction(taskId: string, attachmentIds: string[]): Promise<ActionResult<{ eventId: string }>> {
  return withResult("portal:postJobBatch", async () => {
    await requirePortalPrincipal();
    return uploads.postJobBatch(id.parse(taskId), z.array(id).min(1).max(50).parse(attachmentIds));
  });
}

/** "3 photos posted · Undo": the update and its files go, within the window. */
export async function undoJobPostAction(taskId: string, eventId: string): Promise<ActionResult> {
  return withResult("portal:undoJobPost", async () => {
    await requirePortalPrincipal();
    await uploads.undoJobPost(id.parse(taskId), id.parse(eventId));
  });
}
