"use server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import * as jobs from "@/lib/portal/jobs";
import { requirePortalPrincipal } from "@/lib/portal/session";
import { withResult } from "@/lib/server-action";

/**
 * The job page's actions: check who's calling, parse, call the portal
 * service (src/lib/portal/jobs.ts), and hand back a one-line result for the
 * page to show. Every rule (access, the job's state, Start job and Mark done
 * only) is enforced in the service and core, not here.
 */

const id = z.string().min(1).max(64);

const updateSchema = z
  .object({
    body: z.string().max(5000).default(""),
    attachmentIds: z.array(id).max(50).default([]),
    // Made in the browser for each send, so a Retry after a timeout that did post never posts twice
    // (activity 2.7; core.addComment answers a repeat with the first). Strict schemas refuse a key they don't
    // know, so it has to be named here.
    clientId: z.string().min(1).max(64).optional(),
  })
  .strict();

// Where the browser put the file and what to call it, never its URL, size or
// type: the service reads those from Blob itself.
const uploadSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    filename: z.string().min(1).max(255),
    width: z.number().int().positive().max(20000).nullish(),
    height: z.number().int().positive().max(20000).nullish(),
    durationSec: z.number().positive().max(24 * 3600).nullish(),
    thumbPathname: z.string().min(1).max(300).nullish(),
    posterPathname: z.string().min(1).max(300).nullish(),
  })
  .strict();

export async function startJobAction(taskId: string): Promise<ActionResult> {
  return withResult("portal:startJob", async () => {
    await requirePortalPrincipal();
    await jobs.startJob(id.parse(taskId));
  });
}

export async function markJobDoneAction(taskId: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return withResult("portal:markJobDone", async () => {
    await requirePortalPrincipal();
    await jobs.markJobDone(id.parse(taskId), updateSchema.parse(input));
  });
}

export async function postJobUpdateAction(taskId: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  return withResult("portal:postJobUpdate", async () => {
    await requirePortalPrincipal();
    await jobs.postJobUpdate(id.parse(taskId), updateSchema.parse(input));
  });
}

export async function setChecklistItemAction(itemId: string, done: boolean): Promise<ActionResult> {
  return withResult("portal:setChecklistItem", async () => {
    await requirePortalPrincipal();
    await jobs.setJobChecklistItem(id.parse(itemId), z.boolean().parse(done));
  });
}

/** After the browser finished uploading straight to Blob. A result, not a throw, for the uploader's Retry. */
export async function recordJobUploadAction(taskId: string, file: z.input<typeof uploadSchema>): Promise<ActionResult<{ id: string }>> {
  return withResult("portal:recordJobUpload", async () => {
    await requirePortalPrincipal();
    return jobs.recordJobUpload(id.parse(taskId), uploadSchema.parse(file));
  });
}
